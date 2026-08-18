import { sql } from "drizzle-orm";
import { getDatabase } from "@/lib/db";
import { getReleaseInfo } from "@/lib/release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await getDatabase().execute(sql`select 1`);
  } catch {
    return Response.json(
      { status: "error", release: getReleaseInfo(), error: "database_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return Response.json(
    { status: "ok", release: getReleaseInfo() },
    { headers: { "cache-control": "no-store" } },
  );
}
