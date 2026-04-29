import { NextResponse } from "next/server";
import { getProspectShowings } from "@/lib/appfolio";

export const dynamic = "force-dynamic";

/**
 * GET /api/appfolio/showings
 *
 * Returns scheduled showings derived from AppFolio guest cards / prospects.
 * Used by the team calendar to surface showings that exist in AppFolio but
 * aren't backed by a Moxie showing slot.
 *
 * Best-effort: returns an empty list (200) if AppFolio is unconfigured or
 * the underlying report isn't available, so the calendar doesn't break.
 *
 * Append `?debug=1` to also receive per-report probe diagnostics — useful
 * when no showings are surfaced and you need to know which AppFolio report
 * names this tenant actually exposes.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const debug = searchParams.get("debug") === "1";

  if (!process.env.APPFOLIO_CLIENT_ID || !process.env.APPFOLIO_CLIENT_SECRET) {
    return NextResponse.json({
      showings: [],
      ...(debug ? { debug: { error: "AppFolio not configured" } } : {}),
    });
  }
  try {
    const { showings, attempts } = await getProspectShowings();
    return NextResponse.json({
      showings,
      ...(debug ? { debug: { attempts } } : {}),
    });
  } catch (err: any) {
    console.warn("[/api/appfolio/showings]", err?.message ?? err);
    return NextResponse.json({
      showings: [],
      ...(debug ? { debug: { error: err?.message ?? String(err) } } : {}),
    });
  }
}
