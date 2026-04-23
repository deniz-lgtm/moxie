"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  ALL_EVENT_TYPES,
  TYPE_DOT,
  TYPE_LABEL,
  TYPE_STYLES,
  groupEventsByDate,
  isoDate,
  loadCalendarEvents,
  markUrgency,
  type CalEvent,
  type CalEventType,
} from "@/lib/calendar-events";

// ─── helpers ────────────────────────────────────────────────────────────────

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Start of the week containing `d` (Sunday, midnight local). */
function weekStart(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay()); // 0 = Sun
  return r;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function weekRangeLabel(d: Date): string {
  const start = weekStart(d);
  const end = addDays(start, 6);
  const sameMonth = start.getMonth() === end.getMonth();
  const startPart = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endPart = sameMonth
    ? end.toLocaleDateString("en-US", { day: "numeric", year: "numeric" })
    : end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startPart} – ${endPart}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay(); // 0 = Sun
}

// ─── main component ──────────────────────────────────────────────────────────

type ViewMode = "month" | "week";

interface TeamCalendarProps {
  /** YYYY-MM-DD — the date the calendar opens on. Defaults to today. */
  anchorDate?: string;
  /** Initial view mode. Defaults to "month". */
  defaultView?: ViewMode;
}

export function TeamCalendar({ anchorDate, defaultView = "month" }: TeamCalendarProps = {}) {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultView);
  const [current, setCurrent] = useState(() => {
    const seed = anchorDate ? new Date(anchorDate + "T12:00:00") : new Date();
    if (defaultView === "week") return weekStart(seed);
    seed.setDate(1);
    return seed;
  });
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // YYYY-MM-DD
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<CalEventType>>(new Set());

  const visibleEvents = useMemo(
    () => events.filter((e) => !hidden.has(e.type)),
    [events, hidden]
  );

  const toggleFilter = (t: CalEventType) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const collected = await loadCalendarEvents();
      setEvents(markUrgency(collected));
    } catch {
      // leave events empty
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const todayStr = isoDate(new Date());

  // Build cell grid — 7 for week, 42 for month.
  const cells: { date: string; isCurrentMonth: boolean }[] = useMemo(() => {
    if (viewMode === "week") {
      const start = weekStart(current);
      return Array.from({ length: 7 }, (_, i) => ({
        date: isoDate(addDays(start, i)),
        isCurrentMonth: true, // all cells fully opaque in week view
      }));
    }
    const year = current.getFullYear();
    const month = current.getMonth();
    const totalDays = daysInMonth(year, month);
    const startDow = firstDayOfWeek(year, month);
    const result: { date: string; isCurrentMonth: boolean }[] = [];
    const prevDays = daysInMonth(year, month === 0 ? 11 : month - 1);
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, prevDays - i);
      result.push({ date: isoDate(d), isCurrentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      result.push({ date: isoDate(new Date(year, month, i)), isCurrentMonth: true });
    }
    while (result.length < 42) {
      const d = new Date(year, month + 1, result.length - startDow - totalDays + 1);
      result.push({ date: isoDate(d), isCurrentMonth: false });
    }
    return result;
  }, [viewMode, current]);

  const byDate = groupEventsByDate(visibleEvents);

  const selectedEvents = selected ? (byDate.get(selected) ?? []) : [];

  // Week view shows more events per day since each cell is taller.
  const eventsPerCell = viewMode === "week" ? 8 : 3;
  const cellMinHeight = viewMode === "week" ? "min-h-[220px]" : "min-h-[72px]";

  const navPrev = () => {
    setCurrent((c) => (viewMode === "week" ? addDays(weekStart(c), -7) : addMonths(c, -1)));
    setSelected(null);
  };
  const navNext = () => {
    setCurrent((c) => (viewMode === "week" ? addDays(weekStart(c), 7) : addMonths(c, 1)));
    setSelected(null);
  };
  const goToday = () => {
    const d = new Date();
    setCurrent(viewMode === "week" ? weekStart(d) : new Date(d.getFullYear(), d.getMonth(), 1));
    setSelected(null);
  };

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Calendar header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-semibold">
            {viewMode === "week" ? weekRangeLabel(current) : monthLabel(current)}
          </h2>
          {loading && <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />}
        </div>
        <div className="flex items-center gap-2">
          {/* Month / Week toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-xs font-medium">
            {(["month", "week"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setViewMode(v);
                  setSelected(null);
                }}
                className={`px-3 py-1 capitalize ${
                  viewMode === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={navPrev} className="p-1.5 rounded hover:bg-muted">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToday}
              className="text-xs px-2.5 py-1 rounded border border-border hover:bg-muted font-medium"
            >
              Today
            </button>
            <button onClick={navNext} className="p-1.5 rounded hover:bg-muted">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter chips — click to toggle visibility of an event type */}
      <div className="px-5 py-3 border-b border-border flex flex-wrap gap-1.5">
        {ALL_EVENT_TYPES.map((t) => {
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
          const hasMore = cellEvents.length > eventsPerCell;

          return (
            <button
              key={i}
              onClick={() => setSelected(cell.date === selected ? null : cell.date)}
              className={`
                ${cellMinHeight} p-1.5 text-left border-b border-r border-border last:border-r-0
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
                {cellEvents.slice(0, eventsPerCell).map((e) => (
                  <div
                    key={e.id}
                    className={`text-[10px] leading-tight px-1 py-0.5 rounded truncate font-medium ${
                      e.urgent
                        ? "bg-red-100 text-red-900 ring-1 ring-red-400"
                        : TYPE_STYLES[e.type]
                    }`}
                    title={e.urgent ? `Urgent — ${e.label}` : e.label}
                  >
                    {e.urgent && "! "}{e.label}
                  </div>
                ))}
                {hasMore && (
                  <div className="text-[10px] text-muted-foreground px-1">+{cellEvents.length - eventsPerCell} more</div>
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
              <div
                key={e.id}
                className={`flex items-center gap-2 ${e.urgent ? "px-2 py-1 -mx-2 rounded bg-red-50 border-l-2 border-red-500" : ""}`}
              >
                <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_DOT[e.type]}`} />
                {e.urgent && (
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide shrink-0">!</span>
                )}
                {e.href ? (
                  <Link
                    href={e.href}
                    className={`text-sm hover:underline flex-1 truncate ${e.urgent ? "text-red-900 font-medium" : ""}`}
                  >
                    {e.label}
                  </Link>
                ) : (
                  <span className={`text-sm flex-1 truncate ${e.urgent ? "text-red-900 font-medium" : ""}`}>
                    {e.label}
                  </span>
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
