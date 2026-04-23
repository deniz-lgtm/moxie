import { NextResponse } from "next/server";
import {
  countActiveRegistrations,
  deleteRegistration,
  getShowingSlot,
  getShowingSlotByToken,
  listRegistrationsForSlot,
  updateRegistrationStatus,
  upsertRegistration,
} from "@/lib/showings-db";
import type { ShowingRegistration, ShowingRegistrationStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/showings/registrations?slot_id=<id>
 *   Lists registrations for a slot.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const slotId = url.searchParams.get("slot_id");
    if (!slotId) return NextResponse.json({ error: "Missing slot_id" }, { status: 400 });
    const registrations = await listRegistrationsForSlot(slotId);
    return NextResponse.json({ registrations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/showings/registrations — sign up for a slot.
 *
 * Two flavors:
 *  - Authenticated (internal): body includes `slotId` directly.
 *  - Public sign-up:           body includes `publicToken` (resolves to slot).
 *
 * Capacity is enforced: if the slot is at capacity, returns 409.
 *
 * Body:
 * {
 *   slotId? | publicToken?,
 *   prospectName, prospectEmail?, prospectPhone?, partySize?, notes?,
 *   source?    // "public" | "manual" | "imported"
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prospectName = typeof body?.prospectName === "string" ? body.prospectName.trim() : "";
    if (!prospectName) {
      return NextResponse.json({ error: "Missing prospectName" }, { status: 400 });
    }

    // Resolve the slot (by id or public token).
    let slot = null;
    if (typeof body?.slotId === "string" && body.slotId) {
      slot = await getShowingSlot(body.slotId);
    } else if (typeof body?.publicToken === "string" && body.publicToken) {
      slot = await getShowingSlotByToken(body.publicToken);
    }
    if (!slot) return NextResponse.json({ error: "Slot not found" }, { status: 404 });
    if (slot.status !== "open") {
      return NextResponse.json({ error: "Slot is not accepting sign-ups" }, { status: 409 });
    }

    const partySize = Math.max(1, Number(body.partySize) || 1);

    // Capacity check — `count` is how many "seats" are already claimed.
    // Party size of the incoming registration is what we're adding.
    const active = await countActiveRegistrations(slot.id);
    const currentSeatsUsed = (slot.registrations ?? [])
      .filter((r) => r.status === "confirmed" || r.status === "attended")
      .reduce((s, r) => s + (r.partySize || 1), 0) || active; // fallback to count if partySize not hydrated
    if (currentSeatsUsed + partySize > slot.capacity) {
      return NextResponse.json(
        { error: "Slot is full", capacity: slot.capacity, remaining: Math.max(0, slot.capacity - currentSeatsUsed) },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const registration: ShowingRegistration = {
      id: body.id || `reg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      slotId: slot.id,
      prospectName,
      prospectEmail: typeof body.prospectEmail === "string" ? body.prospectEmail.trim() || undefined : undefined,
      prospectPhone: typeof body.prospectPhone === "string" ? body.prospectPhone.trim() || undefined : undefined,
      partySize,
      status: "confirmed",
      notes: typeof body.notes === "string" ? body.notes.trim() || undefined : undefined,
      guestCardId: typeof body.guestCardId === "string" ? body.guestCardId.trim() || undefined : undefined,
      source: typeof body.source === "string" ? body.source : "manual",
      createdAt: now,
      updatedAt: now,
    };
    const saved = await upsertRegistration(registration);
    return NextResponse.json({ registration: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/**
 * PATCH /api/showings/registrations?id=<id>
 * Body: { status: ShowingRegistrationStatus }
 */
export async function PATCH(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const body = await request.json();
    const status = body?.status as ShowingRegistrationStatus;
    if (!status) return NextResponse.json({ error: "Missing status" }, { status: 400 });
    const registration = await updateRegistrationStatus(id, status);
    return NextResponse.json({ registration });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/** DELETE /api/showings/registrations?id=<id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteRegistration(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
