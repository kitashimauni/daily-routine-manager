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
  errorSource: "auth" | "data" | "session" | null;
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
  retry: () => Promise<void>;
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}

const RoutineContext = createContext<RoutineContextValue | null>(null);

export class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}

function isUnauthorizedError(error: unknown) {
  return Boolean(error && typeof error === "object" && "status" in error && error.status === 401);
}

async function requestJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(input, { ...init, credentials: "same-origin", headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiRequestError(typeof body.error === "string" ? body.error : "サーバーでエラーが発生しました。", response.status);
  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "サーバーでエラーが発生しました。";
}

export function RoutineProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<"auth" | "data" | "session" | null>(null);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [logs, setLogs] = useState<RoutineLogs>({});
  const [hydrated, setHydrated] = useState(false);

  const resetData = useCallback(() => {
    setRoutines([]);
    setLogs({});
    setHydrated(true);
  }, []);

  const invalidateSession = useCallback((message = "セッションの有効期限が切れました。再度ログインしてください。") => {
    setUser(null);
    resetData();
    setAuthHydrated(true);
    setError(message);
    setErrorSource("session");
  }, [resetData]);

  const authenticatedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
    const response = await fetch(input, { ...init, credentials: "same-origin", headers });
    if (response.status === 401) invalidateSession();
    return response;
  }, [invalidateSession]);

  const authenticatedRequestJson = useCallback(async <T,>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
    const response = await authenticatedFetch(input, init);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiRequestError(typeof body.error === "string" ? body.error : "サーバーでエラーが発生しました。", response.status);
    return body as T;
  }, [authenticatedFetch]);

  const loadRoutineData = useCallback(async () => {
    const data = await authenticatedRequestJson<RoutineDataResponse>("/api/routines");
    setRoutines(data.routines);
    setLogs(data.logs);
    setHydrated(true);
  }, [authenticatedRequestJson]);

  const refreshSession = useCallback(async (preserveUi = false) => {
    if (!preserveUi) setAuthHydrated(false);
    setError(null);
    setErrorSource(null);
    try {
      const response = await requestJson<{ user: AuthUser | null }>("/api/auth/session");
      setUser(response.user);
      if (response.user) {
        if (!preserveUi) setHydrated(false);
        await loadRoutineData();
      }
      else resetData();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) invalidateSession();
      else {
        setError(errorMessage(requestError));
        setErrorSource("data");
      }
    } finally {
      setAuthHydrated(true);
      setHydrated(true);
    }
  }, [invalidateSession, loadRoutineData, resetData]);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const authenticate = useCallback(async (endpoint: string, email: string, password: string) => {
    setError(null);
    setErrorSource(null);
    setHydrated(false);
    let response: { user: AuthUser };
    try {
      response = await requestJson<{ user: AuthUser }>(endpoint, { method: "POST", body: JSON.stringify({ email, password }) });
    } catch (authError) {
      setUser(null);
      resetData();
      setError(errorMessage(authError));
      setErrorSource("auth");
      setAuthHydrated(true);
      throw authError;
    }

    setUser(response.user);
    try {
      await loadRoutineData();
    } catch (dataError) {
      if (isUnauthorizedError(dataError)) invalidateSession();
      else {
        setError(errorMessage(dataError));
        setErrorSource("data");
      }
    } finally {
      setAuthHydrated(true);
      setHydrated(true);
    }
  }, [invalidateSession, loadRoutineData, resetData]);

  const login = useCallback((email: string, password: string) => authenticate("/api/auth/login", email, password), [authenticate]);
  const register = useCallback((email: string, password: string) => authenticate("/api/auth/register", email, password), [authenticate]);

  const logout = useCallback(async () => {
    setError(null);
    setErrorSource(null);
    try {
      await authenticatedRequestJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
      setUser(null);
      resetData();
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) invalidateSession();
      else {
        setError(errorMessage(requestError));
        setErrorSource("data");
      }
    }
  }, [authenticatedRequestJson, invalidateSession, resetData]);

  const getDailyRoutines = useCallback((date: string): DailyRoutines => getDailyRoutinesForDate(routines, logs, date), [logs, routines]);

  const isCompleted = useCallback((routineId: string, date: string) => Boolean(logs[`${routineId}__${date}`]), [logs]);

  const toggleRoutine = useCallback(async (routineId: string, date: string) => {
    const completed = !Boolean(logs[`${routineId}__${date}`]);
    setError(null);
    setErrorSource(null);
    try {
      const response = await authenticatedRequestJson<{ log: RoutineLog | null }>(`/api/routines/${encodeURIComponent(routineId)}/log`, { method: "PUT", body: JSON.stringify({ date, completed }) });
      setLogs((current) => {
        const next = { ...current };
        const key = `${routineId}__${date}`;
        if (response.log) next[key] = response.log;
        else delete next[key];
        return next;
      });
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) invalidateSession();
      else {
        setError(errorMessage(requestError));
        setErrorSource("data");
      }
    }
  }, [authenticatedRequestJson, invalidateSession, logs]);

  const addRoutine = useCallback(async (input: RoutineInput) => {
    setError(null);
    setErrorSource(null);
    try {
      const response = await authenticatedRequestJson<{ routine: Routine }>("/api/routines", { method: "POST", body: JSON.stringify(input) });
      setRoutines((current) => [...current, response.routine]);
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) invalidateSession();
      else {
        setError(errorMessage(requestError));
        setErrorSource("data");
      }
      throw requestError;
    }
  }, [authenticatedRequestJson, invalidateSession]);

  const updateRoutine = useCallback(async (routineId: string, input: RoutineInput) => {
    setError(null);
    setErrorSource(null);
    try {
      const response = await authenticatedRequestJson<{ routine: Routine }>(`/api/routines/${encodeURIComponent(routineId)}`, { method: "PATCH", body: JSON.stringify(input) });
      setRoutines((current) => current.map((routine) => routine.id === routineId ? response.routine : routine));
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) invalidateSession();
      else {
        setError(errorMessage(requestError));
        setErrorSource("data");
      }
      throw requestError;
    }
  }, [authenticatedRequestJson, invalidateSession]);

  const changeRoutineState = useCallback(async (routineId: string, action: "deactivate" | "reactivate") => {
    setError(null);
    setErrorSource(null);
    try {
      const response = await authenticatedRequestJson<{ routine: Routine }>(`/api/routines/${encodeURIComponent(routineId)}`, { method: "POST", body: JSON.stringify({ action }) });
      setRoutines((current) => current.map((routine) => routine.id === routineId ? response.routine : routine));
    } catch (requestError) {
      if (isUnauthorizedError(requestError)) invalidateSession();
      else {
        setError(errorMessage(requestError));
        setErrorSource("data");
      }
    }
  }, [authenticatedRequestJson, invalidateSession]);

  const deactivateRoutine = useCallback((routineId: string) => changeRoutineState(routineId, "deactivate"), [changeRoutineState]);
  const reactivateRoutine = useCallback((routineId: string) => changeRoutineState(routineId, "reactivate"), [changeRoutineState]);
  const retry = useCallback(() => refreshSession(true), [refreshSession]);

  const value = useMemo(
    () => ({ user, authHydrated, error, errorSource, routines, logs, hydrated, getDailyRoutines, isCompleted, toggleRoutine, addRoutine, updateRoutine, deactivateRoutine, reactivateRoutine, login, register, logout, retry, authenticatedFetch }),
    [addRoutine, authenticatedFetch, authHydrated, deactivateRoutine, error, errorSource, getDailyRoutines, hydrated, isCompleted, login, logs, logout, reactivateRoutine, register, retry, routines, toggleRoutine, updateRoutine, user],
  );

  return <RoutineContext.Provider value={value}>{children}</RoutineContext.Provider>;
}

export function useRoutines() {
  const context = useContext(RoutineContext);
  if (!context) throw new Error("useRoutines must be used inside RoutineProvider");
  return context;
}
