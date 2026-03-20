"use client";

import { useState, useEffect } from "react";
import type { Property } from "@/lib/types";

type ReportType = "pnl" | "occupancy" | "maintenance_cost" | "rent_roll";
type ReportStatus = "draft" | "generated" | "reviewed" | "sent";

type Report = {
  id: string;
  propertyId: string;
  propertyName: string;
  type: ReportType;
  month: string;
  status: ReportStatus;
  createdAt: string;
  notes: string;
};

const REPORT_TYPES: { value: ReportType; label: string; description: string }[] = [
  { value: "pnl", label: "P&L Statement", description: "Income vs expenses for the month" },
  { value: "occupancy", label: "Occupancy Report", description: "Unit status, vacancy rate, lease expirations" },
  { value: "maintenance_cost", label: "Maintenance Costs", description: "Work order costs by category and vendor" },
  { value: "rent_roll", label: "Rent Roll", description: "Current rents, market rents, and deltas" },
];

export default function ReportsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const [newReport, setNewReport] = useState({
    propertyId: "",
    type: "pnl" as ReportType,
    month: "2026-03",
  });

  useEffect(() => {
    fetch("/api/appfolio/properties")
      .then((res) => res.json())
      .then((data) => {
        setProperties(data.properties || []);
        if (data.properties?.length > 0) {
          setNewReport((r) => ({ ...r, propertyId: data.properties[0].id }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = reports.filter((r) => {
    if (filterType !== "all" && r.type !== filterType) return false;
    return true;
  });

  function createReport() {
    if (!newReport.propertyId) return;
    const property = properties.find((p) => p.id === newReport.propertyId);
    if (!property) return;
    const typeInfo = REPORT_TYPES.find((t) => t.value === newReport.type)!;

    const report: Report = {
      id: `rpt-${Date.now()}`,
      propertyId: newReport.propertyId,
      propertyName: property.name,
      type: newReport.type,
      month: newReport.month,
      status: "generated",
      createdAt: new Date().toISOString(),
      notes: "",
    };
    setReports((prev) => [...prev, report]);
    setShowCreateForm(false);
  }

  function updateStatus(id: string, status: ReportStatus) {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Monthly Reports</h1>
          <p className="text-muted-foreground mt-1">
            Generate and review P&L, occupancy, and maintenance cost reports
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
                value={newReport.propertyId}
                onChange={(e) => setNewReport({ ...newReport, propertyId: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
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

      {/* Report Type Cards */}
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
                    <td className="px-4 py-3">
                      <button className="text-xs text-accent hover:underline">View</button>
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
