"use client";

// Compact 7-day agenda list. Drops into the meeting detail view so the team
// can see at a glance what's coming this week across showings, moves, work
// orders, and academic dates — without duplicating per-meeting busywork.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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

interface WeekAgendaProps {
  /** YYYY-MM-DD — first day shown. Defaults to today. */
  startDate?: string;
  /** How many days to show. Default 7. */
  days?: number;
  /** Event types to hide by default (user can still toggle them on). */
  defaultHidden?: CalEventType[];
  /** Compact mode removes the header and filter chips for embed-in-agenda use. */
  compact?: boolean;
  /** Hide the week-navigation arrows (meeting agenda anchors to the meeting date). */
  fixed?: boolean;
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function weekdayLabel(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function WeekAgenda({
  startDate,
  days = 7,
  defaultHidden = [],
  compact = false,
  fixed = false,
}: WeekAgendaProps) {
  const [start, setStart] = useState<string>(() => startDate ?? isoDate(new Date()));
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState<Set<CalEventType>>(() => new Set(defaultHidden));

  // If the parent passes a new startDate (e.g. when opening a different meeting), follow it.
  useEffect(() => {
    if (startDate) setStart(startDate);
  }, [startDate]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const endIso = addDays(start, days - 1);
      // Pull a generous window so toggling weeks doesn't re-fetch constantly.
      const res = await loadCalendarEvents({
        fromIso: addDays(start, -14),
        toIso: addDays(endIso, 14),
      });
      setEvents(markUrgency(res));
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [start, days]);

  useEffect(() => { load(); }, [load]);

  const visibleEvents = useMemo(
    () => events.filter((e) => !hidden.has(e.type)),
    [events, hidden]
  );

  const byDate = useMemo(() => groupEventsByDate(visibleEvents), [visibleEvents]);

  const toggleFilter = (t: CalEventType) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  };

  const dayList = useMemo(
    () => Array.from({ length: days }, (_, i) => addDays(start, i)),
    [start, days]
  );

  const todayIso = isoDate(new Date());
  const rangeLabel = `${new Date(start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(addDays(start, days - 1) + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  const totalVisible = visibleEvents.filter((e) => {
    return e.date >= start && e.date <= addDays(start, days - 1);
  }).length;

  return (
    <div className={compact ? "" : "bg-card border border-border rounded-xl overflow-hidden"}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-sm">This Week</h3>
            <span className="text-xs text-muted-foreground">{rangeLabel}</span>
            {loading && (
              <div className="w-3 h-3 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            )}
          </div>
          {!fixed && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setStart(addDays(start, -days))}
                className="p-1 rounded hover:bg-muted"
                title="Previous week"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setStart(isoDate(new Date()))}
                className="text-xs px-2 py-0.5 rounded border border-border hover:bg-muted"
              >
                Today
              </button>
              <button
                onClick={() => setStart(addDays(start, days))}
                className="p-1 rounded hover:bg-muted"
                title="Next week"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter chips */}
      {!compact && (
        <div className="px-4 py-2 border-b border-border flex flex-wrap gap-1.5">
          {ALL_EVENT_TYPES.map((t) => {
            const isHidden = hidden.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleFilter(t)}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition ${
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
      )}

      {/* Day list */}
      <div className="divide-y divide-border">
        {dayList.map((iso) => {
          const dayEvents = byDate.get(iso) ?? [];
          const isToday = iso === todayIso;

          return (
            <div key={iso} className={`px-4 py-2.5 flex gap-3 ${isToday ? "bg-primary/5" : ""}`}>
              <div className="w-28 shrink-0">
                <p className={`text-xs font-semibold ${isToday ? "text-primary" : "text-muted-foreground"} uppercase tracking-wide`}>
                  {weekdayLabel(iso)}
                </p>
                {isToday && <p className="text-[10px] text-primary font-medium">Today</p>}
              </div>
              <div className="flex-1 min-w-0">
                {dayEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">—</p>
                ) : (
                  <div className="space-y-1">
                    {dayEvents.map((e) => (
                      <div
                        key={e.id}
                        className={`flex items-center gap-2 ${e.urgent ? "px-1.5 py-0.5 -mx-1.5 rounded bg-red-50 border-l-2 border-red-500" : ""}`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TYPE_DOT[e.type]}`} />
                        {e.urgent && (
                          <span className="text-[10px] font-bold text-red-600 uppercase tracking-wide shrink-0">!</span>
                        )}
                        {e.href ? (
                          <Link
                            href={e.href}
                            className={`text-sm hover:underline truncate flex-1 ${e.urgent ? "text-red-900 font-medium" : ""}`}
                            title={e.label}
                          >
                            {e.label}
                          </Link>
                        ) : (
                          <span
                            className={`text-sm truncate flex-1 ${e.urgent ? "text-red-900 font-medium" : ""}`}
                            title={e.label}
                          >
                            {e.label}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty state */}
      {!loading && totalVisible === 0 && (
        <div className="px-4 py-3 text-center text-xs text-muted-foreground border-t border-border">
          Nothing scheduled for this week.
        </div>
      )}
    </div>
  );
}
