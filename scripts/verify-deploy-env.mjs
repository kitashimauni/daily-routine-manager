import { validateAppTimeZone } from "./deploy-env-validation.mjs";

const deploymentEnvironment = process.env.DEPLOY_ENV?.trim() || process.env.VERCEL_ENV?.trim();

if (!deploymentEnvironment || deploymentEnvironment === "local") {
  console.log("Deployment environment check skipped outside a production or preview deployment.");
  process.exit(0);
}

if (deploymentEnvironment !== "production" && deploymentEnvironment !== "preview") {
  throw new Error("DEPLOY_ENV must be production or preview for a deployment.");
}

if (process.env.VERCEL_ENV && process.env.DEPLOY_ENV !== process.env.VERCEL_ENV) {
  throw new Error(`DEPLOY_ENV must equal VERCEL_ENV (${process.env.VERCEL_ENV}).`);
}

validateAppTimeZone(process.env.APP_TIME_ZONE);

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

if (process.env.ALLOW_TEST_DATABASE_RESET === "true" || process.env.RESET_TEST_DATABASE === "true") {
  throw new Error("Test database reset flags must not be enabled for a deployment.");
}

const releaseCommitSha = process.env.RELEASE_COMMIT_SHA?.trim();
if (!releaseCommitSha) {
  throw new Error("RELEASE_COMMIT_SHA must be configured for release tracking.");
}
if (!/^[0-9a-f]{7,64}$/i.test(releaseCommitSha)) {
  throw new Error("RELEASE_COMMIT_SHA must be a full or abbreviated hexadecimal Git commit SHA.");
}

if (!process.env.RELEASE_BRANCH?.trim()) {
  throw new Error("RELEASE_BRANCH must be configured for release tracking.");
}

if (deploymentEnvironment === "production") {
  if (process.env.RELEASE_BRANCH !== "main") {
    throw new Error("Production deployments must use RELEASE_BRANCH=main.");
  }
  if (process.env.TRUST_PROXY_HEADERS !== "true") {
    throw new Error("Production deployments require TRUST_PROXY_HEADERS=true behind the managed reverse proxy.");
  }
}

console.log(`Deployment environment verified: ${deploymentEnvironment}.`);
