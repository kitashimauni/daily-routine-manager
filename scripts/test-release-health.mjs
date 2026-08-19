import { assertReleaseHealthPayload, waitForAppHealth } from "./deploy-production.mjs";

async function expectFailure(action, expectedMessage) {
  try {
    await action();
    throw new Error(`Expected failure containing: ${expectedMessage}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes(expectedMessage)) throw error;
  }
}

let now = 0;
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
