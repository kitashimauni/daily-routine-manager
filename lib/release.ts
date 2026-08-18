import packageJson from "../package.json";

function deploymentUrl(host: string | undefined) {
  if (!host) return null;
  return host.startsWith("http://") || host.startsWith("https://") ? host : `https://${host}`;
}

export interface ReleaseInfo {
  version: string;
  commitSha: string;
  branch: string;
  environment: string;
  deploymentUrl: string | null;
  productionUrl: string | null;
}

export function getReleaseInfo(): ReleaseInfo {
  return {
    version: process.env.RELEASE_VERSION?.trim() || packageJson.version,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || process.env.RELEASE_COMMIT_SHA?.trim() || "local",
    branch: process.env.VERCEL_GIT_COMMIT_REF?.trim() || process.env.RELEASE_BRANCH?.trim() || "local",
    environment: process.env.VERCEL_ENV?.trim() || process.env.NODE_ENV || "development",
    deploymentUrl: deploymentUrl(process.env.VERCEL_URL?.trim()),
    productionUrl: deploymentUrl(process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()),
  };
}
