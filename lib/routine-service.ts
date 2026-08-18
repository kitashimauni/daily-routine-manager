import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { routineLogs, routineRevisions, routines } from "@/lib/db/schema";
import { getDayOfWeek } from "@/lib/date";
import { addDateDays, getServerTodayDate } from "@/lib/server-date";
import type { Routine, RoutineInput, RoutineLog, RoutineLogs, RoutineRevision } from "@/lib/types";

export class RoutineServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "RoutineServiceError";
  }
}

function isDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseRoutineInput(value: unknown): RoutineInput {
  if (!value || typeof value !== "object") throw new RoutineServiceError("ルーティーンの入力が不正です。", 400);
  const body = value as Record<string, unknown>;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const priority = body.priority === "required" || body.priority === "optional" ? body.priority : null;
  const daysOfWeek = Array.isArray(body.daysOfWeek) && body.daysOfWeek.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    ? Array.from(new Set(body.daysOfWeek as number[])).sort((left, right) => left - right)
    : [];
  const startDate = typeof body.startDate === "string" ? body.startDate : "";
  const endDate = typeof body.endDate === "string" && body.endDate ? body.endDate : undefined;
  const isActive = typeof body.isActive === "boolean" ? body.isActive : null;

  if (!content || content.length > 200) throw new RoutineServiceError("内容は1〜200文字で入力してください。", 400);
  if (!priority || daysOfWeek.length === 0) throw new RoutineServiceError("優先度と実施曜日を指定してください。", 400);
  if (!isDateKey(startDate) || (endDate && !isDateKey(endDate)) || (endDate && endDate < startDate)) throw new RoutineServiceError("期間の指定が不正です。", 400);
  if (isActive === null) throw new RoutineServiceError("有効状態の指定が不正です。", 400);
  return { content, priority, daysOfWeek, startDate, endDate, isActive };
}

function toRoutine(row: typeof routines.$inferSelect, revisions: Array<typeof routineRevisions.$inferSelect>): Routine {
  return {
    id: row.id,
    content: row.content,
    priority: row.priority,
    daysOfWeek: row.daysOfWeek,
    startDate: row.startDate,
    endDate: row.endDate ?? undefined,
    isActive: row.isActive,
    revisions: revisions.map((revision): RoutineRevision => ({
      id: revision.id,
      routineId: revision.routineId,
      content: revision.content,
      priority: revision.priority,
      daysOfWeek: revision.daysOfWeek,
      startDate: revision.startDate,
      endDate: revision.endDate ?? undefined,
      isActive: revision.isActive,
      createdAt: revision.createdAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function revisionForDate(routine: Routine, date: string) {
  return [...routine.revisions]
    .sort((left, right) => right.startDate.localeCompare(left.startDate))
    .find((revision) => date >= revision.startDate && (!revision.endDate || date <= revision.endDate));
}

function inputFromRevision(revision: RoutineRevision, overrides: Partial<RoutineInput> = {}): RoutineInput {
  return {
    content: revision.content,
    priority: revision.priority,
    daysOfWeek: revision.daysOfWeek,
    startDate: revision.startDate,
    endDate: revision.endDate,
    isActive: revision.isActive,
    ...overrides,
  };
}

function withNewRevision(routine: Routine, input: RoutineInput, effectiveDate: string, timestamp: string) {
  const today = getServerTodayDate();
  const endDate = input.endDate && input.endDate >= effectiveDate ? input.endDate : undefined;
  const nextInput = { ...input, startDate: effectiveDate, endDate };
  const previous = routine.revisions
    .filter((revision) => effectiveDate > today ? revision.startDate <= today : revision.startDate < effectiveDate)
    .map((revision) => revision.endDate && revision.endDate < effectiveDate ? revision : { ...revision, endDate: addDateDays(effectiveDate, -1) });
  const nextRevision: RoutineRevision = {
    id: randomUUID(),
    routineId: routine.id,
    content: nextInput.content,
    priority: nextInput.priority,
    daysOfWeek: nextInput.daysOfWeek,
    startDate: effectiveDate,
    endDate,
    isActive: nextInput.isActive,
    createdAt: timestamp,
  };
  return { ...routine, ...nextInput, revisions: [...previous, nextRevision], updatedAt: timestamp };
}

async function findRoutine(userId: string, routineId: string) {
  const db = getDatabase();
  const [row] = await db.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.userId, userId))).limit(1);
  if (!row) throw new RoutineServiceError("ルーティーンが見つかりません。", 404);
  const revisions = await db.select().from(routineRevisions).where(eq(routineRevisions.routineId, routineId)).orderBy(asc(routineRevisions.startDate), asc(routineRevisions.createdAt));
  return { row, routine: toRoutine(row, revisions) };
}

export async function listRoutineData(userId: string) {
  const db = getDatabase();
  const rows = await db.select().from(routines).where(eq(routines.userId, userId)).orderBy(asc(routines.createdAt));
  const routineIds = rows.map((row) => row.id);
  const revisions = routineIds.length === 0 ? [] : await db.select().from(routineRevisions).where(inArray(routineRevisions.routineId, routineIds)).orderBy(asc(routineRevisions.startDate), asc(routineRevisions.createdAt));
  const logRows = routineIds.length === 0 ? [] : await db.select().from(routineLogs).where(and(eq(routineLogs.userId, userId), inArray(routineLogs.routineId, routineIds)));
  const revisionsByRoutine = new Map<string, Array<typeof routineRevisions.$inferSelect>>();
  for (const revision of revisions) revisionsByRoutine.set(revision.routineId, [...(revisionsByRoutine.get(revision.routineId) ?? []), revision]);
  const logs: RoutineLogs = Object.fromEntries(logRows.map((log): [string, RoutineLog] => [
    `${log.routineId}__${log.date}`,
    { id: log.id, routineId: log.routineId, date: log.date, createdAt: log.createdAt, updatedAt: log.updatedAt },
  ]));
  return { routines: rows.map((row) => toRoutine(row, revisionsByRoutine.get(row.id) ?? [])), logs };
}

async function replaceRoutine(userId: string, routine: Routine) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.update(routines).set({
      content: routine.content,
      priority: routine.priority,
      daysOfWeek: routine.daysOfWeek,
      startDate: routine.startDate,
      endDate: routine.endDate ?? null,
      isActive: routine.isActive,
      updatedAt: routine.updatedAt,
    }).where(and(eq(routines.id, routine.id), eq(routines.userId, userId)));
    await tx.delete(routineRevisions).where(eq(routineRevisions.routineId, routine.id));
    await tx.insert(routineRevisions).values(routine.revisions.map((revision) => ({
      id: revision.id,
      routineId: routine.id,
      content: revision.content,
      priority: revision.priority,
      daysOfWeek: revision.daysOfWeek,
      startDate: revision.startDate,
      endDate: revision.endDate ?? null,
      isActive: revision.isActive,
      createdAt: revision.createdAt,
    })));
  });
}

export async function createRoutineForUser(userId: string, input: RoutineInput) {
  const timestamp = new Date().toISOString();
  const routineId = randomUUID();
  const revision: RoutineRevision = { id: randomUUID(), routineId, ...input, createdAt: timestamp };
  const db = getDatabase();
  await db.transaction(async (tx) => {
    await tx.insert(routines).values({ id: routineId, userId, ...input, createdAt: timestamp, updatedAt: timestamp });
    await tx.insert(routineRevisions).values({ id: revision.id, routineId, ...input, createdAt: timestamp });
  });
  return (await findRoutine(userId, routineId)).routine;
}

export async function seedDefaultRoutines(userId: string) {
  const today = getServerTodayDate();
  const timestamp = new Date().toISOString();
  const seed = [
    ["体を動かす", "required", [1, 2, 3, 4, 5]],
    ["本を読む", "required", [0, 1, 2, 3, 4, 5, 6]],
    ["英語を勉強する", "optional", [1, 2, 3, 4, 5]],
    ["日記を書く", "optional", [0, 2, 4, 6]],
  ] as const;
  const db = getDatabase();
  await db.transaction(async (tx) => {
    for (const [content, priority, daysOfWeek] of seed) {
      const routineId = randomUUID();
      const mutableDaysOfWeek = [...daysOfWeek];
      await tx.insert(routines).values({ id: routineId, userId, content, priority, daysOfWeek: mutableDaysOfWeek, startDate: today, isActive: true, createdAt: timestamp, updatedAt: timestamp });
      await tx.insert(routineRevisions).values({ id: randomUUID(), routineId, content, priority, daysOfWeek: mutableDaysOfWeek, startDate: today, isActive: true, createdAt: timestamp });
    }
  });
}

export async function updateRoutineForUser(userId: string, routineId: string, input: RoutineInput) {
  const { routine } = await findRoutine(userId, routineId);
  const today = getServerTodayDate();
  const deactivating = routine.isActive && !input.isActive;
  const effectiveDate = deactivating ? addDateDays(today, 1) : input.startDate > today ? input.startDate : today;
  const nextInput = deactivating ? { ...input, startDate: effectiveDate, endDate: undefined } : input;
  const nextRoutine = withNewRevision(routine, nextInput, effectiveDate, new Date().toISOString());
  await replaceRoutine(userId, nextRoutine);
  return (await findRoutine(userId, routineId)).routine;
}

export async function deactivateRoutineForUser(userId: string, routineId: string) {
  const { routine } = await findRoutine(userId, routineId);
  if (!routine.isActive) return routine;
  const today = getServerTodayDate();
  const currentRevision = revisionForDate(routine, today) ?? routine.revisions.at(-1);
  if (!currentRevision) throw new RoutineServiceError("ルーティーン履歴が見つかりません。", 500);
  return updateRoutineForUser(userId, routineId, inputFromRevision(currentRevision, { isActive: false, startDate: addDateDays(today, 1), endDate: undefined }));
}

export async function reactivateRoutineForUser(userId: string, routineId: string) {
  const { routine } = await findRoutine(userId, routineId);
  if (routine.isActive) return routine;
  const today = getServerTodayDate();
  const currentRevision = revisionForDate(routine, today) ?? routine.revisions.at(-1);
  if (!currentRevision) throw new RoutineServiceError("ルーティーン履歴が見つかりません。", 500);
  return updateRoutineForUser(userId, routineId, inputFromRevision(currentRevision, { isActive: true, startDate: today, endDate: undefined }));
}

export async function toggleRoutineLog(userId: string, routineId: string, date: string) {
  if (!isDateKey(date)) throw new RoutineServiceError("日付の指定が不正です。", 400);
  const { routine } = await findRoutine(userId, routineId);
  const today = getServerTodayDate();
  const revision = revisionForDate(routine, date);
  if (date > today || !revision || !revision.isActive || !revision.daysOfWeek.includes(getDayOfWeek(date))) throw new RoutineServiceError("この日に記録できるルーティーンではありません。", 400);
  const db = getDatabase();
  const [existing] = await db.select().from(routineLogs).where(and(eq(routineLogs.userId, userId), eq(routineLogs.routineId, routineId), eq(routineLogs.date, date))).limit(1);
  if (existing) {
    await db.delete(routineLogs).where(eq(routineLogs.id, existing.id));
    return null;
  }
  const timestamp = new Date().toISOString();
  const [log] = await db.insert(routineLogs).values({ id: randomUUID(), userId, routineId, date, createdAt: timestamp, updatedAt: timestamp }).returning();
  return { id: log.id, routineId: log.routineId, date: log.date, createdAt: log.createdAt, updatedAt: log.updatedAt } satisfies RoutineLog;
}
