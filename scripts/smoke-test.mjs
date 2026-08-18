const baseUrl = process.env.SMOKE_BASE_URL?.trim();

if (!baseUrl) throw new Error("SMOKE_BASE_URL is required.");

const origin = new URL(baseUrl);
const localHost = ["localhost", "127.0.0.1", "::1"].includes(origin.hostname);
if (!localHost && origin.protocol !== "https:") throw new Error("Production smoke tests require an HTTPS URL.");

async function fetchJson(path) {
  const response = await fetch(new URL(path, origin), { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}.`);
  return response.json();
}

const health = await fetchJson("/api/health");
if (health.status !== "ok" || !health.release?.commitSha || !health.release?.version) {
  throw new Error("Health response is missing release metadata.");
}

const expectedCommit = process.env.SMOKE_EXPECTED_COMMIT_SHA?.trim();
if (expectedCommit && health.release.commitSha !== expectedCommit) {
  throw new Error(`Expected commit ${expectedCommit}, received ${health.release.commitSha}.`);
}

const root = await fetch(new URL("/", origin));
if (!root.ok) throw new Error(`/ returned HTTP ${root.status}.`);

console.log(`Smoke test passed: ${health.release.version} @ ${health.release.commitSha} (${health.release.environment}).`);
