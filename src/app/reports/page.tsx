"use client";

import { useState, useEffect, useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import type { Unit, MaintenanceRequest } from "@/lib/types";

type ReportType = "pnl" | "occupancy" | "maintenance_cost" | "rent_roll";
type ReportStatus = "draft" | "generated" | "reviewed" | "sent";

type ReportData = {
  occupancy?: { total: number; occupied: number; vacant: number; notice: number; future: number; rate: string };
  rentRoll?: { units: { name: string; tenant: string | null; rent: string | number | null; status: string; leaseEnd: string | null }[] };
  maintenanceCost?: { categories: { category: string; count: number; totalCost: number }[]; totalSpend: number };
};

type Report = {
  id: string;
  propertyId: string;
  propertyName: string;
  type: ReportType;
  month: string;
  status: ReportStatus;
  createdAt: string;
  notes: string;
  data: ReportData;
};

const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: "pnl", label: "P&L Statement", description: "Income vs expenses for the month" },
  { value: "occupancy", label: "Occupancy Report", description: "Unit status, vacancy rate, lease expirations" },
  { value: "maintenance_cost", label: "Maintenance Costs", description: "Work order costs by category and vendor" },
  { value: "rent_roll", label: "Rent Roll", description: "Current rents, market rents, and deltas" },
];

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);
  const [reports, setReports] = useState<Report[]>(() => loadFromStorage<Report[]>("reports", []));
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [viewingReport, setViewingReport] = useState<Report | null>(null);

  const [newReport, setNewReport] = useState({
    propertyName: "",
    type: "occupancy" as ReportType,
    month: getCurrentMonth(),
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/appfolio/units").then((r) => r.json()).then((d) => setUnits(d.units || [])),
      fetch("/api/appfolio/work-orders").then((r) => r.json()).then((d) => setWorkOrders(d.workOrders || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Persist reports
  useEffect(() => {
    saveToStorage("reports", reports);
  }, [reports]);

  const propertyNames = useMemo(
    () => [...new Set(units.map((u) => u.propertyName).filter(Boolean))],
    [units]
  );

  const filtered = reports.filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    return true;
  });

  function generateReportData(propertyName: string, type: ReportType): ReportData {
    const propUnits = units.filter((u) => u.propertyName === propertyName);
    const propWorkOrders = workOrders.filter((w) => w.propertyName === propertyName);

    switch (type) {
      case "occupancy": {
        const occupied = propUnits.filter((u) => u.status === "current").length;
        const vacant = propUnits.filter((u) => u.status === "vacant").length;
        const notice = propUnits.filter((u) => u.status === "notice").length;
        const future = propUnits.filter((u) => u.status === "future").length;
        const rate = propUnits.length > 0 ? ((occupied + notice) / propUnits.length * 100).toFixed(1) : "0";
        return {
          occupancy: { total: propUnits.length, occupied, vacant, notice, future, rate: `${rate}%` },
        };
      }

      case "rent_roll": {
        return {
          rentRoll: {
            units: propUnits.map((u) => ({
              name: u.unitName || u.displayName,
              tenant: u.tenant,
              rent: u.rent,
              status: u.status,
              leaseEnd: u.leaseTo,
            })),
          },
        };
      }

      case "maintenance_cost": {
        const catMap: Record<string, { count: number; totalCost: number }> = {};
        for (const wo of propWorkOrders) {
          const cat = wo.category || "general";
          if (!catMap[cat]) catMap[cat] = { count: 0, totalCost: 0 };
          catMap[cat].count++;
          catMap[cat].totalCost += wo.actualCost || wo.estimatedCost || 0;
        }
        const categories = Object.entries(catMap)
          .map(([category, data]) => ({ category, ...data }))
          .sort((a, b) => b.totalCost - a.totalCost);
        const totalSpend = categories.reduce((sum, c) => sum + c.totalCost, 0);
        return { maintenanceCost: { categories, totalSpend } };
      }

      case "pnl": {
        // P&L: estimate income from rents, expenses from maintenance
        const monthlyIncome = propUnits.reduce((sum, u) => {
          const rent = typeof u.rent === "number" ? u.rent : parseFloat(String(u.rent || "0").replace(/[^0-9.]/g, "")) || 0;
          return sum + (u.status === "current" || u.status === "notice" ? rent : 0);
        }, 0);
        const maintenanceCost = propWorkOrders.reduce((sum, wo) => sum + (wo.actualCost || wo.estimatedCost || 0), 0);
        return {
          occupancy: {
            total: propUnits.length,
            occupied: propUnits.filter((u) => u.status === "current").length,
            vacant: propUnits.filter((u) => u.status === "vacant").length,
            notice: propUnits.filter((u) => u.status === "notice").length,
            future: propUnits.filter((u) => u.status === "future").length,
            rate: `$${monthlyIncome.toLocaleString()} income / $${maintenanceCost.toLocaleString()} expenses`,
          },
        };
      }

      default:
        return {};
    }
  }

  function createReport() {
    if (!newReport.propertyName) return;

    const data = generateReportData(newReport.propertyName, newReport.type);

    const report: Report = {
      id: `rpt-${Date.now()}`,
      propertyId: "",
      propertyName: newReport.propertyName,
      type: newReport.type,
      month: newReport.month,
      status: "generated",
      createdAt: new Date().toISOString(),
      notes: "",
      data,
    };
    setReports((prev) => [...prev, report]);
    setShowCreateForm(false);
  }

  function updateStatus(id: string, status: ReportStatus) {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  function deleteReport(id: string) {
    setReports((prev) => prev.filter((r) => r.id !== id));
    if (viewingReport?.id === id) setViewingReport(null);
  }

  function exportCSV(report: Report) {
    let csv = "";
    const label = REPORT_TYPES.find((t) => t.value === report.type)?.label || report.type;

    if (report.data.rentRoll) {
      csv = "Unit,Tenant,Rent,Status,Lease End\n";
      for (const u of report.data.rentRoll.units) {
        csv += `"${u.name}","${u.tenant || "Vacant"}","${u.rent || "—"}","${u.status}","${u.leaseEnd || "—"}"\n`;
      }
    } else if (report.data.occupancy) {
      const o = report.data.occupancy;
      csv = "Metric,Value\n";
      csv += `Total Units,${o.total}\nOccupied,${o.occupied}\nVacant,${o.vacant}\nNotice,${o.notice}\nFuture/Pre-leased,${o.future}\nOccupancy Rate,${o.rate}\n`;
    } else if (report.data.maintenanceCost) {
      csv = "Category,Count,Total Cost\n";
      for (const c of report.data.maintenanceCost.categories) {
        csv += `"${c.category}",${c.count},$${c.totalCost}\n`;
      }
      csv += `\nTotal,,${report.data.maintenanceCost.totalSpend}\n`;
    }

    if (csv) {
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.propertyName}-${label}-${report.month}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  }

  // Report detail view
  if (viewingReport) {
    const label = REPORT_TYPES.find((t) => t.value === viewingReport.type)?.label || viewingReport.type;
    return (
      <div className="space-y-6">
        <button onClick={() => setViewingReport(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Reports
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{viewingReport.propertyName} — {label}</h1>
            <p className="text-muted-foreground mt-1">
              {viewingReport.month} &middot; Generated {new Date(viewingReport.createdAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCSV(viewingReport)}
              className="px-3 py-1.5 text-xs border border-border rounded-lg hover:bg-muted transition-colors"
            >
              Export CSV
            </button>
            <select
              value={viewingReport.status}
              onChange={(e) => {
                updateStatus(viewingReport.id, e.target.value as ReportStatus);
                setViewingReport((r) => r ? { ...r, status: e.target.value as ReportStatus } : null);
              }}
              className="text-xs border border-border rounded-md px-2 py-1.5 bg-card"
            >
              <option value="draft">Draft</option>
              <option value="generated">Generated</option>
              <option value="reviewed">Reviewed</option>
              <option value="sent">Sent to Owner</option>
            </select>
          </div>
        </div>

        {/* Occupancy Report */}
        {viewingReport.data.occupancy && viewingReport.type === "occupancy" && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Total Units</p>
              <p className="text-2xl font-bold mt-1">{viewingReport.data.occupancy.total}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Occupied</p>
              <p className="text-2xl font-bold mt-1 text-green-600">{viewingReport.data.occupancy.occupied}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Vacant</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{viewingReport.data.occupancy.vacant}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Notice</p>
              <p className="text-2xl font-bold mt-1 text-yellow-600">{viewingReport.data.occupancy.notice}</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-sm text-muted-foreground">Occupancy Rate</p>
              <p className="text-2xl font-bold mt-1">{viewingReport.data.occupancy.rate}</p>
            </div>
          </div>
        )}

        {/* Rent Roll Report */}
        {viewingReport.data.rentRoll && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 font-medium">Unit</th>
                    <th className="text-left px-4 py-3 font-medium">Tenant</th>
                    <th className="text-right px-4 py-3 font-medium">Rent</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Lease End</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingReport.data.rentRoll.units.map((u, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">{u.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{u.tenant || "Vacant"}</td>
                      <td className="px-4 py-3 text-right">
                        {u.rent ? (typeof u.rent === "number" ? `$${u.rent.toLocaleString()}` : u.rent) : "—"}
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={u.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{u.leaseEnd || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Maintenance Cost Report */}
        {viewingReport.data.maintenanceCost && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold">Maintenance Spend by Category</h2>
                <p className="text-lg font-bold">
                  ${viewingReport.data.maintenanceCost.totalSpend.toLocaleString()} total
                </p>
              </div>
              {viewingReport.data.maintenanceCost.categories.length > 0 ? (
                <div className="space-y-3">
                  {viewingReport.data.maintenanceCost.categories.map((cat) => (
                    <div key={cat.category} className="flex items-center gap-4">
                      <span className="text-sm font-medium capitalize w-32">{cat.category.replace(/_/g, " ")}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent rounded-full"
                          style={{
                            width: `${viewingReport.data.maintenanceCost!.totalSpend > 0
                              ? (cat.totalCost / viewingReport.data.maintenanceCost!.totalSpend) * 100
                              : 0}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm text-muted-foreground w-24 text-right">
                        ${cat.totalCost.toLocaleString()} ({cat.count})
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No maintenance costs recorded for this property.</p>
              )}
            </div>
          </div>
        )}

        {/* P&L Report */}
        {viewingReport.type === "pnl" && viewingReport.data.occupancy && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">P&L Summary</h2>
            <p className="text-sm text-muted-foreground">{viewingReport.data.occupancy.rate}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Note: Full P&L requires financial data from AppFolio General Ledger reports, which are not yet connected.
              Current values show estimated rental income vs maintenance expenses.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monthly Reports</h1>
          <p className="text-muted-foreground mt-1">
            Generate and review occupancy, rent roll, and maintenance cost reports from live AppFolio data
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ Generate Report"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Generate Report</h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Property</label>
              <select
                value={newReport.propertyName}
                onChange={(e) => setNewReport({ ...newReport, propertyName: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">Select property...</option>
                {propertyNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Report Type</label>
              <select
                value={newReport.type}
                onChange={(e) => setNewReport({ ...newReport, type: e.target.value as ReportType })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {REPORT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Month</label>
              <input
                type="month"
                value={newReport.month}
                onChange={(e) => setNewReport({ ...newReport, month: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
          </div>
          <button
            onClick={createReport}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Generate
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Report Types</option>
          {REPORT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* Report Type Cards (always shown for quick access) */}
      {reports.length === 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {REPORT_TYPES.map((type) => (
            <div key={type.value} className="bg-card rounded-xl border border-border p-5">
              <h3 className="font-semibold">{type.label}</h3>
              <p className="text-sm text-muted-foreground mt-1">{type.description}</p>
              <button
                onClick={() => {
                  setNewReport((r) => ({ ...r, type: type.value }));
                  setShowCreateForm(true);
                }}
                className="mt-3 text-sm text-accent hover:underline"
              >
                Generate &rarr;
              </button>
            </div>
          ))}
        </div>
      )}

      {filtered.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Property</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Month</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{r.propertyName}</td>
                    <td className="px-4 py-3 text-muted-foreground capitalize">
                      {REPORT_TYPES.find((t) => t.value === r.type)?.label}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.month}</td>
                    <td className="px-4 py-3">
                      <select
                        value={r.status}
                        onChange={(e) => updateStatus(r.id, e.target.value as ReportStatus)}
                        className="text-xs border border-border rounded-md px-2 py-1 bg-card"
                      >
                        <option value="draft">Draft</option>
                        <option value="generated">Generated</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="sent">Sent to Owner</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 flex items-center gap-2">
                      <button
                        onClick={() => setViewingReport(r)}
                        className="text-xs text-accent hover:underline"
                      >
                        View
                      </button>
                      <button
                        onClick={() => exportCSV(r)}
                        className="text-xs text-accent hover:underline"
                      >
                        CSV
                      </button>
                      <button
                        onClick={() => deleteReport(r.id)}
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
      )}
    </div>
  );
}
