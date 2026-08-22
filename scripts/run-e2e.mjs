import path from "node:path";
import { spawn } from "node:child_process";
import { cp, readdir, rm } from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://routine_test:test_password@localhost:5433/routine_test";
const playwrightCli = path.join(projectRoot, "node_modules", "@playwright", "test", "cli.js");
const standaloneSourceDir = path.join(projectRoot, ".next", "standalone");
const standaloneRuntimeDir = path.join(projectRoot, ".next", "e2e-standalone");
const standaloneServer = path.join(standaloneRuntimeDir, "server.js");
const standaloneStaticDir = path.join(standaloneRuntimeDir, ".next", "static");
const standalonePublicDir = path.join(standaloneRuntimeDir, "public");
const standaloneSwcHelpersDir = path.join(standaloneRuntimeDir, "node_modules", ".pnpm", "@swc+helpers@0.5.23", "node_modules", "@swc", "helpers", "esm");
const sourceSwcHelpersPackageDir = path.join(projectRoot, "node_modules", ".pnpm", "@swc+helpers@0.5.23", "node_modules", "@swc", "helpers");
const sourceSwcHelpersDir = path.join(sourceSwcHelpersPackageDir, "esm");
const baseUrl = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const env = {
  ...process.env,
  ALLOW_TEST_DATABASE_RESET: "true",
  APP_TIME_ZONE: process.env.APP_TIME_ZONE ?? "Asia/Tokyo",
  DATABASE_URL: testDatabaseUrl,
  RESET_TEST_DATABASE: "true",
  TEST_DATABASE_URL: testDatabaseUrl,
  TRUST_PROXY_HEADERS: "true",
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
let copiedRuntime = false;

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3_000))]);
}

async function patchWindowsStandaloneSymlinks() {
  if (process.platform !== "win32") return;
  const pnpmDir = path.join(standaloneRuntimeDir, "node_modules", ".pnpm");
  const packageNames = await readdir(pnpmDir);
  const nextPackageName = packageNames.find((name) => name.startsWith("next@"));
  const reactPackageName = packageNames.find((name) => name.startsWith("react@"));
  const reactDomPackageName = packageNames.find((name) => name.startsWith("react-dom@"));
  if (!nextPackageName || !reactPackageName || !reactDomPackageName) throw new Error("standalone runtimeのReact依存関係を特定できません。");

  for (const [packageName, dependency] of [[reactPackageName, "react"], [reactDomPackageName, "react-dom"]]) {
    const source = path.join(pnpmDir, packageName, "node_modules", dependency);
    const target = path.join(pnpmDir, nextPackageName, "node_modules", dependency);
    await rm(target, { recursive: true, force: true });
    await cp(source, target, { recursive: true, dereference: true });
  }
}

try {
  const migration = await run(process.execPath, ["scripts/test-database.mjs"]);
  if (migration.code !== 0) process.exitCode = migration.code;
  else {
    if (!process.env.E2E_BASE_URL) {
      await rm(standaloneRuntimeDir, { recursive: true, force: true });
      await cp(standaloneSourceDir, standaloneRuntimeDir, { recursive: true, verbatimSymlinks: true });
      copiedRuntime = true;
      await cp(path.join(projectRoot, ".next", "static"), standaloneStaticDir, { recursive: true });
      await cp(sourceSwcHelpersDir, standaloneSwcHelpersDir, { recursive: true });
      try {
        await cp(path.join(projectRoot, "public"), standalonePublicDir, { recursive: true });
      } catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code !== "ENOENT") throw error;
      }
      await patchWindowsStandaloneSymlinks();
      server = spawn(process.execPath, [standaloneServer], {
        cwd: standaloneRuntimeDir,
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
  await stopServer(server);
  if (copiedRuntime) await rm(standaloneRuntimeDir, { recursive: true, force: true });
}
