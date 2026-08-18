import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { loginUser } from "@/lib/auth";
import { assertAuthRateLimit, getClientIp } from "@/lib/auth-rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await assertAuthRateLimit("login", getClientIp(request));
    const body = await request.json() as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") return NextResponse.json({ error: "メールアドレスとパスワードを入力してください。" }, { status: 400 });
    return NextResponse.json({ user: await loginUser(body.email, body.password) });
  } catch (error) {
    return handleApiError(error);
  }
}
