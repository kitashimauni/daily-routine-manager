import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertAuthRateLimit, getClientIp } from "@/lib/auth-rate-limit";
import { getCurrentUser, loginUser, logoutUser, registerUser, removeExpiredSessions } from "@/lib/auth";
import { routineLogs, routineRevisions, routines, sessions, users } from "@/lib/db/schema";
import { getTodayDate, isValidDateKey } from "@/lib/date";
import { getDailyRoutinesForDate, isRoutineEnded, routineForDate } from "@/lib/routine-view";
import { createRoutineForUser, deactivateRoutineForUser, listRoutineData, parseRoutineInput, parseRoutineMutationUpdatedAt, reactivateRoutineForUser, setRoutineLog, updateRoutineForUser } from "@/lib/routine-service";
import { getServerTodayDate } from "@/lib/server-date";
import { assertSafeTestDatabaseUrl } from "@/scripts/test-database-safety.mjs";
import { testDb, testSql } from "@/tests/setup";
import { createCookieStore, createTestUser, TEST_TODAY } from "@/tests/helpers";

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-01-15T03:00:00.000Z"));
});

afterAll(() => {
  vi.useRealTimers();
});

describe("test database safety", () => {
  it("rejects non-test databases and mismatched application URLs", () => {
    expect(() => assertSafeTestDatabaseUrl("postgresql://routine:password@localhost:5432/routine_manager")).toThrow("routine_test");
    expect(() => assertSafeTestDatabaseUrl("postgresql://routine_test:password@localhost:5433/routine_test", "postgresql://routine:password@localhost:5432/routine_manager")).toThrow("must match exactly");
  });
});

describe("date input validation", () => {
  it("accepts real date keys and rejects malformed or nonexistent dates", () => {
    expect(isValidDateKey("2026-02-28")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2026-02-31")).toBe(false);
    expect(isValidDateKey("2026-2-1")).toBe(false);
    expect(isValidDateKey("not-a-date")).toBe(false);
  });

  it("uses the same strict validation for routine periods", () => {
    expect(() => parseRoutineInput({ content: "検証", priority: "required", daysOfWeek: [1], startDate: "2026-02-31", isActive: true })).toThrow("期間の指定が不正です。");
  });

  it("requires an ISO updatedAt for routine mutation requests", () => {
    expect(() => parseRoutineMutationUpdatedAt({})).toThrow("updatedAtは必須です。");
    expect(() => parseRoutineMutationUpdatedAt({ updatedAt: "not-a-timestamp" })).toThrow("updatedAtの形式が不正です。");
    expect(parseRoutineMutationUpdatedAt({ updatedAt: "2026-01-15T12:00:00+09:00" })).toBe("2026-01-15T03:00:00.000Z");
  });

  it("uses the configured app timezone on both sides of the JST midnight boundary", () => {
    const defaultTime = new Date("2026-01-15T03:00:00.000Z");
    vi.stubEnv("APP_TIME_ZONE", "Asia/Tokyo");
    try {
      vi.setSystemTime(new Date("2026-01-14T14:59:59.999Z"));
      expect(getTodayDate()).toBe("2026-01-14");
      expect(getTodayDate("Asia/Tokyo")).toBe(getServerTodayDate());

      vi.setSystemTime(new Date("2026-01-14T15:00:00.000Z"));
      expect(getTodayDate()).toBe("2026-01-15");
      expect(getTodayDate("Asia/Tokyo")).toBe(getServerTodayDate());
      expect(getTodayDate("America/Los_Angeles")).toBe("2026-01-14");
    } finally {
      vi.setSystemTime(defaultTime);
      vi.unstubAllEnvs();
    }
  });

  it("does not trust arbitrary forwarded headers outside the configured proxy", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("TRUST_PROXY_HEADERS", "false");
    const forgedRequest = new Request("https://example.com", { headers: { "x-forwarded-for": "198.51.100.20", "x-real-ip": "198.51.100.21" } });
    expect(getClientIp(forgedRequest)).toBe("unknown");

    vi.stubEnv("TRUST_PROXY_HEADERS", "true");
    const selfHostedRequest = new Request("https://example.com", { headers: { "x-forwarded-for": "198.51.100.20" } });
    expect(getClientIp(selfHostedRequest)).toBe("198.51.100.20");

    vi.stubEnv("VERCEL", "1");
    const vercelRequest = new Request("https://example.com", { headers: { "x-forwarded-for": "198.51.100.20", "x-vercel-forwarded-for": "203.0.113.10" } });
    expect(getClientIp(vercelRequest)).toBe("203.0.113.10");
    vi.unstubAllEnvs();
  });
});

describe("routine views and revision boundaries", () => {
  it("returns routines, revisions, and logs from one snapshot while an update is in progress", async () => {
    const user = await createTestUser();
    const routine = await createRoutineForUser(user.id, {
      content: "更新前のRoutine",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });
    await setRoutineLog(user.id, routine.id, TEST_TODAY, true);
    await testSql`CREATE OR REPLACE FUNCTION test_delay_routine_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.4); RETURN NEW; END; $$`;
    await testSql`CREATE TRIGGER test_delay_routine_update AFTER UPDATE ON routines FOR EACH ROW EXECUTE FUNCTION test_delay_routine_update()`;
    try {
      const updatePromise = updateRoutineForUser(user.id, routine.id, {
        content: "更新後のRoutine",
        priority: "optional",
        daysOfWeek: [4],
        startDate: TEST_TODAY,
        isActive: true,
      }, { expectedUpdatedAt: routine.updatedAt });
      await new Promise((resolve) => setTimeout(resolve, 50));
      const snapshot = await listRoutineData(user.id);
      await updatePromise;

      expect(snapshot.routines[0]).toMatchObject({ content: "更新前のRoutine" });
      expect(snapshot.routines[0]?.revisions).toHaveLength(1);
      expect(snapshot.routines[0]?.revisions[0]).toMatchObject({ content: "更新前のRoutine" });
      expect(snapshot.logs[`${routine.id}__${TEST_TODAY}`]).toBeDefined();
    } finally {
      await testSql`DROP TRIGGER IF EXISTS test_delay_routine_update ON routines`;
      await testSql`DROP FUNCTION IF EXISTS test_delay_routine_update()`;
    }
  });

  it("rejects concurrent updates using the same routine version", async () => {
    const user = await createTestUser();
    const routine = await createRoutineForUser(user.id, {
      content: "競合前のRoutine",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });
    const input = {
      content: "競合更新",
      priority: "optional" as const,
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    };

    const results = await Promise.allSettled([
      updateRoutineForUser(user.id, routine.id, input, { expectedUpdatedAt: routine.updatedAt }),
      updateRoutineForUser(user.id, routine.id, { ...input, content: "もう一つの競合更新" }, { expectedUpdatedAt: routine.updatedAt }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { status: 409 } });
    const current = await listRoutineData(user.id);
    expect(current.routines).toHaveLength(1);
    expect(current.routines[0]?.revisions).toHaveLength(1);
    expect(current.routines[0]?.revisions.at(-1)?.content).toBe(current.routines[0]?.content);
  });

  it("shows only routines scheduled for the requested weekday and restores the revision for that date", async () => {
    const user = await createTestUser();
    const thursday = await createRoutineForUser(user.id, {
      content: "木曜の記録",
      priority: "required",
      daysOfWeek: [3, 4],
      startDate: "2026-01-10",
      isActive: true,
    });
    const friday = await createRoutineForUser(user.id, {
      content: "金曜の記録",
      priority: "optional",
      daysOfWeek: [5],
      startDate: "2026-01-10",
      isActive: true,
    });

    const today = getDailyRoutinesForDate([thursday, friday], { [`${thursday.id}__${TEST_TODAY}`]: { id: "log", routineId: thursday.id, date: TEST_TODAY, createdAt: "", updatedAt: "" } }, TEST_TODAY);
    expect(today.required.map(({ routine }) => routine.content)).toEqual(["木曜の記録"]);
    expect(today.required[0]?.completed).toBe(true);
    expect(today.optional).toHaveLength(0);

    const edited = await updateRoutineForUser(user.id, thursday.id, {
      content: "新しい木曜の記録",
      priority: "optional",
      daysOfWeek: [4, 5],
      startDate: TEST_TODAY,
      isActive: true,
    });
    const previousDay = getDailyRoutinesForDate([edited], {}, "2026-01-14");
    const editedDay = getDailyRoutinesForDate([edited], {}, TEST_TODAY);
    expect(previousDay.required.map(({ routine }) => routine.content)).toEqual(["木曜の記録"]);
    expect(editedDay.required).toHaveLength(0);
    expect(editedDay.optional.map(({ routine }) => routine.content)).toEqual(["新しい木曜の記録"]);
    const editedFriday = getDailyRoutinesForDate([edited], {}, "2026-01-16");
    expect(editedFriday.optional.map(({ routine }) => routine.content)).toEqual(["新しい木曜の記録"]);
    expect(routineForDate(edited, "2026-01-14")).toMatchObject({ content: "木曜の記録", priority: "required" });
    expect(routineForDate(edited, TEST_TODAY)).toMatchObject({ content: "新しい木曜の記録", priority: "optional" });
  });

  it("replaces an unstarted future revision instead of leaving stale future history", async () => {
    const user = await createTestUser();
    const routine = await createRoutineForUser(user.id, {
      content: "現在の記録",
      priority: "required",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: TEST_TODAY,
      isActive: true,
    });

    await updateRoutineForUser(user.id, routine.id, {
      content: "未来の古い記録",
      priority: "required",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-01-20",
      isActive: true,
    });
    const replaced = await updateRoutineForUser(user.id, routine.id, {
      content: "未来の新しい記録",
      priority: "optional",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-01-20",
      isActive: true,
    });

    expect(replaced.revisions).toHaveLength(2);
    expect(replaced.revisions.map((revision) => revision.content)).not.toContain("未来の古い記録");
    expect(replaced.revisions.find((revision) => revision.startDate === "2026-01-20")).toMatchObject({ content: "未来の新しい記録", priority: "optional" });
  });
});

describe("ended routines", () => {
  it("keeps an ended routine ended when edited, preserves history, and resumes only explicitly", async () => {
    const user = await createTestUser();
    const routine = await createRoutineForUser(user.id, {
      content: "終了前の記録",
      priority: "required",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      isActive: true,
    });
    await setRoutineLog(user.id, routine.id, "2026-01-08", true);

    const edited = await updateRoutineForUser(user.id, routine.id, {
      content: "終了後に編集した記録",
      priority: "optional",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-01-01",
      isActive: true,
    });
    expect(edited).toMatchObject({ content: "終了後に編集した記録", priority: "optional", endDate: "2026-01-10", isActive: true });
    expect(edited.revisions).toHaveLength(1);
    expect(edited.revisions[0]).toMatchObject({ content: "終了前の記録", endDate: "2026-01-10" });
    expect(isRoutineEnded(edited, TEST_TODAY)).toBe(true);

    const previousDay = getDailyRoutinesForDate([edited], { [`${routine.id}__2026-01-08`]: { id: "log", routineId: routine.id, date: "2026-01-08", createdAt: "", updatedAt: "" } }, "2026-01-08");
    expect(previousDay.required[0]?.routine.content).toBe("終了前の記録");
    expect(previousDay.required[0]?.completed).toBe(true);
    expect(getDailyRoutinesForDate([edited], {}, TEST_TODAY).required).toHaveLength(0);

    const resumed = await reactivateRoutineForUser(user.id, routine.id);
    expect(resumed).toMatchObject({ content: "終了後に編集した記録", priority: "optional", isActive: true });
    expect(resumed.revisions.at(-1)).toMatchObject({ content: "終了後に編集した記録", startDate: TEST_TODAY, endDate: undefined, isActive: true });
    expect(getDailyRoutinesForDate([resumed], {}, TEST_TODAY).optional[0]?.routine.content).toBe("終了後に編集した記録");
  });

  it("allows an explicit end-date extension to resume future scheduling", async () => {
    const user = await createTestUser();
    const routine = await createRoutineForUser(user.id, {
      content: "延長前の記録",
      priority: "required",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-01-01",
      endDate: "2026-01-10",
      isActive: true,
    });

    const extended = await updateRoutineForUser(user.id, routine.id, {
      content: "延長後の記録",
      priority: "required",
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-01-01",
      endDate: "2026-01-20",
      isActive: true,
    });
    expect(extended.revisions.at(-1)).toMatchObject({ content: "延長後の記録", startDate: TEST_TODAY, endDate: "2026-01-20", isActive: true });
    expect(getDailyRoutinesForDate([extended], {}, "2026-01-16").required[0]?.routine.content).toBe("延長後の記録");
  });
});

describe("routine logs and user isolation", () => {
  it("stores completion idempotently and safely removes it", async () => {
    const user = await createTestUser();
    const routine = await createRoutineForUser(user.id, {
      content: "今日の記録",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });

    const first = await setRoutineLog(user.id, routine.id, TEST_TODAY, true);
    const second = await setRoutineLog(user.id, routine.id, TEST_TODAY, true);
    expect(first?.id).toBe(second?.id);
    expect(await setRoutineLog(user.id, routine.id, TEST_TODAY, false)).toBeNull();
    expect(await setRoutineLog(user.id, routine.id, TEST_TODAY, false)).toBeNull();
  });

  it("rejects future dates, non-scheduled weekdays, and inactive revisions", async () => {
    const user = await createTestUser();
    const routine = await createRoutineForUser(user.id, {
      content: "木曜だけの記録",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });

    await expect(setRoutineLog(user.id, routine.id, "2026-01-16", true)).rejects.toMatchObject({ status: 400 });
    await expect(setRoutineLog(user.id, routine.id, "2026-01-16", false)).rejects.toMatchObject({ status: 400 });
    const deactivated = await deactivateRoutineForUser(user.id, routine.id);
    expect(deactivated.isActive).toBe(false);
    expect(routineForDate(deactivated, TEST_TODAY)).toMatchObject({ content: "木曜だけの記録" });
    expect(routineForDate(deactivated, "2026-01-22")).toBeNull();
    await expect(setRoutineLog(user.id, routine.id, "2026-01-16", true)).rejects.toMatchObject({ status: 400 });
    expect(await setRoutineLog(user.id, routine.id, TEST_TODAY, true)).not.toBeNull();
    const reactivated = await reactivateRoutineForUser(user.id, routine.id);
    expect(reactivated.isActive).toBe(true);
    expect(reactivated.revisions.at(-1)).toMatchObject({ startDate: TEST_TODAY, isActive: true });
  });

  it("does not expose or mutate another user's routine", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const routine = await createRoutineForUser(owner.id, {
      content: "所有者だけの記録",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    });

    await expect(updateRoutineForUser(other.id, routine.id, {
      content: "不正な変更",
      priority: "required",
      daysOfWeek: [4],
      startDate: TEST_TODAY,
      isActive: true,
    })).rejects.toMatchObject({ status: 404 });
    await expect(setRoutineLog(other.id, routine.id, TEST_TODAY, true)).rejects.toMatchObject({ status: 404 });
  });
});

describe("authentication, transactions, and rate limits", () => {
  it("registers an empty routine state and a session, then supports login, session lookup, and logout", async () => {
    const cookies = createCookieStore();
    const email = "member@example.com";
    const password = "correct-horse-battery-staple";
    const user = await registerUser(email, password, { cookieStore: cookies });
    expect(user.email).toBe(email);
    expect(cookies.get("routine_session")).toBeDefined();
    expect((await testDb.select().from(users).where(eq(users.id, user.id)))).toHaveLength(1);
    expect((await testDb.select().from(routines).where(eq(routines.userId, user.id)))).toHaveLength(0);
    expect((await testDb.select().from(routineRevisions))).toHaveLength(0);
    expect((await testDb.select().from(routineLogs))).toHaveLength(0);
    expect((await testDb.select().from(sessions).where(eq(sessions.userId, user.id)))).toHaveLength(1);

    expect(await getCurrentUser({ cookieStore: cookies })).toEqual(user);
    await logoutUser({ cookieStore: cookies });
    expect(await getCurrentUser({ cookieStore: cookies })).toBeNull();
    expect((await testDb.select().from(sessions).where(eq(sessions.userId, user.id)))).toHaveLength(0);

    const loginCookies = createCookieStore();
    expect(await loginUser(email, password, { cookieStore: loginCookies })).toEqual(user);
    expect(await getCurrentUser({ cookieStore: loginCookies })).toEqual(user);
  });

  it("rolls back the whole registration transaction when session creation fails", async () => {
    await testSql`CREATE OR REPLACE FUNCTION test_fail_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test session failure'; END; $$`;
    await testSql`CREATE TRIGGER test_fail_session BEFORE INSERT ON sessions FOR EACH ROW EXECUTE FUNCTION test_fail_session()`;
    try {
      await expect(registerUser("rollback@example.com", "correct-horse-battery-staple", { cookieStore: createCookieStore() })).rejects.toThrow("Failed query");
      expect(await testDb.select().from(users).where(eq(users.email, "rollback@example.com"))).toHaveLength(0);
      expect(await testDb.select().from(routines)).toHaveLength(0);
      expect(await testDb.select().from(routineRevisions)).toHaveLength(0);
      expect(await testDb.select().from(routineLogs)).toHaveLength(0);
      expect(await testDb.select().from(sessions)).toHaveLength(0);
    } finally {
      await testSql`DROP TRIGGER IF EXISTS test_fail_session ON sessions`;
      await testSql`DROP FUNCTION IF EXISTS test_fail_session()`;
    }
  });

  it("does not accept expired sessions and enforces the login rate limit", async () => {
    const cookies = createCookieStore();
    const user = await registerUser("expiry@example.com", "correct-horse-battery-staple", { cookieStore: cookies });
    const [session] = await testDb.select().from(sessions).where(eq(sessions.userId, user.id));
    await testDb.update(sessions).set({ expiresAt: "2026-01-15T02:59:59.000Z" }).where(eq(sessions.id, session.id));
    expect(await getCurrentUser({ cookieStore: cookies })).toBeNull();
    await removeExpiredSessions();
    expect(await testDb.select().from(sessions).where(eq(sessions.id, session.id))).toHaveLength(0);

    const ip = "198.51.100.10";
    for (let attempt = 0; attempt < 10; attempt += 1) await assertAuthRateLimit("login", ip);
    await expect(assertAuthRateLimit("login", ip)).rejects.toMatchObject({ status: 429 });
  });

  it("cleans multiple expired sessions during successful login and keeps valid sessions", async () => {
    const email = "session-cleanup@example.com";
    const password = "correct-horse-battery-staple";
    const user = await registerUser(email, password, { cookieStore: createCookieStore() });
    await loginUser(email, password, { cookieStore: createCookieStore() });
    await loginUser(email, password, { cookieStore: createCookieStore() });

    const createdSessions = await testDb.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(createdSessions).toHaveLength(3);
    const expiredSessionIds = createdSessions.slice(0, 2).map((session) => session.id);
    const validSessionId = createdSessions[2].id;
    await testDb.update(sessions).set({ expiresAt: "2026-01-15T03:00:00.000Z" }).where(eq(sessions.id, expiredSessionIds[0]));
    await testDb.update(sessions).set({ expiresAt: "2026-01-15T03:00:00.000Z" }).where(eq(sessions.id, expiredSessionIds[1]));

    await loginUser(email, password, { cookieStore: createCookieStore() });

    const remainingSessions = await testDb.select().from(sessions).where(eq(sessions.userId, user.id));
    expect(remainingSessions.map((session) => session.id)).not.toEqual(expect.arrayContaining(expiredSessionIds));
    expect(remainingSessions.map((session) => session.id)).toEqual(expect.arrayContaining([validSessionId]));
    expect(remainingSessions).toHaveLength(2);
  });

  it("does not block successful login when session cleanup fails", async () => {
    const email = "session-cleanup-failure@example.com";
    const password = "correct-horse-battery-staple";
    const user = await registerUser(email, password, { cookieStore: createCookieStore() });
    const [session] = await testDb.select().from(sessions).where(eq(sessions.userId, user.id));
    await testDb.update(sessions).set({ expiresAt: "2026-01-15T03:00:00.000Z" }).where(eq(sessions.id, session.id));
    await testSql`CREATE OR REPLACE FUNCTION test_fail_expired_session_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test cleanup failure'; END; $$`;
    await testSql`CREATE TRIGGER test_fail_expired_session_cleanup BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION test_fail_expired_session_cleanup()`;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(await loginUser(email, password, { cookieStore: createCookieStore() })).toEqual(user);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      await testSql`DROP TRIGGER IF EXISTS test_fail_expired_session_cleanup ON sessions`;
      await testSql`DROP FUNCTION IF EXISTS test_fail_expired_session_cleanup()`;
    }
  });

  it("normalizes duplicate registration and preserves the existing account", async () => {
    await registerUser("Duplicate@Example.com", "correct-horse-battery-staple", { cookieStore: createCookieStore() });
    await expect(registerUser(" duplicate@example.com ", "another-correct-password", { cookieStore: createCookieStore() })).rejects.toMatchObject({ status: 409 });
    expect(await testDb.select().from(users).where(eq(users.email, "duplicate@example.com"))).toHaveLength(1);
  });
});
