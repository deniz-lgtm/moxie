"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenancePriority,
  MaintenanceCategory,
  Unit,
} from "@/lib/types";

const STATUS_OPTIONS: MaintenanceStatus[] = [
  "submitted",
  "assigned",
  "in_progress",
  "awaiting_parts",
  "completed",
  "closed",
];

const CATEGORY_OPTIONS: { value: MaintenanceCategory; label: string }[] = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "hvac", label: "HVAC" },
  { value: "appliance", label: "Appliance" },
  { value: "structural", label: "Structural" },
  { value: "pest", label: "Pest Control" },
  { value: "locksmith", label: "Locksmith" },
  { value: "general", label: "General" },
];

export default function MaintenancePage() {
  const [allRequests, setAllRequests] = useState<MaintenanceRequest[]>([]);
  const [selected, setSelected] = useState<MaintenanceRequest | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [newNote, setNewNote] = useState("");
  const [dataSource, setDataSource] = useState<"appfolio" | "error">("appfolio");
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [newRequest, setNewRequest] = useState({
    unitId: "",
    title: "",
    description: "",
    category: "general" as MaintenanceCategory,
    priority: "medium" as MaintenancePriority,
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [woRes, unitRes] = await Promise.all([
          fetch("/api/appfolio/work-orders"),
          fetch("/api/appfolio/units"),
        ]);
        const [woJson, unitJson] = await Promise.all([
          woRes.ok ? woRes.json() : { workOrders: [] },
          unitRes.ok ? unitRes.json() : { units: [] },
        ]);
        setAllRequests(woJson.workOrders || []);
        setUnits(unitJson.units || []);
        setDataSource("appfolio");
      } catch {
        setDataSource("error");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const filteredUnits = unitSearch
    ? units.filter((u) => u.unitName.toLowerCase().includes(unitSearch.toLowerCase()))
    : units;

  function createRequest() {
    if (!newRequest.title.trim() || !newRequest.unitId) return;
    const unit = units.find((u) => u.id === newRequest.unitId);
    if (!unit) return;

    const now = new Date().toISOString();
    const request: MaintenanceRequest = {
      id: `wo-${Date.now()}`,
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitNumber: unit.unitName,
      propertyName: unit.propertyName,
      tenantName: unit.tenant || "Vacant",
      category: newRequest.category,
      priority: newRequest.priority,
      status: "submitted",
      title: newRequest.title,
      description: newRequest.description,
      photos: [],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    setAllRequests((prev) => [request, ...prev]);
    setShowCreateForm(false);
    setSelected(request);
    setNewRequest({ unitId: "", title: "", description: "", category: "general", priority: "medium" });
  }

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Maintenance Requests</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage work orders across all properties
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium">
            Live from AppFolio
          </span>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showCreateForm ? "Cancel" : "+ New Request"}
          </button>
        </div>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Create Work Order</h2>
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
                value={newRequest.unitId}
                onChange={(e) => setNewRequest({ ...newRequest, unitId: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                size={5}
              >
                <option value="">Select unit...</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.unitName}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Title *</label>
              <input
                type="text"
                value={newRequest.title}
                onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                placeholder="Brief description of the issue"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <select
                value={newRequest.category}
                onChange={(e) => setNewRequest({ ...newRequest, category: e.target.value as MaintenanceCategory })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Priority</label>
              <select
                value={newRequest.priority}
                onChange={(e) => setNewRequest({ ...newRequest, priority: e.target.value as MaintenancePriority })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <textarea
              value={newRequest.description}
              onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
              placeholder="Detailed description..."
              rows={3}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
            />
          </div>
          <button
            onClick={createRequest}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Create Work Order
          </button>
        </div>
      )}

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

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Loading work orders...
        </div>
      )}

      {/* Request Cards */}
      {!loading && (
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
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No maintenance requests match the current filters.
        </div>
      )}
    </div>
  );
}
