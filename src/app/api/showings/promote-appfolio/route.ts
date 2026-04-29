import { NextResponse } from "next/server";
import { upsertShowingSlot } from "@/lib/showings-db";
import type { ShowingSlot } from "@/lib/types";

export const dynamic = "force-dynamic";

const PROMOTED_DURATION_MINUTES = 30;

/**
 * POST /api/showings/promote-appfolio
 *
 * Convert a 1-on-1 AppFolio showing into a multi-prospect Moxie open
 * house. The original prospect stays in AppFolio (we don't push or copy
 * their PII into Moxie); we just stamp the AppFolio showing_id +
 * guest_card_id on the new slot so the showings page can:
 *   - hide the AppFolio shadow now that a Moxie slot covers it
 *   - re-derive the original prospect from the AppFolio feed at render
 *     time as a synthetic non-deletable registration
 *
 * New sign-ups for the promoted slot live in Moxie only — the
 * /api/showings/registrations POST handler skips its AppFolio auto-push
 * for slots that have appfolio_showing_id set.
 *
 * Body: {
 *   appfolioShowingId, appfolioGuestCardId, propertyId?, propertyName?,
 *   unitId?, unitName?, startsAt, hostName?
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      appfolioShowingId,
      appfolioGuestCardId,
      propertyId,
      propertyName,
      unitId,
      unitName,
      startsAt,
      hostName,
    } = body ?? {};

    if (!appfolioShowingId || !appfolioGuestCardId || !startsAt) {
      return NextResponse.json(
        { error: "Missing appfolioShowingId, appfolioGuestCardId, or startsAt" },
        { status: 400 }
      );
    }

    const startMs = new Date(startsAt).getTime();
    if (Number.isNaN(startMs)) {
      return NextResponse.json({ error: "Invalid startsAt" }, { status: 400 });
    }
    const endsAt = new Date(startMs + PROMOTED_DURATION_MINUTES * 60_000).toISOString();

    const id = `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const publicToken = `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;

    const slot: ShowingSlot = {
      id,
      propertyId: propertyId ? String(propertyId) : undefined,
      propertyName: propertyName ? String(propertyName) : undefined,
      unitId: unitId ? String(unitId) : undefined,
      unitName: unitName ? String(unitName) : undefined,
      startsAt: new Date(startMs).toISOString(),
      endsAt,
      hostName: hostName ? String(hostName) : undefined,
      // 0 = unlimited; capacity check is skipped server-side for these slots.
      capacity: 0,
      publicToken,
      status: "open",
      appfolioShowingId: String(appfolioShowingId),
      appfolioGuestCardId: String(appfolioGuestCardId),
    };

    const saved = await upsertShowingSlot(slot);
    return NextResponse.json({ slot: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
