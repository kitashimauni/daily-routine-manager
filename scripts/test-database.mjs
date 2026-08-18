import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { assertSafeTestDatabaseUrl, assertTestDatabaseResetAllowed } from "./test-database-safety.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://routine_test:test_password@localhost:5433/routine_test";
assertSafeTestDatabaseUrl(testDatabaseUrl, process.env.DATABASE_URL);
const sql = postgres(testDatabaseUrl, { max: 1, prepare: false });

try {
  await migrate(drizzle(sql), { migrationsFolder: path.join(projectRoot, "drizzle") });
  if (process.env.RESET_TEST_DATABASE === "true") {
    assertTestDatabaseResetAllowed();
    await sql`TRUNCATE TABLE routine_logs, routine_revisions, routines, sessions, auth_rate_limits, users CASCADE`;
  }
  console.log(`Test database is ready: ${testDatabaseUrl}`);
} finally {
  await sql.end();
}
