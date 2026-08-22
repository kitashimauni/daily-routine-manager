import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { assertReleaseHealthPayload, parseReleaseHealthSettings, waitForAppHealth } from "./deploy-production.mjs";

async function expectFailure(action, expectedMessage) {
  try {
    await action();
    throw new Error(`Expected failure containing: ${expectedMessage}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(expectedMessage)) throw error;
  }
}

let now = 0;
if (parseReleaseHealthSettings({}).timeoutMs !== 120_000 || parseReleaseHealthSettings({}).pollIntervalMs !== 2_000) {
  throw new Error("Release health defaults changed unexpectedly.");
}
if (parseReleaseHealthSettings({ RELEASE_HEALTH_TIMEOUT_SECONDS: "3.5", RELEASE_HEALTH_POLL_INTERVAL_SECONDS: "0.25" }).timeoutMs !== 3_500) {
  throw new Error("Release health timeout parsing failed.");
}
await expectFailure(
  () => Promise.resolve(parseReleaseHealthSettings({ RELEASE_HEALTH_TIMEOUT_SECONDS: "abc" })),
  "RELEASE_HEALTH_TIMEOUT_SECONDS must be a positive number of seconds",
);
await expectFailure(
  () => Promise.resolve(parseReleaseHealthSettings({ RELEASE_HEALTH_POLL_INTERVAL_SECONDS: "0" })),
  "RELEASE_HEALTH_POLL_INTERVAL_SECONDS must be a positive number of seconds",
);

const invalidRelease = spawnSync(process.execPath, [fileURLToPath(new URL("./deploy-production.mjs", import.meta.url)), "--compose-env-file", ".env.production"], {
  env: { ...process.env, RELEASE_HEALTH_TIMEOUT_SECONDS: "abc" },
  encoding: "utf8",
});
const invalidReleaseOutput = `${invalidRelease.stdout ?? ""}\n${invalidRelease.stderr ?? ""}`;
if (invalidRelease.status === 0 || !invalidReleaseOutput.includes("RELEASE_HEALTH_TIMEOUT_SECONDS must be a positive number of seconds")) {
  throw new Error("Invalid release health settings must fail before release operations begin.");
}

const statuses = ["starting", "starting", "healthy"];
await waitForAppHealth({
  getStatus: () => statuses.shift() ?? "healthy",
  timeoutMs: 100,
  pollIntervalMs: 10,
  now: () => now,
  sleep: async (milliseconds) => {
    now += milliseconds;
  },
});

await expectFailure(
  () => waitForAppHealth({ getStatus: () => "unhealthy", timeoutMs: 100, pollIntervalMs: 10 }),
  "status: unhealthy",
);

now = 0;
await expectFailure(
  () => waitForAppHealth({
    getStatus: () => "starting",
    timeoutMs: 20,
    pollIntervalMs: 10,
    now: () => now,
    sleep: async (milliseconds) => {
      now += milliseconds;
    },
  }),
  "Timed out",
);

assertReleaseHealthPayload({ status: "ok", release: { commitSha: "abcdef0123456789" } }, "abcdef0123456789");
await expectFailure(
  () => Promise.resolve(assertReleaseHealthPayload({ status: "error", release: { commitSha: "abcdef0123456789" } }, "abcdef0123456789")),
  "status=ok",
);
await expectFailure(
  () => Promise.resolve(assertReleaseHealthPayload({ status: "ok", release: { commitSha: "different" } }, "abcdef0123456789")),
  "expected abcdef0123456789",
);

console.log("Release health wait and SHA verification regression tests passed.");
