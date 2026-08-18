const deploymentEnvironment = process.env.VERCEL_ENV?.trim();
const runningOnVercel = process.env.VERCEL === "1" || Boolean(deploymentEnvironment);

if (!runningOnVercel) {
  console.log("Deployment environment check skipped outside Vercel.");
  process.exit(0);
}

if (deploymentEnvironment !== "production" && deploymentEnvironment !== "preview") {
  throw new Error("VERCEL_ENV must be production or preview for a deployment.");
}

if (process.env.DEPLOY_ENV !== deploymentEnvironment) {
  throw new Error(`DEPLOY_ENV must equal VERCEL_ENV (${deploymentEnvironment}).`);
}

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be configured for a deployment.");

let databaseUrl;
try {
  databaseUrl = new URL(process.env.DATABASE_URL);
} catch {
  throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
}

if (databaseUrl.protocol !== "postgres:" && databaseUrl.protocol !== "postgresql:") {
  throw new Error("DATABASE_URL must use the PostgreSQL protocol.");
}

if (["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname)) {
  throw new Error("A deployment DATABASE_URL must not point to localhost.");
}

if (process.env.ALLOW_TEST_DATABASE_RESET === "true") {
  throw new Error("ALLOW_TEST_DATABASE_RESET must not be enabled on Vercel.");
}

console.log(`Deployment environment verified: ${deploymentEnvironment}.`);
