import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { MAX_DATA_BYTES, DataPortabilityError, dataSizeLimitMessage, importDataForUser } from "@/lib/data-portability";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_DATA_BYTES) throw new DataPortabilityError(dataSizeLimitMessage(), 413);
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_DATA_BYTES) throw new DataPortabilityError(dataSizeLimitMessage(), 413);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new DataPortabilityError("JSONファイルを読み込めませんでした。");
    }
    return NextResponse.json({ imported: await importDataForUser(user.id, payload) });
  } catch (error) {
    return handleApiError(error);
  }
}
