import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const usage = `Usage:
  pnpm release:production [--compose-env-file .env.production]
  pnpm release:production -- --rollback <commit-or-tag> [--compose-env-file .env.production]

The release commit is always derived from the Git source used as the Docker build context.
The worktree must be clean. Production deploys require the main branch; rollback creates a
temporary detached worktree at the requested commit, verifies it is part of main, and builds
the image with that exact commit SHA as both its tag and health metadata.`;

function fail(message) {
  throw new Error(`${message}\n\n${usage}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const details = options.includeErrorDetails === false ? "" : [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${details ? `:\n${details}` : "."}`);
  }
  return result.stdout?.trim() ?? "";
}

function tryRun(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: "ignore" });
  return result.status === 0;
}

function parseArgs() {
  const args = process.argv.slice(2);
  let envFile = ".env.production";
  let rollbackRef;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--help" || arg === "-h") {
      console.log(usage);
      process.exit(0);
    }
    if (arg === "--compose-env-file") {
      envFile = args[index + 1];
      if (!envFile) fail("--compose-env-file requires a path.");
      index += 1;
      continue;
    }
    if (arg === "--rollback") {
      rollbackRef = args[index + 1];
      if (!rollbackRef) fail("--rollback requires a commit SHA or tag.");
      index += 1;
      continue;
    }
    fail(`Unknown argument: ${arg}`);
  }

  return { envFile, rollbackRef };
}

function assertCleanWorktree(repoRoot) {
  const status = run("git", ["status", "--porcelain=v1"], { cwd: repoRoot });
  if (status) {
    fail("The Git worktree must be clean before a production release or rollback.");
  }
}

function resolveMainRef(repoRoot) {
  if (tryRun("git", ["show-ref", "--verify", "--quiet", "refs/heads/main"], repoRoot)) {
    return "main";
  }
  if (tryRun("git", ["show-ref", "--verify", "--quiet", "refs/remotes/origin/main"], repoRoot)) {
    return "origin/main";
  }
  fail("A local main or origin/main ref is required to validate a production rollback target.");
}

function createRollbackWorktree(repoRoot, rollbackRef) {
  const targetSha = run("git", ["rev-parse", "--verify", `${rollbackRef}^{commit}`], { cwd: repoRoot });
  const mainRef = resolveMainRef(repoRoot);
  if (!tryRun("git", ["merge-base", "--is-ancestor", targetSha, mainRef], repoRoot)) {
    fail(`Rollback target ${rollbackRef} is not an ancestor of ${mainRef}.`);
  }

  const tempParent = mkdtempSync(join(tmpdir(), "daily-routine-manager-release-"));
  const worktreePath = join(tempParent, "source");
  try {
    run("git", ["worktree", "add", "--detach", worktreePath, targetSha], { cwd: repoRoot });
  } catch (error) {
    rmSync(tempParent, { force: true, recursive: true });
    throw error;
  }

  return { targetSha, tempParent, worktreePath };
}

export function composeValidationArgs() {
  return ["config", "--quiet"];
}

function runCompose(contextRoot, envFile, releaseSha) {
  const envFilePath = resolve(envFile);
  if (!existsSync(envFilePath)) {
    fail(`Environment file not found: ${envFilePath}`);
  }

  const composeFile = resolve(contextRoot, "compose.prod.yaml");
  const composeArgs = ["compose", "--env-file", envFilePath, "-f", composeFile];
  const environment = {
    ...process.env,
    RELEASE_COMMIT_SHA: releaseSha,
    RELEASE_BRANCH: "main",
  };

  const validationArgs = composeValidationArgs();
  for (const args of [
    validationArgs,
    ["build", "app", "migrate"],
    ["up", "-d", "postgres"],
    ["run", "--rm", "migrate"],
    ["up", "-d", "--no-deps", "app"],
  ]) {
    run("docker", [...composeArgs, ...args], {
      cwd: contextRoot,
      env: environment,
      includeErrorDetails: args !== validationArgs,
      inherit: args !== validationArgs,
    });
  }
}

function removeRollbackWorktree(repoRoot, rollbackWorktree) {
  if (!rollbackWorktree) return;
  try {
    run("git", ["worktree", "remove", "--force", rollbackWorktree.worktreePath], { cwd: repoRoot });
  } finally {
    rmSync(rollbackWorktree.tempParent, { force: true, recursive: true });
  }
}

function main() {
  const { envFile, rollbackRef } = parseArgs();
  const repoRoot = run("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd() });
  assertCleanWorktree(repoRoot);

  let rollbackWorktree;
  let contextRoot = repoRoot;
  let releaseSha;

  try {
    if (rollbackRef) {
      rollbackWorktree = createRollbackWorktree(repoRoot, rollbackRef);
      contextRoot = rollbackWorktree.worktreePath;
      releaseSha = rollbackWorktree.targetSha;
    } else {
      const branch = run("git", ["branch", "--show-current"], { cwd: repoRoot });
      if (branch !== "main") {
        fail(`Production releases must be built from the main branch (current: ${branch || "detached HEAD"}).`);
      }
      releaseSha = run("git", ["rev-parse", "HEAD"], { cwd: repoRoot });
    }

    console.log(`Building production release from ${releaseSha}.`);
    runCompose(contextRoot, envFile, releaseSha);
    console.log(`Production release deployed from ${releaseSha}.`);
  } finally {
    removeRollbackWorktree(repoRoot, rollbackWorktree);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}
