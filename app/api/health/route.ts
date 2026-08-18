import { getReleaseInfo } from "@/lib/release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { status: "ok", release: getReleaseInfo() },
    { headers: { "cache-control": "no-store" } },
  );
}
