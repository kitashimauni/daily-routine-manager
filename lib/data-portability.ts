import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { routineLogs, routineRevisions, routines } from "@/lib/db/schema";
import { isValidDateKey } from "@/lib/date";

export const DATA_EXPORT_FORMAT = "daily-routine-manager" as const;
export const DATA_EXPORT_SCHEMA_VERSION = 1 as const;
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const MAX_ROUTINES = 1_000;
const MAX_REVISIONS = 10_000;
const MAX_LOGS = 100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class DataPortabilityError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "DataPortabilityError";
  }
}

export interface DataExportRoutine {
  id: string;
  content: string;
  priority: "required" | "optional";
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataExportRevision {
  id: string;
  routineId: string;
  content: string;
  priority: "required" | "optional";
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface DataExportLog {
  id: string;
  routineId: string;
  date: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataExportPayload {
  format: typeof DATA_EXPORT_FORMAT;
  schemaVersion: typeof DATA_EXPORT_SCHEMA_VERSION;
  exportedAt: string;
  data: {
    routines: DataExportRoutine[];
    revisions: DataExportRevision[];
    logs: DataExportLog[];
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function fail(message: string): never {
  throw new DataPortabilityError(message);
}

function assertKeys(value: Record<string, unknown>, keys: string[], label: string) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${label}の項目が不正です。`);
  }
}

function parseString(value: unknown, label: string, maxLength: number) {
  if (typeof value !== "string" || value.length === 0 || value.length > maxLength) fail(`${label}が不正です。`);
  return value;
}

function parseUuid(value: unknown, label: string) {
  const id = parseString(value, label, 36);
  if (!UUID_PATTERN.test(id)) fail(`${label}が不正です。`);
  return id;
}

function parseTimestamp(value: unknown, label: string) {
  const timestamp = parseString(value, label, 64);
  if (Number.isNaN(Date.parse(timestamp))) fail(`${label}が不正です。`);
  return timestamp;
}

function parseDate(value: unknown, label: string) {
  if (typeof value !== "string" || !isValidDateKey(value)) fail(`${label}が不正です。`);
  return value;
}

function parseNullableDate(value: unknown, label: string) {
  if (value === null) return null;
  return parseDate(value, label);
}

function parsePriority(value: unknown, label: string) {
  if (value !== "required" && value !== "optional") fail(`${label}が不正です。`);
  return value;
}

function parseDays(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 7) fail(`${label}が不正です。`);
  const days = value.map((day) => {
    if (!Number.isInteger(day) || day < 0 || day > 6) fail(`${label}が不正です。`);
    return day;
  });
  if (new Set(days).size !== days.length) fail(`${label}が不正です。`);
  return days.sort((left, right) => left - right);
}

function parseRoutine(value: unknown, index: number): DataExportRoutine {
  if (!isRecord(value)) fail(`routines[${index}]が不正です。`);
  assertKeys(value, ["id", "content", "priority", "daysOfWeek", "startDate", "endDate", "isActive", "createdAt", "updatedAt"], `routines[${index}]`);
  const startDate = parseDate(value.startDate, `routines[${index}].startDate`);
  const endDate = parseNullableDate(value.endDate, `routines[${index}].endDate`);
  if (endDate && endDate < startDate) fail(`routines[${index}]の期間が不正です。`);
  if (typeof value.isActive !== "boolean") fail(`routines[${index}].isActiveが不正です。`);
  return {
    id: parseUuid(value.id, `routines[${index}].id`),
    content: parseString(value.content, `routines[${index}].content`, 200),
    priority: parsePriority(value.priority, `routines[${index}].priority`),
    daysOfWeek: parseDays(value.daysOfWeek, `routines[${index}].daysOfWeek`),
    startDate,
    endDate,
    isActive: value.isActive,
    createdAt: parseTimestamp(value.createdAt, `routines[${index}].createdAt`),
    updatedAt: parseTimestamp(value.updatedAt, `routines[${index}].updatedAt`),
  };
}

function parseRevision(value: unknown, index: number): DataExportRevision {
  if (!isRecord(value)) fail(`revisions[${index}]が不正です。`);
  assertKeys(value, ["id", "routineId", "content", "priority", "daysOfWeek", "startDate", "endDate", "isActive", "createdAt"], `revisions[${index}]`);
  const startDate = parseDate(value.startDate, `revisions[${index}].startDate`);
  const endDate = parseNullableDate(value.endDate, `revisions[${index}].endDate`);
  if (endDate && endDate < startDate) fail(`revisions[${index}]の期間が不正です。`);
  if (typeof value.isActive !== "boolean") fail(`revisions[${index}].isActiveが不正です。`);
  return {
    id: parseUuid(value.id, `revisions[${index}].id`),
    routineId: parseUuid(value.routineId, `revisions[${index}].routineId`),
    content: parseString(value.content, `revisions[${index}].content`, 200),
    priority: parsePriority(value.priority, `revisions[${index}].priority`),
    daysOfWeek: parseDays(value.daysOfWeek, `revisions[${index}].daysOfWeek`),
    startDate,
    endDate,
    isActive: value.isActive,
    createdAt: parseTimestamp(value.createdAt, `revisions[${index}].createdAt`),
  };
}

function parseLog(value: unknown, index: number): DataExportLog {
  if (!isRecord(value)) fail(`logs[${index}]が不正です。`);
  assertKeys(value, ["id", "routineId", "date", "createdAt", "updatedAt"], `logs[${index}]`);
  return {
    id: parseUuid(value.id, `logs[${index}].id`),
    routineId: parseUuid(value.routineId, `logs[${index}].routineId`),
    date: parseDate(value.date, `logs[${index}].date`),
    createdAt: parseTimestamp(value.createdAt, `logs[${index}].createdAt`),
    updatedAt: parseTimestamp(value.updatedAt, `logs[${index}].updatedAt`),
  };
}

export function validateDataExport(value: unknown): DataExportPayload {
  if (!isRecord(value)) fail("エクスポートファイルの形式が不正です。");
  assertKeys(value, ["format", "schemaVersion", "exportedAt", "data"], "エクスポートファイル");
  if (value.format !== DATA_EXPORT_FORMAT) fail("対応していないエクスポート形式です。");
  if (value.schemaVersion !== DATA_EXPORT_SCHEMA_VERSION) fail("対応していないschema versionです。");
  const exportedAt = parseTimestamp(value.exportedAt, "exportedAt");
  if (!isRecord(value.data)) fail("エクスポートデータが不正です。");
  assertKeys(value.data, ["routines", "revisions", "logs"], "エクスポートデータ");
  if (!Array.isArray(value.data.routines) || value.data.routines.length > MAX_ROUTINES) fail("routinesの件数が上限を超えています。");
  if (!Array.isArray(value.data.revisions) || value.data.revisions.length > MAX_REVISIONS) fail("revisionsの件数が上限を超えています。");
  if (!Array.isArray(value.data.logs) || value.data.logs.length > MAX_LOGS) fail("logsの件数が上限を超えています。");

  const routinesData = value.data.routines.map(parseRoutine);
  const revisionsData = value.data.revisions.map(parseRevision);
  const logsData = value.data.logs.map(parseLog);
  const routineIds = new Set(routinesData.map((routine) => routine.id));
  const revisionIds = new Set<string>();
  const revisionsByRoutine = new Set<string>();
  const logKeys = new Set<string>();

  if (routineIds.size !== routinesData.length) fail("routinesに重複したIDがあります。");
  for (const revision of revisionsData) {
    if (revisionIds.has(revision.id)) fail("revisionsに重複したIDがあります。");
    if (!routineIds.has(revision.routineId)) fail("revisionsに存在しないroutineへの参照があります。");
    revisionIds.add(revision.id);
    revisionsByRoutine.add(revision.routineId);
  }
  for (const routine of routinesData) {
    if (!revisionsByRoutine.has(routine.id)) fail("routineにrevisionがありません。");
  }
  const logIds = new Set<string>();
  for (const log of logsData) {
    const key = `${log.routineId}__${log.date}`;
    if (!routineIds.has(log.routineId)) fail("logsに存在しないroutineへの参照があります。");
    if (logIds.has(log.id) || logKeys.has(key)) fail("logsに重複があります。");
    logIds.add(log.id);
    logKeys.add(key);
  }

  return { format: DATA_EXPORT_FORMAT, schemaVersion: DATA_EXPORT_SCHEMA_VERSION, exportedAt, data: { routines: routinesData, revisions: revisionsData, logs: logsData } };
}

export async function exportDataForUser(userId: string): Promise<DataExportPayload> {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const routineRows = await tx.select().from(routines).where(eq(routines.userId, userId)).orderBy(asc(routines.createdAt), asc(routines.id));
    const routineIds = routineRows.map((routine) => routine.id);
    const revisionRows = routineIds.length === 0
      ? []
      : await tx.select().from(routineRevisions).where(inArray(routineRevisions.routineId, routineIds)).orderBy(asc(routineRevisions.startDate), asc(routineRevisions.createdAt), asc(routineRevisions.id));
    const logRows = routineIds.length === 0
      ? []
      : await tx.select().from(routineLogs).where(and(eq(routineLogs.userId, userId), inArray(routineLogs.routineId, routineIds))).orderBy(asc(routineLogs.date), asc(routineLogs.id));

    return {
      format: DATA_EXPORT_FORMAT,
      schemaVersion: DATA_EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        routines: routineRows.map(({ id, content, priority, daysOfWeek, startDate, endDate, isActive, createdAt, updatedAt }) => ({ id, content, priority, daysOfWeek, startDate, endDate, isActive, createdAt, updatedAt })),
        revisions: revisionRows.map(({ id, routineId, content, priority, daysOfWeek, startDate, endDate, isActive, createdAt }) => ({ id, routineId, content, priority, daysOfWeek, startDate, endDate, isActive, createdAt })),
        logs: logRows.map(({ id, routineId, date, createdAt, updatedAt }) => ({ id, routineId, date, createdAt, updatedAt })),
      },
    };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function importDataForUser(userId: string, value: unknown) {
  const payload = validateDataExport(value);
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const existingRoutines = await tx.select({ id: routines.id }).from(routines).where(eq(routines.userId, userId));
    const existingRoutineIds = existingRoutines.map(({ id }) => id);
    await tx.delete(routineLogs).where(eq(routineLogs.userId, userId));
    if (existingRoutineIds.length > 0) {
      await tx.delete(routineRevisions).where(inArray(routineRevisions.routineId, existingRoutineIds));
      await tx.delete(routines).where(eq(routines.userId, userId));
    }

    const routineIdMap = new Map(payload.data.routines.map((routine) => [routine.id, randomUUID()]));
    if (payload.data.routines.length > 0) {
      await tx.insert(routines).values(payload.data.routines.map((routine) => ({
        id: routineIdMap.get(routine.id)!,
        userId,
        content: routine.content,
        priority: routine.priority,
        daysOfWeek: routine.daysOfWeek,
        startDate: routine.startDate,
        endDate: routine.endDate,
        isActive: routine.isActive,
        createdAt: routine.createdAt,
        updatedAt: routine.updatedAt,
      })));
    }
    if (payload.data.revisions.length > 0) {
      await tx.insert(routineRevisions).values(payload.data.revisions.map((revision) => ({
        id: randomUUID(),
        routineId: routineIdMap.get(revision.routineId)!,
        content: revision.content,
        priority: revision.priority,
        daysOfWeek: revision.daysOfWeek,
        startDate: revision.startDate,
        endDate: revision.endDate,
        isActive: revision.isActive,
        createdAt: revision.createdAt,
      })));
    }
    if (payload.data.logs.length > 0) {
      await tx.insert(routineLogs).values(payload.data.logs.map((log) => ({
        id: randomUUID(),
        userId,
        routineId: routineIdMap.get(log.routineId)!,
        date: log.date,
        createdAt: log.createdAt,
        updatedAt: log.updatedAt,
      })));
    }

    return {
      routines: payload.data.routines.length,
      revisions: payload.data.revisions.length,
      logs: payload.data.logs.length,
    };
  });
}
