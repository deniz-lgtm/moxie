"use client";

import { useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";

type Vendor = {
  id: string;
  name: string;
  category: string;
  phone: string;
  email: string;
  insuranceExpiry: string;
  rating: number;
  jobsCompleted: number;
  avgResponseTime: string;
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
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [selected, setSelected] = useState<Vendor | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVendor, setNewVendor] = useState({
    name: "",
    category: VENDOR_CATEGORIES[0],
    phone: "",
    email: "",
    notes: "",
  });

  const filtered = vendors.filter((v) => {
    if (filterCategory !== "all" && v.category !== filterCategory) return false;
    return true;
  });

  function addVendor() {
    if (!newVendor.name.trim()) return;
    const vendor: Vendor = {
      id: `v-${Date.now()}`,
      name: newVendor.name,
      category: newVendor.category,
      phone: newVendor.phone,
      email: newVendor.email,
      insuranceExpiry: "",
      rating: 0,
      jobsCompleted: 0,
      avgResponseTime: "—",
      notes: newVendor.notes,
      status: "active",
    };
    setVendors((prev) => [...prev, vendor]);
    setNewVendor({ name: "", category: VENDOR_CATEGORIES[0], phone: "", email: "", notes: "" });
    setShowAddForm(false);
  }

  if (selected) {
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
          <StatusBadge value={selected.status} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Contact Info</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Phone:</span> {selected.phone || "—"}</p>
              <p><span className="text-muted-foreground">Email:</span> {selected.email || "—"}</p>
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Performance</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Jobs Completed:</span> {selected.jobsCompleted}</p>
              <p><span className="text-muted-foreground">Avg Response:</span> {selected.avgResponseTime}</p>
              <p><span className="text-muted-foreground">Insurance Expiry:</span> {selected.insuranceExpiry || "Not on file"}</p>
            </div>
          </div>
        </div>

        {selected.notes && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-2">Notes</h2>
            <p className="text-sm text-muted-foreground">{selected.notes}</p>
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

      <div className="flex gap-3">
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
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => setSelected(v)}
                    className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">{v.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.category}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{v.jobsCompleted}</td>
                    <td className="px-4 py-3"><StatusBadge value={v.status} /></td>
                  </tr>
                ))}
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
