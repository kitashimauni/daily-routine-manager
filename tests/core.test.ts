import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { assertAuthRateLimit } from "@/lib/auth-rate-limit";
import { getCurrentUser, loginUser, logoutUser, registerUser, removeExpiredSessions } from "@/lib/auth";
import { routines, sessions, users } from "@/lib/db/schema";
import { getDailyRoutinesForDate } from "@/lib/routine-view";
import { createRoutineForUser, deactivateRoutineForUser, reactivateRoutineForUser, setRoutineLog, updateRoutineForUser } from "@/lib/routine-service";
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

describe("routine views and revision boundaries", () => {
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
  it("registers seeded data and a session, then supports login, session lookup, and logout", async () => {
    const cookies = createCookieStore();
    const email = "member@example.com";
    const password = "correct-horse-battery-staple";
    const user = await registerUser(email, password, { cookieStore: cookies });
    expect(user.email).toBe(email);
    expect(cookies.get("routine_session")).toBeDefined();
    expect((await testDb.select().from(users).where(eq(users.id, user.id)))).toHaveLength(1);
    expect((await testDb.select().from(routines).where(eq(routines.userId, user.id)))).toHaveLength(4);
    expect((await testDb.select().from(sessions).where(eq(sessions.userId, user.id)))).toHaveLength(1);

    expect(await getCurrentUser({ cookieStore: cookies })).toEqual(user);
    await logoutUser({ cookieStore: cookies });
    expect(await getCurrentUser({ cookieStore: cookies })).toBeNull();
    expect((await testDb.select().from(sessions).where(eq(sessions.userId, user.id)))).toHaveLength(0);

    const loginCookies = createCookieStore();
    expect(await loginUser(email, password, { cookieStore: loginCookies })).toEqual(user);
    expect(await getCurrentUser({ cookieStore: loginCookies })).toEqual(user);
  });

  it("rolls back the whole registration transaction when seed creation fails", async () => {
    await testSql`CREATE OR REPLACE FUNCTION test_fail_seed_routine() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test seed failure'; END; $$`;
    await testSql`CREATE TRIGGER test_fail_seed BEFORE INSERT ON routines FOR EACH ROW EXECUTE FUNCTION test_fail_seed_routine()`;
    try {
      await expect(registerUser("rollback@example.com", "correct-horse-battery-staple", { cookieStore: createCookieStore() })).rejects.toThrow("Failed query");
      expect(await testDb.select().from(users).where(eq(users.email, "rollback@example.com"))).toHaveLength(0);
      expect(await testDb.select().from(routines)).toHaveLength(0);
      expect(await testDb.select().from(sessions)).toHaveLength(0);
    } finally {
      await testSql`DROP TRIGGER IF EXISTS test_fail_seed ON routines`;
      await testSql`DROP FUNCTION IF EXISTS test_fail_seed_routine()`;
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

  it("normalizes duplicate registration and preserves the existing account", async () => {
    await registerUser("Duplicate@Example.com", "correct-horse-battery-staple", { cookieStore: createCookieStore() });
    await expect(registerUser(" duplicate@example.com ", "another-correct-password", { cookieStore: createCookieStore() })).rejects.toMatchObject({ status: 409 });
    expect(await testDb.select().from(users).where(eq(users.email, "duplicate@example.com"))).toHaveLength(1);
  });
});
