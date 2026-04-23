"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { MaintenanceRequest, Unit } from "@/lib/types";

// ─── event model ────────────────────────────────────────────────────────────

type EventType = "showing" | "move_in" | "move_out" | "academic" | "meeting" | "work_order";

interface CalEvent {
  id: string;
  date: string; // YYYY-MM-DD
  label: string;
  type: EventType;
  href?: string;
}

const TYPE_STYLES: Record<EventType, string> = {
  academic:   "bg-blue-100 text-blue-800",
  showing:    "bg-purple-100 text-purple-800",
  move_in:    "bg-emerald-100 text-emerald-800",
  move_out:   "bg-orange-100 text-orange-800",
  meeting:    "bg-teal-100 text-teal-800",
  work_order: "bg-yellow-100 text-yellow-800",
};

const TYPE_DOT: Record<EventType, string> = {
  academic:   "bg-blue-500",
  showing:    "bg-purple-500",
  move_in:    "bg-emerald-500",
  move_out:   "bg-orange-500",
  meeting:    "bg-teal-500",
  work_order: "bg-yellow-500",
};

const TYPE_LABEL: Record<EventType, string> = {
  academic:   "Academic",
  showing:    "Showings",
  move_in:    "Move-in",
  move_out:   "Move-out",
  meeting:    "Meetings",
  work_order: "Work orders",
};

const ALL_TYPES: EventType[] = ["academic", "showing", "move_in", "move_out", "meeting", "work_order"];

// ─── hardcoded academic calendar ────────────────────────────────────────────

const ACADEMIC_DATES: { date: string; label: string }[] = [
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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  return r;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0 = Sun
}

// ─── main component ──────────────────────────────────────────────────────────

export function TeamCalendar() {
  const [current, setCurrent] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // YYYY-MM-DD
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<EventType>>(new Set());

  const visibleEvents = useMemo(
    () => events.filter((e) => !hidden.has(e.type)),
    [events, hidden]
  );

  const toggleFilter = (t: EventType) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [showingsRes, unitsRes, meetingsRes, workOrdersRes] = await Promise.allSettled([
        fetch("/api/showings/slots?include_regs=1").then((r) => r.json()),
        fetch("/api/appfolio/units").then((r) => r.json()),
        fetch("/api/meetings/crud").then((r) => r.json()),
        fetch("/api/maintenance/requests").then((r) => r.json()),
      ]);

      const collected: CalEvent[] = [];

      // Academic dates
      for (const ad of ACADEMIC_DATES) {
        collected.push({ id: `ac-${ad.date}`, date: ad.date, label: ad.label, type: "academic" });
      }

      // Showings
      if (showingsRes.status === "fulfilled" && Array.isArray(showingsRes.value.slots)) {
        for (const s of showingsRes.value.slots) {
          if (s.status === "cancelled") continue;
          const date = (s.startsAt as string).slice(0, 10);
          const time = new Date(s.startsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
          const label = s.propertyName ? `Showing: ${s.propertyName} @ ${time}` : `Open house @ ${time}`;
          collected.push({ id: `show-${s.id}`, date, label, type: "showing", href: "/showings" });
        }
      }

      // Move-in / move-out from units
      if (unitsRes.status === "fulfilled" && Array.isArray(unitsRes.value.units)) {
        const units: Unit[] = unitsRes.value.units;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 1); // show up to 1 month ago
        const ceiling = new Date();
        ceiling.setMonth(ceiling.getMonth() + 6); // and 6 months ahead

        for (const u of units) {
          const name = u.unitName || u.displayName || u.number;
          if (u.moveIn) {
            const d = new Date(u.moveIn);
            if (d >= cutoff && d <= ceiling) {
              collected.push({
                id: `mi-${u.id}`,
                date: isoDate(d),
                label: `Move-in: ${name}${u.tenant ? ` (${u.tenant})` : ""}`,
                type: "move_in",
                href: "/portfolio",
              });
            }
          }
          if (u.moveOut) {
            const d = new Date(u.moveOut);
            if (d >= cutoff && d <= ceiling) {
              collected.push({
                id: `mo-${u.id}`,
                date: isoDate(d),
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

      // Work orders — scheduled date from AppFolio (+ Moxie override via scheduled_date_override).
      // Only show currently-actionable ones: not completed/closed, with a scheduled date.
      if (workOrdersRes.status === "fulfilled" && Array.isArray(workOrdersRes.value.workOrders)) {
        const workOrders: MaintenanceRequest[] = workOrdersRes.value.workOrders;
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - 2);
        const ceiling = new Date();
        ceiling.setMonth(ceiling.getMonth() + 6);

        for (const wo of workOrders) {
          if (!wo.scheduledDate) continue;
          if (wo.status === "completed" || wo.status === "closed") continue;
          const d = new Date(wo.scheduledDate);
          if (!(d >= cutoff && d <= ceiling)) continue;
          const propertyBit = wo.unitNumber ? ` · ${wo.unitNumber}` : "";
          const priorityBit = wo.priority === "emergency" || wo.priority === "high" ? ` [${wo.priority}]` : "";
          collected.push({
            id: `wo-${wo.id}`,
            date: isoDate(d),
            label: `WO: ${wo.title}${propertyBit}${priorityBit}`,
            type: "work_order",
            href: `/maintenance?id=${wo.id}`,
          });
        }
      }

      setEvents(collected);
    } catch {
      // leave events empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const year = current.getFullYear();
  const month = current.getMonth();
  const totalDays = daysInMonth(year, month);
  const startDow = firstDayOfWeek(year, month); // 0 = Sun
  const todayStr = isoDate(new Date());

  // Build 42-cell grid
  const cells: { date: string; isCurrentMonth: boolean }[] = [];
  const prevDays = daysInMonth(year, month === 0 ? 11 : month - 1);
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevDays - i);
    cells.push({ date: isoDate(d), isCurrentMonth: false });
  }
  for (let i = 1; i <= totalDays; i++) {
    cells.push({ date: isoDate(new Date(year, month, i)), isCurrentMonth: true });
  }
  while (cells.length < 42) {
    const d = new Date(year, month + 1, cells.length - startDow - totalDays + 1);
    cells.push({ date: isoDate(d), isCurrentMonth: false });
  }

  const byDate = new Map<string, CalEvent[]>();
  for (const e of visibleEvents) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date)!.push(e);
  }

  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">{monthLabel(current)}</h2>
          {loading && <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setCurrent((c) => addMonths(c, -1)); setSelected(null); }}
            className="p-1.5 rounded hover:bg-muted"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setCurrent(new Date(new Date().setDate(1))); setSelected(null); }}
            className="text-xs px-2.5 py-1 rounded border border-border hover:bg-muted font-medium"
          >
            Today
          </button>
          <button
            onClick={() => { setCurrent((c) => addMonths(c, 1)); setSelected(null); }}
            className="p-1.5 rounded hover:bg-muted"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter chips — click to toggle visibility of an event type */}
      <div className="px-5 py-3 border-b border-border flex flex-wrap gap-1.5">
        {ALL_TYPES.map((t) => {
          const isHidden = hidden.has(t);
          return (
            <button
              key={t}
              onClick={() => toggleFilter(t)}
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition ${
                isHidden
                  ? "bg-muted text-muted-foreground opacity-50 hover:opacity-75"
                  : TYPE_STYLES[t] + " hover:opacity-80"
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${TYPE_DOT[t]}`} />
              {TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const cellEvents = byDate.get(cell.date) ?? [];
          const isToday = cell.date === todayStr;
          const isSelected = cell.date === selected;
          const hasMore = cellEvents.length > 3;

          return (
            <button
              key={i}
              onClick={() => setSelected(cell.date === selected ? null : cell.date)}
              className={`
                min-h-[72px] p-1.5 text-left border-b border-r border-border last:border-r-0
                transition-colors hover:bg-muted/50
                ${!cell.isCurrentMonth ? "opacity-40" : ""}
                ${isSelected ? "bg-primary/5" : ""}
              `}
            >
              <span
                className={`
                  text-xs font-medium inline-flex items-center justify-center w-5 h-5 rounded-full mb-1
                  ${isToday ? "bg-primary text-primary-foreground" : "text-foreground"}
                `}
              >
                {new Date(cell.date + "T12:00:00").getDate()}
              </span>
              <div className="space-y-0.5">
                {cellEvents.slice(0, 3).map((e) => (
                  <div
                    key={e.id}
                    className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium ${TYPE_STYLES[e.type]}`}
                  >
                    {e.label}
                  </div>
                ))}
                {hasMore && (
                  <div className="text-[10px] text-muted-foreground px-1">+{cellEvents.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day event list */}
      {selected && selectedEvents.length > 0 && (
        <div className="border-t border-border px-5 py-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2">
            {new Date(selected + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <div className="space-y-1.5">
            {selectedEvents.map((e) => (
              <div key={e.id} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[e.type]}`} />
                {e.href ? (
                  <Link href={e.href} className="text-sm hover:underline flex-1 truncate">{e.label}</Link>
                ) : (
                  <span className="text-sm flex-1 truncate">{e.label}</span>
                )}
                <span className={`text-xs px-1.5 py-0.5 rounded ${TYPE_STYLES[e.type]}`}>
                  {e.type.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
