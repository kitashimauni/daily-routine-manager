import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { deactivateRoutineForUser, parseRoutineInput, reactivateRoutineForUser, updateRoutineForUser } from "@/lib/routine-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const routine = await updateRoutineForUser(user.id, id, parseRoutineInput(await request.json()));
    return NextResponse.json({ routine });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await request.json() as { action?: unknown };
    if (body.action === "deactivate") return NextResponse.json({ routine: await deactivateRoutineForUser(user.id, id) });
    if (body.action === "reactivate") return NextResponse.json({ routine: await reactivateRoutineForUser(user.id, id) });
    return NextResponse.json({ error: "操作の指定が不正です。" }, { status: 400 });
  } catch (error) {
    return handleApiError(error);
  }
}
