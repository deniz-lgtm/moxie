"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePortfolio } from "@/contexts/PortfolioContext";
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
  PropertyAlias,
} from "@/lib/rubs-types";
import { METER_TYPE_LABELS, SPLIT_METHOD_LABELS } from "@/lib/rubs-types";
import {
  getMeterMappings,
  getMeterMappingById,
  getBills,
  getBillByFileHash,
  saveBill as saveBillToStorage,
  deleteBill as deleteBillFromStorage,
  getOccupancyData,
  saveOccupancyData,
  getPropertyAliases,
  migrateLocalToSupabaseIfNeeded,
  clearWorkspaceData,
} from "@/lib/rubs-db";
import { seedRubsData } from "@/lib/rubs-seed";
import { calculateAllocations } from "@/lib/rubs-calc";
import {
  parseAppFolioTemplate,
  reconcile,
  generateAppFolioExport,
  getExportTotal,
} from "@/lib/rubs-appfolio-export";
import {
  uploadBillPdf,
  deleteAllBillPdfs,
  hashFile,
  listBillPdfs,
  deleteBillPdf,
  type StoredBillFile,
} from "@/lib/rubs-storage";

// ─── Workflow guide ────────────────────────────────────────────
// New users land on a wall of buttons with no sense of the order of
// operations. This status-aware checklist orients them: it shows the five
// steps of the RUBS pipeline, marks what's done, and surfaces the next action.

function WorkflowGuide({
  mappingsConfigured,
  hasTemplate,
  billCount,
  calculatedCount,
  postedCount,
  onImport,
  onUploadTemplate,
  onExport,
}: {
  mappingsConfigured: number;
  hasTemplate: boolean;
  billCount: number;
  calculatedCount: number;
  postedCount: number;
  onImport: () => void;
  onUploadTemplate: () => void;
  onExport: () => void;
}) {
  const steps = [
    {
      title: "Configure meters",
      desc: "Map each utility meter to the units it serves. Do this once per property.",
      done: mappingsConfigured > 0,
      action: (
        <Link href="/rubs/settings" className="text-xs font-medium text-accent hover:underline whitespace-nowrap">
          Open Settings →
        </Link>
      ),
    },
    {
      title: "Load AppFolio template",
      desc: "Upload the blank Bulk Charges template so exported charges line up with AppFolio.",
      done: hasTemplate,
      action: (
        <button onClick={onUploadTemplate} className="text-xs font-medium text-accent hover:underline whitespace-nowrap">
          Upload template →
        </button>
      ),
    },
    {
      title: "Import bills",
      desc: "Drop in this cycle's utility PDFs — AI reads the amount, dates, and meter.",
      done: billCount > 0,
      action: (
        <button onClick={onImport} className="text-xs font-medium text-accent hover:underline whitespace-nowrap">
          Import bills →
        </button>
      ),
    },
    {
      title: "Review & calculate",
      desc: "Open each bill to check how the cost splits across tenants before exporting.",
      done: calculatedCount > 0,
      action: null,
    },
    {
      title: "Export to AppFolio",
      desc: "Send the calculated charges back to AppFolio to bill the students.",
      done: postedCount > 0,
      action: (
        <button onClick={onExport} className="text-xs font-medium text-accent hover:underline whitespace-nowrap">
          Export →
        </button>
      ),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;
  const allDone = doneCount === steps.length;
  // First not-yet-done step is the user's current focus.
  const currentIdx = steps.findIndex((s) => !s.done);
  const [open, setOpen] = useState(!allDone);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${allDone ? "bg-green-100 text-green-700" : "bg-accent/10 text-accent"}`}>
            {allDone ? "✓" : `${doneCount}/${steps.length}`}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {allDone ? "You're all set up" : "How RUBS works"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {allDone
                ? "Setup complete — import this cycle's bills to begin."
                : currentIdx >= 0
                ? `Next: ${steps[currentIdx].title}`
                : "Follow these steps to bill utilities."}
            </p>
          </div>
        </div>
        <span className={`shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
        </span>
      </button>

      {open && (
        <ol className="border-t border-border divide-y divide-border">
          {steps.map((s, i) => {
            const isCurrent = i === currentIdx;
            return (
              <li
                key={s.title}
                className={`flex items-start gap-3 px-4 sm:px-5 py-3 ${isCurrent ? "bg-accent/5" : ""}`}
              >
                <span
                  className={`shrink-0 mt-0.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
                    s.done
                      ? "bg-green-100 text-green-700"
                      : isCurrent
                      ? "bg-accent text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm font-medium ${s.done ? "text-muted-foreground" : ""}`}>{s.title}</p>
                    {!s.done && isCurrent && s.action}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────

export default function RubsPage() {
  const { portfolioId } = usePortfolio();
  const [units, setUnits] = useState<Unit[]>([]);
  const [bills, setBills] = useState<RubsBill[]>([]);
  const [mappings, setMappings] = useState<MeterMapping[]>([]);
  const [selected, setSelected] = useState<RubsBill | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showPdfLibrary, setShowPdfLibrary] = useState(false);
  const [loading, setLoading] = useState(true);
  const [seeded, setSeeded] = useState(true);
  const [filterMonth, setFilterMonth] = useState("");
  const [filterProperty, setFilterProperty] = useState("");
  const [occupancy, setOccupancy] = useState<OccupancyData | null>(null);
  const [aliases, setAliases] = useState<PropertyAlias[]>([]);
  const templateInputRef = useRef<HTMLInputElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Units from AppFolio API; RUBS data from Supabase (or localStorage fallback)
      const unitsRes = await fetch(`/api/appfolio/units?portfolio_id=${portfolioId}`).then((r) => r.json()).catch(() => ({ units: [] }));
      setUnits(unitsRes.units || []);

      // One-time migration of any existing localStorage data to Supabase
      const migration = await migrateLocalToSupabaseIfNeeded();
      if (migration.migrated && migration.counts) {
        console.log("[RUBS] Migrated localStorage to Supabase:", migration.counts);
      }

      const [localBills, localMappings, localOccupancy, localAliases] = await Promise.all([
        getBills(),
        getMeterMappings(),
        getOccupancyData(),
        getPropertyAliases(),
      ]);
      setBills(localBills);
      setMappings(localMappings);
      setOccupancy(localOccupancy);
      setAliases(localAliases);
      setSeeded(localBills.length > 0 || localMappings.length > 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSeed() {
    setLoading(true);
    await seedRubsData();
    setBills(await getBills());
    setMappings(await getMeterMappings());
    setSeeded(true);
    setLoading(false);
  }

  async function handleDeleteBill(id: string) {
    await deleteBillFromStorage(id);
    setBills((prev) => prev.filter((b) => b.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  async function handlePostBill(bill: RubsBill) {
    const updated: RubsBill = { ...bill, status: "posted", updatedAt: new Date().toISOString() };
    await saveBillToStorage(updated);
    setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    setSelected(updated);
  }

  async function handleClearAll() {
    const billCount = bills.length;
    const hasOccupancy = Boolean(occupancy);
    const summary = [
      billCount > 0 && `${billCount} bill${billCount !== 1 ? "s" : ""}`,
      hasOccupancy && "the AppFolio template",
      "every uploaded PDF",
    ].filter(Boolean).join(", ");
    const ok = confirm(
      `Clear ${summary}?\n\nMeter mappings and property aliases are kept. This cannot be undone.`,
    );
    if (!ok) return;
    setLoading(true);
    try {
      await clearWorkspaceData();
      const removed = await deleteAllBillPdfs();
      setBills([]);
      setOccupancy(null);
      setSelected(null);
      setShowImport(false);
      setShowExport(false);
      alert(
        `Cleared. ${billCount} bill${billCount !== 1 ? "s" : ""} and ${removed} PDF${removed !== 1 ? "s" : ""} removed. Upload a fresh template and bills to start the next cycle.`,
      );
    } catch (err: any) {
      alert(`Clear failed: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleCalculateAll(method: SplitMethod = "occupancy") {
    const draftBills = bills.filter((b) => b.status === "draft");
    if (draftBills.length === 0) {
      alert("No draft bills to calculate.");
      return;
    }
    if (!confirm(`Calculate allocations for ${draftBills.length} draft bill${draftBills.length !== 1 ? "s" : ""} using "${SPLIT_METHOD_LABELS[method]}"?`)) return;

    let calculated = 0;
    let skipped = 0;
    const updates: RubsBill[] = [];
    for (const b of bills) {
      if (b.status !== "draft") {
        updates.push(b);
        continue;
      }
      const mapping = await getMeterMappingById(b.mappingId);
      if (!mapping) {
        skipped++;
        updates.push(b);
        continue;
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
      await saveBillToStorage(updated);
      calculated++;
      updates.push(updated);
    }
    setBills(updates);
    alert(`Calculated ${calculated} bill${calculated !== 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} skipped — no meter mapping found)` : ""}.`);
  }

  async function handleTemplateUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (templateInputRef.current) templateInputRef.current.value = "";
    if (!file) return;
    try {
      const data = await parseAppFolioTemplate(file);
      await saveOccupancyData(data);
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
        aliases={aliases}
        onBack={() => setSelected(null)}
        onPost={() => handlePostBill(selected)}
        onExport={() => handleExport(selected.id)}
        onUpdate={async (updates) => {
          const updated: RubsBill = {
            ...selected,
            ...updates,
            updatedAt: new Date().toISOString(),
          };
          await saveBillToStorage(updated);
          setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
          setSelected(updated);
        }}
        onRecalculate={async (method: SplitMethod) => {
          const mapping = await getMeterMappingById(selected.mappingId);
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
          await saveBillToStorage(updated);
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
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/rubs/settings"
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Settings
          </Link>
          {(bills.length > 0 || occupancy) && (
            <button
              onClick={handleClearAll}
              className="px-4 py-2 text-sm border border-red-200 text-red-700 rounded-lg hover:bg-red-50 transition-colors"
              title="Wipe all bills, uploaded PDFs, and the AppFolio template. Meter mappings stay."
            >
              Clear All
            </button>
          )}
          <button
            onClick={() => { setShowPdfLibrary(!showPdfLibrary); setShowImport(false); setShowExport(false); }}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            {showPdfLibrary ? "Hide PDFs" : "Stored PDFs"}
          </button>
          <button
            onClick={() => { setShowExport(!showExport); setShowImport(false); setShowPdfLibrary(false); }}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            {showExport ? "Cancel Export" : "Export to AppFolio"}
          </button>
          {bills.filter((b) => b.status === "draft").length > 0 && (
            <button
              onClick={() => handleCalculateAll("occupancy")}
              className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              title="Calculate allocations for any draft bills (no meter mapping was found at import time)"
            >
              Calculate All ({bills.filter((b) => b.status === "draft").length})
            </button>
          )}
          <button
            onClick={() => { setShowImport(!showImport); setShowExport(false); }}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showImport ? "Cancel Import" : "Import Bills"}
          </button>
        </div>
      </div>

      {/* Getting-started workflow guide */}
      <WorkflowGuide
        mappingsConfigured={propertiesConfigured}
        hasTemplate={!!occupancy}
        billCount={bills.length}
        calculatedCount={bills.filter((b) => b.status === "calculated" || b.status === "posted").length}
        postedCount={bills.filter((b) => b.status === "posted").length}
        onImport={() => { setShowImport(true); setShowExport(false); setShowPdfLibrary(false); }}
        onUploadTemplate={() => templateInputRef.current?.click()}
        onExport={() => { setShowExport(true); setShowImport(false); setShowPdfLibrary(false); }}
      />

      {/* AppFolio Template Status */}
      <input
        ref={templateInputRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls"
        onChange={handleTemplateUpload}
        className="hidden"
      />
      {/* Once a template is loaded, keep showing the status (and the stale
          warning). Brand-new users get the prompt from the workflow guide
          instead, so we don't double up "upload template" calls-to-action. */}
      {occupancy && (
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
      )}

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

      {/* Import Flow */}
      {showImport && (
        <ImportBillsFlow
          propertyNames={propertyNames}
          mappings={mappings}
          aliases={aliases}
          units={units}
          existingBills={bills}
          occupancyRecords={occupancy?.records || []}
          onImported={(newBills) => {
            setBills((prev) => [...prev, ...newBills]);
            setShowImport(false);
          }}
        />
      )}

      {/* Export All Flow */}
      {showExport && (
        <ExportAllPanel
          bills={bills}
          occupancy={occupancy}
          aliases={aliases}
        />
      )}

      {/* Stored PDFs Panel */}
      {showPdfLibrary && (
        <StoredPdfsPanel bills={bills} />
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
      ) : bills.length === 0 ? (
        // No bills at all — point the user at the real next action.
        <div className="text-center py-14 bg-card rounded-xl border border-border">
          <div className="w-12 h-12 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
          </div>
          <p className="text-sm font-semibold">No bills imported yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Import this cycle&apos;s utility PDFs and the system will read the amounts, match each
            bill to a meter, and split the cost across tenants.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <button
              onClick={() => { setShowImport(true); setShowExport(false); setShowPdfLibrary(false); }}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
            >
              Import Bills
            </button>
            {!seeded && (
              <button
                onClick={handleSeed}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
              >
                Load Demo Data
              </button>
            )}
          </div>
        </div>
      ) : (
        // Bills exist but the current filters hide them all.
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-sm text-muted-foreground">No bills match the current filters.</p>
          <button
            onClick={() => { setFilterMonth(""); setFilterProperty(""); }}
            className="text-xs font-medium text-accent hover:underline mt-1"
          >
            Clear filters
          </button>
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

// ─── Bill Detail View ────────────────────────────────────────

function BillDetailView({
  bill,
  bills,
  occupancy,
  aliases,
  onBack,
  onPost,
  onExport,
  onUpdate,
  onRecalculate,
}: {
  bill: RubsBill;
  bills: RubsBill[];
  occupancy: OccupancyData | null;
  aliases: PropertyAlias[];
  onBack: () => void;
  onPost: () => void;
  onExport: () => void;
  onUpdate: (updates: Partial<RubsBill>) => Promise<void>;
  onRecalculate: (method: SplitMethod) => void | Promise<void>;
}) {
  const [recalcMethod, setRecalcMethod] = useState<SplitMethod | "">("");
  const [recalculating, setRecalculating] = useState(false);
  const [showAppFolioExport, setShowAppFolioExport] = useState(false);
  const [editingAllocations, setEditingAllocations] = useState(false);
  const [draftAmounts, setDraftAmounts] = useState<Record<string, number>>({});

  function startEdit() {
    setDraftAmounts(Object.fromEntries(bill.allocations.map((a) => [a.unitId, a.amount])));
    setEditingAllocations(true);
  }
  function cancelEdit() {
    setDraftAmounts({});
    setEditingAllocations(false);
  }
  async function saveEdit() {
    const newAllocations = bill.allocations.map((a) => {
      const amount = draftAmounts[a.unitId] ?? a.amount;
      const share = bill.totalAmount > 0 ? amount / bill.totalAmount : 0;
      return { ...a, amount: Math.round(amount * 100) / 100, share };
    });
    await onUpdate({ allocations: newAllocations });
    cancelEdit();
  }

  const draftTotal = editingAllocations
    ? bill.allocations.reduce((s, a) => s + (draftAmounts[a.unitId] ?? a.amount), 0)
    : 0;
  const draftDelta = editingAllocations
    ? Math.round((draftTotal - bill.totalAmount) * 100) / 100
    : 0;

  const totalAllocated = bill.allocations.reduce((s, a) => s + a.amount, 0);
  const totalTenants = bill.allocations.reduce((s, a) => s + (a.occupants || 0), 0);
  // Only show the Sq Ft column when at least one allocation actually has a
  // sqft value — for occupancy/equal/custom splits it's irrelevant clutter.
  const showSqft = bill.allocations.some((a) => (a.sqft || 0) > 0);

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
          <p className="text-sm text-muted-foreground">Tenants</p>
          <p className="text-2xl font-bold mt-1">{totalTenants}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Avg Per Tenant</p>
          <p className="text-2xl font-bold mt-1">
            ${totalTenants > 0
              ? (bill.totalAmount / totalTenants).toFixed(2)
              : "0.00"}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Allocated</p>
          <p className="text-2xl font-bold mt-1">${totalAllocated.toFixed(2)}</p>
        </div>
      </div>

      {/* Status-aware next step — tells a first-time user what each status
          means and what to do from here. */}
      {(() => {
        const hint =
          bill.status === "draft"
            ? { cls: "bg-amber-50 border-amber-200 text-amber-900", label: "Not split yet", text: "Choose a split method below to divide this bill across the units on its meter." }
            : bill.status === "calculated"
            ? { cls: "bg-blue-50 border-blue-200 text-blue-900", label: "Calculated", text: "Review the per-unit amounts below, then export to AppFolio to post the charges." }
            : { cls: "bg-green-50 border-green-200 text-green-900", label: "Posted", text: "These charges have been exported to AppFolio and billed to tenants." };
        return (
          <div className={`rounded-lg border px-4 py-3 text-sm flex items-start gap-2.5 ${hint.cls}`}>
            <span className="font-semibold shrink-0">{hint.label}:</span>
            <span>{hint.text}</span>
          </div>
        );
      })()}

      {/* Calculate / recalculate split */}
      {bill.status !== "posted" && (() => {
        const isFirstCalc = bill.status === "draft" || bill.allocations.length === 0;
        return (
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={recalcMethod}
              onChange={(e) => setRecalcMethod(e.target.value as SplitMethod)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            >
              <option value="">{isFirstCalc ? "Choose split method…" : "Recalculate with…"}</option>
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
              {recalculating ? "Calculating…" : isFirstCalc ? "Calculate Split" : "Recalculate"}
            </button>
          </div>
        );
      })()}

      {/* Allocations Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold">Unit Allocations</h2>
          {bill.allocations.length > 0 && bill.status !== "posted" && (
            !editingAllocations ? (
              <button
                onClick={startEdit}
                className="text-xs text-accent hover:underline"
              >
                Edit amounts
              </button>
            ) : (
              <div className="flex items-center gap-3 text-xs">
                <span className={draftDelta === 0 ? "text-muted-foreground" : "text-amber-700"}>
                  Draft total ${draftTotal.toFixed(2)} of ${bill.totalAmount.toFixed(2)}
                  {draftDelta !== 0 && ` (${draftDelta > 0 ? "+" : ""}$${draftDelta.toFixed(2)})`}
                </span>
                <button onClick={cancelEdit} className="text-muted-foreground hover:underline">
                  Cancel
                </button>
                <button
                  onClick={saveEdit}
                  className="px-2 py-1 bg-accent text-white rounded hover:bg-accent/90"
                >
                  Save
                </button>
              </div>
            )
          )}
        </div>
        {bill.allocations.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Unit</th>
                  <th className="text-right px-4 py-3 font-medium">Tenants</th>
                  {showSqft && <th className="text-right px-4 py-3 font-medium">Sq Ft</th>}
                  <th className="text-right px-4 py-3 font-medium">Share</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {bill.allocations.map((a) => {
                  const draftAmt = draftAmounts[a.unitId] ?? a.amount;
                  const draftShare = bill.totalAmount > 0 ? draftAmt / bill.totalAmount : a.share;
                  return (
                    <tr key={a.unitId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{a.unitName}</td>
                      <td className="px-4 py-3 text-right text-muted-foreground">{a.occupants}</td>
                      {showSqft && (
                        <td className="px-4 py-3 text-right text-muted-foreground">{a.sqft.toLocaleString()}</td>
                      )}
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {(editingAllocations ? draftShare * 100 : a.share * 100).toFixed(1)}%
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {editingAllocations ? (
                          <input
                            type="number"
                            step="0.01"
                            value={draftAmt}
                            onChange={(e) =>
                              setDraftAmounts((prev) => ({
                                ...prev,
                                [a.unitId]: parseFloat(e.target.value) || 0,
                              }))
                            }
                            className="w-24 text-right border border-border rounded px-2 py-1"
                          />
                        ) : (
                          `$${a.amount.toFixed(2)}`
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted">
                  <td className="px-4 py-3 font-semibold" colSpan={showSqft ? 4 : 3}>Total</td>
                  <td className="px-4 py-3 text-right font-semibold">${totalAllocated.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-5 text-sm text-muted-foreground">
            Not split yet. Choose a split method above and click <strong>Calculate Split</strong> to divide this bill across the units on its meter.
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
        {bill.status === "posted" && (
          <button
            onClick={() => onUpdate({ status: "calculated" })}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
            title="Allow further edits and re-export"
          >
            Mark Unposted
          </button>
        )}
      </div>

      {/* AppFolio Export Panel */}
      {showAppFolioExport && (
        <AppFolioExportPanel
          bill={bill}
          bills={bills}
          occupancy={occupancy}
          aliases={aliases}
        />
      )}
    </div>
  );
}

// ─── Import Bills Flow ───────────────────────────────────────

type ImportStep = "scan" | "parsing" | "preview";

// Compact 3-step indicator so users know where they are in the import flow.
function ImportStepper({ current }: { current: ImportStep }) {
  const steps: { key: ImportStep; label: string }[] = [
    { key: "scan", label: "Upload" },
    { key: "parsing", label: "Parse" },
    { key: "preview", label: "Review" },
  ];
  const currentIdx = steps.findIndex((s) => s.key === current);
  return (
    <div className="flex items-center gap-1.5 text-xs">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={s.key} className="flex items-center gap-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg font-medium ${
                active
                  ? "bg-accent text-white"
                  : done
                  ? "text-green-700"
                  : "text-muted-foreground"
              }`}
            >
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  active ? "bg-white/20 text-white" : done ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                }`}
              >
                {done ? "✓" : i + 1}
              </span>
              {s.label}
            </span>
            {i < steps.length - 1 && <span className={`w-4 h-px ${done ? "bg-green-300" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function ImportBillsFlow({
  propertyNames,
  mappings,
  aliases,
  units,
  existingBills,
  occupancyRecords,
  onImported,
}: {
  propertyNames: string[];
  mappings: MeterMapping[];
  aliases: PropertyAlias[];
  units: Unit[];
  existingBills: RubsBill[];
  occupancyRecords: import("@/lib/rubs-types").OccupancyRecord[];
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
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [uploading, setUploading] = useState({ current: 0, total: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [skippedDuplicates, setSkippedDuplicates] = useState<string[]>([]);
  const [fileHashes, setFileHashes] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(fileList: File[]) {
    const pdfs = fileList.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) {
      setError("No PDF files in the selection.");
      return;
    }
    setError("");
    setSkippedDuplicates([]);
    setUploading({ current: 0, total: pdfs.length });
    const folder = new Date().toISOString().slice(0, 7); // YYYY-MM
    const uploadedPaths: string[] = [];
    const pathHashes: Record<string, string> = {};
    const duplicates: string[] = [];
    for (let i = 0; i < pdfs.length; i++) {
      setUploading({ current: i + 1, total: pdfs.length });
      try {
        const hash = await hashFile(pdfs[i]);
        const existing = await getBillByFileHash(hash);
        if (existing) {
          duplicates.push(`${pdfs[i].name} → already imported as ${existing.propertyName} ${existing.month}`);
          continue;
        }
        const storedPath = await uploadBillPdf(pdfs[i], folder);
        uploadedPaths.push(storedPath);
        pathHashes[storedPath] = hash;
      } catch (err: any) {
        setError(err.message || `Upload failed for ${pdfs[i].name}`);
      }
    }
    setUploading({ current: 0, total: 0 });
    setSkippedDuplicates(duplicates);
    setFileHashes((prev) => ({ ...prev, ...pathHashes }));
    // Auto-parse just the newly uploaded files and land on the review screen.
    if (uploadedPaths.length > 0) {
      await parseSelected(uploadedPaths, pathHashes);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(Array.from(e.dataTransfer.files));
  }

  function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleUpload(Array.from(e.target.files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function inBillingPeriod(p: ParsedBill): boolean {
    if (!periodFrom && !periodTo) return true;
    if (!p.billingPeriod) return false;
    if (periodFrom && p.billingPeriod < periodFrom) return false;
    if (periodTo && p.billingPeriod > periodTo) return false;
    return true;
  }

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

  // Auto-scan the bucket on open so users don't have to click "Refresh"
  // to discover PDFs they've already uploaded. Without this the import
  // screen looks like a fresh upload dropzone even when there are
  // hundreds of PDFs sitting in storage waiting to be parsed.
  useEffect(() => {
    scanFolder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function parseSelected(filenames?: string[], extraHashes?: Record<string, string>) {
    const filesToParse = filenames ?? Array.from(selectedFiles);
    if (filesToParse.length === 0) return;

    const hashLookup = { ...fileHashes, ...(extraHashes || {}) };

    setStep("parsing");
    setParseProgress({ current: 0, total: filesToParse.length });
    const allParsed: ParsedBill[] = [];

    for (let i = 0; i < filesToParse.length; i++) {
      setParseProgress({ current: i + 1, total: filesToParse.length });
      const fileHash = hashLookup[filesToParse[i]];
      try {
        const res = await fetch("/api/rubs/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: filesToParse[i],
            knownProperties: propertyNames,
            aliases,
            fileHash,
            occupancyRecords,
          }),
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
            meterType: "unknown",
            accountNumber: "",
            confidence: 0,
            sourceFile: filesToParse[i],
            fileHash,
          });
        }
      } catch {
        // skip failed files
      }
    }

    setParsedBills(allParsed);
    setStep("preview");
  }

  async function handleSaveImported() {
    const validBills = parsedBills.filter(
      (p) =>
        p.matchedProperty &&
        p.totalAmount > 0 &&
        p.billingPeriod &&
        p.meterType !== "unknown" &&
        inBillingPeriod(p),
    );
    const newBills: RubsBill[] = [];
    const skipped: string[] = [];
    for (const p of validBills) {
      // Hash dedup — skip if we've already saved a bill for this exact PDF.
      if (p.fileHash) {
        const existing = await getBillByFileHash(p.fileHash);
        if (existing) {
          skipped.push(`${p.sourceFile} (already imported as ${existing.propertyName} ${existing.month})`);
          continue;
        }
      }
      // Prefer matching by meter account number (mapping.meterId) when the
      // bill carries one, since a single property+utility can have multiple
      // accounts (e.g. two gas meters serving different unit clusters). Only
      // fall back to property+type when no account match exists.
      const acct = (p.accountNumber || "").trim();
      const acctNorm = acct.replace(/\s|-/g, "").toLowerCase();
      const mapping =
        (acctNorm
          ? mappings.find((m) => m.meterId.replace(/\s|-/g, "").toLowerCase() === acctNorm)
          : undefined) ||
        mappings.find((m) => m.propertyName === p.matchedProperty && m.meterType === p.meterType);
      // Auto-calculate when a meter mapping exists. Skip when there is no
      // mapping — those bills land as drafts so the user knows to set one up.
      const allocations = mapping
        ? calculateAllocations({
            totalAmount: p.totalAmount,
            mapping,
            units,
            splitMethod: mapping.splitMethod,
          })
        : [];
      const bill: RubsBill = {
        id: `bill-import-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        propertyName: p.matchedProperty!,
        month: p.billingPeriod,
        meterType: p.meterType,
        totalAmount: p.totalAmount,
        mappingId: mapping?.id || "",
        status: mapping ? "calculated" : "draft",
        allocations,
        sourceFile: p.sourceFile,
        fileHash: p.fileHash,
        servicePeriodStart: p.servicePeriodStart,
        servicePeriodEnd: p.servicePeriodEnd,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await saveBillToStorage(bill);
      newBills.push(bill);
    }
    if (skipped.length > 0) {
      setSkippedDuplicates((prev) => [...prev, ...skipped]);
    }
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
    const isUploading = uploading.total > 0;
    return (
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <ImportStepper current="scan" />
        <h2 className="font-semibold">Import Utility Bills</h2>
        <p className="text-sm text-muted-foreground">
          Drop PDF bills below. They upload to secure cloud storage, then AI extracts billing data automatically.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            isDragging ? "border-accent bg-accent/5" : "border-border hover:bg-muted/30"
          } ${isUploading ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            onChange={handleFilePick}
            className="hidden"
          />
          {isUploading ? (
            <div className="space-y-2">
              <p className="text-sm font-medium">Uploading {uploading.current} of {uploading.total}...</p>
              <div className="w-full max-w-sm mx-auto bg-muted rounded-full h-2">
                <div
                  className="bg-accent h-2 rounded-full transition-all"
                  style={{ width: `${(uploading.current / uploading.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm font-medium">Drop PDFs here, or click to choose files</p>
              <p className="text-xs text-muted-foreground mt-1">
                Multi-select works. Upload as many bills as you&apos;d like.
              </p>
            </>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowCoworkInstructions(!showCoworkInstructions)}
            className="text-xs text-accent hover:underline"
          >
            How to download bills with Claude Cowork
          </button>
          <button
            onClick={scanFolder}
            disabled={scanLoading || isUploading}
            className="text-xs text-accent hover:underline disabled:opacity-50"
          >
            {scanLoading ? "Refreshing..." : "Refresh list"}
          </button>
        </div>

        {showCoworkInstructions && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm text-blue-900">Typical workflow</h3>
            <ol className="text-sm text-blue-900 space-y-2 list-decimal list-inside">
              <li>
                Open <strong>Claude Cowork</strong> on the Windows computer and ask it to download
                this month&apos;s LADWP and SoCal Gas bills to any local folder (e.g. Downloads or Dropbox).
              </li>
              <li>
                Once Cowork is done, come back to this page and drag the PDFs from that folder into
                the drop zone above. They&apos;ll upload straight to secure cloud storage.
              </li>
              <li>
                Select the ones you want to parse and click <strong>Parse with AI</strong>. Review
                the extracted data before importing.
              </li>
            </ol>
            <p className="text-xs text-blue-800">
              No PowerShell, ngrok tunnels, or local services required — everything happens in your browser.
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        {skippedDuplicates.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <p className="font-semibold mb-1">Skipped {skippedDuplicates.length} duplicate file{skippedDuplicates.length !== 1 ? "s" : ""}:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {skippedDuplicates.slice(0, 10).map((d, i) => (
                <li key={i} className="truncate">{d}</li>
              ))}
              {skippedDuplicates.length > 10 && <li>...and {skippedDuplicates.length - 10} more</li>}
            </ul>
          </div>
        )}

        {files.length > 0 && (
          <>
            <div className="text-xs font-medium text-muted-foreground">
              Already in storage ({files.length}) — pick which to parse:
            </div>
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
                onClick={() => parseSelected()}
                disabled={selectedFiles.size === 0}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                Parse {selectedFiles.size} File{selectedFiles.size !== 1 ? "s" : ""} with AI
              </button>
            </div>
          </>
        )}

        {files.length === 0 && !scanLoading && !error && scannedFolder && uploading.total === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-1">
            <p className="font-semibold text-amber-900">No PDFs stored yet</p>
            <p className="text-amber-800 text-xs">
              Drop PDFs into the box above to upload your first bills.
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
        <ImportStepper current="parsing" />
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
  const validCount = parsedBills.filter(
    (p) =>
      p.matchedProperty &&
      p.totalAmount > 0 &&
      p.billingPeriod &&
      p.meterType !== "unknown" &&
      inBillingPeriod(p),
  ).length;
  const unknownTypeCount = parsedBills.filter((p) => p.meterType === "unknown").length;
  const outOfPeriodCount = parsedBills.filter((p) => p.billingPeriod && !inBillingPeriod(p)).length;

  // Surface meter accounts seen on bills that have no mapping. Account # is
  // the unique key per meter; matching by it (vs property+type) catches the
  // "two gas accounts at one property" case the propertyName lookup misses.
  function findMappingFor(p: ParsedBill): MeterMapping | undefined {
    const acctNorm = (p.accountNumber || "").replace(/\s|-/g, "").toLowerCase();
    if (acctNorm) {
      const byAcct = mappings.find((m) => m.meterId.replace(/\s|-/g, "").toLowerCase() === acctNorm);
      if (byAcct) return byAcct;
    }
    return mappings.find((m) => m.propertyName === p.matchedProperty && m.meterType === p.meterType);
  }
  // YoY anomaly: a parsed bill is flagged when its amount is ≥30% higher
  // than the same property+meter from ~12 months earlier. Helps catch
  // leaks, misreads, or new equipment that needs investigation before
  // tenants get charged the inflated amount.
  function findAnomaly(p: ParsedBill): { lastYear: number; pctIncrease: number } | null {
    if (!p.matchedProperty || !p.billingPeriod || p.totalAmount <= 0) return null;
    const [yStr, mStr] = p.billingPeriod.split("-");
    const lastYearMonth = `${Number(yStr) - 1}-${mStr}`;
    const acctNorm = (p.accountNumber || "").replace(/\s|-/g, "").toLowerCase();
    // Match prior bill via the same mapping when possible (account-based),
    // else fall back to property+meterType.
    const priorMappingId = acctNorm
      ? mappings.find((m) => m.meterId.replace(/\s|-/g, "").toLowerCase() === acctNorm)?.id
      : undefined;
    const prior = existingBills.find((b) =>
      b.month === lastYearMonth &&
      (priorMappingId ? b.mappingId === priorMappingId : (b.propertyName === p.matchedProperty && b.meterType === p.meterType)),
    );
    if (!prior || prior.totalAmount <= 0) return null;
    const pct = (p.totalAmount - prior.totalAmount) / prior.totalAmount;
    if (pct < 0.3) return null;
    return { lastYear: prior.totalAmount, pctIncrease: pct };
  }

  const unmappedAccounts = (() => {
    const seen = new Map<string, { property: string; meterType: string; account: string }>();
    for (const p of parsedBills) {
      if (!p.matchedProperty || p.meterType === "unknown") continue;
      if (findMappingFor(p)) continue;
      const acct = (p.accountNumber || "").trim() || "(no account #)";
      const key = `${p.matchedProperty}|${p.meterType}|${acct}`;
      if (!seen.has(key)) seen.set(key, { property: p.matchedProperty, meterType: p.meterType, account: acct });
    }
    return Array.from(seen.values());
  })();

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border space-y-3">
        <ImportStepper current="preview" />
        <div>
          <h2 className="font-semibold">Review Extracted Bills ({parsedBills.length} found)</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Verify and edit the extracted data before importing. Rows with missing property matches or outside the billing period will be skipped.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-medium">Billing Period:</span>
          <input
            type="month"
            value={periodFrom}
            onChange={(e) => setPeriodFrom(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1"
            placeholder="From"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="month"
            value={periodTo}
            onChange={(e) => setPeriodTo(e.target.value)}
            className="text-xs border border-border rounded px-2 py-1"
            placeholder="To"
          />
          {(periodFrom || periodTo) && (
            <button
              onClick={() => { setPeriodFrom(""); setPeriodTo(""); }}
              className="text-xs text-accent hover:underline"
            >
              Clear
            </button>
          )}
          {outOfPeriodCount > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              {outOfPeriodCount} bill{outOfPeriodCount !== 1 ? "s" : ""} outside this range — will be skipped
            </span>
          )}
          {unknownTypeCount > 0 && (
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
              {unknownTypeCount} bill{unknownTypeCount !== 1 ? "s" : ""} with unknown utility type — pick one to import
            </span>
          )}
        </div>
        {unmappedAccounts.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
            <p className="font-semibold text-amber-900 mb-1">
              {unmappedAccounts.length} unmapped meter account{unmappedAccounts.length !== 1 ? "s" : ""} —
              these bills will save as drafts until you create a mapping.
            </p>
            <ul className="text-amber-900 space-y-0.5">
              {unmappedAccounts.slice(0, 10).map((u, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="truncate">
                    <strong>{u.property}</strong> · {METER_TYPE_LABELS[u.meterType as MeterType]} · acct {u.account}
                  </span>
                  <Link
                    href={`/rubs/settings?addProperty=${encodeURIComponent(u.property)}&addMeterType=${u.meterType}&addAccount=${encodeURIComponent(u.account)}`}
                    className="text-accent hover:underline whitespace-nowrap"
                  >
                    Create mapping →
                  </Link>
                </li>
              ))}
              {unmappedAccounts.length > 10 && (
                <li>...and {unmappedAccounts.length - 10} more</li>
              )}
            </ul>
          </div>
        )}
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
                const outOfPeriod = Boolean(p.billingPeriod) && !inBillingPeriod(p);
                const unknownType = p.meterType === "unknown";
                const anomaly = findAnomaly(p);
                const rowBg = outOfPeriod
                  ? "bg-slate-100 opacity-60"
                  : !hasMatch || unknownType
                    ? "bg-amber-50"
                    : "";
                return (
                  <tr key={i} className={`border-b border-border last:border-0 ${rowBg}`}>
                    <td className="px-4 py-2 text-xs max-w-32 truncate">
                      {p.sourceFile ? (
                        <a
                          href={`/api/rubs/pdf?file=${encodeURIComponent(p.sourceFile)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline"
                          title={p.sourceFile}
                        >
                          {p.sourceFile.split("/").pop()}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
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
                          {p.matchedVia === "address" && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-green-700">addr</span>
                          )}
                          {p.matchedVia === "fuzzy" && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-amber-700">fuzzy</span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={p.meterType}
                        onChange={(e) => updateParsedBill(i, "meterType", e.target.value)}
                        className={`text-xs border rounded px-2 py-1 ${unknownType ? "border-amber-400 bg-amber-50" : "border-border"}`}
                        title={unknownType ? "Utility type couldn't be determined — please pick one" : undefined}
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
                      {anomaly && (
                        <p
                          className="text-[10px] text-amber-700 mt-0.5"
                          title={`Last year same month: $${anomaly.lastYear.toLocaleString()}`}
                        >
                          ↑{Math.round(anomaly.pctIncrease * 100)}% YoY
                        </p>
                      )}
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

// ─── Stored PDFs Library ──────────────────────────────────────
// Shows every PDF currently in Supabase Storage, joined with the bills
// table by sourceFile so each row shows whether it has been imported.
// Lets you view originals and clean up PDFs that haven't been imported
// (either freshly uploaded but never parsed/imported, or imported then
// later bill-deleted).

function StoredPdfsPanel({ bills }: { bills: RubsBill[] }) {
  const [files, setFiles] = useState<StoredBillFile[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "imported" | "orphan">("all");
  const [busy, setBusy] = useState<string | null>(null);

  const billsBySourceFile = new Map(bills.filter((b) => b.sourceFile).map((b) => [b.sourceFile!, b]));

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const list = await listBillPdfs();
      setFiles(list);
    } catch (err: any) {
      setError(err.message || "Failed to list stored PDFs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(path: string) {
    if (!confirm(`Delete ${path}? This removes the PDF from cloud storage permanently.`)) return;
    setBusy(path);
    try {
      await deleteBillPdf(path);
      setFiles((prev) => (prev ? prev.filter((f) => f.name !== path) : prev));
    } catch (err: any) {
      setError(err.message || `Failed to delete ${path}`);
    } finally {
      setBusy(null);
    }
  }

  if (loading && !files) {
    return (
      <div className="bg-card rounded-xl border border-border p-5">
        <p className="text-sm text-muted-foreground">Loading stored PDFs...</p>
      </div>
    );
  }

  const list = files || [];
  const filtered = list.filter((f) => {
    if (filter === "imported") return billsBySourceFile.has(f.name);
    if (filter === "orphan") return !billsBySourceFile.has(f.name);
    return true;
  });
  const importedCount = list.filter((f) => billsBySourceFile.has(f.name)).length;
  const orphanCount = list.length - importedCount;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-semibold">Stored PDFs ({list.length})</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {importedCount} imported · {orphanCount} not yet imported
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "all" | "imported" | "orphan")}
            className="border border-border rounded px-2 py-1 bg-card"
          >
            <option value="all">All ({list.length})</option>
            <option value="imported">Imported ({importedCount})</option>
            <option value="orphan">Not imported ({orphanCount})</option>
          </select>
          <button onClick={load} className="text-accent hover:underline">Refresh</button>
        </div>
      </div>
      {error && <p className="px-5 py-3 text-sm text-red-500">{error}</p>}
      {filtered.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">
          {list.length === 0 ? "No PDFs uploaded yet." : "No PDFs match this filter."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium">File</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Linked Bill</th>
                <th className="text-right px-4 py-3 font-medium">Size</th>
                <th className="text-left px-4 py-3 font-medium">Modified</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((f) => {
                const linked = billsBySourceFile.get(f.name);
                return (
                  <tr key={f.name} className="border-b border-border last:border-0">
                    <td className="px-4 py-2 text-xs max-w-xs">
                      <a
                        href={`/api/rubs/pdf?file=${encodeURIComponent(f.name)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:underline truncate block"
                        title={f.name}
                      >
                        {f.name}
                      </a>
                    </td>
                    <td className="px-4 py-2">
                      {linked ? (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">Imported</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">Not imported</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {linked
                        ? `${linked.propertyName} · ${linked.meterType} · ${linked.month}`
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-muted-foreground">
                      {(f.size / 1024).toFixed(0)} KB
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(f.modified).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {!linked && (
                        <button
                          onClick={() => handleDelete(f.name)}
                          disabled={busy === f.name}
                          className="text-xs text-red-500 hover:underline disabled:opacity-50"
                        >
                          {busy === f.name ? "Deleting..." : "Delete"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Export All Panel (top-level /rubs export) ────────────────

function ExportAllPanel({
  bills,
  occupancy,
  aliases,
}: {
  bills: RubsBill[];
  occupancy: OccupancyData | null;
  aliases: PropertyAlias[];
}) {
  const ALL_TYPES: MeterType[] = ["water", "gas", "electric", "sewer"];
  const postable = bills.filter((b) => b.status === "calculated" || b.status === "posted");
  const months = Array.from(new Set(postable.map((b) => b.month))).sort().reverse();

  const [month, setMonth] = useState(months[0] ?? "");
  const [selected, setSelected] = useState<Set<MeterType>>(new Set(ALL_TYPES));

  const monthBills = postable.filter((b) => b.month === month);
  const recon = reconcile(monthBills, occupancy, aliases);

  function toggle(t: MeterType) {
    const next = new Set(selected);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setSelected(next);
  }

  function triggerDownload(csv: string, filename: string) {
    const blob = new Blob([csv], { type: "text/tab-separated-values" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadSeparate() {
    if (!occupancy) return;
    let count = 0;
    for (const t of ALL_TYPES) {
      if (!selected.has(t)) continue;
      const { csv, rows } = generateAppFolioExport(monthBills, t, occupancy, month, aliases);
      if (rows.length === 0) continue;
      triggerDownload(csv, `appfolio-${t}-${month}.tsv`);
      count++;
    }
    if (count === 0) alert("No calculated bills match the selected utilities for this month.");
  }

  function downloadCombined() {
    if (!occupancy) return;
    const headers = ["Property Name", "Unit Name", "Occupancy UID", "Tenant Name", "Occupancy ID", "Amount", "Description"];
    const lines: string[] = [headers.join("\t")];
    let rowCount = 0;
    for (const t of ALL_TYPES) {
      if (!selected.has(t)) continue;
      const { rows } = generateAppFolioExport(monthBills, t, occupancy, month, aliases);
      for (const r of rows) {
        lines.push([r.propertyName, r.unitName, r.occupancyUid, r.tenantName, r.occupancyId, r.amount, r.description].join("\t"));
        rowCount++;
      }
    }
    if (rowCount === 0) { alert("No rows to export."); return; }
    triggerDownload(lines.join("\n"), `appfolio-combined-${month}.tsv`);
  }

  const perUtility = ALL_TYPES.map((t) => {
    const tBills = monthBills.filter((b) => b.meterType === t);
    return {
      type: t,
      billCount: tBills.length,
      total: tBills.reduce((s, b) => s + b.totalAmount, 0),
    };
  });

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold">Export to AppFolio</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Pick a billing month and which utilities to include. Download one combined file or a separate file per utility.
        </p>
      </div>

      <div className="p-5 space-y-4">
        {!occupancy && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            No AppFolio template loaded. Upload the Bulk Charges template at the top of the RUBs page first.
          </div>
        )}

        {months.length === 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            No calculated bills available to export. Calculate bills first.
          </div>
        )}

        {months.length > 0 && (
          <>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Billing Month:</label>
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {months.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {monthBills.length} bill{monthBills.length !== 1 ? "s" : ""} in this month
              </span>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Utilities to include:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {perUtility.map(({ type, billCount, total }) => (
                  <label
                    key={type}
                    className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer ${
                      selected.has(type) ? "border-accent bg-accent/5" : "border-border"
                    } ${billCount === 0 ? "opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(type)}
                      onChange={() => toggle(type)}
                      disabled={billCount === 0}
                    />
                    <span className="font-medium">{METER_TYPE_LABELS[type]}</span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {billCount > 0 ? `${billCount} · $${total.toFixed(0)}` : "—"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {occupancy && (
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
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={downloadCombined}
                disabled={!occupancy || selected.size === 0}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              >
                Download Combined TSV
              </button>
              <button
                onClick={downloadSeparate}
                disabled={!occupancy || selected.size === 0}
                className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                Download One File per Utility
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AppFolioExportPanel({
  bill,
  bills,
  occupancy,
  aliases,
}: {
  bill: RubsBill;
  bills: RubsBill[];
  occupancy: OccupancyData | null;
  aliases: PropertyAlias[];
}) {
  const recon = reconcile([bill], occupancy, aliases);
  const errors = recon.issues.filter((i) => i.severity === "error");
  const warnings = recon.issues.filter((i) => i.severity === "warning");

  function downloadExport() {
    if (!occupancy) return;
    const { csv, rows, errors: exportErrors } = generateAppFolioExport(
      [bill],
      bill.meterType,
      occupancy,
      bill.month,
      aliases
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
    const types: MeterType[] = ["water", "gas", "electric", "sewer"];
    let downloadCount = 0;
    for (const type of types) {
      const { csv, rows } = generateAppFolioExport(bills, type, occupancy, bill.month, aliases);
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
