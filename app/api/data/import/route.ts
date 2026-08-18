import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { MAX_IMPORT_BYTES, DataPortabilityError, importDataForUser } from "@/lib/data-portability";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_IMPORT_BYTES) throw new DataPortabilityError("ファイルサイズが大きすぎます。5MB以下のJSONを選択してください。");
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) throw new DataPortabilityError("ファイルサイズが大きすぎます。5MB以下のJSONを選択してください。");
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
