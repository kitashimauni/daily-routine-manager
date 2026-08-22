import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(new URL("./verify-deploy-env.mjs", import.meta.url));
const baseEnvironment = { ...process.env };
for (const key of ["APP_TIME_ZONE", "DEPLOY_ENV", "VERCEL_ENV", "DATABASE_URL", "RELEASE_COMMIT_SHA", "RELEASE_BRANCH", "TRUST_PROXY_HEADERS", "ALLOW_TEST_DATABASE_RESET", "RESET_TEST_DATABASE"]) delete baseEnvironment[key];
Object.assign(baseEnvironment, {
  DEPLOY_ENV: "production",
  DATABASE_URL: "postgresql://routine:password@postgres:5432/routine_manager",
  RELEASE_COMMIT_SHA: "abcdef0123456789",
  RELEASE_BRANCH: "main",
  TRUST_PROXY_HEADERS: "true",
});

function run(environment) {
  return spawnSync(process.execPath, [scriptPath], { env: environment, encoding: "utf8" });
}

const valid = run({ ...baseEnvironment, APP_TIME_ZONE: "Asia/Tokyo" });
if (valid.status !== 0) throw new Error(`Expected valid APP_TIME_ZONE to pass: ${valid.stderr}`);

const defaulted = run(baseEnvironment);
if (defaulted.status !== 0) throw new Error(`Expected the default APP_TIME_ZONE to pass: ${defaulted.stderr}`);

const invalid = run({ ...baseEnvironment, APP_TIME_ZONE: "Invalid/Foo" });
const invalidOutput = `${invalid.stdout ?? ""}\n${invalid.stderr ?? ""}`;
if (invalid.status === 0 || !invalidOutput.includes("APP_TIME_ZONE must be a valid IANA timezone")) {
  throw new Error("Expected an invalid APP_TIME_ZONE to be rejected before deployment.");
}

console.log("Deployment environment and APP_TIME_ZONE validation regression tests passed.");
