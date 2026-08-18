import { spawnSync } from "node:child_process";

function run(command, args) {
  const result = spawnSync(command, args, { env: process.env, stdio: "inherit" });
  if (result.error) {
    console.error(result.error);
    return 1;
  }
  return result.status ?? 1;
}

const verificationStatus = run(process.execPath, ["scripts/verify-deploy-env.mjs"]);
if (verificationStatus !== 0) process.exit(verificationStatus);

const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
process.exit(run(pnpmCommand, ["db:migrate"]));
