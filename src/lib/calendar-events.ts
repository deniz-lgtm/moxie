// ============================================
// Calendar events — shared event model + loader
// ============================================
// Used by both TeamCalendar (dashboard month view) and WeekAgenda
// (compact 7-day list embedded in the meeting agenda).
//
// All calendar-event styling, academic key dates, and the parallel
// fetch pipeline live here so UI components only have to render.

import type { MaintenanceRequest, Unit } from "./types";

// ─── event model ────────────────────────────────────────────────────────────

export type CalEventType =
  | "showing"
  | "move_in"
  | "move_out"
  | "academic"
  | "meeting"
  | "work_order";

export interface CalEvent {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  type: CalEventType;
  href?: string;
  /** Minutes-past-midnight, if the underlying event has a known time */
  startMinutes?: number;
}

export const TYPE_STYLES: Record<CalEventType, string> = {
  academic:   "bg-blue-100 text-blue-800",
  showing:    "bg-purple-100 text-purple-800",
  move_in:    "bg-emerald-100 text-emerald-800",
  move_out:   "bg-orange-100 text-orange-800",
  meeting:    "bg-teal-100 text-teal-800",
  work_order: "bg-yellow-100 text-yellow-800",
};

export const TYPE_DOT: Record<CalEventType, string> = {
  academic:   "bg-blue-500",
  showing:    "bg-purple-500",
  move_in:    "bg-emerald-500",
  move_out:   "bg-orange-500",
  meeting:    "bg-teal-500",
  work_order: "bg-yellow-500",
};

export const TYPE_LABEL: Record<CalEventType, string> = {
  academic:   "Academic",
  showing:    "Showings",
  move_in:    "Move-in",
  move_out:   "Move-out",
  meeting:    "Meetings",
  work_order: "Work orders",
};

export const ALL_EVENT_TYPES: CalEventType[] = [
  "academic", "showing", "move_in", "move_out", "meeting", "work_order",
];

// ─── USC / lease-year academic calendar ─────────────────────────────────────

export const ACADEMIC_DATES: { date: string; label: string }[] = [
  // 2025–2026
  { date: "2025-08-15", label: "Move-in (Fall 2025)" },
  { date: "2025-08-18", label: "Fall semester starts" },
  { date: "2025-11-26", label: "Thanksgiving break" },
  { date: "2025-12-12", label: "Fall semester ends" },
  { date: "2026-01-12", label: "Spring semester starts" },
  { date: "2026-03-23", label: "Spring break (USC)" },
  { date: "2026-05-08", label: "Spring semester ends" },
  { date: "2026-07-31", label: "Lease end / Move-out deadline" },
  // 2026–2027
  { date: "2026-08-15", label: "Move-in (Fall 2026)" },
  { date: "2026-08-17", label: "Fall semester starts" },
  { date: "2026-11-25", label: "Thanksgiving break" },
  { date: "2026-12-11", label: "Fall semester ends" },
  { date: "2027-01-11", label: "Spring semester starts" },
  { date: "2027-03-22", label: "Spring break (USC)" },
  { date: "2027-05-07", label: "Spring semester ends" },
  { date: "2027-07-31", label: "Lease end / Move-out deadline" },
];

// ─── helpers ────────────────────────────────────────────────────────────────

export function isoDate(d: Date): string {
  // Timezone-safe: pad local y/m/d rather than relying on toISOString (UTC).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Is the given YYYY-MM-DD string within an inclusive window in local time? */
function withinWindow(dateIso: string, fromIso: string, toIso: string): boolean {
  return dateIso >= fromIso && dateIso <= toIso;
}

// ─── loader ─────────────────────────────────────────────────────────────────

/**
 * Fetch all calendar events from the four live sources + academic dates.
 *
 * `window` is used purely to bound the move-event + work-order queries so we
 * don't accidentally dump 5 years of AppFolio history onto the calendar. The
 * caller is free to filter further.
 */
export async function loadCalendarEvents(window?: {
  fromIso?: string;
  toIso?: string;
}): Promise<CalEvent[]> {
  const defaultCutoff = new Date();
  defaultCutoff.setMonth(defaultCutoff.getMonth() - 2);
  const defaultCeiling = new Date();
  defaultCeiling.setMonth(defaultCeiling.getMonth() + 6);
  const fromIso = window?.fromIso ?? isoDate(defaultCutoff);
  const toIso = window?.toIso ?? isoDate(defaultCeiling);

  const [showingsRes, unitsRes, meetingsRes, workOrdersRes] = await Promise.allSettled([
    fetch("/api/showings/slots?include_regs=1").then((r) => r.json()),
    fetch("/api/appfolio/units").then((r) => r.json()),
    fetch("/api/meetings/crud").then((r) => r.json()),
    fetch("/api/maintenance/requests").then((r) => r.json()),
  ]);

  const collected: CalEvent[] = [];

  // Academic dates — always include, consumer can filter by window
  for (const ad of ACADEMIC_DATES) {
    collected.push({ id: `ac-${ad.date}`, date: ad.date, label: ad.label, type: "academic" });
  }

  // Showings
  if (showingsRes.status === "fulfilled" && Array.isArray(showingsRes.value.slots)) {
    for (const s of showingsRes.value.slots) {
      if (s.status === "cancelled") continue;
      const startIso = s.startsAt as string;
      const date = startIso.slice(0, 10);
      const startDate = new Date(startIso);
      const time = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
      const label = s.propertyName ? `Showing: ${s.propertyName} @ ${time}` : `Open house @ ${time}`;
      collected.push({
        id: `show-${s.id}`,
        date,
        label,
        type: "showing",
        href: "/showings",
        startMinutes: startDate.getHours() * 60 + startDate.getMinutes(),
      });
    }
  }

  // Move-in / move-out from units
  if (unitsRes.status === "fulfilled" && Array.isArray(unitsRes.value.units)) {
    const units: Unit[] = unitsRes.value.units;
    for (const u of units) {
      const name = u.unitName || u.displayName || u.number;
      if (u.moveIn) {
        const dIso = isoDate(new Date(u.moveIn));
        if (withinWindow(dIso, fromIso, toIso)) {
          collected.push({
            id: `mi-${u.id}`,
            date: dIso,
            label: `Move-in: ${name}${u.tenant ? ` (${u.tenant})` : ""}`,
            type: "move_in",
            href: "/portfolio",
          });
        }
      }
      if (u.moveOut) {
        const dIso = isoDate(new Date(u.moveOut));
        if (withinWindow(dIso, fromIso, toIso)) {
          collected.push({
            id: `mo-${u.id}`,
            date: dIso,
            label: `Move-out: ${name}${u.tenant ? ` (${u.tenant})` : ""}`,
            type: "move_out",
            href: "/portfolio",
          });
        }
      }
    }
  }

  // Meetings
  if (meetingsRes.status === "fulfilled" && Array.isArray(meetingsRes.value.meetings)) {
    for (const m of meetingsRes.value.meetings) {
      const date = (m.meeting_date as string).slice(0, 10);
      const label = m.title || m.property_name
        ? `Meeting: ${m.title || m.property_name}`
        : "Team meeting";
      collected.push({ id: `mtg-${m.id}`, date, label, type: "meeting", href: "/meetings" });
    }
  }

  // Work orders
  if (workOrdersRes.status === "fulfilled" && Array.isArray(workOrdersRes.value.workOrders)) {
    const workOrders: MaintenanceRequest[] = workOrdersRes.value.workOrders;
    for (const wo of workOrders) {
      if (!wo.scheduledDate) continue;
      if (wo.status === "completed" || wo.status === "closed") continue;
      const dIso = isoDate(new Date(wo.scheduledDate));
      if (!withinWindow(dIso, fromIso, toIso)) continue;
      const propertyBit = wo.unitNumber ? ` · ${wo.unitNumber}` : "";
      const priorityBit = wo.priority === "emergency" || wo.priority === "high" ? ` [${wo.priority}]` : "";
      collected.push({
        id: `wo-${wo.id}`,
        date: dIso,
        label: `WO: ${wo.title}${propertyBit}${priorityBit}`,
        type: "work_order",
        href: `/maintenance?id=${wo.id}`,
      });
    }
  }

  return collected;
}

/** Group events by YYYY-MM-DD. */
export function groupEventsByDate(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>();
  for (const e of events) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date)!.push(e);
  }
  // Sort events within each day: known-time events first (chronologically), then all-day
  for (const list of map.values()) {
    list.sort((a, b) => {
      const am = a.startMinutes ?? 9999;
      const bm = b.startMinutes ?? 9999;
      if (am !== bm) return am - bm;
      return a.label.localeCompare(b.label);
    });
  }
  return map;
}
