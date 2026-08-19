import { randomUUID } from "node:crypto";
import { rmSync, writeFileSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { composeValidationArgs } from "./deploy-production.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const composeFile = resolve(repoRoot, "compose.prod.yaml");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "daily-routine-manager-release-security-"));
const sentinel = `issue-28-sentinel-${randomUUID()}`;
const environmentKeys = [
  "COMPOSE_PROJECT_NAME",
  "FRONTEND_NETWORK_NAME",
  "BACKEND_NETWORK_NAME",
  "DATABASE_URL",
  "POSTGRES_DB",
  "POSTGRES_USER",
  "POSTGRES_PASSWORD",
  "APP_TIME_ZONE",
  "DEPLOY_ENV",
  "RELEASE_VERSION",
  "RELEASE_COMMIT_SHA",
  "RELEASE_BRANCH",
  "TRUST_PROXY_HEADERS",
  "BACKUP_DIR",
  "BACKUP_RETENTION_DAYS",
];

function cleanProcessEnvironment() {
  const environment = { ...process.env };
  for (const key of environmentKeys) delete environment[key];
  return environment;
}

function runComposeValidation(environmentFile) {
  return spawnSync(
    "docker",
    ["compose", "--env-file", environmentFile, "-f", composeFile, ...composeValidationArgs()],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: cleanProcessEnvironment(),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
}

function assertSecretIsAbsent(result, label) {
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (output.includes(sentinel)) {
    throw new Error(`${label} exposed the sentinel secret in command output.`);
  }
}

function writeEnvironmentFile(filePath, includeDatabaseUrl) {
  const values = [
    "COMPOSE_PROJECT_NAME=daily-routine-manager-issue-28",
    "FRONTEND_NETWORK_NAME=routine-issue-28-frontend",
    "BACKEND_NETWORK_NAME=routine-issue-28-backend",
    ...(includeDatabaseUrl ? [`DATABASE_URL=postgresql://routine:${sentinel}@postgres:5432/routine_manager`] : []),
    "POSTGRES_DB=routine_manager",
    "POSTGRES_USER=routine",
    `POSTGRES_PASSWORD=${sentinel}`,
    "APP_TIME_ZONE=Asia/Tokyo",
    "DEPLOY_ENV=production",
    "RELEASE_VERSION=0.1.0",
    "RELEASE_COMMIT_SHA=abcdef0123456789",
    "RELEASE_BRANCH=main",
    "TRUST_PROXY_HEADERS=true",
    "BACKUP_DIR=/tmp/daily-routine-manager-backups",
    "BACKUP_RETENTION_DAYS=7",
  ];
  writeFileSync(filePath, `${values.join("\n")}\n`, "utf8");
}

try {
  if (!composeValidationArgs().includes("--quiet")) {
    throw new Error("Compose validation must use --quiet.");
  }

  const validEnvironmentFile = join(temporaryDirectory, "valid.env");
  writeEnvironmentFile(validEnvironmentFile, true);
  const validResult = runComposeValidation(validEnvironmentFile);
  if (validResult.error) throw new Error("Docker Compose validation could not be started.");
  if (validResult.status !== 0) throw new Error("Docker Compose validation rejected a valid sentinel environment.");
  assertSecretIsAbsent(validResult, "Successful validation");

  const invalidEnvironmentFile = join(temporaryDirectory, "invalid.env");
  writeEnvironmentFile(invalidEnvironmentFile, false);
  const invalidResult = runComposeValidation(invalidEnvironmentFile);
  if (invalidResult.error) throw new Error("Docker Compose validation could not be started.");
  if (invalidResult.status === 0) throw new Error("Docker Compose validation accepted an environment without DATABASE_URL.");
  assertSecretIsAbsent(invalidResult, "Failed validation");

  console.log("Release Compose validation does not expose sentinel secrets.");
} finally {
  rmSync(temporaryDirectory, { force: true, recursive: true });
}
