import { spawn } from "node:child_process";

const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://routine_test:test_password@localhost:5433/routine_test";
const isWindows = process.platform === "win32";
const command = isWindows ? process.env.ComSpec ?? "cmd.exe" : "pnpm";
const args = isWindows ? ["/d", "/s", "/c", "pnpm exec vitest run"] : ["exec", "vitest", "run"];
const child = spawn(command, args, {
  env: {
    ...process.env,
    APP_TIME_ZONE: process.env.APP_TIME_ZONE ?? "Asia/Tokyo",
    DATABASE_URL: testDatabaseUrl,
    TEST_DATABASE_URL: testDatabaseUrl,
  },
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
