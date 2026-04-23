import { NextResponse } from "next/server";
import { createGuestCard } from "@/lib/appfolio";
import { getShowingSlot, updateRegistrationStatus } from "@/lib/showings-db";
import { upsertRegistration, listRegistrationsForSlot } from "@/lib/showings-db";

export const dynamic = "force-dynamic";

/**
 * POST /api/showings/guest-card
 *
 * Pushes a showing registration to AppFolio as a guest card.
 * Stores the returned guest_card_id on the registration row.
 *
 * Body: { registrationId, slotId }
 *
 * Returns: { guestCardId } or { error, skipped: true } if already pushed.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { registrationId, slotId } = body;

    if (!registrationId || !slotId) {
      return NextResponse.json({ error: "Missing registrationId or slotId" }, { status: 400 });
    }

    // Fetch the registration from the slot
    const regs = await listRegistrationsForSlot(slotId);
    const reg = regs.find((r) => r.id === registrationId);
    if (!reg) {
      return NextResponse.json({ error: "Registration not found" }, { status: 404 });
    }
    if (reg.guestCardId) {
      return NextResponse.json({ guestCardId: reg.guestCardId, skipped: true });
    }

    // Fetch slot for property context
    const slot = await getShowingSlot(slotId);

    // Split name heuristically (first word = first, rest = last)
    const nameParts = reg.prospectName.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(" ") || "-";

    const noteLines = [
      `Open house sign-up via Moxie Showings`,
      slot?.propertyName ? `Property: ${slot.propertyName}` : null,
      slot?.startsAt ? `Showing: ${new Date(slot.startsAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}` : null,
      reg.partySize > 1 ? `Party size: ${reg.partySize}` : null,
      reg.notes ? `Notes: ${reg.notes}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    const result = await createGuestCard({
      firstName,
      lastName,
      email: reg.prospectEmail,
      phone: reg.prospectPhone,
      propertyId: slot?.propertyId,
      notes: noteLines,
    });

    const guestCardId = String(result.id ?? result);

    // Persist the guest_card_id back to the registration
    await upsertRegistration({ ...reg, guestCardId });

    return NextResponse.json({ guestCardId });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
