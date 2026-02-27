"use client";

import { useState } from "react";
import { maintenanceRequests } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenancePriority,
} from "@/lib/types";

const STATUS_OPTIONS: MaintenanceStatus[] = [
  "submitted",
  "assigned",
  "in_progress",
  "awaiting_parts",
  "completed",
  "closed",
];

export default function MaintenancePage() {
  const [allRequests, setAllRequests] = useState<MaintenanceRequest[]>(maintenanceRequests);
  const [selected, setSelected] = useState<MaintenanceRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [newNote, setNewNote] = useState("");

  const filtered = allRequests
    .filter((r) => {
      if (filterStatus !== "all" && r.status !== filterStatus) return false;
      if (filterPriority !== "all" && r.priority !== filterPriority) return false;
      return true;
    })
    .sort((a, b) => {
      const order: Record<string, number> = { emergency: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    });

  function updateStatus(status: MaintenanceStatus) {
    if (!selected) return;
    const updated: MaintenanceRequest = {
      ...selected,
      status,
      completedDate:
        status === "completed" || status === "closed"
          ? new Date().toISOString().split("T")[0]
          : selected.completedDate,
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }

  function addNote() {
    if (!selected || !newNote.trim()) return;
    const updated: MaintenanceRequest = {
      ...selected,
      notes: [...selected.notes, newNote.trim()],
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setNewNote("");
  }

  function updateField(field: keyof MaintenanceRequest, value: string) {
    if (!selected) return;
    const updated = { ...selected, [field]: value, updatedAt: new Date().toISOString() };
    setSelected(updated as MaintenanceRequest);
    setAllRequests((prev) =>
      prev.map((r) => (r.id === updated.id ? (updated as MaintenanceRequest) : r))
    );
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-accent hover:underline"
        >
          &larr; Back to Maintenance
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selected.title}</h1>
            <p className="text-muted-foreground mt-1">
              {selected.propertyName} #{selected.unitNumber} &middot; {selected.tenantName}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge value={selected.priority} />
            <StatusBadge value={selected.status} />
          </div>
        </div>

        {/* Details */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Request Details</h2>
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm mt-1">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <p className="text-sm mt-1 capitalize">{selected.category}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-sm mt-1">
                  {new Date(selected.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tenant Phone</p>
                <p className="text-sm mt-1">{selected.tenantPhone || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tenant Email</p>
                <p className="text-sm mt-1">{selected.tenantEmail || "—"}</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Assignment & Status</h2>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Status</label>
              <select
                value={selected.status}
                onChange={(e) => updateStatus(e.target.value as MaintenanceStatus)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Assigned To</label>
              <input
                type="text"
                value={selected.assignedTo || ""}
                onChange={(e) => updateField("assignedTo", e.target.value)}
                placeholder="Staff member..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Vendor</label>
              <input
                type="text"
                value={selected.vendor || ""}
                onChange={(e) => updateField("vendor", e.target.value)}
                placeholder="Vendor name..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Scheduled Date</label>
              <input
                type="date"
                value={selected.scheduledDate || ""}
                onChange={(e) => updateField("scheduledDate", e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
          </div>
        </div>

        {/* Notes / Activity */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Notes & Activity</h2>
          {selected.notes.length > 0 ? (
            <div className="space-y-2 mb-4">
              {selected.notes.map((note, i) => (
                <div key={i} className="bg-muted rounded-lg px-4 py-2.5 text-sm">
                  {note}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-4">No notes yet.</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Add a note..."
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <button
              onClick={addNote}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Requests</h1>
        <p className="text-muted-foreground mt-1">
          Track and manage work orders across all properties
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Priorities</option>
          <option value="emergency">Emergency</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Request Cards */}
      <div className="space-y-3">
        {filtered.map((req) => (
          <button
            key={req.id}
            onClick={() => setSelected(req)}
            className="w-full text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold truncate">{req.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {req.propertyName} #{req.unitNumber} &middot; {req.tenantName}
                </p>
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {req.description}
                </p>
              </div>
              <div className="flex items-center gap-2 ml-4 shrink-0">
                <StatusBadge value={req.priority} />
                <StatusBadge value={req.status} />
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span className="capitalize">{req.category}</span>
              <div className="flex items-center gap-3">
                {req.assignedTo && <span>Assigned: {req.assignedTo}</span>}
                {req.scheduledDate && <span>Scheduled: {req.scheduledDate}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No maintenance requests match the current filters.
        </div>
      )}
    </div>
  );
}
