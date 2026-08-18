"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getDailyRoutinesForDate } from "@/lib/routine-view";
import type { AuthUser, DailyRoutines, Routine, RoutineInput, RoutineLog, RoutineLogs } from "@/lib/types";

export type { RoutineInput } from "@/lib/types";

interface RoutineDataResponse {
  routines: Routine[];
  logs: RoutineLogs;
}

interface RoutineContextValue {
  user: AuthUser | null;
  authHydrated: boolean;
  error: string | null;
  routines: Routine[];
  logs: RoutineLogs;
  hydrated: boolean;
  getDailyRoutines: (date: string) => DailyRoutines;
  isCompleted: (routineId: string, date: string) => boolean;
  toggleRoutine: (routineId: string, date: string) => Promise<void>;
  addRoutine: (input: RoutineInput) => Promise<void>;
  updateRoutine: (routineId: string, input: RoutineInput) => Promise<void>;
  deactivateRoutine: (routineId: string) => Promise<void>;
  reactivateRoutine: (routineId: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const RoutineContext = createContext<RoutineContextValue | null>(null);

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(input, { ...init, credentials: "same-origin", headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "サーバーでエラーが発生しました。");
  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "サーバーでエラーが発生しました。";
}

export function RoutineProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLogs>({});
  const [hydrated, setHydrated] = useState(false);

  const resetData = useCallback(() => {
    setRoutines([]);
    setLogs({});
    setHydrated(true);
  }, []);

  const loadRoutineData = useCallback(async () => {
    const data = await requestJson<RoutineDataResponse>("/api/routines");
    setRoutines(data.routines);
    setLogs(data.logs);
    setHydrated(true);
  }, []);

  const refreshSession = useCallback(async () => {
    setAuthHydrated(false);
    setHydrated(false);
    setError(null);
    try {
      const response = await requestJson<{ user: AuthUser | null }>("/api/auth/session");
      setUser(response.user);
      if (response.user) await loadRoutineData();
      else resetData();
    } catch (requestError) {
      setUser(null);
      resetData();
      setError(errorMessage(requestError));
    } finally {
      setAuthHydrated(true);
      setHydrated(true);
    }
  }, [loadRoutineData, resetData]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const authenticate = useCallback(async (endpoint: string, email: string, password: string) => {
    setError(null);
    try {
      const response = await requestJson<{ user: AuthUser }>(endpoint, { method: "POST", body: JSON.stringify({ email, password }) });
      setUser(response.user);
      await loadRoutineData();
      setAuthHydrated(true);
    } catch (requestError) {
      setError(errorMessage(requestError));
      throw requestError;
    }
  }, [loadRoutineData]);

  const login = useCallback((email: string, password: string) => authenticate("/api/auth/login", email, password), [authenticate]);
  const register = useCallback((email: string, password: string) => authenticate("/api/auth/register", email, password), [authenticate]);

  const logout = useCallback(async () => {
    try {
      await requestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
      setUser(null);
      setError(null);
      resetData();
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, [resetData]);

  const getDailyRoutines = useCallback((date: string): DailyRoutines => getDailyRoutinesForDate(routines, logs, date), [logs, routines]);

  const isCompleted = useCallback((routineId: string, date: string) => Boolean(logs[`${routineId}__${date}`]), [logs]);

  const toggleRoutine = useCallback(async (routineId: string, date: string) => {
    const completed = !Boolean(logs[`${routineId}__${date}`]);
    setError(null);
    try {
      const response = await requestJson<{ log: RoutineLog | null }>(`/api/routines/${encodeURIComponent(routineId)}/log`, { method: "PUT", body: JSON.stringify({ date, completed }) });
      setLogs((current) => {
        const next = { ...current };
        const key = `${routineId}__${date}`;
        if (response.log) next[key] = response.log;
        else delete next[key];
        return next;
      });
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, [logs]);

  const addRoutine = useCallback(async (input: RoutineInput) => {
    setError(null);
    try {
      const response = await requestJson<{ routine: Routine }>("/api/routines", { method: "POST", body: JSON.stringify(input) });
      setRoutines((current) => [...current, response.routine]);
    } catch (requestError) {
      setError(errorMessage(requestError));
      throw requestError;
    }
  }, []);

  const updateRoutine = useCallback(async (routineId: string, input: RoutineInput) => {
    setError(null);
    try {
      const response = await requestJson<{ routine: Routine }>(`/api/routines/${encodeURIComponent(routineId)}`, { method: "PATCH", body: JSON.stringify(input) });
      setRoutines((current) => current.map((routine) => routine.id === routineId ? response.routine : routine));
    } catch (requestError) {
      setError(errorMessage(requestError));
      throw requestError;
    }
  }, []);

  const changeRoutineState = useCallback(async (routineId: string, action: "deactivate" | "reactivate") => {
    try {
      const response = await requestJson<{ routine: Routine }>(`/api/routines/${encodeURIComponent(routineId)}`, { method: "POST", body: JSON.stringify({ action }) });
      setRoutines((current) => current.map((routine) => routine.id === routineId ? response.routine : routine));
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, []);

  const deactivateRoutine = useCallback((routineId: string) => changeRoutineState(routineId, "deactivate"), [changeRoutineState]);
  const reactivateRoutine = useCallback((routineId: string) => changeRoutineState(routineId, "reactivate"), [changeRoutineState]);

  const value = useMemo(
    () => ({ user, authHydrated, error, routines, logs, hydrated, getDailyRoutines, isCompleted, toggleRoutine, addRoutine, updateRoutine, deactivateRoutine, reactivateRoutine, login, register, logout }),
    [addRoutine, authHydrated, deactivateRoutine, error, getDailyRoutines, hydrated, isCompleted, login, logs, logout, reactivateRoutine, register, routines, toggleRoutine, updateRoutine, user],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
}

export function useRoutines() {
  const context = useContext(RoutineContext);
  if (!context) throw new Error("useRoutines must be used inside RoutineProvider");
  return context;
}
