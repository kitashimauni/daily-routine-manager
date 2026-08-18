export const TEST_DATABASE_NAME = "routine_test";

function parseTestDatabaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("TEST_DATABASE_URL must be a valid PostgreSQL URL.");
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") throw new Error("TEST_DATABASE_URL must use the PostgreSQL protocol.");
  const databaseName = decodeURIComponent(url.pathname.replace(/^\/+/, ""));
  if (databaseName !== TEST_DATABASE_NAME) throw new Error(`Refusing destructive test database operation outside '${TEST_DATABASE_NAME}'.`);
  return url;
}

export function assertSafeTestDatabaseUrl(testDatabaseUrl, configuredDatabaseUrl) {
  parseTestDatabaseUrl(testDatabaseUrl);
  if (configuredDatabaseUrl && configuredDatabaseUrl !== testDatabaseUrl) throw new Error("TEST_DATABASE_URL and DATABASE_URL must match exactly during tests.");
}

export function assertTestDatabaseResetAllowed() {
  if (process.env.ALLOW_TEST_DATABASE_RESET !== "true") throw new Error("Destructive test database reset requires ALLOW_TEST_DATABASE_RESET=true.");
}
