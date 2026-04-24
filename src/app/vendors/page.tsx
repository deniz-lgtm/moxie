"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { invalidateLogoCache } from "@/lib/pdf-logo";
import { StatusBadge } from "@/components/StatusBadge";
import type { MaintenanceRequest, Vendor, VendorStatus } from "@/lib/types";

const VENDOR_CATEGORIES = [
  "Plumbing",
  "Electrical",
  "HVAC",
  "General Contractor",
  "Painting",
  "Flooring",
  "Locksmith",
  "Pest Control",
  "Landscaping",
  "Appliance Repair",
  "Cleaning",
  "Roofing",
  "Other",
];

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

/** Normalise a phone number for display. Accepts US 10-digit, US 11-digit
 *  (leading 1), or anything else (returned as-is — international, ext, etc.). */
function formatPhone(phone: string | undefined | null): string {
  if (!phone) return "—";
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return String(phone).trim();
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [notionConfigured, setNotionConfigured] = useState(false);
  const [moxieLogoUrl, setMoxieLogoUrl] = useState<string>("");

  const [newVendor, setNewVendor] = useState({
    name: "",
    category: VENDOR_CATEGORIES[0],
    scope: "",
    phone: "",
    email: "",
    insuranceExpiry: "",
    notes: "",
    isInternal: true,
  });

  async function loadVendors() {
    const res = await fetch("/api/vendors");
    if (!res.ok) return [];
    const j = await res.json();
    return (j.vendors || []) as Vendor[];
  }

  async function loadSyncInfo() {
    try {
      const res = await fetch("/api/vendors/sync");
      if (!res.ok) return;
      const j = await res.json();
      setSyncedAt(j.syncedAt ?? null);
      setNotionConfigured(!!j.configured);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    setMoxieLogoUrl(localStorage.getItem("moxie_logo_url") || "");
  }, []);

  useEffect(() => {
    (async () => {
      const [list] = await Promise.all([
        loadVendors(),
        loadSyncInfo(),
        fetch("/api/appfolio/work-orders")
          .then((r) => r.json())
          .then((d) => setWorkOrders(d.workOrders || []))
          .catch(() => {}),
      ]);
      setVendors(list);
      setLoading(false);
    })();
  }, []);

  async function syncWithNotion() {
    setSyncing(true);
    setSyncError(null);
    setSyncInfo(null);
    try {
      const res = await fetch("/api/vendors/sync", { method: "POST" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Sync failed");
      const list = await loadVendors();
      setVendors(list);
      setSyncedAt(j.syncedAt ?? null);
      const parts: string[] = [];
      if (j.pulled) parts.push(`pulled ${j.pulled}`);
      if (j.pushed) parts.push(`pushed ${j.pushed}`);
      if (j.createdInNotion) parts.push(`created ${j.createdInNotion} in Notion`);
      if (parts.length === 0) parts.push("already in sync");
      setSyncInfo(parts.join(" · "));
      if (j.errors?.length) setSyncError(`${j.errors.length} row(s) failed: ${j.errors.slice(0, 2).join("; ")}`);
    } catch (e: any) {
      setSyncError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  // All distinct scope tokens across existing vendors — used for the
  // ScopeTagInput dropdown suggestions.
  const scopeSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const v of vendors) {
      for (const s of parseScope(v.scope)) set.add(s);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [vendors]);

  const vendorMetrics = useMemo(() => {
    const metrics: Record<string, { jobsCompleted: number; avgResponseDays: number | null }> = {};
    for (const wo of workOrders) {
      const name = wo.vendor?.toLowerCase().trim();
      if (!name) continue;
      if (!metrics[name]) metrics[name] = { jobsCompleted: 0, avgResponseDays: null };
      if (wo.status === "completed" || wo.status === "closed") metrics[name].jobsCompleted++;
      if (wo.completedDate && wo.createdAt) {
        const days = Math.abs(new Date(wo.completedDate).getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        metrics[name].avgResponseDays = metrics[name].avgResponseDays === null ? days : (metrics[name].avgResponseDays + days) / 2;
      }
    }
    return metrics;
  }, [workOrders]);

  function getMetrics(name: string) {
    const k = name.toLowerCase().trim();
    if (vendorMetrics[k]) return vendorMetrics[k];
    for (const [mk, mv] of Object.entries(vendorMetrics)) {
      if (mk.includes(k) || k.includes(mk)) return mv;
    }
    return { jobsCompleted: 0, avgResponseDays: null };
  }

  const filtered = vendors.filter((v) => {
    if (filterCategory !== "all" && v.category !== filterCategory) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const haystack = [
        v.name,
        v.scope,
        v.category,
        v.phone,
        v.email,
        v.website,
        v.address,
        v.contactName,
        v.licenseNumber,
        v.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  const expiringInsurance = vendors.filter((v) => {
    if (!v.insuranceExpiry) return false;
    const days = (new Date(v.insuranceExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return days >= 0 && days <= 30;
  });

  async function addVendor() {
    if (!newVendor.name.trim()) return;
    const now = new Date().toISOString();
    const vendor: Vendor = {
      id: `v-${Date.now()}`,
      name: newVendor.name.trim(),
      category: newVendor.category,
      scope: newVendor.scope || undefined,
      phone: newVendor.phone || undefined,
      email: newVendor.email || undefined,
      insuranceExpiry: newVendor.insuranceExpiry || undefined,
      notes: newVendor.notes || undefined,
      status: "active",
      isInternal: newVendor.isInternal,
      createdAt: now,
      updatedAt: now,
    };
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor }),
    });
    if (!res.ok) {
      setSyncError("Couldn't save vendor");
      return;
    }
    const j = await res.json();
    setVendors((prev) => [...prev, j.vendor]);
    setNewVendor({
      name: "",
      category: VENDOR_CATEGORIES[0],
      scope: "",
      phone: "",
      email: "",
      insuranceExpiry: "",
      notes: "",
      isInternal: true,
    });
    setShowAddForm(false);
  }

  async function saveVendor(v: Vendor) {
    const res = await fetch("/api/vendors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vendor: v }),
    });
    if (!res.ok) {
      setSyncError("Couldn't save vendor");
      return;
    }
    const j = await res.json();
    setVendors((prev) => prev.map((x) => (x.id === j.vendor.id ? j.vendor : x)));
    if (selected?.id === j.vendor.id) setSelected(j.vendor);
  }

  function updateVendor<K extends keyof Vendor>(id: string, field: K, value: Vendor[K]) {
    const existing = vendors.find((v) => v.id === id);
    if (!existing) return;
    const updated: Vendor = { ...existing, [field]: value, updatedAt: new Date().toISOString() };
    setVendors((prev) => prev.map((v) => (v.id === id ? updated : v)));
    if (selected?.id === id) setSelected(updated);
    void saveVendor(updated);
  }

  async function removeVendor(id: string) {
    const res = await fetch(`/api/vendors?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setSyncError("Couldn't delete vendor");
      return;
    }
    setVendors((prev) => prev.filter((v) => v.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function uploadLogoFile(dataUrl: string, slot: "moxie" | "vendor", vendorId?: string): Promise<string> {
    try {
      const res = await fetch("/api/logos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, slot, vendorId }),
      });
      if (res.ok) {
        const j = await res.json();
        return j.url as string;
      }
    } catch {}
    return dataUrl;
  }

  async function handleMoxieLogoUpload(dataUrl: string) {
    const url = await uploadLogoFile(dataUrl, "moxie");
    localStorage.setItem("moxie_logo_url", url);
    setMoxieLogoUrl(url);
    invalidateLogoCache();
  }

  if (selected) {
    const m = getMetrics(selected.name);
    const vendorWorkOrders = workOrders.filter(
      (wo) => wo.vendor && wo.vendor.toLowerCase().trim() === selected.name.toLowerCase().trim()
    );

    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Vendors
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {selected.logoUrl && (
              <img
                src={selected.logoUrl}
                alt={selected.name}
                className="h-12 w-auto max-w-[6rem] object-contain rounded border border-border bg-white p-1 shrink-0"
              />
            )}
            <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words">{selected.name}</h1>
            <p className="text-muted-foreground mt-1">
              {selected.category || "—"}
              {selected.isInternal && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">Internal</span>}
              {selected.notionPageId && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-slate-50 text-slate-700">Linked to Notion</span>}
            </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selected.status || "active"}
              onChange={(e) => updateVendor(selected.id, "status", e.target.value as VendorStatus)}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-card"
            >
              <option value="preferred">Preferred</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <button onClick={() => removeVendor(selected.id)} className="text-xs text-red-600 hover:text-red-700 px-2 py-1.5">
              Delete
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h2 className="font-semibold">Contact Info</h2>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <select
                value={selected.category || ""}
                onChange={(e) => updateVendor(selected.id, "category", e.target.value || undefined)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">—</option>
                {VENDOR_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <ScopeTagInput
              value={parseScope(selected.scope)}
              suggestions={scopeSuggestions}
              onChange={(tags) => updateVendor(selected.id, "scope", tags.length > 0 ? tags.join(", ") : undefined)}
            />
            <EditableField label="Phone" value={selected.phone || ""} onBlurSave={(v) => updateVendor(selected.id, "phone", v || undefined)} />
            <EditableField label="Email" type="email" value={selected.email || ""} onBlurSave={(v) => updateVendor(selected.id, "email", v || undefined)} />
            <EditableField label="Website" value={selected.website || ""} onBlurSave={(v) => updateVendor(selected.id, "website", v || undefined)} />
            <EditableField label="Contact Name" value={selected.contactName || ""} onBlurSave={(v) => updateVendor(selected.id, "contactName", v || undefined)} />
            <EditableField label="Address" value={selected.address || ""} onBlurSave={(v) => updateVendor(selected.id, "address", v || undefined)} />
            <div>
              <label className="text-xs text-muted-foreground block mb-2">Logo</label>
              <LogoUploader
                currentUrl={selected.logoUrl}
                label={`${selected.name} logo`}
                onUpload={async (dataUrl) => {
                  const url = await uploadLogoFile(dataUrl, "vendor", selected.id);
                  updateVendor(selected.id, "logoUrl", url);
                }}
              />
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h2 className="font-semibold">Compliance + Performance</h2>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Insurance Expiry</label>
              <input
                type="date"
                value={selected.insuranceExpiry || ""}
                onChange={(e) => updateVendor(selected.id, "insuranceExpiry", e.target.value || undefined)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <EditableField label="License Number" value={selected.licenseNumber || ""} onBlurSave={(v) => updateVendor(selected.id, "licenseNumber", v || undefined)} />
            <div className="pt-3 border-t border-border text-sm space-y-1">
              <p><span className="text-muted-foreground">Jobs Completed:</span> <span className="font-medium">{m.jobsCompleted}</span></p>
              <p>
                <span className="text-muted-foreground">Avg Resolution:</span>{" "}
                <span className="font-medium">{m.avgResponseDays != null ? `${Math.round(m.avgResponseDays)} days` : "—"}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-2">Notes</h2>
          <textarea
            value={selected.notes || ""}
            onChange={(e) => {
              const next = { ...selected, notes: e.target.value };
              setSelected(next);
              setVendors((prev) => prev.map((v) => (v.id === next.id ? next : v)));
            }}
            onBlur={(e) => updateVendor(selected.id, "notes", e.target.value || undefined)}
            rows={3}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
          />
        </div>

        {vendorWorkOrders.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Recent Work Orders ({vendorWorkOrders.length})</h2>
            <div className="space-y-2">
              {vendorWorkOrders.slice(0, 10).map((wo) => (
                <div key={wo.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{wo.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {wo.propertyName} — {wo.unitNumber}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge value={wo.status} />
                    {wo.actualCost != null && <span className="text-xs text-muted-foreground">${wo.actualCost}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Vendor Directory</h1>
          <p className="text-muted-foreground mt-1">
            Preferred vendors, insurance status, and internal trades{notionConfigured ? " — synced with Notion" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {notionConfigured && (
            <>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {syncedAt ? `Synced ${formatRelative(syncedAt)}` : "Not synced yet"}
              </span>
              <button
                onClick={syncWithNotion}
                disabled={syncing}
                className="px-3 py-2 bg-card border border-border text-sm rounded-lg hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
              >
                {syncing ? "Syncing…" : "Sync Notion"}
              </button>
            </>
          )}
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors whitespace-nowrap"
          >
            {showAddForm ? "Cancel" : "+ Add Vendor"}
          </button>
        </div>
      </div>

      {syncInfo && !syncError && (
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">
          {syncInfo}
        </div>
      )}
      {syncError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {syncError}
        </div>
      )}

      {expiringInsurance.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-amber-800">Insurance Expiring Soon</h3>
          <div className="mt-2 space-y-1">
            {expiringInsurance.map((v) => (
              <p key={v.id} className="text-xs text-amber-700">
                {v.name} — expires {v.insuranceExpiry}
              </p>
            ))}
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">New Vendor</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Vendor name *"
              value={newVendor.name}
              onChange={(e) => setNewVendor({ ...newVendor, name: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <select
              value={newVendor.category}
              onChange={(e) => setNewVendor({ ...newVendor, category: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            >
              {VENDOR_CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Phone"
              value={newVendor.phone}
              onChange={(e) => setNewVendor({ ...newVendor, phone: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="email"
              placeholder="Email"
              value={newVendor.email}
              onChange={(e) => setNewVendor({ ...newVendor, email: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="date"
              placeholder="Insurance expiry"
              value={newVendor.insuranceExpiry}
              onChange={(e) => setNewVendor({ ...newVendor, insuranceExpiry: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={newVendor.isInternal}
                onChange={(e) => setNewVendor({ ...newVendor, isInternal: e.target.checked })}
              />
              Internal vendor
            </label>
            <div className="md:col-span-2">
              <ScopeTagInput
                value={parseScope(newVendor.scope)}
                suggestions={scopeSuggestions}
                onChange={(tags) => setNewVendor({ ...newVendor, scope: tags.join(", ") })}
                label="Scope"
              />
            </div>
          </div>
          <textarea
            placeholder="Notes"
            value={newVendor.notes}
            onChange={(e) => setNewVendor({ ...newVendor, notes: e.target.value })}
            rows={2}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
          />
          <button
            onClick={addVendor}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Add Vendor
          </button>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold text-sm">Company Branding</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Moxie Management logo — used on deposit letters and reports.
            </p>
          </div>
          <LogoUploader
            currentUrl={moxieLogoUrl}
            label="Moxie Management logo"
            onUpload={handleMoxieLogoUpload}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Search name, scope, category, phone…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Categories</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading vendors…</div>
      ) : filtered.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Vendor</th>
                  <th className="text-left px-4 py-3 font-medium">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium">Jobs</th>
                  <th className="text-left px-4 py-3 font-medium">Avg Resolution</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const m = getMetrics(v.name);
                  return (
                    <tr
                      key={v.id}
                      onClick={() => setSelected(v)}
                      className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{v.name}</span>
                          {v.isInternal && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">Internal</span>}
                        </div>
                        {v.scope && (
                          <p className="text-xs text-muted-foreground font-normal mt-0.5 line-clamp-1">{v.scope}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{v.category || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{formatPhone(v.phone)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.jobsCompleted}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.avgResponseDays != null ? `${Math.round(m.avgResponseDays)}d` : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={v.status || "active"} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {vendors.length === 0
            ? notionConfigured
              ? "No vendors yet. Click \"Sync Notion\" to pull from your Notion Vendor List, or add one manually."
              : "No vendors added yet. Click \"+ Add Vendor\" to get started."
            : "No vendors match the current filter."}
        </div>
      )}
    </div>
  );
}

function EditableField({
  label,
  value,
  type = "text",
  onBlurSave,
}: {
  label: string;
  value: string;
  type?: string;
  onBlurSave: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onBlurSave(local);
        }}
        className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
      />
    </div>
  );
}

function LogoUploader({
  currentUrl,
  label,
  onUpload,
}: {
  currentUrl?: string;
  label: string;
  onUpload: (dataUrl: string) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    setUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      await onUpload(dataUrl);
    } catch {
      // ignore
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {currentUrl ? (
        <img
          src={currentUrl}
          alt={label}
          className="h-12 w-auto max-w-[8rem] object-contain border border-border rounded bg-white p-1"
        />
      ) : (
        <div className="h-12 w-20 border border-dashed border-border rounded flex items-center justify-center text-xs text-muted-foreground bg-muted">
          No logo
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
      >
        {uploading ? "Uploading…" : currentUrl ? "Replace" : "Upload"}
      </button>
    </div>
  );
}

/** Split a comma-separated scope string into an array of trimmed, non-empty tags. */
function parseScope(scope: string | undefined | null): string[] {
  if (!scope) return [];
  return scope
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Multi-tag picker with suggestions from existing vendors. Stores back to
 *  the vendor as a comma-separated string so the DB schema stays `text`. */
function ScopeTagInput({
  value,
  suggestions,
  onChange,
  label = "Scope",
}: {
  value: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
  label?: string;
}) {
  const [input, setInput] = useState("");
  const datalistId = `scope-suggestions-${label.replace(/\s+/g, "-").toLowerCase()}`;

  function addTag(raw: string) {
    const t = raw.trim().replace(/,$/, "").trim();
    if (!t) return;
    if (value.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setInput("");
      return;
    }
    onChange([...value, t]);
    setInput("");
  }

  function removeTag(tag: string) {
    onChange(value.filter((x) => x !== tag));
  }

  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <div className="flex flex-wrap gap-1.5 items-center border border-border rounded-lg bg-card px-2 py-1.5 min-h-[2.25rem]">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-slate-100 text-slate-700 rounded">
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              aria-label={`Remove ${tag}`}
              className="text-slate-500 hover:text-slate-700 leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          list={datalistId}
          type="text"
          value={input}
          onChange={(e) => {
            const v = e.target.value;
            // Typing a comma commits the tag.
            if (v.includes(",")) {
              v.split(",").forEach((part) => addTag(part));
            } else {
              setInput(v);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(input);
            } else if (e.key === "Backspace" && !input && value.length > 0) {
              removeTag(value[value.length - 1]);
            }
          }}
          onBlur={() => {
            if (input.trim()) addTag(input);
          }}
          placeholder={value.length === 0 ? "Type a scope, pick from the dropdown, or add your own…" : "Add another…"}
          className="flex-1 min-w-[140px] bg-transparent text-sm outline-none py-0.5"
        />
      </div>
      <datalist id={datalistId}>
        {suggestions
          .filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()))
          .map((s) => (
            <option key={s} value={s} />
          ))}
      </datalist>
    </div>
  );
}
