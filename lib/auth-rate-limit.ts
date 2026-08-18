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

export function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const ip = forwarded || realIp || "unknown";
  return ip.slice(0, 128);
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
