"use client";

import { useState, useEffect, useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import type { MaintenanceRequest } from "@/lib/types";

type Vendor = {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  insuranceExpiry: string;
  rating: number;
  notes: string;
  status: "active" | "inactive" | "pending";
};

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
];

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>(() => loadFromStorage<Vendor[]>("vendors", []));
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: "",
    category: VENDOR_CATEGORIES[0],
    phone: "",
    email: "",
    insuranceExpiry: "",
    notes: "",
  });

  // Persist vendors
  useEffect(() => {
    saveToStorage("vendors", vendors);
  }, [vendors]);

  // Fetch work orders for vendor performance metrics
  useEffect(() => {
    fetch("/api/appfolio/work-orders")
      .then((r) => r.json())
      .then((data) => setWorkOrders(data.workOrders || []))
      .catch(() => {});
  }, []);

  // Build vendor performance from work orders
  const vendorMetrics = useMemo(() => {
    const metrics: Record<string, { jobsCompleted: number; avgResponseDays: number | null; recentJobs: string[] }> = {};

    for (const wo of workOrders) {
      const vendorName = wo.vendor;
      if (!vendorName) continue;

      // Match by name (case-insensitive)
      const key = vendorName.toLowerCase().trim();
      if (!metrics[key]) {
        metrics[key] = { jobsCompleted: 0, avgResponseDays: null, recentJobs: [] };
      }

      if (wo.status === "completed" || wo.status === "closed") {
        metrics[key].jobsCompleted++;
      }

      if (wo.completedDate && wo.createdAt) {
        const days = Math.abs(new Date(wo.completedDate).getTime() - new Date(wo.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (metrics[key].avgResponseDays === null) {
          metrics[key].avgResponseDays = days;
        } else {
          metrics[key].avgResponseDays = (metrics[key].avgResponseDays + days) / 2;
        }
      }

      if (metrics[key].recentJobs.length < 5) {
        metrics[key].recentJobs.push(wo.title);
      }
    }

    return metrics;
  }, [workOrders]);

  function getVendorMetrics(vendorName: string) {
    const key = vendorName.toLowerCase().trim();
    return metrics(key) || { jobsCompleted: 0, avgResponseDays: null, recentJobs: [] };

    function metrics(k: string) {
      // Try exact match, then partial match
      if (vendorMetrics[k]) return vendorMetrics[k];
      for (const [mk, mv] of Object.entries(vendorMetrics)) {
        if (mk.includes(k) || k.includes(mk)) return mv;
      }
      return null;
    }
  }

  const filtered = vendors.filter((v) => {
    if (filterCategory !== "all" && v.category !== filterCategory) return false;
    if (searchQuery && !v.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // Check for expiring insurance (within 30 days)
  const expiringInsurance = vendors.filter((v) => {
    if (!v.insuranceExpiry) return false;
    const expiry = new Date(v.insuranceExpiry);
    const now = new Date();
    const daysUntil = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 30;
  });

  function addVendor() {
    if (!newVendor.name.trim()) return;
    const vendor: Vendor = {
      id: `v-${Date.now()}`,
      name: newVendor.name,
      category: newVendor.category,
      phone: newVendor.phone,
      email: newVendor.email,
      insuranceExpiry: newVendor.insuranceExpiry,
      rating: 0,
      notes: newVendor.notes,
      status: "active",
    };
    setVendors((prev) => [...prev, vendor]);
    setNewVendor({ name: "", category: VENDOR_CATEGORIES[0], phone: "", email: "", insuranceExpiry: "", notes: "" });
    setShowAddForm(false);
  }

  function deleteVendor(id: string) {
    setVendors((prev) => prev.filter((v) => v.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function updateVendor(id: string, field: keyof Vendor, value: string | number) {
    setVendors((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
    if (selected?.id === id) {
      setSelected((prev) => prev ? { ...prev, [field]: value } : null);
    }
  }

  if (selected) {
    const metrics = getVendorMetrics(selected.name);
    const vendorWorkOrders = workOrders.filter(
      (wo) => wo.vendor && wo.vendor.toLowerCase().trim() === selected.name.toLowerCase().trim()
    );

    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Vendors
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="text-muted-foreground mt-1">{selected.category}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selected.status}
              onChange={(e) => updateVendor(selected.id, "status", e.target.value)}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-card"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="pending">Pending</option>
            </select>
            <button
              onClick={() => deleteVendor(selected.id)}
              className="text-xs text-red-500 hover:text-red-700 px-2 py-1.5"
            >
              Delete
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Contact Info</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Phone:</span> {selected.phone || "—"}</p>
              <p><span className="text-muted-foreground">Email:</span> {selected.email || "—"}</p>
              <div>
                <span className="text-muted-foreground">Insurance Expiry:</span>{" "}
                <input
                  type="date"
                  value={selected.insuranceExpiry}
                  onChange={(e) => updateVendor(selected.id, "insuranceExpiry", e.target.value)}
                  className="text-sm border border-border rounded px-2 py-1 bg-card ml-1"
                />
              </div>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Performance (from AppFolio)</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Jobs Completed:</span> {metrics.jobsCompleted}</p>
              <p>
                <span className="text-muted-foreground">Avg Resolution:</span>{" "}
                {metrics.avgResponseDays !== null ? `${Math.round(metrics.avgResponseDays)} days` : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Recent work orders for this vendor */}
        {vendorWorkOrders.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Recent Work Orders ({vendorWorkOrders.length})</h2>
            <div className="space-y-2">
              {vendorWorkOrders.slice(0, 10).map((wo) => (
                <div key={wo.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 text-sm">
                  <div>
                    <p className="font-medium">{wo.title}</p>
                    <p className="text-xs text-muted-foreground">{wo.propertyName} — {wo.unitNumber}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={wo.status} />
                    {wo.actualCost && (
                      <span className="text-xs text-muted-foreground">${wo.actualCost}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {selected.notes && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-2">Notes</h2>
            <textarea
              value={selected.notes}
              onChange={(e) => updateVendor(selected.id, "notes", e.target.value)}
              rows={3}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendor Directory</h1>
          <p className="text-muted-foreground mt-1">
            Preferred vendors, performance tracking, and insurance status
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add Vendor"}
        </button>
      </div>

      {/* Insurance expiry alerts */}
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

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search vendors..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Categories</option>
          {VENDOR_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {filtered.length > 0 ? (
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
                  const m = getVendorMetrics(v.name);
                  return (
                    <tr
                      key={v.id}
                      onClick={() => setSelected(v)}
                      className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium">{v.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{v.category}</td>
                      <td className="px-4 py-3 text-muted-foreground">{v.phone || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{m.jobsCompleted}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {m.avgResponseDays !== null ? `${Math.round(m.avgResponseDays)}d` : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={v.status} /></td>
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
            ? "No vendors added yet. Click \"+ Add Vendor\" to get started."
            : "No vendors match the current filter."}
        </div>
      )}
    </div>
  );
}
