import { randomUUID } from "node:crypto";
import type { AuthOptions } from "@/lib/auth";
import { testDb } from "@/tests/setup";
import { users } from "@/lib/db/schema";

export const TEST_TODAY = "2026-01-15";

export async function createTestUser(email = `${randomUUID()}@example.com`) {
  const id = randomUUID();
  await testDb.insert(users).values({
    id,
    email,
    passwordHash: "test-only-password-hash",
    createdAt: new Date().toISOString(),
  });
  return { id, email };
}

export function createCookieStore(): NonNullable<AuthOptions["cookieStore"]> {
  const values = new Map<string, string>();
  const store = {
    get(name: string) {
      const value = values.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set(name: string, value: string) {
      values.set(name, value);
    },
    delete(name: string) {
      values.delete(name);
    },
  };
  return store as NonNullable<AuthOptions["cookieStore"]>;
}
