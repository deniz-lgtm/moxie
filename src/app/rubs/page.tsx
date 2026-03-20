"use client";

import { useState, useEffect } from "react";
import type { Property, Unit } from "@/lib/types";

type UtilityType = "water" | "gas" | "electric" | "trash";
type SplitMethod = "sqft" | "occupancy" | "equal";

type RubsPeriod = {
  id: string;
  month: string;
  propertyId: string;
  propertyName: string;
  utilityType: UtilityType;
  totalBill: number;
  splitMethod: SplitMethod;
  allocations: RubsAllocation[];
  status: "draft" | "calculated" | "posted";
};

type RubsAllocation = {
  unitId: string;
  unitNumber: string;
  tenant: string;
  sqft: number;
  occupants: number;
  share: number;
  amount: number;
};

const UTILITY_TYPES: { value: UtilityType; label: string }[] = [
  { value: "water", label: "Water" },
  { value: "gas", label: "Gas" },
  { value: "electric", label: "Electric" },
  { value: "trash", label: "Trash" },
];

export default function RubsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [periods, setPeriods] = useState<RubsPeriod[]>([]);
  const [selected, setSelected] = useState<RubsPeriod | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [loading, setLoading] = useState(true);

  const [newPeriod, setNewPeriod] = useState({
    month: "2026-03",
    propertyId: "",
    utilityType: "water" as UtilityType,
    totalBill: 0,
    splitMethod: "sqft" as SplitMethod,
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/appfolio/properties").then((r) => r.json()),
      fetch("/api/appfolio/units").then((r) => r.json()),
    ])
      .then(([propData, unitData]) => {
        setProperties(propData.properties || []);
        setUnits(unitData.units || []);
        if (propData.properties?.length > 0) {
          setNewPeriod((p) => ({ ...p, propertyId: propData.properties[0].id }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function calculateAllocations(propertyId: string, splitMethod: SplitMethod, totalBill: number): RubsAllocation[] {
    const propertyUnits = units.filter((u) => u.propertyId === propertyId && u.status === "current");
    if (propertyUnits.length === 0) return [];

    const totalSqft = propertyUnits.reduce((sum, u) => sum + (u.sqft || 0), 0);
    const totalOccupants = propertyUnits.length; // Default 1 per unit

    return propertyUnits.map((u) => {
      let share = 0;
      if (splitMethod === "sqft" && totalSqft > 0) {
        share = (u.sqft || 0) / totalSqft;
      } else if (splitMethod === "occupancy" && totalOccupants > 0) {
        share = 1 / totalOccupants;
      } else {
        share = 1 / propertyUnits.length;
      }

      return {
        unitId: u.id,
        unitNumber: u.number,
        tenant: u.tenant || "Vacant",
        sqft: u.sqft || 0,
        occupants: 1,
        share: Math.round(share * 10000) / 10000,
        amount: Math.round(totalBill * share * 100) / 100,
      };
    });
  }

  function createPeriod() {
    if (!newPeriod.propertyId || newPeriod.totalBill <= 0) return;
    const property = properties.find((p) => p.id === newPeriod.propertyId);
    if (!property) return;

    const allocations = calculateAllocations(newPeriod.propertyId, newPeriod.splitMethod, newPeriod.totalBill);
    const period: RubsPeriod = {
      id: `rubs-${Date.now()}`,
      month: newPeriod.month,
      propertyId: newPeriod.propertyId,
      propertyName: property.name,
      utilityType: newPeriod.utilityType,
      totalBill: newPeriod.totalBill,
      splitMethod: newPeriod.splitMethod,
      allocations,
      status: "calculated",
    };
    setPeriods((prev) => [...prev, period]);
    setShowCreateForm(false);
    setSelected(period);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">RUBs</h1>
          <p className="text-muted-foreground mt-1">Loading properties from AppFolio...</p>
        </div>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to RUBs
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selected.propertyName}</h1>
            <p className="text-muted-foreground mt-1 capitalize">
              {selected.utilityType} · {selected.month} · Split by {selected.splitMethod}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">${selected.totalBill.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Bill</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Units</p>
            <p className="text-2xl font-bold mt-1">{selected.allocations.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Avg Per Unit</p>
            <p className="text-2xl font-bold mt-1">
              ${selected.allocations.length > 0
                ? Math.round(selected.totalBill / selected.allocations.length).toLocaleString()
                : "0"}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="text-2xl font-bold mt-1 capitalize">{selected.status}</p>
          </div>
        </div>

        {/* Allocations table */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Unit Allocations</h2>
          </div>
          {selected.allocations.length > 0 ? (
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
                  {selected.allocations.map((a) => (
                    <tr key={a.unitId} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium">#{a.unitNumber}</td>
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
                    <td className="px-4 py-3 text-right font-semibold">
                      ${selected.allocations.reduce((s, a) => s + a.amount, 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-muted-foreground">
              No occupied units found for this property.
            </div>
          )}
        </div>

        {selected.status === "calculated" && (
          <button
            onClick={() => {
              const updated = { ...selected, status: "posted" as const };
              setSelected(updated);
              setPeriods((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
            }}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Post to Tenant Ledgers
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">RUBs</h1>
          <p className="text-muted-foreground mt-1">
            Ratio Utility Billing — split costs across tenants by sqft or occupancy
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ New Bill Split"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Create Utility Bill Split</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Month</label>
              <input
                type="month"
                value={newPeriod.month}
                onChange={(e) => setNewPeriod({ ...newPeriod, month: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Property</label>
              <select
                value={newPeriod.propertyId}
                onChange={(e) => setNewPeriod({ ...newPeriod, propertyId: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Utility Type</label>
              <select
                value={newPeriod.utilityType}
                onChange={(e) => setNewPeriod({ ...newPeriod, utilityType: e.target.value as UtilityType })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {UTILITY_TYPES.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Total Bill ($)</label>
              <input
                type="number"
                value={newPeriod.totalBill || ""}
                placeholder="0.00"
                onChange={(e) => setNewPeriod({ ...newPeriod, totalBill: parseFloat(e.target.value) || 0 })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Split Method</label>
              <select
                value={newPeriod.splitMethod}
                onChange={(e) => setNewPeriod({ ...newPeriod, splitMethod: e.target.value as SplitMethod })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="sqft">By Square Footage</option>
                <option value="occupancy">By Occupancy</option>
                <option value="equal">Equal Split</option>
              </select>
            </div>
          </div>
          <button
            onClick={createPeriod}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Calculate Split
          </button>
        </div>
      )}

      {periods.length > 0 ? (
        <div className="grid md:grid-cols-2 gap-4">
          {periods.map((p) => (
            <button
              key={p.id}
              onClick={() => setSelected(p)}
              className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{p.propertyName}</h3>
                  <p className="text-sm text-muted-foreground mt-1 capitalize">
                    {p.utilityType} · {p.month}
                  </p>
                </div>
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  p.status === "posted" ? "bg-green-100 text-green-800" :
                  p.status === "calculated" ? "bg-blue-100 text-blue-800" :
                  "bg-slate-100 text-slate-600"
                }`}>
                  {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                </span>
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{p.allocations.length} units</span>
                <span className="font-medium">${p.totalBill.toLocaleString()}</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No utility bill splits yet. Click &quot;+ New Bill Split&quot; to allocate a utility bill across tenants.
        </div>
      )}
    </div>
  );
}
