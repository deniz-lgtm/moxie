"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/contexts/PortfolioContext";
import type { Unit } from "@/lib/types";

type MoveEvent = {
  id: string;
  unitId: string;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  type: "move_in" | "move_out";
  date: string;
  status: "upcoming" | "in_progress" | "completed";
  checklist: ChecklistItem[];
};

type ChecklistItem = {
  id: string;
  label: string;
  completed: boolean;
  notes: string;
};

const MOVE_IN_CHECKLIST = [
  "Key handoff",
  "Utility transfer confirmed",
  "Welcome packet delivered",
  "Condition photos taken",
  "Parking pass issued",
  "Mailbox key issued",
  "Move-in inspection signed",
  "Emergency contacts collected",
  "Renter's insurance verified",
];

const MOVE_OUT_CHECKLIST = [
  "30-day notice received",
  "Move-out inspection scheduled",
  "Key return confirmed",
  "Forwarding address collected",
  "Final utility read scheduled",
  "Security deposit walkthrough",
  "Move-out inspection completed",
  "Deposit disposition mailed",
];

export default function MoveInOutPage() {
  const { portfolioId } = usePortfolio();
  const [units, setUnits] = useState<Unit[]>([]);
  const [events, setEvents] = useState<MoveEvent[]>([]);
  const [selected, setSelected] = useState<MoveEvent | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/appfolio/units?portfolio_id=${portfolioId}`)
      .then((res) => res.json())
      .then((data) => {
        const unitList: Unit[] = data.units || [];
        setUnits(unitList);

        // Build move events from units with upcoming lease changes
        const moveEvents: MoveEvent[] = [];
        for (const u of unitList) {
          if (u.status === "notice" && u.leaseTo) {
            moveEvents.push({
              id: `out-${u.id}`,
              unitId: u.id,
              propertyName: u.propertyName,
              unitNumber: u.number,
              tenantName: u.tenant || "Unknown",
              type: "move_out",
              date: u.leaseTo,
              status: "upcoming",
              checklist: MOVE_OUT_CHECKLIST.map((label, i) => ({
                id: `mo-${u.id}-${i}`,
                label,
                completed: false,
                notes: "",
              })),
            });
          }
          if (u.status === "vacant") {
            moveEvents.push({
              id: `in-${u.id}`,
              unitId: u.id,
              propertyName: u.propertyName,
              unitNumber: u.number,
              tenantName: "TBD",
              type: "move_in",
              date: "",
              status: "upcoming",
              checklist: MOVE_IN_CHECKLIST.map((label, i) => ({
                id: `mi-${u.id}-${i}`,
                label,
                completed: false,
                notes: "",
              })),
            });
          }
        }
        setEvents(moveEvents);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portfolioId]);

  const filtered = events.filter((e) => {
    if (filterType !== "all" && e.type !== filterType) return false;
    return true;
  });

  function toggleChecklistItem(itemId: string) {
    if (!selected) return;
    const updated = {
      ...selected,
      checklist: selected.checklist.map((c) =>
        c.id === itemId ? { ...c, completed: !c.completed } : c
      ),
    };
    const allDone = updated.checklist.every((c) => c.completed);
    if (allDone) updated.status = "completed";
    else if (updated.checklist.some((c) => c.completed)) updated.status = "in_progress";
    setSelected(updated);
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Move In / Move Out</h1>
          <p className="text-muted-foreground mt-1">Loading from AppFolio...</p>
        </div>
      </div>
    );
  }

  if (selected) {
    const completedItems = selected.checklist.filter((c) => c.completed).length;
    const pct = Math.round((completedItems / selected.checklist.length) * 100);

    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Move Events
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {selected.propertyName} #{selected.unitNumber}
            </h1>
            <p className="text-muted-foreground mt-1 capitalize">
              {selected.type.replace("_", " ")} &middot; {selected.tenantName}
              {selected.date && ` · ${selected.date}`}
            </p>
          </div>
          <StatusBadge value={selected.status} />
        </div>

        {/* Progress */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Checklist Progress</p>
            <span className="text-sm text-muted-foreground">{completedItems}/{selected.checklist.length}</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Checklist */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold capitalize">
              {selected.type.replace("_", " ")} Checklist
            </h2>
          </div>
          <div className="divide-y divide-border">
            {selected.checklist.map((item) => (
              <div key={item.id} className="p-4 flex items-center gap-3">
                <button
                  onClick={() => toggleChecklistItem(item.id)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    item.completed
                      ? "bg-green-500 border-green-500 text-white"
                      : "border-border hover:border-accent"
                  }`}
                >
                  {item.completed && <span className="text-xs">✓</span>}
                </button>
                <span className={`text-sm ${item.completed ? "line-through text-muted-foreground" : ""}`}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Move In / Move Out</h1>
        <p className="text-muted-foreground mt-1">
          Checklists for move day — key handoff, utilities, condition photos
        </p>
      </div>

      <div className="flex gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Events</option>
          <option value="move_in">Move Ins</option>
          <option value="move_out">Move Outs</option>
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((event) => {
            const done = event.checklist.filter((c) => c.completed).length;
            const pct = Math.round((done / event.checklist.length) * 100);
            return (
              <button
                key={event.id}
                onClick={() => setSelected(event)}
                className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold">
                      {event.propertyName} #{event.unitNumber}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 capitalize">
                      {event.type.replace("_", " ")} · {event.tenantName}
                    </p>
                  </div>
                  <StatusBadge value={event.type === "move_in" ? "move_in" : "move_out"} />
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>{done}/{event.checklist.length} tasks</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {event.date && (
                  <p className="text-xs text-muted-foreground mt-3">{event.date}</p>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No upcoming move events found.
        </div>
      )}
    </div>
  );
}
