import { NextResponse } from "next/server";
import { listShowingSlots } from "@/lib/showings-db";
import { listMeetings } from "@/lib/meetings-db";
import { getStoredWorkOrders } from "@/lib/work-orders-db";
import { mapWorkOrderRow } from "@/lib/data";
import { ACADEMIC_DATES } from "@/lib/calendar-events";

export const dynamic = "force-dynamic";

/**
 * GET /api/calendar/team
 *
 * iCalendar (.ics) feed of the full team calendar — showings, meetings,
 * work orders, and USC academic dates. Subscribe in Google/Apple Calendar
 * to get automatic 15-minute refreshes.
 *
 * Moves aren't included here (they'd require live AppFolio on every feed
 * hit and risk rate-limit issues). They're visible in-app on the calendar.
 */
export async function GET() {
  try {
    const [slots, meetings, workOrderRows] = await Promise.all([
      listShowingSlots({ includeRegistrations: true }),
      listMeetings(),
      getStoredWorkOrders({}),
    ]);

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Moxie Management//Team Calendar//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:Moxie Team Calendar",
      "X-WR-TIMEZONE:America/Los_Angeles",
      "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
      "X-PUBLISHED-TTL:PT15M",
    ];

    const dtstamp = toIcalUtc(new Date());

    // Showings — use real timed events (DTSTART / DTEND)
    for (const slot of slots) {
      if (slot.status === "cancelled") continue;
      const confirmed = (slot.registrations ?? []).filter(
        (r) => r.status === "confirmed" || r.status === "attended"
      );
      const seats = confirmed.reduce((s, r) => s + (r.partySize || 1), 0);
      const summary = slot.propertyName
        ? `Showing: ${slot.propertyName}`
        : "Open house showing";
      const descParts: string[] = [];
      if (slot.publicDescription) descParts.push(slot.publicDescription);
      descParts.push(`${confirmed.length} sign-up${confirmed.length === 1 ? "" : "s"} (${seats}/${slot.capacity} seats)`);
      if (slot.hostName) descParts.push(`Host: ${slot.hostName}`);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:showing-${slot.id}@moxie.app`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART:${toIcalUtc(new Date(slot.startsAt))}`);
      lines.push(`DTEND:${toIcalUtc(new Date(slot.endsAt))}`);
      lines.push(`SUMMARY:${escIcal(summary)}`);
      lines.push(`DESCRIPTION:${escIcal(descParts.join("\\n"))}`);
      if (slot.propertyName) lines.push(`LOCATION:${escIcal(slot.propertyName)}`);
      lines.push(`STATUS:${slot.status === "completed" ? "COMPLETED" : "CONFIRMED"}`);
      lines.push("END:VEVENT");
    }

    // Meetings — all-day
    for (const m of meetings) {
      const title = m.title || (m.property_name ? `Meeting: ${m.property_name}` : "Team meeting");
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:meeting-${m.id}@moxie.app`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${m.meeting_date.replace(/-/g, "")}`);
      lines.push(`SUMMARY:${escIcal(title)}`);
      if (m.summary) lines.push(`DESCRIPTION:${escIcal(m.summary)}`);
      lines.push("END:VEVENT");
    }

    // Work orders — all-day on scheduled date, skip completed/closed
    for (const row of workOrderRows) {
      const wo = mapWorkOrderRow((row.raw as Record<string, unknown>) || {}, 0);
      if (!wo.scheduledDate) continue;
      if (wo.status === "completed" || wo.status === "closed") continue;
      const dateStr = wo.scheduledDate.slice(0, 10).replace(/-/g, "");
      const priorityBit = wo.priority === "emergency" ? "🚨 " : wo.priority === "high" ? "⚠️ " : "";
      const propertyBit = wo.unitNumber ? ` · ${wo.unitNumber}` : "";
      const descParts: string[] = [];
      if (wo.vendor) descParts.push(`Vendor: ${wo.vendor}`);
      if (wo.assignedTo) descParts.push(`Assigned: ${wo.assignedTo}`);
      if (wo.description) descParts.push(wo.description);
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:wo-${wo.id}@moxie.app`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${dateStr}`);
      lines.push(`SUMMARY:${escIcal(`${priorityBit}WO: ${wo.title}${propertyBit}`)}`);
      if (descParts.length) lines.push(`DESCRIPTION:${escIcal(descParts.join("\\n"))}`);
      if (wo.propertyName) lines.push(`LOCATION:${escIcal(wo.propertyName)}`);
      lines.push("END:VEVENT");
    }

    // Academic dates — all-day
    for (const ad of ACADEMIC_DATES) {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:academic-${ad.date}@moxie.app`);
      lines.push(`DTSTAMP:${dtstamp}`);
      lines.push(`DTSTART;VALUE=DATE:${ad.date.replace(/-/g, "")}`);
      lines.push(`SUMMARY:${escIcal(`🎓 ${ad.label}`)}`);
      lines.push("END:VEVENT");
    }

    lines.push("END:VCALENDAR");
    const ics = lines.join("\r\n") + "\r\n";

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="moxie-team.ics"',
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/** Convert a Date to iCal UTC format: 20260501T130000Z */
function toIcalUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Escape iCal special chars in property values. */
function escIcal(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}
