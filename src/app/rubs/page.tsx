"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import type { Unit } from "@/lib/types";
import type {
  RubsBill,
  MeterMapping,
  MeterType,
  SplitMethod,
  BillStatus,
  ParsedBill,
  ImportFileInfo,
  OccupancyData,
  ReconciliationIssue,
} from "@/lib/rubs-types";
import { METER_TYPE_LABELS, SPLIT_METHOD_LABELS } from "@/lib/rubs-types";
import {
  getMeterMappings,
  getMeterMappingById,
  getBills,
  saveBill as saveBillToStorage,
  deleteBill as deleteBillFromStorage,
  getOccupancyData,
  saveOccupancyData,
} from "@/lib/rubs-db";
import { seedRubsData, isSeeded as checkIsSeeded } from "@/lib/rubs-seed";
import { calculateAllocations } from "@/lib/rubs-calc";
import {
  parseAppFolioTemplate,
  reconcile,
  generateAppFolioExport,
  getExportTotal,
} from "@/lib/rubs-appfolio-export";

// ─── Main Page ─────────────────────────────────────────────────

export default function RubsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [bills, setBills] = useState<RubsBill[]>([]);
  const [mappings, setMappings] = useState<MeterMapping[]>([]);
  const [selected, setSelected] = useState<RubsBill | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(true);
  const [filterMonth, setFilterMonth] = useState("");
  const [filterProperty, setFilterProperty] = useState("");
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    try {
      // Units come from AppFolio API (server-side), RUBS data from localStorage (client-side)
      const unitsRes = await fetch("/api/appfolio/units").then((r) => r.json()).catch(() => ({ units: [] }));
      setUnits(unitsRes.units || []);

      const localBills = getBills();
      const localMappings = getMeterMappings();
      const localOccupancy = getOccupancyData();
      setBills(localBills);
      setMappings(localMappings);
      setOccupancy(localOccupancy);
      setSeeded(localBills.length > 0 || localMappings.length > 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function handleSeed() {
    setLoading(true);
    seedRubsData();
    // Reload from localStorage
    setBills(getBills());
    setMappings(getMeterMappings());
    setSeeded(true);
    setLoading(false);
  }

  function handleDeleteBill(id: string) {
    deleteBillFromStorage(id);
    setBills((prev) => prev.filter((b) => b.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  function handlePostBill(bill: RubsBill) {
    const updated: RubsBill = { ...bill, status: "posted", updatedAt: new Date().toISOString() };
    saveBillToStorage(updated);
    setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelected(updated);
  }

  function handleCalculateAll(method: SplitMethod = "occupancy") {
    const draftBills = bills.filter((b) => b.status === "draft");
    if (draftBills.length === 0) {
      alert("No draft bills to calculate.");
      return;
    }
    if (!confirm(`Calculate allocations for ${draftBills.length} draft bill${draftBills.length !== 1 ? "s" : ""} using "${SPLIT_METHOD_LABELS[method]}"?`)) return;

    let calculated = 0;
    let skipped = 0;
    const updates: RubsBill[] = bills.map((b) => {
      if (b.status !== "draft") return b;
      const mapping = getMeterMappingById(b.mappingId);
      if (!mapping) {
        skipped++;
        return b;
      }
      const allocs = calculateAllocations({
        totalAmount: b.totalAmount,
        mapping,
        units,
        splitMethod: method,
      });
      const updated: RubsBill = {
        ...b,
        allocations: allocs,
        status: "calculated",
        updatedAt: new Date().toISOString(),
      };
      saveBillToStorage(updated);
      calculated++;
      return updated;
    });
    setBills(updates);
    alert(`Calculated ${calculated} bill${calculated !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} skipped — no meter mapping found)` : ""}.`);
  }

  async function handleTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (templateInputRef.current) templateInputRef.current.value = "";
    if (!file) return;
    try {
      const data = await parseAppFolioTemplate(file);
      saveOccupancyData(data);
      setOccupancy(data);
    } catch (err: any) {
      alert(`Failed to parse AppFolio template: ${err.message}`);
    }
  }

  function handleExport(billId: string) {
    const bill = bills.find((b) => b.id === billId);
    if (!bill) return;
    const headers = ["Unit", "Tenant", "Sq Ft", "Occupants", "Share %", "Amount"];
    const rows = bill.allocations.map((a) => [
      a.unitName, a.tenant, a.sqft.toString(), a.occupants.toString(),
      (a.share * 100).toFixed(1), a.amount.toFixed(2),
    ]);
    const totalAmount = bill.allocations.reduce((sum, a) => sum + a.amount, 0);
    rows.push(["TOTAL", "", "", "", "100.0", totalAmount.toFixed(2)]);
    const csv = [
      `# ${bill.propertyName} - ${bill.meterType.toUpperCase()} - ${bill.month}`,
      `# Total Bill: $${bill.totalAmount.toFixed(2)}`,
      "",
      headers.join(","),
      ...rows.map((r) => r.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rubs-${bill.propertyName.replace(/\s/g, "-")}-${bill.meterType}-${bill.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
        bills={bills}
        occupancy={occupancy}
        onBack={() => setSelected(null)}
        onPost={() => handlePostBill(selected)}
        onExport={() => handleExport(selected.id)}
        onRecalculate={(method: SplitMethod) => {
          const mapping = getMeterMappingById(selected.mappingId);
          if (!mapping) return;
          const allocs = calculateAllocations({
            totalAmount: selected.totalAmount,
            mapping,
            units,
            splitMethod: method,
          });
          const updated: RubsBill = {
            ...selected,
            allocations: allocs,
            status: "calculated",
            updatedAt: new Date().toISOString(),
          };
          saveBillToStorage(updated);
          setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
          setSelected(updated);
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
            onClick={() => { setShowImport(!showImport); setShowCreateForm(false); }}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            {showImport ? "Cancel Import" : "Import Bills"}
          </button>
          {bills.filter((b) => b.status === "draft").length > 0 && (
            <button
              onClick={() => handleCalculateAll("occupancy")}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              title="Calculate allocations for all draft bills using By Occupancy"
            >
              Calculate All ({bills.filter((b) => b.status === "draft").length})
            </button>
          )}
          <button
            onClick={() => { setShowCreateForm(!showCreateForm); setShowImport(false); }}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showCreateForm ? "Cancel" : "+ New Bill"}
          </button>
        </div>
      </div>

      {/* AppFolio Template Status */}
      <input
        ref={templateInputRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls"
        onChange={handleTemplateUpload}
        className="hidden"
      />
      <div className={`rounded-lg px-4 py-3 flex items-center justify-between text-sm ${
        occupancy
          ? Math.floor((Date.now() - new Date(occupancy.importedAt).getTime()) / 86400000) > 30
            ? "bg-amber-50 border border-amber-200"
            : "bg-green-50 border border-green-200"
          : "bg-slate-50 border border-border"
      }`}>
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${occupancy ? "bg-green-500" : "bg-slate-400"}`} />
          <span>
            {occupancy ? (
              <>
                <strong>AppFolio template loaded:</strong> {occupancy.records.length} tenants from{" "}
                <em>{occupancy.filename}</em> &middot; Imported{" "}
                {new Date(occupancy.importedAt).toLocaleDateString()}
                {Math.floor((Date.now() - new Date(occupancy.importedAt).getTime()) / 86400000) > 30 && (
                  <span className="text-amber-700 ml-2">(stale — refresh recommended)</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                No AppFolio template loaded. Upload the Bulk Charges template to enable export.
              </span>
            )}
          </span>
        </div>
        <button
          onClick={() => templateInputRef.current?.click()}
          className="px-3 py-1 text-xs border border-border rounded hover:bg-white transition-colors whitespace-nowrap"
        >
          {occupancy ? "Refresh Template" : "Upload Template"}
        </button>
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

      {/* Import Flow */}
      {showImport && (
        <ImportBillsFlow
          propertyNames={propertyNames}
          mappings={mappings}
          onImported={(newBills) => {
            setBills((prev) => [...prev, ...newBills]);
            setShowImport(false);
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
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {bill.sourceFile && (
                        <a
                          href={`/api/rubs/pdf?file=${encodeURIComponent(bill.sourceFile)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-accent hover:underline mr-3"
                          title="View original bill PDF"
                        >
                          PDF
                        </a>
                      )}
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
  // Find matching mapping
  const mapping = mappings.find(
    (m) => m.propertyName === propertyName && m.meterType === meterType
  );

  // Available meter types for selected property
  const availableMeters = mappings
    .filter((m) => m.propertyName === propertyName)
    .map((m) => m.meterType);

  function handleCreate() {
    if (!propertyName || totalAmount <= 0 || !mapping) return;

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

    saveBillToStorage(bill);
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
        disabled={!propertyName || totalAmount <= 0 || !mapping}
        className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
      >
        Create Bill
      </button>
    </div>
  );
}

// ─── Bill Detail View ────────────────────────────────────────

function BillDetailView({
  bill,
  bills,
  occupancy,
  onBack,
  onPost,
  onExport,
  onRecalculate,
}: {
  bill: RubsBill;
  bills: RubsBill[];
  occupancy: OccupancyData | null;
  onBack: () => void;
  onPost: () => void;
  onExport: () => void;
  onRecalculate: (method: SplitMethod) => void;
}) {
  const [recalcMethod, setRecalcMethod] = useState<SplitMethod | "">("");
  const [recalculating, setRecalculating] = useState(false);
  const [showAppFolioExport, setShowAppFolioExport] = useState(false);

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
            {bill.sourceFile && (
              <>
                {" "}&middot;{" "}
                <a
                  href={`/api/rubs/pdf?file=${encodeURIComponent(bill.sourceFile)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline"
                >
                  View Original PDF
                </a>
              </>
            )}
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
            onClick={() => {
              if (!recalcMethod) return;
              setRecalculating(true);
              onRecalculate(recalcMethod);
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
            onClick={() => setShowAppFolioExport(!showAppFolioExport)}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showAppFolioExport ? "Hide Export" : "Export for AppFolio"}
          </button>
        )}
        {bill.allocations.length > 0 && (
          <button
            onClick={onExport}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Export Raw CSV
          </button>
        )}
        {bill.status === "calculated" && (
          <button
            onClick={onPost}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Mark as Posted
          </button>
        )}
      </div>

      {/* AppFolio Export Panel */}
      {showAppFolioExport && (
        <AppFolioExportPanel
          bill={bill}
          bills={bills}
          occupancy={occupancy}
        />
      )}
    </div>
  );
}

// ─── Import Bills Flow ───────────────────────────────────────

type ImportStep = "scan" | "parsing" | "preview";

function ImportBillsFlow({
  propertyNames,
  mappings,
  onImported,
}: {
  propertyNames: string[];
  mappings: MeterMapping[];
  onImported: (bills: RubsBill[]) => void;
}) {
  const [step, setStep] = useState<ImportStep>("scan");
  const [files, setFiles] = useState<ImportFileInfo[]>([]);
  const [scannedFolder, setScannedFolder] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [parsedBills, setParsedBills] = useState<ParsedBill[]>([]);
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState("");
  const [showCoworkInstructions, setShowCoworkInstructions] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);

  async function scanFolder() {
    setScanLoading(true);
    setError("");
    setShowCoworkInstructions(false);
    try {
      const res = await fetch("/api/rubs/import");
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || `Scan failed (HTTP ${res.status})`);
        setScannedFolder(null);
      } else {
        setFiles(data.files || []);
        setScannedFolder(data.folder || "(unknown)");
      }
    } catch (err: any) {
      setError(err.message || "Failed to scan folder");
      setScannedFolder(null);
    } finally {
      setScanLoading(false);
    }
  }

  async function parseSelected() {
    const filesToParse = Array.from(selectedFiles);
    if (filesToParse.length === 0) return;

    setStep("parsing");
    setParseProgress({ current: 0, total: filesToParse.length });
    const allParsed: ParsedBill[] = [];

    for (let i = 0; i < filesToParse.length; i++) {
      setParseProgress({ current: i + 1, total: filesToParse.length });
      try {
        const res = await fetch("/api/rubs/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: filesToParse[i], knownProperties: propertyNames }),
        });
        const data = await res.json();
        if (data.results) {
          allParsed.push(...data.results);
        } else if (data.error) {
          allParsed.push({
            utilityProvider: "Error",
            serviceAddress: data.error,
            matchedProperty: null,
            totalAmount: 0,
            billingPeriod: "",
            meterType: "water",
            accountNumber: "",
            confidence: 0,
            sourceFile: filesToParse[i],
          });
        }
      } catch {
        // skip failed files
      }
    }

    setParsedBills(allParsed);
    setStep("preview");
  }

  function handleSaveImported() {
    const validBills = parsedBills.filter((p) => p.matchedProperty && p.totalAmount > 0 && p.billingPeriod);
    const newBills: RubsBill[] = validBills.map((p) => {
      const mapping = mappings.find((m) => m.propertyName === p.matchedProperty && m.meterType === p.meterType);
      const bill: RubsBill = {
        id: `bill-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        propertyName: p.matchedProperty!,
        month: p.billingPeriod,
        meterType: p.meterType,
        totalAmount: p.totalAmount,
        mappingId: mapping?.id || "",
        status: "draft",
        allocations: [],
        sourceFile: p.sourceFile,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      saveBillToStorage(bill);
      return bill;
    });
    onImported(newBills);
  }

  function toggleFile(name: string) {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function updateParsedBill(index: number, field: keyof ParsedBill, value: string | number) {
    setParsedBills((prev) => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  }

  // ─── Scan Step ──────────────────────────────────────────
  if (step === "scan") {
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h2 className="font-semibold">Import Utility Bills</h2>
        <p className="text-sm text-muted-foreground">
          Scan your bills folder for PDFs, then AI will extract billing data automatically.
        </p>

        <div className="flex items-center gap-3">
          <button
            onClick={scanFolder}
            disabled={scanLoading}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {scanLoading ? "Scanning..." : "Scan Folder for New Bills"}
          </button>
          <button
            onClick={() => setShowCoworkInstructions(!showCoworkInstructions)}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Need to download new bills?
          </button>
        </div>

        {showCoworkInstructions && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm text-blue-900">Download bills with Cowork</h3>
            <ol className="text-sm text-blue-900 space-y-2 list-decimal list-inside">
              <li>
                Open <strong>Cowork</strong> on the always-on Windows computer.
              </li>
              <li>
                Mount this folder when starting the session:
                <code className="block mt-1 px-2 py-1 bg-blue-100 rounded text-xs font-mono break-all">
                  C:\Users\deniz\Simpatico Systems Dropbox\Brad Management\MOXIE MANAGEMENT\AI\RUBs\Utility Bills
                </code>
              </li>
              <li>
                Tell Cowork: <em>&quot;Download this month&apos;s LADWP and SoCal Gas bills for all
                accounts and save them to the mounted folder.&quot;</em>
              </li>
              <li>
                Wait for Cowork to finish (usually a few minutes). Bills will sync to Dropbox
                automatically.
              </li>
              <li>
                Click <strong>I&apos;ve Downloaded the Bills</strong> below to scan the folder and
                continue with AI parsing.
              </li>
            </ol>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={scanFolder}
                disabled={scanLoading}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                {scanLoading ? "Scanning..." : "I've Downloaded the Bills — Scan Now"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {files.length > 0 && (
          <>
            <div className="border border-border rounded-lg divide-y divide-border max-h-64 overflow-y-auto">
              {files.map((f) => (
                <label
                  key={f.name}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(f.name)}
                    onChange={() => toggleFile(f.name)}
                    className="rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {(f.size / 1024).toFixed(0)} KB &middot; {new Date(f.modified).toLocaleDateString()}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSelectedFiles(new Set(files.map((f) => f.name)))}
                className="text-xs text-accent hover:underline"
              >
                Select All ({files.length})
              </button>
              <button
                onClick={parseSelected}
                disabled={selectedFiles.size === 0}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                Parse {selectedFiles.size} File{selectedFiles.size !== 1 ? "s" : ""} with AI
              </button>
            </div>
          </>
        )}

        {files.length === 0 && !scanLoading && !error && !showCoworkInstructions && scannedFolder && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-2">
            <p className="font-semibold text-amber-900">No PDFs found in the folder</p>
            <p className="text-amber-800 text-xs break-all">Scanned: <code>{scannedFolder}</code></p>
            <p className="text-amber-800">
              Either the folder is empty, Dropbox hasn&apos;t finished syncing yet, or the files
              don&apos;t have a <code>.pdf</code> extension. Make sure Cowork saved the bills to
              the exact path above.
            </p>
          </div>
        )}

        {files.length === 0 && !scanLoading && !error && !showCoworkInstructions && !scannedFolder && (
          <p className="text-sm text-muted-foreground">
            Click &quot;Scan Folder for New Bills&quot; if Cowork has already downloaded bills, or
            click &quot;Need to download new bills?&quot; for instructions.
          </p>
        )}
      </div>
    );
  }

  // ─── Parsing Step ───────────────────────────────────────
  if (step === "parsing") {
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <h2 className="font-semibold">Parsing Bills with AI...</h2>
        <div className="w-full bg-muted rounded-full h-2">
          <div
            className="bg-accent h-2 rounded-full transition-all duration-500"
            style={{ width: `${(parseProgress.current / parseProgress.total) * 100}%` }}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Processing {parseProgress.current} of {parseProgress.total} files...
        </p>
      </div>
    );
  }

  // ─── Preview Step ───────────────────────────────────────
  const validCount = parsedBills.filter((p) => p.matchedProperty && p.totalAmount > 0 && p.billingPeriod).length;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold">Review Extracted Bills ({parsedBills.length} found)</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Verify and edit the extracted data before importing. Rows with missing property matches will be skipped.
        </p>
      </div>
      {parsedBills.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium">Source File</th>
                <th className="text-left px-4 py-3 font-medium">Provider</th>
                <th className="text-left px-4 py-3 font-medium">Property</th>
                <th className="text-left px-4 py-3 font-medium">Utility</th>
                <th className="text-left px-4 py-3 font-medium">Month</th>
                <th className="text-right px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Account #</th>
              </tr>
            </thead>
            <tbody>
              {parsedBills.map((p, i) => {
                const hasMatch = Boolean(p.matchedProperty);
                return (
                  <tr key={i} className={`border-b border-border last:border-0 ${!hasMatch ? "bg-amber-50" : ""}`}>
                    <td className="px-4 py-2 text-xs text-muted-foreground max-w-32 truncate">{p.sourceFile}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.utilityProvider}</td>
                    <td className="px-4 py-2">
                      <select
                        value={p.matchedProperty || ""}
                        onChange={(e) => updateParsedBill(i, "matchedProperty", e.target.value)}
                        className={`text-xs border rounded px-2 py-1 w-full ${hasMatch ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}
                      >
                        <option value="">No match</option>
                        {propertyNames.map((name) => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                      {p.serviceAddress && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate" title={p.serviceAddress}>
                          {p.serviceAddress}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={p.meterType}
                        onChange={(e) => updateParsedBill(i, "meterType", e.target.value)}
                        className="text-xs border border-border rounded px-2 py-1"
                      >
                        {(Object.entries(METER_TYPE_LABELS) as [MeterType, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="month"
                        value={p.billingPeriod}
                        onChange={(e) => updateParsedBill(i, "billingPeriod", e.target.value)}
                        className="text-xs border border-border rounded px-2 py-1"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        value={p.totalAmount || ""}
                        onChange={(e) => updateParsedBill(i, "totalAmount", parseFloat(e.target.value) || 0)}
                        className="text-xs border border-border rounded px-2 py-1 w-24 text-right"
                      />
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.accountNumber}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-sm text-muted-foreground">
          No billing data could be extracted from the selected files.
        </div>
      )}
      <div className="p-4 border-t border-border flex items-center justify-between">
        <button
          onClick={() => setStep("scan")}
          className="text-sm text-accent hover:underline"
        >
          &larr; Back to file selection
        </button>
        <button
          onClick={handleSaveImported}
          disabled={validCount === 0}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          Import {validCount} Bill{validCount !== 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

// ─── AppFolio Export Panel ────────────────────────────────────

function AppFolioExportPanel({
  bill,
  bills,
  occupancy,
}: {
  bill: RubsBill;
  bills: RubsBill[];
  occupancy: OccupancyData | null;
}) {
  const recon = reconcile([bill], occupancy);
  const errors = recon.issues.filter((i) => i.severity === "error");
  const warnings = recon.issues.filter((i) => i.severity === "warning");

  function downloadExport() {
    if (!occupancy) return;
    const { csv, rows, errors: exportErrors } = generateAppFolioExport(
      [bill],
      bill.meterType,
      occupancy,
      bill.month
    );
    if (exportErrors.length > 0) {
      const proceed = confirm(
        `${exportErrors.length} allocation(s) could not be matched:\n\n${exportErrors.join("\n")}\n\nDownload anyway (unmatched entries will be skipped)?`
      );
      if (!proceed) return;
    }
    if (rows.length === 0) {
      alert("No rows to export. Fix the issues above first.");
      return;
    }
    const total = getExportTotal(rows);
    const blob = new Blob([csv], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appfolio-${bill.meterType}-${bill.propertyName.replace(/\s/g, "-")}-${bill.month}.tsv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllUtilities() {
    if (!occupancy) return;
    const types: MeterType[] = ["water", "gas", "electric", "trash"];
    let downloadCount = 0;
    for (const type of types) {
      const { csv, rows } = generateAppFolioExport(bills, type, occupancy, bill.month);
      if (rows.length === 0) continue;
      const blob = new Blob([csv], { type: "text/tab-separated-values" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `appfolio-${type}-all-properties-${bill.month}.tsv`;
      a.click();
      URL.revokeObjectURL(url);
      downloadCount++;
    }
    if (downloadCount === 0) alert("No calculated bills found to export.");
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold">Export for AppFolio</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Generates the Bulk Charges upload file matching AppFolio&apos;s template format.
        </p>
      </div>

      {/* Reconciliation */}
      <div className="p-5 space-y-3">
        {!occupancy && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            No AppFolio template loaded. Upload the Bulk Charges template at the top of the RUBs page first.
          </div>
        )}

        {occupancy && (
          <>
            {/* Stats */}
            <div className="flex items-center gap-6 text-sm">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-green-500 rounded-full" />
                {recon.matchedCount} matched
              </span>
              {recon.unmatchedAllocations.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-red-500 rounded-full" />
                  {recon.unmatchedAllocations.length} unmatched
                </span>
              )}
              {warnings.length > 0 && (
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-amber-500 rounded-full" />
                  {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
                </span>
              )}
              <span className="text-xs text-muted-foreground">
                Template: {recon.templateAge < 999 ? `${recon.templateAge} day${recon.templateAge !== 1 ? "s" : ""} old` : "not loaded"}
              </span>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-900 mb-1">Errors — these tenants will be MISSING from the export</p>
                <ul className="text-xs text-red-700 list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                  {errors.map((e, i) => (
                    <li key={i}>{e.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Warnings */}
            {warnings.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-amber-900 mb-1">Warnings</p>
                <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5 max-h-32 overflow-y-auto">
                  {warnings.map((w, i) => (
                    <li key={i}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Export Actions */}
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={downloadExport}
                disabled={recon.matchedCount === 0}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                Download {METER_TYPE_LABELS[bill.meterType]} Upload ({recon.matchedCount} tenant{recon.matchedCount !== 1 ? "s" : ""})
              </button>
              <button
                onClick={downloadAllUtilities}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Download All Utilities ({bill.month})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
