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
 */
export async function GET() {
  if (!process.env.APPFOLIO_CLIENT_ID || !process.env.APPFOLIO_CLIENT_SECRET) {
    return NextResponse.json({ showings: [] });
  }
  try {
    const showings = await getProspectShowings();
    return NextResponse.json({ showings });
  } catch (err: any) {
    console.warn("[/api/appfolio/showings]", err?.message ?? err);
    return NextResponse.json({ showings: [] });
  }
}
