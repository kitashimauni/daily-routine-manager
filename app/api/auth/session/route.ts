import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { getAppTimeZone } from "@/lib/server-date";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ user: await getCurrentUser(), timeZone: getAppTimeZone() });
  } catch (error) {
    return handleApiError(error);
  }
}
