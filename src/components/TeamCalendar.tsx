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

  const byDate = groupEventsByDate(visibleEvents);

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
