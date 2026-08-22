import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { exportDataForUser, serializeDataExport } from "@/lib/data-portability";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const payload = await exportDataForUser(user.id);
    const serialized = serializeDataExport(payload);
    const fileStamp = payload.exportedAt.replace(/[.:]/g, "-");
    return new NextResponse(serialized, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="daily-routine-manager-export-${fileStamp}.json"`,
        "content-type": "application/json; charset=utf-8",
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
