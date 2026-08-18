import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { logoutUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    await logoutUser();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
