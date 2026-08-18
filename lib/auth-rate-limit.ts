import { isIP } from "node:net";
import { lt, sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { authRateLimits } from "@/lib/db/schema";
import { AuthError } from "@/lib/auth";

const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = {
  login: { maxAttempts: 10, message: "ログイン試行が多すぎます。しばらく待ってから再試行してください。" },
  register: { maxAttempts: 5, message: "登録試行が多すぎます。しばらく待ってから再試行してください。" },
} as const;

export type AuthAction = keyof typeof LIMITS;

function normalizeIp(value: string | null) {
  const candidate = value?.split(",")[0]?.trim();
  return candidate && isIP(candidate) ? candidate : null;
}

export function getClientIp(request: Request) {
  const isVercelRequest = process.env.VERCEL === "1";
  if (isVercelRequest) {
    return normalizeIp(request.headers.get("x-vercel-forwarded-for"))
      || normalizeIp(request.headers.get("x-real-ip"))
      || "unknown";
  }

  if (process.env.TRUST_PROXY_HEADERS !== "true") return "unknown";

  return normalizeIp(request.headers.get("x-forwarded-for"))
    || normalizeIp(request.headers.get("x-real-ip"))
    || "unknown";
}

export async function assertAuthRateLimit(action: AuthAction, ip: string) {
  const { maxAttempts, message } = LIMITS[action];
  const now = new Date();
  const nowIso = now.toISOString();
  const resetBoundary = new Date(now.getTime() - WINDOW_MS).toISOString();
  const db = getDatabase();

  await db.delete(authRateLimits).where(lt(authRateLimits.updatedAt, resetBoundary));

  const [record] = await db
    .insert(authRateLimits)
    .values({
      id: `${action}:${ip}`,
      action,
      ip,
      windowStartedAt: nowIso,
      attempts: 1,
      createdAt: nowIso,
      updatedAt: nowIso,
    })
    .onConflictDoUpdate({
      target: [authRateLimits.action, authRateLimits.ip],
      set: {
        windowStartedAt: sql`CASE WHEN ${authRateLimits.windowStartedAt} < ${resetBoundary} THEN ${nowIso} ELSE ${authRateLimits.windowStartedAt} END`,
        attempts: sql`CASE WHEN ${authRateLimits.windowStartedAt} < ${resetBoundary} THEN 1 ELSE ${authRateLimits.attempts} + 1 END`,
        updatedAt: nowIso,
      },
    })
    .returning({ attempts: authRateLimits.attempts });

  if (record.attempts > maxAttempts) throw new AuthError(message, 429);
}
