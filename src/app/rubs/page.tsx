"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Unit } from "@/lib/types";
import type {
  RubsBill,
  RubsAllocation,
  MeterMapping,
  MeterType,
  SplitMethod,
  BillStatus,
} from "@/lib/rubs-types";
import { METER_TYPE_LABELS, SPLIT_METHOD_LABELS } from "@/lib/rubs-types";

// ─── Main Page ─────────────────────────────────────────────────

export default function RubsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [bills, setBills] = useState<RubsBill[]>([]);
  const [mappings, setMappings] = useState<MeterMapping[]>([]);
  const [selected, setSelected] = useState<RubsBill | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(true);
  const [filterMonth, setFilterMonth] = useState("");
  const [filterProperty, setFilterProperty] = useState("");

  const loadData = useCallback(async () => {
    try {
      const [unitsRes, billsRes, mappingsRes] = await Promise.all([
        fetch("/api/appfolio/units").then((r) => r.json()).catch(() => ({ units: [] })),
        fetch("/api/rubs/bills").then((r) => r.json()),
        fetch("/api/rubs/mappings").then((r) => r.json()),
      ]);
      setUnits(unitsRes.units || []);
      setBills(billsRes.bills || []);
      setMappings(mappingsRes.mappings || []);
      setSeeded((billsRes.bills || []).length > 0 || (mappingsRes.mappings || []).length > 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSeed() {
    setLoading(true);
    await fetch("/api/rubs/seed", { method: "POST" });
    await loadData();
  }

  async function handleDeleteBill(id: string) {
    await fetch(`/api/rubs/bills?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setBills((prev) => prev.filter((b) => b.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function handlePostBill(bill: RubsBill) {
    const updated: RubsBill = { ...bill, status: "posted", updatedAt: new Date().toISOString() };
    await fetch("/api/rubs/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill: updated }),
    });
    setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelected(updated);
  }

  async function handleExport(billId: string) {
    window.open(`/api/rubs/export?billId=${encodeURIComponent(billId)}`, "_blank");
  }

  // Derived data
  const propertyNames = [...new Set([
    ...mappings.map((m) => m.propertyName),
    ...units.map((u) => u.propertyName),
  ].filter(Boolean))].sort();

  const months = [...new Set(bills.map((b) => b.month))].sort().reverse();

  const filteredBills = bills.filter((b) => {
    if (filterMonth && b.month !== filterMonth) return false;
    if (filterProperty && b.propertyName !== filterProperty) return false;
    return true;
  });

  // Stats
  const currentMonth = new Date().toISOString().slice(0, 7);
  const thisMonthBills = bills.filter((b) => b.month === currentMonth);
  const totalBilledThisMonth = thisMonthBills.reduce((s, b) => s + b.totalAmount, 0);
  const pendingBills = bills.filter((b) => b.status === "draft").length;
  const propertiesConfigured = new Set(mappings.map((m) => m.propertyName)).size;

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">RUBs</h1>
        <p className="text-muted-foreground mt-1">Loading...</p>
      </div>
    );
  }

  // ─── Detail View ───────────────────────────────────────────
  if (selected) {
    return (
      <BillDetailView
        bill={selected}
        onBack={() => setSelected(null)}
        onPost={() => handlePostBill(selected)}
        onExport={() => handleExport(selected.id)}
        onRecalculate={async (method: SplitMethod) => {
          const res = await fetch("/api/rubs/calculate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ billId: selected.id, splitMethod: method, units }),
          });
          const data = await res.json();
          if (data.ok && data.bill) {
            setBills((prev) => prev.map((b) => (b.id === data.bill.id ? data.bill : b)));
            setSelected(data.bill);
          }
        }}
      />
    );
  }

  // ─── List View ─────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">RUBs</h1>
          <p className="text-muted-foreground mt-1">
            Ratio Utility Billing — split utility costs across tenants
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/rubs/settings"
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Settings
          </Link>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showCreateForm ? "Cancel" : "+ New Bill"}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Billed This Month</p>
          <p className="text-2xl font-bold mt-1">${totalBilledThisMonth.toLocaleString()}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Pending Bills</p>
          <p className="text-2xl font-bold mt-1">{pendingBills}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Properties Configured</p>
          <p className="text-2xl font-bold mt-1">{propertiesConfigured}</p>
        </div>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <CreateBillForm
          propertyNames={propertyNames}
          mappings={mappings}
          onCreated={(bill) => {
            setBills((prev) => [...prev, bill]);
            setShowCreateForm(false);
            setSelected(bill);
          }}
        />
      )}

      {/* Filters */}
      {bills.length > 0 && (
        <div className="flex items-center gap-4">
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            <option value="">All Months</option>
            {months.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            <option value="">All Properties</option>
            {propertyNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {(filterMonth || filterProperty) && (
            <button
              onClick={() => { setFilterMonth(""); setFilterProperty(""); }}
              className="text-xs text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bills Table */}
      {filteredBills.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Utility Bills ({filteredBills.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Property</th>
                  <th className="text-left px-4 py-3 font-medium">Utility</th>
                  <th className="text-left px-4 py-3 font-medium">Month</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBills.map((bill) => (
                  <tr
                    key={bill.id}
                    className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                    onClick={() => setSelected(bill)}
                  >
                    <td className="px-4 py-3 font-medium">{bill.propertyName}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">{bill.meterType}</td>
                    <td className="px-4 py-3 text-muted-foreground">{bill.month}</td>
                    <td className="px-4 py-3 text-right font-medium">${bill.totalAmount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={bill.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteBill(bill.id); }}
                        className="text-xs text-red-500 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !seeded ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No RUBS data yet. Seed demo data to get started, or configure meters in Settings.
          </p>
          <button
            onClick={handleSeed}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Seed Demo Data
          </button>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No bills match the current filters. Click &quot;+ New Bill&quot; to create one.
        </div>
      )}
    </div>
  );
}

// ─── Status Badge ────────────────────────────────────────────

function StatusBadge({ status }: { status: BillStatus }) {
  const styles: Record<BillStatus, string> = {
    draft: "bg-slate-100 text-slate-600",
    calculated: "bg-blue-100 text-blue-800",
    posted: "bg-green-100 text-green-800",
  };
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${styles[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Create Bill Form ────────────────────────────────────────

function CreateBillForm({
  propertyNames,
  mappings,
  onCreated,
}: {
  propertyNames: string[];
  mappings: MeterMapping[];
  onCreated: (bill: RubsBill) => void;
}) {
  const [propertyName, setPropertyName] = useState("");
  const [meterType, setMeterType] = useState<MeterType>("water");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [saving, setSaving] = useState(false);

  // Find matching mapping
  const mapping = mappings.find(
    (m) => m.propertyName === propertyName && m.meterType === meterType
  );

  // Available meter types for selected property
  const availableMeters = mappings
    .filter((m) => m.propertyName === propertyName)
    .map((m) => m.meterType);

  async function handleCreate() {
    if (!propertyName || totalAmount <= 0 || !mapping) return;
    setSaving(true);

    const bill: RubsBill = {
      id: `bill-${Date.now()}`,
      propertyName,
      month,
      meterType,
      totalAmount,
      mappingId: mapping.id,
      status: "draft",
      allocations: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await fetch("/api/rubs/bills", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bill }),
    });

    setSaving(false);
    onCreated(bill);
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <h2 className="font-semibold">Create Utility Bill</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Property</label>
          <select
            value={propertyName}
            onChange={(e) => { setPropertyName(e.target.value); setMeterType("water"); }}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            <option value="">Select property...</option>
            {propertyNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Utility Type</label>
          <select
            value={meterType}
            onChange={(e) => setMeterType(e.target.value as MeterType)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            {(availableMeters.length > 0
              ? availableMeters
              : (["water", "gas", "electric", "trash"] as MeterType[])
            ).map((t) => (
              <option key={t} value={t}>{METER_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Billing Month</label>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Total Bill ($)</label>
          <input
            type="number"
            value={totalAmount || ""}
            placeholder="0.00"
            onChange={(e) => setTotalAmount(parseFloat(e.target.value) || 0)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
          />
        </div>
      </div>
      {propertyName && !mapping && (
        <p className="text-xs text-amber-600">
          No meter mapping found for {propertyName} / {METER_TYPE_LABELS[meterType]}.{" "}
          <Link href="/rubs/settings" className="underline">Configure in Settings</Link>
        </p>
      )}
      <button
        onClick={handleCreate}
        disabled={!propertyName || totalAmount <= 0 || !mapping || saving}
        className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        {saving ? "Creating..." : "Create Bill"}
      </button>
    </div>
  );
}

// ─── Bill Detail View ────────────────────────────────────────

function BillDetailView({
  bill,
  onBack,
  onPost,
  onExport,
  onRecalculate,
}: {
  bill: RubsBill;
  onBack: () => void;
  onPost: () => void;
  onExport: () => void;
  onRecalculate: (method: SplitMethod) => Promise<void>;
}) {
  const [recalcMethod, setRecalcMethod] = useState<SplitMethod | "">("");
  const [recalculating, setRecalculating] = useState(false);

  const totalAllocated = bill.allocations.reduce((s, a) => s + a.amount, 0);

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-accent hover:underline">
        &larr; Back to RUBs
      </button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">{bill.propertyName}</h1>
          <p className="text-muted-foreground mt-1 capitalize">
            {bill.meterType} &middot; {bill.month} &middot; <StatusBadge status={bill.status} />
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold">${bill.totalAmount.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">Total Bill</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Units</p>
          <p className="text-2xl font-bold mt-1">{bill.allocations.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Avg Per Unit</p>
          <p className="text-2xl font-bold mt-1">
            ${bill.allocations.length > 0
              ? Math.round(bill.totalAmount / bill.allocations.length).toLocaleString()
              : "0"}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Allocated</p>
          <p className="text-2xl font-bold mt-1">${totalAllocated.toFixed(2)}</p>
        </div>
      </div>

      {/* Recalculate */}
      {bill.status !== "posted" && (
        <div className="flex items-center gap-3">
          <select
            value={recalcMethod}
            onChange={(e) => setRecalcMethod(e.target.value as SplitMethod)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            <option value="">Recalculate with...</option>
            {(Object.entries(SPLIT_METHOD_LABELS) as [SplitMethod, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button
            onClick={async () => {
              if (!recalcMethod) return;
              setRecalculating(true);
              await onRecalculate(recalcMethod);
              setRecalculating(false);
              setRecalcMethod("");
            }}
            disabled={!recalcMethod || recalculating}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {recalculating ? "Calculating..." : "Recalculate"}
          </button>
        </div>
      )}

      {/* Allocations Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold">Unit Allocations</h2>
        </div>
        {bill.allocations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Unit</th>
                  <th className="text-left px-4 py-3 font-medium">Tenant</th>
                  <th className="text-right px-4 py-3 font-medium">Sq Ft</th>
                  <th className="text-right px-4 py-3 font-medium">Share</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.allocations.map((a) => (
                  <tr key={a.unitId} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{a.unitName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{a.tenant}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{a.sqft.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{(a.share * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-medium">${a.amount.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted">
                  <td className="px-4 py-3 font-semibold" colSpan={4}>Total</td>
                  <td className="px-4 py-3 text-right font-semibold">${totalAllocated.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-muted-foreground">
            No allocations yet. Use the recalculate option above to split this bill across units.
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {bill.status === "calculated" && (
          <button
            onClick={onPost}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Post to Tenant Ledgers
          </button>
        )}
        {bill.allocations.length > 0 && (
          <button
            onClick={onExport}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Export CSV
          </button>
        )}
      </div>
    </div>
  );
}
