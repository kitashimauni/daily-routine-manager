import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { routineLogs, routineRevisions, routines } from "@/lib/db/schema";
import { getDayOfWeek, isValidDateKey } from "@/lib/date";
import { addDateDays, getServerTodayDate } from "@/lib/server-date";
import { isRoutineEnded } from "@/lib/routine-view";
import type { Routine, RoutineInput, RoutineLog, RoutineLogs, RoutineRevision } from "@/lib/types";

export class RoutineServiceError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
    this.name = "RoutineServiceError";
  }
}

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseExpectedUpdatedAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) throw new RoutineServiceError("updatedAtは必須です。", 400);
  if (!ISO_TIMESTAMP_PATTERN.test(value) || Number.isNaN(Date.parse(value))) throw new RoutineServiceError("updatedAtの形式が不正です。", 400);
  return new Date(value).toISOString();
}

export function parseRoutineMutationUpdatedAt(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return parseExpectedUpdatedAt(undefined);
  return parseExpectedUpdatedAt((value as { updatedAt?: unknown }).updatedAt);
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
  if (!isValidDateKey(startDate) || (endDate && !isValidDateKey(endDate)) || (endDate && endDate < startDate)) throw new RoutineServiceError("期間の指定が不正です。", 400);
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
      createdAt: normalizeTimestamp(revision.createdAt),
    })),
    createdAt: normalizeTimestamp(row.createdAt),
    updatedAt: normalizeTimestamp(row.updatedAt),
  };
}

function conflictError() {
  return new RoutineServiceError("ルーティーンが別の場所で更新されています。再読み込みしてから再度保存してください。", 409);
}

function normalizeTimestamp(value: string) {
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? value : timestamp.toISOString();
}

function nextTimestamp(previous: string) {
  const now = Date.now();
  const previousTime = Date.parse(previous);
  return new Date(Math.max(now, previousTime + 1)).toISOString();
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

function inputFromRoutine(routine: Routine, overrides: Partial<RoutineInput> = {}): RoutineInput {
  return {
    content: routine.content,
    priority: routine.priority,
    daysOfWeek: routine.daysOfWeek,
    startDate: routine.startDate,
    endDate: routine.endDate,
    isActive: routine.isActive,
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
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(routines).where(and(eq(routines.id, routineId), eq(routines.userId, userId))).limit(1);
    if (!row) throw new RoutineServiceError("ルーティーンが見つかりません。", 404);
    const revisions = await tx.select().from(routineRevisions).where(eq(routineRevisions.routineId, routineId)).orderBy(asc(routineRevisions.startDate), asc(routineRevisions.createdAt));
    return { row, routine: toRoutine(row, revisions) };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

export async function listRoutineData(userId: string) {
  const db = getDatabase();
  return db.transaction(async (tx) => {
    const rows = await tx.select().from(routines).where(eq(routines.userId, userId)).orderBy(asc(routines.createdAt));
    const routineIds = rows.map((row) => row.id);
    const revisions = routineIds.length === 0 ? [] : await tx.select().from(routineRevisions).where(inArray(routineRevisions.routineId, routineIds)).orderBy(asc(routineRevisions.startDate), asc(routineRevisions.createdAt));
    const logRows = routineIds.length === 0 ? [] : await tx.select().from(routineLogs).where(and(eq(routineLogs.userId, userId), inArray(routineLogs.routineId, routineIds)));
    const revisionsByRoutine = new Map<string, Array<typeof routineRevisions.$inferSelect>>();
    for (const revision of revisions) revisionsByRoutine.set(revision.routineId, [...(revisionsByRoutine.get(revision.routineId) ?? []), revision]);
    const logs: RoutineLogs = Object.fromEntries(logRows.map((log): [string, RoutineLog] => [
      `${log.routineId}__${log.date}`,
      { id: log.id, routineId: log.routineId, date: log.date, createdAt: log.createdAt, updatedAt: log.updatedAt },
    ]));
    return { routines: rows.map((row) => toRoutine(row, revisionsByRoutine.get(row.id) ?? [])), logs };
  }, { isolationLevel: "repeatable read", accessMode: "read only" });
}

async function replaceRoutine(userId: string, routine: Routine, expectedUpdatedAt: string) {
  const db = getDatabase();
  await db.transaction(async (tx) => {
    const updated = await tx.update(routines).set({
      content: routine.content,
      priority: routine.priority,
      daysOfWeek: routine.daysOfWeek,
      startDate: routine.startDate,
      endDate: routine.endDate ?? null,
      isActive: routine.isActive,
      updatedAt: routine.updatedAt,
    }).where(and(eq(routines.id, routine.id), eq(routines.userId, userId), eq(routines.updatedAt, expectedUpdatedAt))).returning({ id: routines.id });
    if (updated.length === 0) throw conflictError();
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

async function updateRoutineSummary(userId: string, routine: Routine, expectedUpdatedAt: string) {
  const db = getDatabase();
  const updated = await db.update(routines).set({
    content: routine.content,
    priority: routine.priority,
    daysOfWeek: routine.daysOfWeek,
    startDate: routine.startDate,
    endDate: routine.endDate ?? null,
    isActive: routine.isActive,
    updatedAt: routine.updatedAt,
  }).where(and(eq(routines.id, routine.id), eq(routines.userId, userId), eq(routines.updatedAt, expectedUpdatedAt))).returning({ id: routines.id });
  if (updated.length === 0) throw conflictError();
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

export async function updateRoutineForUser(userId: string, routineId: string, input: RoutineInput, options: { allowEndedResume?: boolean; expectedUpdatedAt?: string } = {}) {
  const { routine } = await findRoutine(userId, routineId);
  if (options.expectedUpdatedAt && options.expectedUpdatedAt !== routine.updatedAt) throw conflictError();
  const expectedUpdatedAt = routine.updatedAt;
  const today = getServerTodayDate();
  const timestamp = nextTimestamp(routine.updatedAt);
  const keepsEnded = !input.endDate || input.endDate < today;
  const startsInFuture = input.startDate > today;
  if (isRoutineEnded(routine, today) && !options.allowEndedResume && keepsEnded && !startsInFuture) {
    const endedRoutine = { ...routine, ...input, endDate: input.endDate ?? routine.endDate, updatedAt: timestamp };
    await updateRoutineSummary(userId, endedRoutine, expectedUpdatedAt);
    return (await findRoutine(userId, routineId)).routine;
  }
  const deactivating = routine.isActive && !input.isActive;
  const effectiveDate = deactivating ? addDateDays(today, 1) : input.startDate > today ? input.startDate : today;
  const nextInput = deactivating ? { ...input, startDate: effectiveDate, endDate: undefined } : input;
  const nextRoutine = withNewRevision(routine, nextInput, effectiveDate, timestamp);
  await replaceRoutine(userId, nextRoutine, expectedUpdatedAt);
  return (await findRoutine(userId, routineId)).routine;
}

export async function deactivateRoutineForUser(userId: string, routineId: string, options: { expectedUpdatedAt?: string } = {}) {
  const { routine } = await findRoutine(userId, routineId);
  if (!routine.isActive) return routine;
  const today = getServerTodayDate();
  const currentRevision = revisionForDate(routine, today) ?? routine.revisions.at(-1);
  if (!currentRevision) throw new RoutineServiceError("ルーティーン履歴が見つかりません。", 500);
  const currentInput = isRoutineEnded(routine, today) ? inputFromRoutine(routine) : inputFromRevision(currentRevision);
  return updateRoutineForUser(userId, routineId, { ...currentInput, isActive: false, startDate: addDateDays(today, 1), endDate: undefined }, options);
}

export async function reactivateRoutineForUser(userId: string, routineId: string, options: { expectedUpdatedAt?: string } = {}) {
  const { routine } = await findRoutine(userId, routineId);
  const today = getServerTodayDate();
  if (routine.isActive && !isRoutineEnded(routine, today)) return routine;
  if (isRoutineEnded(routine, today)) {
    return updateRoutineForUser(userId, routineId, inputFromRoutine(routine, { isActive: true, startDate: today, endDate: undefined }), { ...options, allowEndedResume: true });
  }
  const currentRevision = revisionForDate(routine, today) ?? routine.revisions.at(-1);
  if (!currentRevision) throw new RoutineServiceError("ルーティーン履歴が見つかりません。", 500);
  return updateRoutineForUser(userId, routineId, inputFromRevision(currentRevision, { isActive: true, startDate: today, endDate: undefined }), options);
}

export async function setRoutineLog(userId: string, routineId: string, date: string, completed: boolean) {
  if (!isValidDateKey(date)) throw new RoutineServiceError("日付の指定が不正です。", 400);
  const { routine } = await findRoutine(userId, routineId);
  const today = getServerTodayDate();
  const revision = revisionForDate(routine, date);
  if (date > today || !revision || !revision.isActive || !revision.daysOfWeek.includes(getDayOfWeek(date))) throw new RoutineServiceError("この日に記録できるルーティーンではありません。", 400);
  const db = getDatabase();
  if (!completed) {
    await db.delete(routineLogs).where(and(eq(routineLogs.userId, userId), eq(routineLogs.routineId, routineId), eq(routineLogs.date, date)));
    return null;
  }
  const timestamp = new Date().toISOString();
  const [log] = await db.insert(routineLogs)
    .values({ id: randomUUID(), userId, routineId, date, createdAt: timestamp, updatedAt: timestamp })
    .onConflictDoNothing({ target: [routineLogs.routineId, routineLogs.date] })
    .returning();
  if (log) return { id: log.id, routineId: log.routineId, date: log.date, createdAt: log.createdAt, updatedAt: log.updatedAt } satisfies RoutineLog;
  const [existing] = await db.select().from(routineLogs).where(and(eq(routineLogs.userId, userId), eq(routineLogs.routineId, routineId), eq(routineLogs.date, date))).limit(1);
  if (!existing) throw new RoutineServiceError("完了ログの保存に失敗しました。", 500);
  return { id: existing.id, routineId: existing.routineId, date: existing.date, createdAt: existing.createdAt, updatedAt: existing.updatedAt } satisfies RoutineLog;
}
