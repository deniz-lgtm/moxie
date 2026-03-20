"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Property } from "@/lib/types";

type CompProperty = {
  id: string;
  name: string;
  address: string;
  distance: string;
  avgRent1Bed: number | null;
  avgRent2Bed: number | null;
  avgRent4Bed: number | null;
  concessions: string;
  occupancy: string;
  lastUpdated: string;
  trend: "up" | "down" | "stable";
  notes: string;
};

export default function CompWatchPage() {
  const [comps, setComps] = useState<CompProperty[]>([]);
  const [ownProperties, setOwnProperties] = useState<Property[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newComp, setNewComp] = useState({
    name: "",
    address: "",
    distance: "",
    notes: "",
  });

  useEffect(() => {
    fetch("/api/appfolio/properties")
      .then((res) => res.json())
      .then((data) => {
        if (data.properties) setOwnProperties(data.properties);
      })
      .catch(() => {});
  }, []);

  function addComp() {
    if (!newComp.name.trim()) return;
    const comp: CompProperty = {
      id: `comp-${Date.now()}`,
      name: newComp.name,
      address: newComp.address,
      distance: newComp.distance,
      avgRent1Bed: null,
      avgRent2Bed: null,
      avgRent4Bed: null,
      concessions: "",
      occupancy: "",
      lastUpdated: new Date().toISOString().split("T")[0],
      trend: "stable",
      notes: newComp.notes,
    };
    setComps((prev) => [...prev, comp]);
    setNewComp({ name: "", address: "", distance: "", notes: "" });
    setShowAddForm(false);
  }

  function updateCompField(id: string, field: keyof CompProperty, value: string | number) {
    setComps((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value, lastUpdated: new Date().toISOString().split("T")[0] } : c))
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Comp Watch</h1>
          <p className="text-muted-foreground mt-1">
            Track competitor rents near USC — price drops, concessions, and demand signals
          </p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showAddForm ? "Cancel" : "+ Add Comp"}
        </button>
      </div>

      {/* Own properties summary */}
      {ownProperties.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Your Properties</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {ownProperties.map((p) => (
              <div key={p.id} className="text-sm">
                <p className="font-medium">{p.name}</p>
                <p className="text-muted-foreground text-xs">{p.address}</p>
                <p className="text-muted-foreground text-xs">{p.unitCount} units</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Add Competitor Property</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Property name *"
              value={newComp.name}
              onChange={(e) => setNewComp({ ...newComp, name: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="text"
              placeholder="Address"
              value={newComp.address}
              onChange={(e) => setNewComp({ ...newComp, address: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="text"
              placeholder="Distance (e.g. 0.3 mi)"
              value={newComp.distance}
              onChange={(e) => setNewComp({ ...newComp, distance: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
          </div>
          <textarea
            placeholder="Notes"
            value={newComp.notes}
            onChange={(e) => setNewComp({ ...newComp, notes: e.target.value })}
            rows={2}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
          />
          <button
            onClick={addComp}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Add Competitor
          </button>
        </div>
      )}

      {comps.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Property</th>
                  <th className="text-left px-4 py-3 font-medium">Distance</th>
                  <th className="text-right px-4 py-3 font-medium">1-Bed</th>
                  <th className="text-right px-4 py-3 font-medium">2-Bed</th>
                  <th className="text-right px-4 py-3 font-medium">4-Bed</th>
                  <th className="text-left px-4 py-3 font-medium">Concessions</th>
                  <th className="text-left px-4 py-3 font-medium">Trend</th>
                  <th className="text-left px-4 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.address}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{c.distance || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={c.avgRent1Bed ?? ""}
                        placeholder="—"
                        onChange={(e) => updateCompField(c.id, "avgRent1Bed", parseFloat(e.target.value) || 0)}
                        className="w-20 text-sm text-right border border-border rounded px-2 py-1 bg-card"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={c.avgRent2Bed ?? ""}
                        placeholder="—"
                        onChange={(e) => updateCompField(c.id, "avgRent2Bed", parseFloat(e.target.value) || 0)}
                        className="w-20 text-sm text-right border border-border rounded px-2 py-1 bg-card"
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        value={c.avgRent4Bed ?? ""}
                        placeholder="—"
                        onChange={(e) => updateCompField(c.id, "avgRent4Bed", parseFloat(e.target.value) || 0)}
                        className="w-20 text-sm text-right border border-border rounded px-2 py-1 bg-card"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={c.concessions}
                        placeholder="None"
                        onChange={(e) => updateCompField(c.id, "concessions", e.target.value)}
                        className="w-full text-sm border border-border rounded px-2 py-1 bg-card"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={c.trend}
                        onChange={(e) => updateCompField(c.id, "trend", e.target.value)}
                        className="text-xs border border-border rounded px-2 py-1 bg-card"
                      >
                        <option value="up">Up</option>
                        <option value="down">Down</option>
                        <option value="stable">Stable</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.lastUpdated}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No competitors tracked yet. Click &quot;+ Add Comp&quot; to start tracking nearby properties.
        </div>
      )}
    </div>
  );
}
