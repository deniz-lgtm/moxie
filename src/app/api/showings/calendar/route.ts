import { NextResponse } from "next/server";
import { listShowingSlots } from "@/lib/showings-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/showings/calendar
 *   Returns an iCalendar (.ics) feed of all open/upcoming showing slots.
 *   Add this URL to Google Calendar / Apple Calendar / Outlook as a
 *   "subscribe to calendar" URL to get real-time showing updates.
 *
 *   Optional query params:
 *   ?status=open         — filter by status (default: all non-cancelled)
 *   ?host_user_id=...    — limit to one host
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const hostUserId = url.searchParams.get("host_user_id") || undefined;
    const statusParam = url.searchParams.get("status") || undefined;

    const slots = await listShowingSlots({
      status: statusParam as "open" | "cancelled" | "completed" | undefined,
      hostUserId,
      includeRegistrations: true,
    });

    const activeSlots = slots.filter((s) => s.status !== "cancelled");

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Moxie Management//Showings//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Moxie Showings",
      "X-WR-TIMEZONE:America/Los_Angeles",
      "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
      "X-PUBLISHED-TTL:PT15M",
    ];

    for (const slot of activeSlots) {
      const confirmed = (slot.registrations ?? []).filter(
        (r) => r.status === "confirmed" || r.status === "attended"
      );
      const seats = confirmed.reduce((s, r) => s + (r.partySize || 1), 0);
      const remaining = Math.max(0, slot.capacity - seats);

      const dtstart = toIcalDate(slot.startsAt);
      const dtend = toIcalDate(slot.endsAt);
      const dtstamp = toIcalDate(new Date().toISOString());
      const uid = `showing-${slot.id}@moxie.app`;

      const summary = slot.propertyName
        ? `Showing: ${slot.propertyName}`
        : "Open House Showing";

      const descParts: string[] = [];
      if (slot.publicDescription) descParts.push(slot.publicDescription);
      descParts.push(`Registrations: ${confirmed.length} (${seats} seats / ${slot.capacity} capacity)`);
      descParts.push(`Spots remaining: ${remaining}`);
      if (slot.hostName) descParts.push(`Host: ${slot.hostName}`);
      descParts.push(`Status: ${slot.status}`);
      if (confirmed.length > 0) {
        descParts.push("");
        descParts.push("Registrants:");
        for (const r of confirmed) {
          descParts.push(`  • ${r.prospectName}${r.partySize > 1 ? ` (party of ${r.partySize})` : ""}${r.prospectPhone ? ` — ${r.prospectPhone}` : ""}`);
        }
      }
      const description = descParts.join("\\n");

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${uid}`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART:${dtstart}`);
      lines.push(`DTEND:${dtend}`);
      lines.push(`SUMMARY:${escIcal(summary)}`);
      lines.push(`DESCRIPTION:${escIcal(description)}`);
      if (slot.propertyName) lines.push(`LOCATION:${escIcal(slot.propertyName)}`);
      lines.push(`STATUS:${slot.status === "completed" ? "COMPLETED" : "CONFIRMED"}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");

    const ics = lines.join("\r\n") + "\r\n";

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="moxie-showings.ics"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/** Convert an ISO date string to iCal BASIC format: 20260501T130000Z */
function toIcalDate(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape special iCal characters in property values. */
function escIcal(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
