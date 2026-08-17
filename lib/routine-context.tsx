"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getDayOfWeek, getTodayDate, isDateInRange } from "@/lib/date";
import type { DailyRoutines, Priority, Routine, RoutineLog, RoutineLogs, RoutineWithStatus } from "@/lib/types";

const STORAGE_KEY = "daily-routine-manager:v1";

interface StoredData {
  routines: Routine[];
  logs: RoutineLogs;
}

interface RoutineInput {
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

function createSeedData(today: string): StoredData {
  const timestamp = new Date().toISOString();
  const routines: Routine[] = [
    {
      id: "seed-move",
      content: "体を動かす",
      priority: "required",
      daysOfWeek: [1, 2, 3, 4, 5],
      startDate: today,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "seed-reading",
      content: "本を読む",
      priority: "required",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: today,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "seed-english",
      content: "英語を勉強する",
      priority: "optional",
      daysOfWeek: [1, 2, 3, 4, 5],
      startDate: today,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "seed-journal",
      content: "日記を書く",
      priority: "optional",
      daysOfWeek: [0, 2, 4, 6],
      startDate: today,
      isActive: true,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ];

  const logs: RoutineLogs = {};
  if (getDayOfWeek(today) !== 0) {
    [routines[0], routines[1]].forEach((routine) => {
      const log: RoutineLog = {
        id: `seed-log-${routine.id}`,
        routineId: routine.id,
        date: today,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      logs[`${routine.id}__${today}`] = log;
    });
  }
  return { routines, logs };
}

export function RoutineProvider({ children }: { children: React.ReactNode }) {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLogs>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const initial = raw ? (JSON.parse(raw) as StoredData) : createSeedData(getTodayDate());
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
    const scheduled = routines
      .filter(
        (routine) =>
          routine.isActive &&
          routine.daysOfWeek.includes(dayOfWeek) &&
          isDateInRange(date, routine.startDate, routine.endDate),
      )
      .map((routine): RoutineWithStatus => ({
        routine,
        completed: Boolean(logs[`${routine.id}__${date}`]),
      }));

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
        next[key] = { id: crypto.randomUUID(), routineId, date, createdAt: timestamp, updatedAt: timestamp };
      }
      return next;
    });
  }, []);

  const addRoutine = useCallback((input: RoutineInput) => {
    const timestamp = new Date().toISOString();
    setRoutines((current) => [
      ...current,
      { ...input, id: crypto.randomUUID(), createdAt: timestamp, updatedAt: timestamp },
    ]);
  }, []);

  const updateRoutine = useCallback((routineId: string, input: RoutineInput) => {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === routineId ? { ...routine, ...input, updatedAt: new Date().toISOString() } : routine,
      ),
    );
  }, []);

  const deactivateRoutine = useCallback((routineId: string) => {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === routineId ? { ...routine, isActive: false, updatedAt: new Date().toISOString() } : routine,
      ),
    );
  }, []);

  const reactivateRoutine = useCallback((routineId: string) => {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === routineId ? { ...routine, isActive: true, updatedAt: new Date().toISOString() } : routine,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({
      routines,
      logs,
      hydrated,
      getDailyRoutines,
      isCompleted,
      toggleRoutine,
      addRoutine,
      updateRoutine,
      deactivateRoutine,
      reactivateRoutine,
    }),
    [addRoutine, deactivateRoutine, getDailyRoutines, hydrated, isCompleted, logs, reactivateRoutine, routines, toggleRoutine, updateRoutine],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
}

export function useRoutines() {
  const context = useContext(RoutineContext);
  if (!context) throw new Error("useRoutines must be used inside RoutineProvider");
  return context;
}
