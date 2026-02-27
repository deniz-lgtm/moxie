"use client";

import { useState } from "react";
import { unitTurns } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import type { UnitTurn, TurnTask, TurnTaskStatus } from "@/lib/types";

const TASK_CATEGORIES = [
  { value: "cleaning", label: "Cleaning" },
  { value: "paint", label: "Paint" },
  { value: "repairs", label: "Repairs" },
  { value: "flooring", label: "Flooring" },
  { value: "appliances", label: "Appliances" },
  { value: "final_walk", label: "Final Walk" },
] as const;

export default function UnitTurnsPage() {
  const [allTurns, setAllTurns] = useState<UnitTurn[]>(unitTurns);
  const [selected, setSelected] = useState<UnitTurn | null>(null);

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
    // Recalculate totalSpent
    updated.totalSpent = updated.tasks.reduce(
      (sum, t) => sum + (t.actualCost || 0),
      0
    );
    // Auto-update turn status
    const allDone = updated.tasks.every((t) => t.status === "completed");
    const anyInProgress = updated.tasks.some(
      (t) => t.status === "in_progress" || t.status === "completed"
    );
    if (allDone) updated.status = "completed";
    else if (anyInProgress) updated.status = "in_progress";

    setSelected(updated);
    setAllTurns((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function updateTaskCost(taskId: string, actualCost: number) {
    if (!selected) return;
    const updated: UnitTurn = {
      ...selected,
      tasks: selected.tasks.map((t) =>
        t.id === taskId ? { ...t, actualCost } : t
      ),
      updatedAt: new Date().toISOString(),
    };
    updated.totalSpent = updated.tasks.reduce(
      (sum, t) => sum + (t.actualCost || 0),
      0
    );
    setSelected(updated);
    setAllTurns((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  if (selected) {
    const completedTasks = selected.tasks.filter((t) => t.status === "completed").length;
    const pct = Math.round((completedTasks / selected.tasks.length) * 100);
    const budgetPct = selected.totalBudget
      ? Math.round((selected.totalSpent / selected.totalBudget) * 100)
      : 0;

    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-accent hover:underline"
        >
          &larr; Back to Unit Turns
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {selected.propertyName} #{selected.unitNumber}
            </h1>
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
            <p className="text-2xl font-bold mt-1">
              {completedTasks}/{selected.tasks.length}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Budget</p>
            <p className="text-2xl font-bold mt-1">
              ${selected.totalBudget?.toLocaleString() || "—"}
            </p>
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
                  onChange={(e) =>
                    updateTaskStatus(task.id, e.target.value as TurnTaskStatus)
                  }
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
                  {task.notes && (
                    <p className="text-xs text-muted-foreground mt-1">{task.notes}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">$</span>
                    <input
                      type="number"
                      value={task.actualCost ?? ""}
                      placeholder={task.estimatedCost?.toString() || "0"}
                      onChange={(e) =>
                        updateTaskCost(task.id, parseFloat(e.target.value) || 0)
                      }
                      className="w-20 text-sm text-right border border-border rounded-md px-2 py-1 bg-card"
                    />
                  </div>
                  {task.estimatedCost !== undefined && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Est: ${task.estimatedCost}
                    </p>
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
      <div>
        <h1 className="text-2xl font-bold">Unit Turns</h1>
        <p className="text-muted-foreground mt-1">
          Manage move-out to move-in workflows
        </p>
      </div>

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
                  <h3 className="font-semibold">
                    {turn.propertyName} #{turn.unitNumber}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Move-out: {turn.moveOutDate} &middot; Target: {turn.targetReadyDate}
                  </p>
                </div>
                <StatusBadge value={turn.status} />
              </div>

              {/* Progress bar */}
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
