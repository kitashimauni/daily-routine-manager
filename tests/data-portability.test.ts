import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createRoutineForUser, setRoutineLog } from "@/lib/routine-service";
import { exportDataForUser, importDataForUser, serializeDataExport, validateDataExport, type DataExportPayload } from "@/lib/data-portability";
import { routineLogs, routineRevisions, routines } from "@/lib/db/schema";
import { testDb, testSql } from "@/tests/setup";
import { createTestUser, TEST_TODAY } from "@/tests/helpers";

describe("data portability", () => {
  it("rejects an export whose serialized size exceeds the shared import limit", () => {
    const routineId = randomUUID();
    const oversizedPayload = {
      format: "daily-routine-manager",
      schemaVersion: 1,
      exportedAt: "2026-01-15T03:00:00.000Z",
      data: {
        routines: [{ id: routineId, content: "大きなExport", priority: "required" as const, daysOfWeek: [4], startDate: TEST_TODAY, endDate: null, isActive: true, createdAt: "2026-01-15T03:00:00.000Z", updatedAt: "2026-01-15T03:00:00.000Z" }],
        revisions: [{ id: randomUUID(), routineId, content: "大きなExport", priority: "required" as const, daysOfWeek: [4], startDate: TEST_TODAY, endDate: null, isActive: true, createdAt: "2026-01-15T03:00:00.000Z" }],
        logs: Array.from({ length: 60_000 }, (_, index) => ({ id: randomUUID(), routineId, date: new Date(Date.UTC(1900, 0, index + 1)).toISOString().slice(0, 10), createdAt: "2026-01-15T03:00:00.000Z", updatedAt: "2026-01-15T03:00:00.000Z" })),
      },
    } satisfies DataExportPayload;

    expect(() => serializeDataExport(oversizedPayload)).toThrow("サポート上限");
  });

  it("imports large routine, revision, and log sets in chunks", async () => {
    const user = await createTestUser();
    const routineIds = Array.from({ length: 501 }, () => randomUUID());
    const timestamp = "2026-01-15T03:00:00.000Z";
    const payload: DataExportPayload = {
      format: "daily-routine-manager",
      schemaVersion: 1,
      exportedAt: timestamp,
      data: {
        routines: routineIds.map((id) => ({ id, content: "大量Import", priority: "required", daysOfWeek: [4], startDate: TEST_TODAY, endDate: null, isActive: true, createdAt: timestamp, updatedAt: timestamp })),
        revisions: routineIds.map((routineId) => ({ id: randomUUID(), routineId, content: "大量Import", priority: "required", daysOfWeek: [4], startDate: TEST_TODAY, endDate: null, isActive: true, createdAt: timestamp })),
        logs: routineIds.map((routineId) => ({ id: randomUUID(), routineId, date: TEST_TODAY, createdAt: timestamp, updatedAt: timestamp })),
      },
    };

    await expect(importDataForUser(user.id, payload)).resolves.toEqual({ routines: 501, revisions: 501, logs: 501 });
    expect(await testDb.select().from(routines).where(eq(routines.userId, user.id))).toHaveLength(501);
    expect(await testDb.select().from(routineRevisions)).toHaveLength(501);
    expect(await testDb.select().from(routineLogs).where(eq(routineLogs.userId, user.id))).toHaveLength(501);
  });

  it("exports only the current user's data and imports it with isolated IDs", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const ownerRoutine = await createRoutineForUser(owner.id, {
      content: "持ち運ぶRoutine",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });
    await setRoutineLog(owner.id, ownerRoutine.id, TEST_TODAY, true);
    await createRoutineForUser(other.id, {
      content: "置き換え前のRoutine",
      priority: "optional",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });

    const exported = await exportDataForUser(owner.id);
    expect(exported.format).toBe("daily-routine-manager");
    expect(exported.schemaVersion).toBe(1);
    expect(exported.data.routines).toHaveLength(1);
    expect(exported.data.revisions).toHaveLength(1);
    expect(exported.data.logs).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain("passwordHash");
    expect(JSON.stringify(exported)).not.toContain(owner.id);

    await expect(importDataForUser(other.id, exported)).resolves.toEqual({ routines: 1, revisions: 1, logs: 1 });
    const importedRoutineRows = await testDb.select().from(routines).where(eq(routines.userId, other.id));
    expect(importedRoutineRows).toHaveLength(1);
    expect(importedRoutineRows[0]).toMatchObject({ content: "持ち運ぶRoutine", priority: "required" });
    expect(importedRoutineRows[0]?.id).not.toBe(ownerRoutine.id);
    expect(await testDb.select().from(routineRevisions).where(eq(routineRevisions.routineId, importedRoutineRows[0]!.id))).toHaveLength(1);
    expect(await testDb.select().from(routineLogs).where(and(eq(routineLogs.userId, other.id), eq(routineLogs.routineId, importedRoutineRows[0]!.id)))).toHaveLength(1);
    expect(await testDb.select().from(routines).where(eq(routines.userId, owner.id))).toHaveLength(1);
  });

  it("rejects an unknown schema without changing existing data", async () => {
    const user = await createTestUser();
    await createRoutineForUser(user.id, {
      content: "既存データ",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });
    const exported = await exportDataForUser(user.id);
    await expect(importDataForUser(user.id, { ...exported, schemaVersion: 999 })).rejects.toThrow("対応していないschema version");
    expect(await testDb.select().from(routines).where(eq(routines.userId, user.id))).toHaveLength(1);
  });

  it("rolls back replacement when a later import insert fails", async () => {
    const source = await createTestUser();
    const target = await createTestUser();
    const existing = await createRoutineForUser(target.id, {
      content: "失敗時も残るRoutine",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });
    const sourceRoutine = await createRoutineForUser(source.id, {
      content: "途中で失敗するRoutine",
      priority: "optional",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });
    const exported = await exportDataForUser(source.id);

    await testSql`CREATE OR REPLACE FUNCTION test_fail_import_revision() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test import failure'; END; $$`;
    await testSql`CREATE TRIGGER test_fail_import_revision BEFORE INSERT ON routine_revisions FOR EACH ROW EXECUTE FUNCTION test_fail_import_revision()`;
    try {
      await expect(importDataForUser(target.id, exported)).rejects.toThrow("Failed query");
    } finally {
      await testSql`DROP TRIGGER IF EXISTS test_fail_import_revision ON routine_revisions`;
      await testSql`DROP FUNCTION IF EXISTS test_fail_import_revision()`;
    }

    expect(await testDb.select().from(routines).where(eq(routines.id, existing.id))).toHaveLength(1);
    expect(await testDb.select().from(routines).where(eq(routines.id, sourceRoutine.id))).toHaveLength(1);
    expect(await testDb.select().from(routines).where(eq(routines.userId, target.id))).toHaveLength(1);
    expect(await testDb.select().from(routines).where(eq(routines.userId, target.id)).then((rows) => rows[0]?.content)).toBe("失敗時も残るRoutine");
  });

  it("rejects malformed export structures during validation", () => {
    expect(() => validateDataExport({ format: "daily-routine-manager", schemaVersion: 1, exportedAt: new Date().toISOString(), data: { routines: [], revisions: [], logs: [], secret: "no" } })).toThrow("エクスポートデータの項目が不正");
  });
});

afterAll(async () => {
  await testSql`DROP TRIGGER IF EXISTS test_fail_import_revision ON routine_revisions`;
  await testSql`DROP FUNCTION IF EXISTS test_fail_import_revision()`;
});
