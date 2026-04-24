"use client";

import { useState, useEffect, useCallback } from "react";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import { usePortfolio } from "@/contexts/PortfolioContext";
import type { Property } from "@/lib/types";

type RentEntry = {
  date: string;
  avgRent1Bed: number | null;
  avgRent2Bed: number | null;
  avgRent4Bed: number | null;
};

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
  rentHistory: RentEntry[];
};

function calculateTrend(history: RentEntry[]): "up" | "down" | "stable" {
  if (history.length < 2) return "stable";
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const prev = sorted[sorted.length - 2];
  const curr = sorted[sorted.length - 1];

  // Compare average of non-null rent values
  const prevAvg = [prev.avgRent1Bed, prev.avgRent2Bed, prev.avgRent4Bed].filter((v): v is number => v !== null);
  const currAvg = [curr.avgRent1Bed, curr.avgRent2Bed, curr.avgRent4Bed].filter((v): v is number => v !== null);
  if (prevAvg.length === 0 || currAvg.length === 0) return "stable";

  const prevMean = prevAvg.reduce((a, b) => a + b, 0) / prevAvg.length;
  const currMean = currAvg.reduce((a, b) => a + b, 0) / currAvg.length;

  if (currMean > prevMean * 1.02) return "up";
  if (currMean < prevMean * 0.98) return "down";
  return "stable";
}

export default function CompWatchPage() {
  const { portfolioId } = usePortfolio();
  const [comps, setComps] = useState<CompProperty[]>(() => loadFromStorage<CompProperty[]>("comps", []));
  const [ownProperties, setOwnProperties] = useState<Property[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [newComp, setNewComp] = useState({
    name: "",
    address: "",
    distance: "",
    notes: "",
  });

  useEffect(() => {
    fetch(`/api/appfolio/properties?portfolio_id=${portfolioId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.properties) setOwnProperties(data.properties);
      })
      .catch(() => {});
  }, [portfolioId]);

  // Persist comps to localStorage
  useEffect(() => {
    saveToStorage("comps", comps);
  }, [comps]);

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
      rentHistory: [],
    };
    setComps((prev) => [...prev, comp]);
    setNewComp({ name: "", address: "", distance: "", notes: "" });
    setShowAddForm(false);
  }

  function deleteComp(id: string) {
    setComps((prev) => prev.filter((c) => c.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function updateCompField(id: string, field: keyof CompProperty, value: string | number) {
    setComps((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, [field]: value, lastUpdated: new Date().toISOString().split("T")[0] };

        // When rent changes, snapshot into rent history
        if (field === "avgRent1Bed" || field === "avgRent2Bed" || field === "avgRent4Bed") {
          const today = new Date().toISOString().split("T")[0];
          const lastEntry = updated.rentHistory[updated.rentHistory.length - 1];
          // Only add if date changed or first entry
          if (!lastEntry || lastEntry.date !== today) {
            updated.rentHistory = [
              ...updated.rentHistory,
              {
                date: today,
                avgRent1Bed: field === "avgRent1Bed" ? (value as number) : updated.avgRent1Bed,
                avgRent2Bed: field === "avgRent2Bed" ? (value as number) : updated.avgRent2Bed,
                avgRent4Bed: field === "avgRent4Bed" ? (value as number) : updated.avgRent4Bed,
              },
            ];
          } else {
            // Update today's entry
            const hist = [...updated.rentHistory];
            hist[hist.length - 1] = {
              ...hist[hist.length - 1],
              [field]: value as number,
            };
            updated.rentHistory = hist;
          }
          updated.trend = calculateTrend(updated.rentHistory);
        }

        return updated;
      })
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
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {comps.map((c) => (
                  <>
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                          className="text-left"
                        >
                          <p className="font-medium hover:text-accent">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{c.address}</p>
                        </button>
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
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          c.trend === "up" ? "bg-red-50 text-red-700" :
                          c.trend === "down" ? "bg-green-50 text-green-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {c.trend === "up" ? "Rents up" : c.trend === "down" ? "Rents down" : "Stable"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{c.lastUpdated}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => deleteComp(c.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                          title="Remove competitor"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                    {expandedId === c.id && (
                      <tr key={`${c.id}-detail`} className="border-b border-border bg-muted/30">
                        <td colSpan={9} className="px-4 py-4">
                          <div className="space-y-3">
                            <div className="flex items-center gap-4">
                              <div>
                                <label className="text-xs text-muted-foreground block mb-1">Occupancy</label>
                                <input
                                  type="text"
                                  value={c.occupancy}
                                  placeholder="e.g. 95%"
                                  onChange={(e) => updateCompField(c.id, "occupancy", e.target.value)}
                                  className="w-24 text-sm border border-border rounded px-2 py-1 bg-card"
                                />
                              </div>
                              <div className="flex-1">
                                <label className="text-xs text-muted-foreground block mb-1">Notes</label>
                                <input
                                  type="text"
                                  value={c.notes}
                                  placeholder="Add notes..."
                                  onChange={(e) => updateCompField(c.id, "notes", e.target.value)}
                                  className="w-full text-sm border border-border rounded px-2 py-1 bg-card"
                                />
                              </div>
                            </div>
                            {c.rentHistory.length > 1 && (
                              <div>
                                <p className="text-xs text-muted-foreground mb-2">Rent History ({c.rentHistory.length} entries)</p>
                                <div className="flex gap-4 overflow-x-auto text-xs">
                                  {c.rentHistory.slice(-6).map((entry, i) => (
                                    <div key={i} className="shrink-0 text-center">
                                      <p className="text-muted-foreground">{entry.date}</p>
                                      {entry.avgRent1Bed && <p>1BR: ${entry.avgRent1Bed}</p>}
                                      {entry.avgRent2Bed && <p>2BR: ${entry.avgRent2Bed}</p>}
                                      {entry.avgRent4Bed && <p>4BR: ${entry.avgRent4Bed}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
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
