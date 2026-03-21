"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import type { UnitTurn, TurnTask, TurnTaskStatus, Unit } from "@/lib/types";

const TASK_CATEGORIES = [
  { value: "cleaning", label: "Cleaning" },
  { value: "paint", label: "Paint" },
  { value: "repairs", label: "Repairs" },
  { value: "flooring", label: "Flooring" },
  { value: "appliances", label: "Appliances" },
  { value: "final_walk", label: "Final Walk" },
] as const;

const DEFAULT_TASKS: { name: string; category: string }[] = [
  { name: "Deep clean entire unit", category: "cleaning" },
  { name: "Paint walls & trim", category: "paint" },
  { name: "Patch holes & drywall repair", category: "repairs" },
  { name: "Check/replace flooring", category: "flooring" },
  { name: "Test all appliances", category: "appliances" },
  { name: "Replace HVAC filters", category: "repairs" },
  { name: "Check plumbing fixtures", category: "repairs" },
  { name: "Final walkthrough", category: "final_walk" },
];

export default function UnitTurnsPage() {
  const [allTurns, setAllTurns] = useState<UnitTurn[]>(() => loadFromStorage<UnitTurn[]>("unit_turns", []));
  const [selected, setSelected] = useState<UnitTurn | null>(null);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [newTurn, setNewTurn] = useState({
    unitId: "",
    moveOutDate: "",
    targetReadyDate: "",
    totalBudget: 0,
  });

  useEffect(() => {
    fetch("/api/appfolio/units")
      .then((r) => r.json())
      .then((data) => setUnits(data.units || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    saveToStorage("unit_turns", allTurns);
  }, [allTurns]);

  const filteredUnits = unitSearch
    ? units.filter((u) => u.unitName.toLowerCase().includes(unitSearch.toLowerCase()))
    : units;

  function createTurn() {
    if (!newTurn.unitId || !newTurn.moveOutDate || !newTurn.targetReadyDate) return;
    const unit = units.find((u) => u.id === newTurn.unitId);
    if (!unit) return;

    const now = new Date().toISOString();
    const tasks: TurnTask[] = DEFAULT_TASKS.map((t, i) => ({
      id: `task-${Date.now()}-${i}`,
      name: t.name,
      category: t.category as TurnTask["category"],
      status: "not_started" as TurnTaskStatus,
      dueDate: newTurn.targetReadyDate,
      notes: "",
    }));

    const turn: UnitTurn = {
      id: `turn-${Date.now()}`,
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitNumber: unit.unitName,
      propertyName: unit.propertyName,
      moveOutDate: newTurn.moveOutDate,
      targetReadyDate: newTurn.targetReadyDate,
      status: "pending",
      outgoingTenant: unit.tenant || undefined,
      tasks,
      totalBudget: newTurn.totalBudget || undefined,
      totalSpent: 0,
      createdAt: now,
      updatedAt: now,
    };
    setAllTurns((prev) => [turn, ...prev]);
    setShowCreateForm(false);
    setSelected(turn);
    setNewTurn({ unitId: "", moveOutDate: "", targetReadyDate: "", totalBudget: 0 });
  }

  function updateTaskStatus(taskId: string, status: TurnTaskStatus) {
    if (!selected) return;
    const updated: UnitTurn = {
      ...selected,
      tasks: selected.tasks.map((t) =>
        t.id === taskId
          ? {
              ...t,
              status,
              completedDate: status === "completed" ? new Date().toISOString().split("T")[0] : t.completedDate,
            }
          : t
      ),
      updatedAt: new Date().toISOString(),
    };
    updated.totalSpent = updated.tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
    const allDone = updated.tasks.every((t) => t.status === "completed");
    const anyInProgress = updated.tasks.some((t) => t.status === "in_progress" || t.status === "completed");
    if (allDone) updated.status = "completed";
    else if (anyInProgress) updated.status = "in_progress";

    setSelected(updated);
    setAllTurns((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function updateTaskCost(taskId: string, actualCost: number) {
    if (!selected) return;
    const updated: UnitTurn = {
      ...selected,
      tasks: selected.tasks.map((t) => (t.id === taskId ? { ...t, actualCost } : t)),
      updatedAt: new Date().toISOString(),
    };
    updated.totalSpent = updated.tasks.reduce((sum, t) => sum + (t.actualCost || 0), 0);
    setSelected(updated);
    setAllTurns((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  if (selected) {
    const completedTasks = selected.tasks.filter((t) => t.status === "completed").length;
    const pct = Math.round((completedTasks / selected.tasks.length) * 100);
    const budgetPct = selected.totalBudget ? Math.round((selected.totalSpent / selected.totalBudget) * 100) : 0;

    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Unit Turns
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selected.unitNumber}</h1>
            <p className="text-muted-foreground mt-1">
              Unit Turn &middot; Move-out: {selected.moveOutDate} &middot; Target: {selected.targetReadyDate}
            </p>
          </div>
          <StatusBadge value={selected.status} />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Progress</p>
            <p className="text-2xl font-bold mt-1">{pct}%</p>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Tasks</p>
            <p className="text-2xl font-bold mt-1">{completedTasks}/{selected.tasks.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Budget</p>
            <p className="text-2xl font-bold mt-1">${selected.totalBudget?.toLocaleString() || "—"}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Spent</p>
            <p className={`text-2xl font-bold mt-1 ${budgetPct > 90 ? "text-danger" : ""}`}>
              ${selected.totalSpent.toLocaleString()}
            </p>
            {selected.totalBudget && (
              <p className="text-xs text-muted-foreground mt-1">{budgetPct}% of budget</p>
            )}
          </div>
        </div>

        {/* Tenant Info */}
        <div className="bg-card rounded-xl border border-border p-5 grid md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Outgoing Tenant</p>
            <p className="font-medium mt-0.5">{selected.outgoingTenant || "—"}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Incoming Tenant</p>
            <p className="font-medium mt-0.5">{selected.incomingTenant || "TBD"}</p>
          </div>
        </div>

        {/* Tasks */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Turn Tasks</h2>
          </div>
          <div className="divide-y divide-border">
            {selected.tasks.map((task) => (
              <div key={task.id} className="p-4 flex items-center gap-4">
                <select
                  value={task.status}
                  onChange={(e) => updateTaskStatus(task.id, e.target.value as TurnTaskStatus)}
                  className="text-xs border border-border rounded-md px-2 py-1.5 bg-card min-w-[120px]"
                >
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${task.status === "completed" ? "line-through text-muted-foreground" : ""}`}>
                    {task.name}
                  </p>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span className="capitalize">{task.category.replace("_", " ")}</span>
                    {task.vendor && <span>&middot; {task.vendor}</span>}
                    {task.dueDate && <span>&middot; Due: {task.dueDate}</span>}
                  </div>
                  {task.notes && <p className="text-xs text-muted-foreground mt-1">{task.notes}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={task.actualCost ?? ""}
                      placeholder={task.estimatedCost?.toString() || "0"}
                      onChange={(e) => updateTaskCost(task.id, parseFloat(e.target.value) || 0)}
                      className="w-20 text-sm text-right border border-border rounded-md px-2 py-1 bg-card"
                    />
                  </div>
                  {task.estimatedCost !== undefined && (
                    <p className="text-xs text-muted-foreground mt-1">Est: ${task.estimatedCost}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Unit Turns</h1>
          <p className="text-muted-foreground mt-1">Manage move-out to move-in workflows</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ New Turn"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Start Unit Turn</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Unit *</label>
              <input
                type="text"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                placeholder="Search units..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card mb-1"
              />
              <select
                value={newTurn.unitId}
                onChange={(e) => setNewTurn({ ...newTurn, unitId: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                size={5}
              >
                <option value="">Select unit...</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.unitName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Move-Out Date *</label>
              <input
                type="date"
                value={newTurn.moveOutDate}
                onChange={(e) => setNewTurn({ ...newTurn, moveOutDate: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Target Ready Date *</label>
              <input
                type="date"
                value={newTurn.targetReadyDate}
                onChange={(e) => setNewTurn({ ...newTurn, targetReadyDate: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Budget ($)</label>
              <input
                type="number"
                value={newTurn.totalBudget || ""}
                placeholder="0"
                onChange={(e) => setNewTurn({ ...newTurn, totalBudget: parseFloat(e.target.value) || 0 })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            8 default tasks will be created (clean, paint, repairs, flooring, appliances, HVAC, plumbing, walkthrough).
          </p>
          <button
            onClick={createTurn}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Create Unit Turn
          </button>
        </div>
      )}

      {allTurns.length === 0 && !showCreateForm && (
        <div className="text-center py-12 text-muted-foreground">
          No unit turns yet. Click &quot;+ New Turn&quot; to start a move-out workflow.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {allTurns.map((turn) => {
          const completed = turn.tasks.filter((t) => t.status === "completed").length;
          const pct = Math.round((completed / turn.tasks.length) * 100);
          return (
            <button
              key={turn.id}
              onClick={() => setSelected(turn)}
              className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{turn.unitNumber}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Move-out: {turn.moveOutDate} &middot; Target: {turn.targetReadyDate}
                  </p>
                </div>
                <StatusBadge value={turn.status} />
              </div>

              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                  <span>{completed}/{turn.tasks.length} tasks</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {turn.outgoingTenant && `Out: ${turn.outgoingTenant}`}
                  {turn.incomingTenant && ` → In: ${turn.incomingTenant}`}
                </span>
                <span>
                  ${turn.totalSpent.toLocaleString()}
                  {turn.totalBudget && ` / $${turn.totalBudget.toLocaleString()}`}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
