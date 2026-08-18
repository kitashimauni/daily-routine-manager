import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { RoutineServiceError, setRoutineLog } from "@/lib/routine-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

async function readLogRequest(request: Request) {
  const body = await request.json() as { date?: unknown; completed?: unknown };
  if (typeof body.date !== "string") throw new RoutineServiceError("日付の指定が不正です。", 400);
  return { date: body.date, completed: body.completed };
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { date, completed } = await readLogRequest(request);
    if (typeof completed !== "boolean") return NextResponse.json({ error: "完了状態の指定が不正です。" }, { status: 400 });
    return NextResponse.json({ log: await setRoutineLog(user.id, id, date, completed) });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const { date } = await readLogRequest(request);
    return NextResponse.json({ log: await setRoutineLog(user.id, id, date, false) });
  } catch (error) {
    return handleApiError(error);
  }
}
