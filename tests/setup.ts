import path from "node:path";
import { beforeAll, beforeEach, afterAll } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDatabaseForTests } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://routine_test:test_password@localhost:5433/routine_test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.APP_TIME_ZONE ??= "Asia/Tokyo";

export const testSql = postgres(testDatabaseUrl, { max: 1, prepare: false });
export const testDb = drizzle(testSql, { schema });

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
});

beforeEach(async () => {
  await testDb.delete(schema.routineLogs);
  await testDb.delete(schema.routineRevisions);
  await testDb.delete(schema.routines);
  await testDb.delete(schema.sessions);
  await testDb.delete(schema.authRateLimits);
  await testDb.delete(schema.users);
});

afterAll(async () => {
  await closeDatabaseForTests();
  await testSql.end();
});
