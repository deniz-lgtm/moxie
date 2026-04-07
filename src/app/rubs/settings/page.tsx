"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import type { Unit } from "@/lib/types";
import type { MeterMapping, MeterType, MeteringMethod, SplitMethod } from "@/lib/rubs-types";
import {
  METER_TYPE_LABELS,
  SPLIT_METHOD_LABELS,
  METERING_METHOD_LABELS,
} from "@/lib/rubs-types";
import {
  getMeterMappings,
  saveMeterMapping,
  deleteMeterMapping,
} from "@/lib/rubs-db";
import { parseImportFile, transformRowsToMappings, type ImportResult } from "@/lib/rubs-csv-import";

export default function RubsSettingsPage() {
  const [units, setUnits] = useState<Unit[]>([]);
  const [mappings, setMappings] = useState<MeterMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editMapping, setEditMapping] = useState<MeterMapping | null>(null);
  const [importPreview, setImportPreview] = useState<ImportResult | null>(null);
  const [importFilename, setImportFilename] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importError, setImportError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Table filter / sort state
  const [search, setSearch] = useState("");
  const [filterProperty, setFilterProperty] = useState("");
  const [filterMeterType, setFilterMeterType] = useState<MeterType | "">("");
  const [sortKey, setSortKey] = useState<"property" | "meterType" | "meteringMethod" | "splitMethod" | "units">("property");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    try {
      const unitsRes = await fetch("/api/appfolio/units").then((r) => r.json()).catch(() => ({ units: [] }));
      setUnits(unitsRes.units || []);
      setMappings(getMeterMappings());
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
  const mappingPropertyNames = [...new Set(mappings.map((m) => m.propertyName))].sort();
  const allPropertyNames = [...new Set([...propertyNames, ...mappingPropertyNames])].sort();

  // Group mappings by property (still used for the unconfigured-properties section)
  const mappingsByProperty: Record<string, MeterMapping[]> = {};
  for (const m of mappings) {
    if (!mappingsByProperty[m.propertyName]) mappingsByProperty[m.propertyName] = [];
    mappingsByProperty[m.propertyName].push(m);
  }

  // Filter + sort mappings for the table view
  const searchLower = search.toLowerCase();
  const filteredMappings = mappings.filter((m) => {
    if (filterProperty && m.propertyName !== filterProperty) return false;
    if (filterMeterType && m.meterType !== filterMeterType) return false;
    if (search) {
      const haystack = `${m.propertyName} ${m.meterType} ${m.meterId}`.toLowerCase();
      if (!haystack.includes(searchLower)) return false;
    }
    return true;
  });

  const sortedMappings = [...filteredMappings].sort((a, b) => {
    let av: string | number = "";
    let bv: string | number = "";
    switch (sortKey) {
      case "property":
        av = a.propertyName;
        bv = b.propertyName;
        break;
      case "meterType":
        av = a.meterType;
        bv = b.meterType;
        break;
      case "meteringMethod":
        av = a.meteringMethod;
        bv = b.meteringMethod;
        break;
      case "splitMethod":
        av = a.splitMethod;
        bv = b.splitMethod;
        break;
      case "units":
        av = a.unitIds.length;
        bv = b.unitIds.length;
        break;
    }
    if (av < bv) return sortDir === "asc" ? -1 : 1;
    if (av > bv) return sortDir === "asc" ? 1 : -1;
    // Tiebreaker by property name then meter type
    if (a.propertyName !== b.propertyName) return a.propertyName.localeCompare(b.propertyName);
    return a.meterType.localeCompare(b.meterType);
  });

  function handleSave(mapping: MeterMapping) {
    saveMeterMapping(mapping);
    setMappings(getMeterMappings());
    setShowForm(false);
    setEditMapping(null);
  }

  function handleInlineUpdate(id: string, patch: Partial<MeterMapping>) {
    const existing = mappings.find((m) => m.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch };
    saveMeterMapping(updated);
    setMappings((prev) => prev.map((m) => (m.id === id ? updated : m)));
  }

  function handleBulkUpdate(patch: Partial<MeterMapping>) {
    if (selectedIds.size === 0) return;
    const updates = mappings.map((m) => {
      if (!selectedIds.has(m.id)) return m;
      const updated = { ...m, ...patch };
      saveMeterMapping(updated);
      return updated;
    });
    setMappings(updates);
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} mapping${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    for (const id of selectedIds) {
      deleteMeterMapping(id);
    }
    setMappings((prev) => prev.filter((m) => !selectedIds.has(m.id)));
    setSelectedIds(new Set());
  }

  function toggleRowSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function handleDelete(id: string) {
    deleteMeterMapping(id);
    setMappings((prev) => prev.filter((m) => m.id !== id));
  }

  async function handleCsvSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so the same file can be selected again later
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    setImportError("");
    try {
      const parsed = await parseImportFile(file);
      const result = transformRowsToMappings(parsed);
      setImportFilename(file.name);
      setImportPreview(result);
    } catch (err: any) {
      setImportError(err.message || "Failed to parse file");
    }
  }

  function handleConfirmImport() {
    if (!importPreview) return;
    if (importMode === "replace") {
      // Delete all existing mappings first
      for (const m of mappings) {
        deleteMeterMapping(m.id);
      }
    }
    for (const m of importPreview.mappings) {
      saveMeterMapping(m);
    }
    setMappings(getMeterMappings());
    setImportPreview(null);
    setImportFilename("");
    setImportMode("merge");
  }

  function handleCancelImport() {
    setImportPreview(null);
    setImportFilename("");
    setImportError("");
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
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.tsv,.txt,.xlsx,.xlsm,.xls,.xlsb,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12"
            onChange={handleCsvSelected}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Import Spreadsheet
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setEditMapping(null); }}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            {showForm ? "Cancel" : "+ Add Mapping"}
          </button>
        </div>
      </div>

      {/* CSV Import Error */}
      {importError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {importError}
        </div>
      )}

      {/* CSV Import Preview */}
      {importPreview && (
        <CsvImportPreview
          preview={importPreview}
          filename={importFilename}
          existingCount={mappings.length}
          mode={importMode}
          onModeChange={setImportMode}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
        />
      )}

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

      {/* Filter Bar */}
      {mappings.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search property, utility, meter #..."
            className="text-sm border border-border rounded-lg px-3 py-2 bg-card flex-1 min-w-[200px]"
          />
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            <option value="">All Properties</option>
            {mappingPropertyNames.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          <select
            value={filterMeterType}
            onChange={(e) => setFilterMeterType(e.target.value as MeterType | "")}
            className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
          >
            <option value="">All Utilities</option>
            {(Object.entries(METER_TYPE_LABELS) as [MeterType, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {(search || filterProperty || filterMeterType) && (
            <button
              onClick={() => { setSearch(""); setFilterProperty(""); setFilterMeterType(""); }}
              className="text-xs text-accent hover:underline"
            >
              Clear filters
            </button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">
            {sortedMappings.length} of {mappings.length} mapping{mappings.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Bulk Action Toolbar (only when something is selected) */}
      {selectedIds.size > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium">
            {selectedIds.size} mapping{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Set split:</label>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkUpdate({ splitMethod: e.target.value as SplitMethod });
                  e.target.value = "";
                }
              }}
              className="text-xs border border-border rounded px-2 py-1 bg-card"
            >
              <option value="">— choose —</option>
              {(Object.entries(SPLIT_METHOD_LABELS) as [SplitMethod, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Set metering:</label>
            <select
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  handleBulkUpdate({ meteringMethod: e.target.value as MeteringMethod });
                  e.target.value = "";
                }
              }}
              className="text-xs border border-border rounded px-2 py-1 bg-card"
            >
              <option value="">— choose —</option>
              {(Object.entries(METERING_METHOD_LABELS) as [MeteringMethod, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <button
            onClick={handleBulkDelete}
            className="px-3 py-1 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 transition-colors"
          >
            Delete {selectedIds.size}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-accent hover:underline ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Mappings Table */}
      {sortedMappings.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={sortedMappings.length > 0 && sortedMappings.every((m) => selectedIds.has(m.id))}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Select all currently visible (filtered) rows
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            for (const m of sortedMappings) next.add(m.id);
                            return next;
                          });
                        } else {
                          // Deselect all currently visible rows
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            for (const m of sortedMappings) next.delete(m.id);
                            return next;
                          });
                        }
                      }}
                    />
                  </th>
                  <SortHeader label="Property" sortKey="property" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Utility" sortKey="meterType" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Metering" sortKey="meteringMethod" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <SortHeader label="Split Method" sortKey="splitMethod" current={sortKey} dir={sortDir} onClick={toggleSort} />
                  <th className="text-left px-4 py-3 font-medium">Meter #</th>
                  <SortHeader label="Units" sortKey="units" current={sortKey} dir={sortDir} onClick={toggleSort} align="right" />
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedMappings.map((m) => (
                  <tr
                    key={m.id}
                    className={`border-b border-border last:border-0 hover:bg-muted/30 ${selectedIds.has(m.id) ? "bg-accent/5" : ""}`}
                  >
                    <td className="px-3 py-2 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() => toggleRowSelected(m.id)}
                      />
                    </td>
                    <td className="px-4 py-2 font-medium max-w-xs truncate" title={m.propertyName}>
                      {m.propertyName}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-base leading-none">
                          {m.meterType === "water" ? "💧" : m.meterType === "gas" ? "🔥" : m.meterType === "electric" ? "⚡" : "🗑️"}
                        </span>
                        <span className="capitalize">{m.meterType}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={m.meteringMethod}
                        onChange={(e) => handleInlineUpdate(m.id, { meteringMethod: e.target.value as MeteringMethod })}
                        className="text-xs border border-border rounded px-2 py-1 bg-card"
                      >
                        {(Object.entries(METERING_METHOD_LABELS) as [MeteringMethod, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={m.splitMethod}
                        onChange={(e) => handleInlineUpdate(m.id, { splitMethod: e.target.value as SplitMethod })}
                        className="text-xs border border-border rounded px-2 py-1 bg-card"
                      >
                        {(Object.entries(SPLIT_METHOD_LABELS) as [SplitMethod, string][]).map(([k, v]) => (
                          <option key={k} value={k}>{v}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{m.meterId}</td>
                    <td className="px-4 py-2 text-right">{m.unitIds.length}</td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => { setEditMapping(m); setShowForm(false); }}
                        className="text-xs text-accent hover:underline mr-3"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(m.id)}
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
      ) : mappings.length > 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No mappings match the current filters.
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No meter mappings configured. Click &quot;Import Spreadsheet&quot; to bulk-load,
          or &quot;+ Add Mapping&quot; to add one manually.
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

// ─── CSV Import Preview ─────────────────────────────────────

function CsvImportPreview({
  preview,
  filename,
  existingCount,
  mode,
  onModeChange,
  onConfirm,
  onCancel,
}: {
  preview: ImportResult;
  filename: string;
  existingCount: number;
  mode: "merge" | "replace";
  onModeChange: (m: "merge" | "replace") => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // Stats
  const byType: Record<string, number> = {};
  for (const m of preview.mappings) {
    byType[m.meterType] = (byType[m.meterType] || 0) + 1;
  }
  const propertyCount = new Set(preview.mappings.map((m) => m.propertyName)).size;
  const unitCount = new Set(preview.mappings.flatMap((m) => m.unitIds)).size;

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="font-semibold">Import Preview</h2>
        <p className="text-xs text-muted-foreground mt-1">
          {filename} &middot; {preview.rowsProcessed} row{preview.rowsProcessed !== 1 ? "s" : ""} processed
          {preview.rowsSkipped > 0 ? `, ${preview.rowsSkipped} skipped` : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-5 border-b border-border">
        <div>
          <p className="text-xs text-muted-foreground">Mappings</p>
          <p className="text-2xl font-bold mt-1">{preview.mappings.length}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Properties</p>
          <p className="text-2xl font-bold mt-1">{propertyCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Unique Units</p>
          <p className="text-2xl font-bold mt-1">{unitCount}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">By Utility</p>
          <p className="text-sm mt-1">
            {Object.entries(byType).map(([type, count]) => (
              <span key={type} className="inline-block mr-2">
                {type}: <strong>{count}</strong>
              </span>
            ))}
          </p>
        </div>
      </div>

      {/* Warnings */}
      {preview.warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border-b border-border">
          <p className="text-xs font-semibold text-amber-900 mb-1">Warnings</p>
          <ul className="text-xs text-amber-800 list-disc list-inside space-y-0.5">
            {preview.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Sample mappings */}
      {preview.mappings.length > 0 ? (
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium">Property</th>
                <th className="text-left px-4 py-3 font-medium">Utility</th>
                <th className="text-left px-4 py-3 font-medium">Account #</th>
                <th className="text-left px-4 py-3 font-medium">Method</th>
                <th className="text-right px-4 py-3 font-medium">Units</th>
              </tr>
            </thead>
            <tbody>
              {preview.mappings.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-medium">{m.propertyName}</td>
                  <td className="px-4 py-2 capitalize text-muted-foreground">{m.meterType}</td>
                  <td className="px-4 py-2 text-xs font-mono text-muted-foreground">{m.meterId}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {METERING_METHOD_LABELS[m.meteringMethod]}
                  </td>
                  <td className="px-4 py-2 text-right">{m.unitIds.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-5 text-sm text-muted-foreground">
          No mappings could be extracted from this file. Check that the column headers match
          the expected format (Unit ID - RR, Property Name, LADWP Electric Account #, etc.).
        </div>
      )}

      {/* Mode + Actions */}
      <div className="p-5 border-t border-border space-y-4">
        <div>
          <p className="text-xs text-muted-foreground mb-2">Import mode</p>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "merge"}
                onChange={() => onModeChange("merge")}
              />
              <span>
                <strong>Merge</strong> with existing ({existingCount} current)
                <span className="text-xs text-muted-foreground ml-1">
                  — overwrites mappings with the same ID, keeps the rest
                </span>
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="import-mode"
                checked={mode === "replace"}
                onChange={() => onModeChange("replace")}
              />
              <span>
                <strong>Replace all</strong>
                <span className="text-xs text-muted-foreground ml-1">
                  — deletes all existing mappings first
                </span>
              </span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onConfirm}
            disabled={preview.mappings.length === 0}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            Import {preview.mappings.length} Mapping{preview.mappings.length !== 1 ? "s" : ""}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sortable column header ─────────────────────────────────

function SortHeader<K extends string>({
  label,
  sortKey,
  current,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: K;
  current: K;
  dir: "asc" | "desc";
  onClick: (k: K) => void;
  align?: "left" | "right";
}) {
  const active = current === sortKey;
  const arrow = active ? (dir === "asc" ? "▲" : "▼") : "";
  return (
    <th
      onClick={() => onClick(sortKey)}
      className={`px-4 py-3 font-medium cursor-pointer select-none hover:bg-muted/80 ${align === "right" ? "text-right" : "text-left"}`}
    >
      {label} <span className="text-xs text-muted-foreground">{arrow}</span>
    </th>
  );
}
