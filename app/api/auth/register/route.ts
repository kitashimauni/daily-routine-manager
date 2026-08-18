import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { registerUser } from "@/lib/auth";
import { seedDefaultRoutines } from "@/lib/routine-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { email?: unknown; password?: unknown };
    if (typeof body.email !== "string" || typeof body.password !== "string") return NextResponse.json({ error: "メールアドレスとパスワードを入力してください。" }, { status: 400 });
    const user = await registerUser(body.email, body.password);
    await seedDefaultRoutines(user.id);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
