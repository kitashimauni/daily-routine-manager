import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { RoutineServiceError } from "@/lib/routine-service";

export function handleApiError(error: unknown) {
  if (error instanceof AuthError || error instanceof RoutineServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: "サーバーでエラーが発生しました。" }, { status: 500 });
}
