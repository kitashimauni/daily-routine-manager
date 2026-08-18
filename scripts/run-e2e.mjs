import path from "node:path";
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://routine_test:test_password@localhost:5433/routine_test";
const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const env = {
  ...process.env,
  ALLOW_TEST_DATABASE_RESET: "true",
  APP_TIME_ZONE: process.env.APP_TIME_ZONE ?? "Asia/Tokyo",
  DATABASE_URL: testDatabaseUrl,
  RESET_TEST_DATABASE: "true",
  TEST_DATABASE_URL: testDatabaseUrl,
};

function run(childCommand, childArgs, childEnv = env) {
  return new Promise((resolve, reject) => {
    const child = spawn(childCommand, childArgs, { cwd: projectRoot, env: childEnv, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve({ code: code ?? 1, signal }));
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForServer(url) {
  let lastError = "unknown error";
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const status = await new Promise((resolve, reject) => {
        const request = http.get(url, { timeout: 2_000 }, (response) => {
          response.resume();
          response.on("end", () => resolve(response.statusCode ?? 500));
        });
        request.on("timeout", () => request.destroy(new Error("request timed out")));
        request.on("error", reject);
      });
      if (status < 500) return;
      lastError = `HTTP ${status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await wait(250);
  }
  throw new Error(`E2E server did not become ready at ${url}: ${lastError}`);
}

let server;
try {
  const migration = await run(process.execPath, ["scripts/test-database.mjs"]);
  if (migration.code !== 0) process.exitCode = migration.code;
  else {
    if (!process.env.E2E_BASE_URL) {
      server = spawn(process.execPath, [nextCli, "start"], {
        cwd: projectRoot,
        env: { ...env, PORT: "3000" },
        stdio: "inherit",
      });
      await waitForServer(baseUrl);
      console.log(`E2E server is ready at ${baseUrl}`);
    }
    const result = await run(process.execPath, [playwrightCli, "test"], { ...env, E2E_BASE_URL: baseUrl });
    process.exitCode = result.code;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  server?.kill();
}
