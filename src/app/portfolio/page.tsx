"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Property, Unit, DashboardStats } from "@/lib/types";

type PropertySummary = {
  property: Property;
  units: Unit[];
  occupied: number;
  vacant: number;
  notice: number;
  occupancyRate: number;
  totalMonthlyRent: number;
  avgRent: number;
};

export default function PortfolioPage() {
  const [summaries, setSummaries] = useState<PropertySummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PropertySummary | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/appfolio/properties").then((r) => r.json()),
      fetch("/api/appfolio/units").then((r) => r.json()),
      fetch("/api/appfolio/dashboard").then((r) => r.json()),
    ])
      .then(([propData, unitData, dashData]) => {
        const properties: Property[] = propData.properties || [];
        const units: Unit[] = unitData.units || [];
        if (dashData.stats) setStats(dashData.stats);

        const sums: PropertySummary[] = properties.map((p) => {
          const propUnits = units.filter((u) => u.propertyId === p.id);
          const occupied = propUnits.filter((u) => u.status === "current").length;
          const vacant = propUnits.filter((u) => u.status === "vacant").length;
          const notice = propUnits.filter((u) => u.status === "notice").length;
          const occupiedUnits = propUnits.filter((u) => u.status === "current");
          const totalRent = occupiedUnits.reduce((s, u) => s + (Number(u.rent) || 0), 0);

          return {
            property: p,
            units: propUnits,
            occupied,
            vacant,
            notice,
            occupancyRate: propUnits.length > 0 ? Math.round((occupied / propUnits.length) * 100) : 0,
            totalMonthlyRent: totalRent,
            avgRent: occupiedUnits.length > 0 ? Math.round(totalRent / occupiedUnits.length) : 0,
          };
        });
        setSummaries(sums);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Portfolio Overview</h1>
          <p className="text-muted-foreground mt-1">Loading from AppFolio...</p>
        </div>
      </div>
    );
  }

  const totalUnits = summaries.reduce((s, p) => s + p.units.length, 0);
  const totalOccupied = summaries.reduce((s, p) => s + p.occupied, 0);
  const totalRent = summaries.reduce((s, p) => s + p.totalMonthlyRent, 0);
  const overallOccupancy = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

  if (selected) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Portfolio
        </button>

        <div>
          <h1 className="text-2xl font-bold">{selected.property.name}</h1>
          <p className="text-muted-foreground mt-1">{selected.property.address}</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Total Units</p>
            <p className="text-2xl font-bold mt-1">{selected.units.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Occupancy</p>
            <p className="text-2xl font-bold mt-1">{selected.occupancyRate}%</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Monthly Rent</p>
            <p className="text-2xl font-bold mt-1">${selected.totalMonthlyRent.toLocaleString()}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Avg Rent</p>
            <p className="text-2xl font-bold mt-1">${selected.avgRent.toLocaleString()}</p>
          </div>
        </div>

        {/* Unit breakdown */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Units ({selected.units.length})</h2>
          </div>
          {selected.units.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 font-medium">Unit</th>
                    <th className="text-left px-4 py-3 font-medium">Beds/Bath</th>
                    <th className="text-right px-4 py-3 font-medium">Sq Ft</th>
                    <th className="text-left px-4 py-3 font-medium">Tenant</th>
                    <th className="text-right px-4 py-3 font-medium">Rent</th>
                    <th className="text-left px-4 py-3 font-medium">Lease Ends</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.units
                    .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
                    .map((u) => (
                      <tr key={u.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 font-medium">#{u.number}</td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {u.bedrooms}bd / {u.bathrooms}ba
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {u.sqft ? u.sqft.toLocaleString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{u.tenant || "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {u.rent ? `$${u.rent.toLocaleString()}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{u.leaseTo || "—"}</td>
                        <td className="px-4 py-3"><StatusBadge value={u.status === "current" ? "occupied" : u.status} /></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5 text-sm text-muted-foreground">No units found.</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Portfolio Overview</h1>
        <p className="text-muted-foreground mt-1">
          Property-level performance — occupancy, revenue, and unit details
        </p>
      </div>

      {/* Portfolio totals */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Properties</p>
          <p className="text-2xl font-bold mt-1">{summaries.length}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Units</p>
          <p className="text-2xl font-bold mt-1">{totalUnits}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Occupancy</p>
          <p className="text-2xl font-bold mt-1">{overallOccupancy}%</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Monthly Revenue</p>
          <p className="text-2xl font-bold mt-1">${totalRent.toLocaleString()}</p>
        </div>
      </div>

      {/* Property cards */}
      {summaries.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((s) => (
            <button
              key={s.property.id}
              onClick={() => setSelected(s)}
              className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <h3 className="font-semibold">{s.property.name}</h3>
              <p className="text-xs text-muted-foreground mt-1">{s.property.address}</p>

              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold">{s.units.length}</p>
                  <p className="text-xs text-muted-foreground">Units</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${s.occupancyRate >= 90 ? "text-green-600" : s.occupancyRate >= 70 ? "text-yellow-600" : "text-red-600"}`}>
                    {s.occupancyRate}%
                  </p>
                  <p className="text-xs text-muted-foreground">Occupied</p>
                </div>
                <div>
                  <p className="text-lg font-bold">${s.avgRent.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Avg Rent</p>
                </div>
              </div>

              <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${s.occupancyRate >= 90 ? "bg-green-500" : s.occupancyRate >= 70 ? "bg-yellow-500" : "bg-red-500"}`}
                  style={{ width: `${s.occupancyRate}%` }}
                />
              </div>

              <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
                <span>{s.occupied} occupied · {s.vacant} vacant{s.notice > 0 ? ` · ${s.notice} notice` : ""}</span>
                <span>${s.totalMonthlyRent.toLocaleString()}/mo</span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No properties found in AppFolio.
        </div>
      )}
    </div>
  );
}
