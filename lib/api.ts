import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { DataPortabilityError } from "@/lib/data-portability";
import { RoutineServiceError } from "@/lib/routine-service";

export function handleApiError(error: unknown) {
  if (error instanceof AuthError || error instanceof DataPortabilityError || error instanceof RoutineServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "リクエスト形式が不正です。" }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "サーバーでエラーが発生しました。" }, { status: 500 });
}
