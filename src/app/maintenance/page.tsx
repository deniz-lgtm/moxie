"use client";

import { useState, useEffect, useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenancePriority,
  MaintenanceCategory,
  Unit,
} from "@/lib/types";

const OPEN_STATUSES = new Set<MaintenanceStatus>([
  "submitted",
  "assigned",
  "in_progress",
  "awaiting_parts",
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelative(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

type Metrics = {
  openCount: number;
  openEmergencies: number;
  avgResolutionDays: number | null;
  resolvedSample: number;
  aging: { bucket: string; count: number; color: string }[];
  oldest31Plus: number;
  recurring: { key: string; category: string; propertyName: string; unitNumber: string; count: number }[];
  problemTenants: {
    name: string;
    property: string;
    unit: string;
    total90d: number;
    emergencies30d: number;
  }[];
};

function computeMetrics(requests: MaintenanceRequest[]): Metrics {
  const now = Date.now();
  const d30 = now - 30 * DAY_MS;
  const d90 = now - 90 * DAY_MS;

  const open = requests.filter((r) => OPEN_STATUSES.has(r.status));
  const closed = requests.filter(
    (r) => (r.status === "completed" || r.status === "closed") && r.completedDate && r.createdAt
  );

  // Avg resolution time over last 90 days of completions
  const resolvedRecently = closed.filter((r) => {
    const done = Date.parse(r.completedDate!);
    return !Number.isNaN(done) && done >= d90;
  });
  const avgResolutionDays = resolvedRecently.length
    ? resolvedRecently.reduce((sum, r) => {
        const days = (Date.parse(r.completedDate!) - Date.parse(r.createdAt)) / DAY_MS;
        return sum + Math.max(0, days);
      }, 0) / resolvedRecently.length
    : null;

  // Aging buckets (open only)
  let b07 = 0, b830 = 0, b31 = 0;
  for (const r of open) {
    const created = Date.parse(r.createdAt);
    if (Number.isNaN(created)) continue;
    const days = (now - created) / DAY_MS;
    if (days <= 7) b07++;
    else if (days <= 30) b830++;
    else b31++;
  }

  // Recurring: same unit + category, >=2 in last 30 days
  const recentByKey = new Map<string, MaintenanceRequest[]>();
  for (const r of requests) {
    const created = Date.parse(r.createdAt);
    if (Number.isNaN(created) || created < d30) continue;
    const unitKey = r.unitId || r.unitNumber || "";
    if (!unitKey) continue;
    const key = `${unitKey}|${r.category}`;
    const arr = recentByKey.get(key) ?? [];
    arr.push(r);
    recentByKey.set(key, arr);
  }
  const recurring = Array.from(recentByKey.entries())
    .filter(([, arr]) => arr.length >= 2)
    .map(([key, arr]) => ({
      key,
      category: arr[0].category,
      propertyName: arr[0].propertyName,
      unitNumber: arr[0].unitNumber,
      count: arr.length,
    }))
    .sort((a, b) => b.count - a.count);

  // Problem tenants: >=3 work orders in 90d OR >=2 emergencies in 30d
  const byTenant = new Map<string, MaintenanceRequest[]>();
  for (const r of requests) {
    const name = r.tenantName?.trim();
    if (!name || name === "—" || name.toLowerCase() === "vacant") continue;
    const created = Date.parse(r.createdAt);
    if (Number.isNaN(created) || created < d90) continue;
    const key = `${name}|${r.unitId || r.unitNumber}`;
    const arr = byTenant.get(key) ?? [];
    arr.push(r);
    byTenant.set(key, arr);
  }
  const problemTenants = Array.from(byTenant.values())
    .map((reqs) => {
      const emergencies30d = reqs.filter(
        (r) => r.priority === "emergency" && Date.parse(r.createdAt) >= d30
      ).length;
      return {
        name: reqs[0].tenantName,
        property: reqs[0].propertyName,
        unit: reqs[0].unitNumber,
        total90d: reqs.length,
        emergencies30d,
      };
    })
    .filter((t) => t.total90d >= 3 || t.emergencies30d >= 2)
    .sort((a, b) => b.total90d - a.total90d || b.emergencies30d - a.emergencies30d);

  return {
    openCount: open.length,
    openEmergencies: open.filter((r) => r.priority === "emergency").length,
    avgResolutionDays,
    resolvedSample: resolvedRecently.length,
    aging: [
      { bucket: "0–7 days", count: b07, color: "bg-green-500" },
      { bucket: "8–30 days", count: b830, color: "bg-yellow-500" },
      { bucket: "31+ days", count: b31, color: "bg-red-500" },
    ],
    oldest31Plus: b31,
    recurring,
    problemTenants,
  };
}

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
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [newRequest, setNewRequest] = useState({
    unitId: "",
    title: "",
    description: "",
    category: "general" as MaintenanceCategory,
    priority: "medium" as MaintenancePriority,
  });

  async function loadRequests() {
    const res = await fetch("/api/maintenance/requests");
    if (!res.ok) return { workOrders: [] as MaintenanceRequest[], syncedAt: null };
    const json = await res.json();
    return {
      workOrders: (json.workOrders || []) as MaintenanceRequest[],
      syncedAt: (json.syncedAt || null) as string | null,
    };
  }

  async function syncFromAppFolio() {
    setSyncing(true);
    setSyncError(null);
    try {
      const res = await fetch("/api/maintenance/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const { workOrders, syncedAt: ts } = await loadRequests();
      setAllRequests(workOrders);
      setSyncedAt(ts ?? json.syncedAt ?? null);
    } catch (e: any) {
      setSyncError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        const [wo, unitRes] = await Promise.all([
          loadRequests(),
          fetch("/api/appfolio/units"),
        ]);
        const unitJson = unitRes.ok ? await unitRes.json() : { units: [] };
        setAllRequests(wo.workOrders);
        setSyncedAt(wo.syncedAt);
        setUnits(unitJson.units || []);
        // First-time UX: no snapshot yet → pull once automatically
        if (wo.workOrders.length === 0 && !wo.syncedAt) {
          setLoading(false);
          await syncFromAppFolio();
          return;
        }
        // Stale UX: older than 6h → background sync (doesn't block render)
        const STALE_MS = 6 * 60 * 60 * 1000;
        const age = wo.syncedAt ? Date.now() - Date.parse(wo.syncedAt) : Infinity;
        if (age > STALE_MS) {
          setLoading(false);
          void syncFromAppFolio();
          return;
        }
      } catch {
        setSyncError("Couldn't load work orders");
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

  const metrics = useMemo(() => computeMetrics(allRequests), [allRequests]);
  const maxAging = Math.max(1, ...metrics.aging.map((a) => a.count));

  async function saveAnnotation(body: Record<string, unknown>) {
    if (!selected) return;
    try {
      const res = await fetch("/api/maintenance/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, ...body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
    } catch (e: any) {
      setSyncError(e.message || "Save failed");
    }
  }

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
    void saveAnnotation({ internal_status: status });
  }

  function addNote() {
    if (!selected || !newNote.trim()) return;
    const text = newNote.trim();
    const updated: MaintenanceRequest = {
      ...selected,
      notes: [...selected.notes, text],
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setNewNote("");
    void saveAnnotation({ appendNote: { text } });
  }

  function updateField(field: keyof MaintenanceRequest, value: string) {
    if (!selected) return;
    const updated = { ...selected, [field]: value, updatedAt: new Date().toISOString() };
    setSelected(updated as MaintenanceRequest);
    setAllRequests((prev) =>
      prev.map((r) => (r.id === updated.id ? (updated as MaintenanceRequest) : r))
    );
  }

  // Persist text-field edits on blur so we don't hit the API on every keystroke.
  function persistField(field: "assignedTo" | "vendor" | "scheduledDate", value: string) {
    const key = {
      assignedTo: "assigned_to_override",
      vendor: "vendor_override",
      scheduledDate: "scheduled_date_override",
    }[field];
    void saveAnnotation({ [key]: value || null });
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

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words">{selected.title}</h1>
            <p className="text-muted-foreground mt-1 break-words">
              {selected.propertyName} #{selected.unitNumber} &middot; {selected.tenantName}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
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
                onBlur={(e) => persistField("assignedTo", e.target.value)}
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
                onBlur={(e) => persistField("vendor", e.target.value)}
                placeholder="Vendor name..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Scheduled Date</label>
              <input
                type="date"
                value={selected.scheduledDate || ""}
                onChange={(e) => {
                  updateField("scheduledDate", e.target.value);
                  persistField("scheduledDate", e.target.value);
                }}
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Maintenance Requests</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage work orders across all properties
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {syncedAt
              ? `Last synced ${formatRelative(syncedAt)}`
              : "Never synced"}
          </span>
          <button
            onClick={syncFromAppFolio}
            disabled={syncing}
            className="px-3 py-2 bg-card border border-border text-sm rounded-lg hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors whitespace-nowrap"
          >
            {showCreateForm ? "Cancel" : "+ New Request"}
          </button>
        </div>
      </div>

      {syncError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {syncError}
        </div>
      )}

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

      {/* Dashboard */}
      {!loading && allRequests.length > 0 && (
        <section className="space-y-3">
          {/* Top-line stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Open work orders</p>
              <p className="text-2xl font-bold mt-1">{metrics.openCount}</p>
              {metrics.openEmergencies > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  {metrics.openEmergencies} emergency
                </p>
              )}
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Avg resolution</p>
              <p className="text-2xl font-bold mt-1">
                {metrics.avgResolutionDays != null
                  ? `${metrics.avgResolutionDays.toFixed(1)}d`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.resolvedSample} resolved (90d)
              </p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Aging 31+ days</p>
              <p className={`text-2xl font-bold mt-1 ${metrics.oldest31Plus > 0 ? "text-red-600" : ""}`}>
                {metrics.oldest31Plus}
              </p>
              <p className="text-xs text-muted-foreground mt-1">still open</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Recurring issues</p>
              <p className="text-2xl font-bold mt-1">{metrics.recurring.length}</p>
              <p className="text-xs text-muted-foreground mt-1">unit+category, 30d</p>
            </div>
          </div>

          {/* Aging breakdown */}
          <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
            <h3 className="font-semibold text-sm mb-3">Open work order aging</h3>
            <div className="space-y-2">
              {metrics.aging.map((bucket) => (
                <div key={bucket.bucket} className="flex items-center gap-3 text-sm">
                  <span className="w-20 shrink-0 text-muted-foreground">{bucket.bucket}</span>
                  <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${bucket.color} transition-all`}
                      style={{ width: `${(bucket.count / maxAging) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 text-right font-medium">{bucket.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Problem tenants + Recurring issues */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-sm">Problem tenants</h3>
                <span className="text-xs text-muted-foreground">≥3 in 90d · ≥2 emergency in 30d</span>
              </div>
              {metrics.problemTenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">None flagged.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.problemTenants.slice(0, 5).map((t) => (
                    <li key={`${t.name}-${t.unit}`} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{t.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {t.property} #{t.unit}
                        </p>
                      </div>
                      <div className="text-right text-xs shrink-0">
                        <p className="font-medium">{t.total90d} in 90d</p>
                        {t.emergencies30d > 0 && (
                          <p className="text-red-600">{t.emergencies30d} emergency</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-sm">Recurring issues</h3>
                <span className="text-xs text-muted-foreground">same unit + category, 30d</span>
              </div>
              {metrics.recurring.length === 0 ? (
                <p className="text-sm text-muted-foreground">None detected.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.recurring.slice(0, 5).map((r) => (
                    <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium capitalize truncate">{r.category}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {r.propertyName} #{r.unitNumber}
                        </p>
                      </div>
                      <span className="text-xs font-medium shrink-0">{r.count}x</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="flex-1 sm:flex-initial text-sm border border-border rounded-lg px-3 py-2 bg-card"
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
          className="flex-1 sm:flex-initial text-sm border border-border rounded-lg px-3 py-2 bg-card"
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
              className="w-full text-left bg-card rounded-xl border border-border p-4 sm:p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <StatusBadge value={req.priority} />
                <StatusBadge value={req.status} />
                <span className="text-xs text-muted-foreground capitalize ml-auto">{req.category}</span>
              </div>
              <h3 className="font-semibold break-words">{req.title}</h3>
              <p className="text-sm text-muted-foreground mt-1 break-words">
                {req.propertyName} #{req.unitNumber} &middot; {req.tenantName}
              </p>
              {req.description && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {req.description}
                </p>
              )}
              {(req.assignedTo || req.scheduledDate) && (
                <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {req.assignedTo && <span>Assigned: {req.assignedTo}</span>}
                  {req.scheduledDate && <span>Scheduled: {req.scheduledDate}</span>}
                </div>
              )}
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
