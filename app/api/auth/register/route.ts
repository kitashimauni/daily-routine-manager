import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { registerUser } from "@/lib/auth";
import { assertAuthRateLimit, getClientIp } from "@/lib/auth-rate-limit";
import { getAppTimeZone } from "@/lib/server-date";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertAuthRateLimit("register", getClientIp(request));
    const body = await request.json() as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") return NextResponse.json({ error: "メールアドレスとパスワードを入力してください。" }, { status: 400 });
    const user = await registerUser(body.email, body.password);
    return NextResponse.json({ user, timeZone: getAppTimeZone() }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
