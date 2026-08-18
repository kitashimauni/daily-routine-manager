import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { createRoutineForUser, listRoutineData, parseRoutineInput } from "@/lib/routine-service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(await listRoutineData(user.id));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const routine = await createRoutineForUser(user.id, parseRoutineInput(await request.json()));
    return NextResponse.json({ routine }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
