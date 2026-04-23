import { NextResponse } from "next/server";
import {
  deleteShowingSlot,
  getShowingSlot,
  listShowingSlots,
  makePublicToken,
  upsertShowingSlot,
} from "@/lib/showings-db";
import type { ShowingSlot, ShowingSlotStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/showings/slots
 *   ?id=<slot_id>       — single slot (with registrations)
 *   ?from=YYYY-MM-DD    — only slots starting on/after (inclusive)
 *   ?to=YYYY-MM-DD      — only slots starting on/before (inclusive)
 *   ?status=...         — open | cancelled | completed
 *   ?host_user_id=...   — slots hosted by this user
 *   ?include_regs=1     — hydrate registrations on the listing response
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (id) {
      const slot = await getShowingSlot(id);
      if (!slot) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ slot });
    }
    const slots = await listShowingSlots({
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      status: (url.searchParams.get("status") as ShowingSlotStatus) || undefined,
      hostUserId: url.searchParams.get("host_user_id") || undefined,
      includeRegistrations: url.searchParams.get("include_regs") === "1",
    });
    return NextResponse.json({ slots });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/showings/slots — create or update a slot.
 *
 * Body: ShowingSlot (id + public_token auto-generated when creating).
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ShowingSlot> & {
      propertyName?: string | null;
    };
    if (!body?.startsAt || !body?.endsAt) {
      return NextResponse.json(
        { error: "Missing startsAt / endsAt" },
        { status: 400 }
      );
    }
    const now = new Date().toISOString();
    const slot: ShowingSlot = {
      id: body.id || `slot_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      propertyId: body.propertyId,
      propertyName: body.propertyName ?? undefined,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      hostUserId: body.hostUserId,
      hostName: body.hostName,
      capacity: Number.isFinite(Number(body.capacity)) ? Number(body.capacity) : 10,
      notes: body.notes,
      publicDescription: body.publicDescription,
      publicToken: body.publicToken || makePublicToken(),
      status: (body.status as ShowingSlotStatus) || "open",
      createdAt: body.createdAt ?? now,
      updatedAt: now,
    };
    const saved = await upsertShowingSlot(slot);
    return NextResponse.json({ slot: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/** DELETE /api/showings/slots?id=<slot_id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteShowingSlot(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
