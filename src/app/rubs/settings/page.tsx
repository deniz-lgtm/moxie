"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Unit } from "@/lib/types";
import type { MeterMapping, MeterType, MeteringMethod, SplitMethod } from "@/lib/rubs-types";
import {
  METER_TYPE_LABELS,
  SPLIT_METHOD_LABELS,
  METERING_METHOD_LABELS,
} from "@/lib/rubs-types";

export default function RubsSettingsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [mappings, setMappings] = useState<MeterMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editMapping, setEditMapping] = useState<MeterMapping | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [unitsRes, mappingsRes] = await Promise.all([
        fetch("/api/appfolio/units").then((r) => r.json()).catch(() => ({ units: [] })),
        fetch("/api/rubs/mappings").then((r) => r.json()),
      ]);
      setUnits(unitsRes.units || []);
      setMappings(mappingsRes.mappings || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const propertyNames = [...new Set(units.map((u) => u.propertyName).filter(Boolean))].sort();

  // Group mappings by property
  const mappingsByProperty: Record<string, MeterMapping[]> = {};
  for (const m of mappings) {
    if (!mappingsByProperty[m.propertyName]) mappingsByProperty[m.propertyName] = [];
    mappingsByProperty[m.propertyName].push(m);
  }

  async function handleSave(mapping: MeterMapping) {
    await fetch("/api/rubs/mappings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping }),
    });
    await loadData();
    setShowForm(false);
    setEditMapping(null);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/rubs/mappings?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setMappings((prev) => prev.filter((m) => m.id !== id));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">RUBs Settings</h1>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link href="/rubs" className="text-sm text-accent hover:underline">
            &larr; Back to RUBs
          </Link>
          <h1 className="text-2xl font-bold mt-2">Meter Mapping Settings</h1>
          <p className="text-muted-foreground mt-1">
            Configure which meters serve which units at each property
          </p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); setEditMapping(null); }}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Mapping"}
        </button>
      </div>

      {/* Add/Edit Form */}
      {(showForm || editMapping) && (
        <MappingForm
          propertyNames={propertyNames}
          units={units}
          existing={editMapping}
          onSave={handleSave}
          onCancel={() => { setShowForm(false); setEditMapping(null); }}
        />
      )}

      {/* Property Cards */}
      {Object.keys(mappingsByProperty).length > 0 ? (
        <div className="space-y-6">
          {Object.entries(mappingsByProperty)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([propName, propMappings]) => {
              const propUnits = units.filter((u) => u.propertyName === propName);
              const mappedUnitIds = new Set(propMappings.flatMap((m) => m.unitIds));
              const unmappedUnits = propUnits.filter((u) => !mappedUnitIds.has(u.id));

              return (
                <div key={propName} className="bg-card rounded-xl border border-border overflow-hidden">
                  <div className="p-5 border-b border-border flex items-center justify-between">
                    <div>
                      <h2 className="font-semibold">{propName}</h2>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {propUnits.length} units &middot; {propMappings.length} meter{propMappings.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                    {unmappedUnits.length > 0 && (
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                        {unmappedUnits.length} unmapped unit{unmappedUnits.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="divide-y divide-border">
                    {propMappings.map((m) => (
                      <div key={m.id} className="p-4 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg">
                            {m.meterType === "water" ? "💧" : m.meterType === "gas" ? "🔥" : m.meterType === "electric" ? "⚡" : "🗑️"}
                          </div>
                          <div>
                            <p className="font-medium">{METER_TYPE_LABELS[m.meterType]}</p>
                            <p className="text-xs text-muted-foreground">
                              {METERING_METHOD_LABELS[m.meteringMethod]} &middot;{" "}
                              {SPLIT_METHOD_LABELS[m.splitMethod]} &middot;{" "}
                              {m.unitIds.length} unit{m.unitIds.length !== 1 ? "s" : ""} &middot;{" "}
                              Meter #{m.meterId}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => { setEditMapping(m); setShowForm(false); }}
                            className="text-xs text-accent hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="text-xs text-red-500 hover:underline"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No meter mappings configured. Click &quot;+ Add Mapping&quot; to get started.
        </div>
      )}

      {/* Properties without any mappings */}
      {propertyNames.filter((p) => !mappingsByProperty[p]).length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="font-semibold text-sm mb-3">Unconfigured Properties</h3>
          <div className="flex flex-wrap gap-2">
            {propertyNames
              .filter((p) => !mappingsByProperty[p])
              .map((name) => (
                <span key={name} className="text-xs px-3 py-1 rounded-full bg-muted text-muted-foreground">
                  {name}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mapping Form ────────────────────────────────────────────

function MappingForm({
  propertyNames,
  units,
  existing,
  onSave,
  onCancel,
}: {
  propertyNames: string[];
  units: Unit[];
  existing: MeterMapping | null;
  onSave: (mapping: MeterMapping) => void;
  onCancel: () => void;
}) {
  const [propertyName, setPropertyName] = useState(existing?.propertyName || "");
  const [meterType, setMeterType] = useState<MeterType>(existing?.meterType || "water");
  const [meteringMethod, setMeteringMethod] = useState<MeteringMethod>(existing?.meteringMethod || "master");
  const [splitMethod, setSplitMethod] = useState<SplitMethod>(existing?.splitMethod || "sqft");
  const [meterId, setMeterId] = useState(existing?.meterId || "");
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set(existing?.unitIds || []));

  const propUnits = units.filter((u) => u.propertyName === propertyName);

  function toggleUnit(id: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllUnits() {
    setSelectedUnitIds(new Set(propUnits.map((u) => u.id)));
  }

  function handleSubmit() {
    if (!propertyName || !meterId || selectedUnitIds.size === 0) return;

    const mapping: MeterMapping = {
      id: existing?.id || `mapping-${Date.now()}`,
      propertyName,
      meterType,
      meteringMethod,
      meterId,
      unitIds: Array.from(selectedUnitIds),
      splitMethod,
    };
    onSave(mapping);
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <h2 className="font-semibold">{existing ? "Edit" : "Add"} Meter Mapping</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Property</label>
          <select
            value={propertyName}
            onChange={(e) => { setPropertyName(e.target.value); setSelectedUnitIds(new Set()); }}
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
            {(Object.entries(METER_TYPE_LABELS) as [MeterType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Metering Method</label>
          <select
            value={meteringMethod}
            onChange={(e) => setMeteringMethod(e.target.value as MeteringMethod)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            {(Object.entries(METERING_METHOD_LABELS) as [MeteringMethod, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Split Method</label>
          <select
            value={splitMethod}
            onChange={(e) => setSplitMethod(e.target.value as SplitMethod)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            {(Object.entries(SPLIT_METHOD_LABELS) as [SplitMethod, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground block mb-1">Meter ID / Account Number</label>
          <input
            type="text"
            value={meterId}
            placeholder="e.g. WTR-001 or account number"
            onChange={(e) => setMeterId(e.target.value)}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
          />
        </div>
      </div>

      {/* Unit Selection */}
      {propertyName && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs text-muted-foreground">
              Assign Units ({selectedUnitIds.size}/{propUnits.length} selected)
            </label>
            <button onClick={selectAllUnits} className="text-xs text-accent hover:underline">
              Select All
            </button>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {propUnits.map((u) => (
              <button
                key={u.id}
                onClick={() => toggleUnit(u.id)}
                className={`text-sm px-3 py-2 rounded-lg border transition-colors ${
                  selectedUnitIds.has(u.id)
                    ? "border-accent bg-accent/10 text-accent font-medium"
                    : "border-border hover:bg-muted"
                }`}
              >
                {u.unitName || u.number}
              </button>
            ))}
          </div>
          {propUnits.length === 0 && (
            <p className="text-xs text-muted-foreground">No units found for this property in AppFolio.</p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={!propertyName || !meterId || selectedUnitIds.size === 0}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
        >
          {existing ? "Update Mapping" : "Add Mapping"}
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
