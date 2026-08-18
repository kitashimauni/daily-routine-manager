"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { addDays, getDayOfWeek, getTodayDate, isDateInRange, toDateKey } from "@/lib/date";
import type { DailyRoutines, Priority, Routine, RoutineLog, RoutineLogs, RoutineRevision, RoutineWithStatus } from "@/lib/types";

const STORAGE_KEY = "daily-routine-manager:v1";

interface StoredData {
  routines: Routine[];
  logs: RoutineLogs;
}

export interface RoutineInput {
  content: string;
  priority: Priority;
  daysOfWeek: number[];
  startDate: string;
  endDate?: string;
  isActive: boolean;
}

interface RoutineContextValue {
  routines: Routine[];
  logs: RoutineLogs;
  hydrated: boolean;
  getDailyRoutines: (date: string) => DailyRoutines;
  isCompleted: (routineId: string, date: string) => boolean;
  toggleRoutine: (routineId: string, date: string) => void;
  addRoutine: (input: RoutineInput) => void;
  updateRoutine: (routineId: string, input: RoutineInput) => void;
  deactivateRoutine: (routineId: string) => void;
  reactivateRoutine: (routineId: string) => void;
}

const RoutineContext = createContext<RoutineContextValue | null>(null);

function revisionFromRoutine(routine: Omit<Routine, "revisions">, id = `legacy-${routine.id}`): RoutineRevision {
  return {
    id,
    routineId: routine.id,
    content: routine.content,
    priority: routine.priority,
    daysOfWeek: routine.daysOfWeek,
    startDate: routine.startDate,
    endDate: routine.endDate,
    isActive: routine.isActive,
    createdAt: routine.createdAt,
  };
}

function normalizeRoutine(routine: Routine): Routine {
  if (Array.isArray(routine.revisions) && routine.revisions.length > 0) return routine;

  const today = getTodayDate();
  const base = revisionFromRoutine(routine);
  if (routine.isActive) return { ...routine, revisions: [base] };

  const deactivatedOn = dateFromTimestamp(routine.updatedAt, today);
  const historicalEnd = addDays(deactivatedOn, -1);
  const historical = base.startDate <= historicalEnd
    ? [{ ...base, id: `${base.id}-historical`, isActive: true, endDate: base.endDate && base.endDate < historicalEnd ? base.endDate : historicalEnd }]
    : [];
  const inactive: RoutineRevision = { ...base, id: `${base.id}-inactive`, startDate: deactivatedOn, endDate: undefined, isActive: false };
  return { ...routine, revisions: [...historical, inactive] };
}

function dateFromTimestamp(timestamp: string | undefined, fallback: string) {
  const parsed = new Date(timestamp ?? "");
  return Number.isNaN(parsed.getTime()) ? fallback : toDateKey(parsed);
}

function migrateStoredData(data: StoredData): StoredData {
  return {
    routines: (data.routines ?? []).map(normalizeRoutine),
    logs: data.logs ?? {},
  };
}

function makeRevision(routineId: string, input: RoutineInput, startDate: string, timestamp: string): RoutineRevision {
  return {
    id: crypto.randomUUID(),
    routineId,
    content: input.content,
    priority: input.priority,
    daysOfWeek: input.daysOfWeek,
    startDate,
    endDate: input.endDate,
    isActive: input.isActive,
    createdAt: timestamp,
  };
}

function revisionForDate(routine: Routine, date: string) {
  return [...routine.revisions]
    .sort((left, right) => right.startDate.localeCompare(left.startDate))
    .find((revision) => isDateInRange(date, revision.startDate, revision.endDate));
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

function withNewRevision(routine: Routine, input: RoutineInput, effectiveDate: string, timestamp: string): Routine {
  const today = getTodayDate();
  const endDate = input.endDate && input.endDate >= effectiveDate ? input.endDate : undefined;
  const nextInput = { ...input, startDate: effectiveDate, endDate };
  const previous = routine.revisions
    .filter((revision) => effectiveDate > today ? revision.startDate <= today : revision.startDate < effectiveDate)
    .map((revision) => {
      if (revision.endDate && revision.endDate < effectiveDate) return revision;
      return { ...revision, endDate: addDays(effectiveDate, -1) };
    });
  const nextRevision = makeRevision(routine.id, nextInput, effectiveDate, timestamp);
  return { ...routine, ...nextInput, revisions: [...previous, nextRevision], updatedAt: timestamp };
}

function seedRoutine(id: string, content: string, priority: Priority, daysOfWeek: number[], today: string, timestamp: string): Routine {
  const routine = { id, content, priority, daysOfWeek, startDate: today, isActive: true, createdAt: timestamp, updatedAt: timestamp };
  return { ...routine, revisions: [revisionFromRoutine(routine, `${id}-revision`)] };
}

function createSeedData(today: string): StoredData {
  const timestamp = new Date().toISOString();
  return {
    routines: [
      seedRoutine("seed-move", "体を動かす", "required", [1, 2, 3, 4, 5], today, timestamp),
      seedRoutine("seed-reading", "本を読む", "required", [0, 1, 2, 3, 4, 5, 6], today, timestamp),
      seedRoutine("seed-english", "英語を勉強する", "optional", [1, 2, 3, 4, 5], today, timestamp),
      seedRoutine("seed-journal", "日記を書く", "optional", [0, 2, 4, 6], today, timestamp),
    ],
    // Sample routines are intentionally incomplete until the user checks them.
    logs: {},
  };
}

export function RoutineProvider({ children }: { children: React.ReactNode }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLogs>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const initial = raw ? migrateStoredData(JSON.parse(raw) as StoredData) : createSeedData(getTodayDate());
    setRoutines(initial.routines);
    setLogs(initial.logs);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ routines, logs } satisfies StoredData));
  }, [hydrated, routines, logs]);

  const getDailyRoutines = useCallback((date: string): DailyRoutines => {
    const dayOfWeek = getDayOfWeek(date);
    const scheduled = routines.flatMap((routine): RoutineWithStatus[] => {
      const revision = revisionForDate(routine, date);
      if (!revision || !revision.isActive || !revision.daysOfWeek.includes(dayOfWeek)) return [];

      const routineForDate: Routine = {
        ...routine,
        content: revision.content,
        priority: revision.priority,
        daysOfWeek: revision.daysOfWeek,
        startDate: revision.startDate,
        endDate: revision.endDate,
        isActive: revision.isActive,
      };
      return [{ routine: routineForDate, completed: Boolean(logs[`${routine.id}__${date}`]) }];
    });

    return {
      required: scheduled.filter(({ routine }) => routine.priority === "required"),
      optional: scheduled.filter(({ routine }) => routine.priority === "optional"),
    };
  }, [logs, routines]);

  const isCompleted = useCallback((routineId: string, date: string) => Boolean(logs[`${routineId}__${date}`]), [logs]);

  const toggleRoutine = useCallback((routineId: string, date: string) => {
    if (date > getTodayDate()) return;
    const key = `${routineId}__${date}`;
    setLogs((current) => {
      const next = { ...current };
      if (next[key]) {
        delete next[key];
      } else {
        const timestamp = new Date().toISOString();
        const log: RoutineLog = { id: crypto.randomUUID(), routineId, date, createdAt: timestamp, updatedAt: timestamp };
        next[key] = log;
      }
      return next;
    });
  }, []);

  const addRoutine = useCallback((input: RoutineInput) => {
    const timestamp = new Date().toISOString();
    const routineId = crypto.randomUUID();
    const routine = { ...input, id: routineId, createdAt: timestamp, updatedAt: timestamp };
    setRoutines((current) => [...current, { ...routine, revisions: [makeRevision(routineId, input, input.startDate, timestamp)] }]);
  }, []);

  const updateRoutine = useCallback((routineId: string, input: RoutineInput) => {
    const today = getTodayDate();
    const timestamp = new Date().toISOString();
    setRoutines((current) => current.map((routine) => {
      if (routine.id !== routineId) return routine;
      const deactivating = routine.isActive && !input.isActive;
      const effectiveDate = deactivating ? addDays(today, 1) : input.startDate > today ? input.startDate : today;
      const nextInput = deactivating ? { ...input, startDate: effectiveDate, endDate: undefined } : input;
      return withNewRevision(routine, nextInput, effectiveDate, timestamp);
    }));
  }, []);

  const deactivateRoutine = useCallback((routineId: string) => {
    const today = getTodayDate();
    const effectiveDate = addDays(today, 1);
    const timestamp = new Date().toISOString();
    setRoutines((current) => current.map((routine) => {
      if (routine.id !== routineId || !routine.isActive) return routine;
      const currentRevision = revisionForDate(routine, today) ?? revisionFromRoutine(routine);
      return withNewRevision(routine, inputFromRevision(currentRevision, { isActive: false, startDate: effectiveDate, endDate: undefined }), effectiveDate, timestamp);
    }));
  }, []);

  const reactivateRoutine = useCallback((routineId: string) => {
    const today = getTodayDate();
    const timestamp = new Date().toISOString();
    setRoutines((current) => current.map((routine) => {
      if (routine.id !== routineId || routine.isActive) return routine;
      const currentRevision = revisionForDate(routine, today) ?? [...routine.revisions].sort((left, right) => right.startDate.localeCompare(left.startDate))[0] ?? revisionFromRoutine(routine);
      return withNewRevision(routine, inputFromRevision(currentRevision, { isActive: true, startDate: today, endDate: undefined }), today, timestamp);
    }));
  }, []);

  const value = useMemo(
    () => ({ routines, logs, hydrated, getDailyRoutines, isCompleted, toggleRoutine, addRoutine, updateRoutine, deactivateRoutine, reactivateRoutine }),
    [addRoutine, deactivateRoutine, getDailyRoutines, hydrated, isCompleted, logs, reactivateRoutine, routines, toggleRoutine, updateRoutine],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
}

export function useRoutines() {
  const context = useContext(RoutineContext);
  if (!context) throw new Error("useRoutines must be used inside RoutineProvider");
  return context;
}
