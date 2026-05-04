"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Pencil,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { academicYearDates, type AcademicYear, type Unit, type VacantUnit } from "@/lib/types";
import type { UnitOverride } from "@/lib/unit-overrides-db";

// Column definition: every column the user can toggle on the table.
// `key` is also the localStorage flag and the sort key; `header` is the
// rendered <th> label; `accessor` extracts the value for display + sort.
type ColumnKey =
  | "displayName"
  | "propertyName"
  | "unitNumber"
  | "status"
  | "ayStatus"
  | "bedBath"
  | "sqft"
  | "rent"
  | "tenant"
  | "leaseFrom"
  | "leaseTo"
  | "moveOut"
  | "notes";

type ColumnDef = {
  key: ColumnKey;
  header: string;
  align?: "left" | "right";
  defaultVisible: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "displayName", header: "Unit name", defaultVisible: true },
  { key: "propertyName", header: "Property", defaultVisible: true },
  { key: "unitNumber", header: "Unit #", defaultVisible: false },
  { key: "status", header: "Status", defaultVisible: true },
  { key: "ayStatus", header: "AY status", defaultVisible: true },
  { key: "bedBath", header: "Bd/Ba", defaultVisible: true },
  { key: "sqft", header: "Sqft", align: "right", defaultVisible: false },
  { key: "rent", header: "Rent", align: "right", defaultVisible: true },
  { key: "tenant", header: "Tenant", defaultVisible: true },
  { key: "leaseFrom", header: "Lease start", defaultVisible: false },
  { key: "leaseTo", header: "Lease end", defaultVisible: true },
  { key: "moveOut", header: "Move-out", defaultVisible: false },
  { key: "notes", header: "Notes", defaultVisible: false },
];

const COLUMN_VISIBILITY_KEY = "moxie:units-columns-v1";

type AyStatus = "leased" | "unleased" | "unknown";

// Merged row: AppFolio truth + Moxie override layered on top. The
// tie-back to AppFolio is `appfolioUnitId`; if no override row exists
// the merged values are identical to the AppFolio values.
type UnitRow = {
  appfolioUnitId: string;
  unitName: string;          // AppFolio's primary label (kept for fallback display + reset)
  displayName: string;       // override.displayName ?? unitName
  propertyName: string;
  propertyId: string;
  unitNumber: string;
  status: Unit["status"];
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  rent: number | string | null;
  tenant: string | null;
  leaseFrom: string | null;
  leaseTo: string | null;
  moveIn: string | null;
  moveOut: string | null;
  notes: string;             // override.notes ?? ""
  ayStatus: AyStatus;
  hasOverride: boolean;
};

function readVisibility(): Record<ColumnKey, boolean> {
  const defaults = Object.fromEntries(
    COLUMNS.map((c) => [c.key, c.defaultVisible])
  ) as Record<ColumnKey, boolean>;
  if (typeof window === "undefined") return defaults;
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<Record<ColumnKey, boolean>>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

function fmtRent(rent: number | string | null): string {
  if (rent == null || rent === "") return "—";
  const n = Number(rent);
  if (Number.isNaN(n)) return String(rent);
  return `$${n.toLocaleString()}`;
}

function fmtBedBath(bd: number | null, ba: number | null): string {
  if (bd == null && ba == null) return "—";
  return `${bd ?? "—"}bd / ${ba ?? "—"}ba`;
}

export default function UnitsPage() {
  const { portfolioId } = usePortfolio();

  const [academicYear, setAcademicYear] = useState<AcademicYear>("2026-2027");
  const [units, setUnits] = useState<Unit[]>([]);
  const [vacancies, setVacancies] = useState<VacantUnit[]>([]);
  const [overrides, setOverrides] = useState<Record<string, UnitOverride>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(readVisibility);
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<ColumnKey>("propertyName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [notesEditingId, setNotesEditingId] = useState<string | null>(null);
  const [notesValue, setNotesValue] = useState("");

  // Persist column visibility on every change.
  useEffect(() => {
    try {
      window.localStorage.setItem(COLUMN_VISIBILITY_KEY, JSON.stringify(visible));
    } catch {
      // ignore
    }
  }, [visible]);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const aySearch = `vacancies_ay=${encodeURIComponent(academicYear)}`;
      const [unitsR, vacR, overR] = await Promise.all([
        fetch(`/api/appfolio/units?portfolio_id=${portfolioId}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/appfolio/units?${aySearch}&portfolio_id=${portfolioId}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/units/overrides`).then((r) => r.json()).catch(() => ({})),
      ]);
      setUnits(Array.isArray(unitsR.units) ? unitsR.units : []);
      setVacancies(Array.isArray(vacR.vacancies) ? vacR.vacancies : []);
      const overList: UnitOverride[] = Array.isArray(overR.overrides) ? overR.overrides : [];
      const overMap: Record<string, UnitOverride> = {};
      for (const o of overList) overMap[o.appfolioUnitId] = o;
      setOverrides(overMap);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [academicYear, portfolioId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Build merged rows. AppFolio values are the base; override values
  // (when present) shadow the matching AppFolio field on display, but
  // both are kept on the row so a "reset" can revert without a refetch.
  const rows: UnitRow[] = useMemo(() => {
    const vacantIds = new Set(vacancies.map((v) => v.unitId));
    return units.map((u): UnitRow => {
      const id = u.appfolioId || u.id;
      const ov = overrides[id];
      const ayStatus: AyStatus =
        vacantIds.size === 0 ? "unknown" : vacantIds.has(u.id) ? "unleased" : "leased";
      return {
        appfolioUnitId: id,
        unitName: u.unitName || u.displayName || u.number || "Unit",
        displayName: ov?.displayName || u.unitName || u.displayName || u.number || "Unit",
        propertyName: u.propertyName || "—",
        propertyId: u.propertyId,
        unitNumber: u.number,
        status: u.status,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        sqft: u.sqft,
        rent: u.rent,
        tenant: u.tenant,
        leaseFrom: u.leaseFrom,
        leaseTo: u.leaseTo,
        moveIn: u.moveIn,
        moveOut: u.moveOut,
        notes: ov?.notes ?? "",
        ayStatus,
        hasOverride: Boolean(ov && (ov.displayName || ov.notes)),
      };
    });
  }, [units, vacancies, overrides]);

  const properties = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.propertyName) set.add(r.propertyName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (propertyFilter !== "all" && r.propertyName !== propertyFilter) return false;
      if (!q) return true;
      const hay = [
        r.displayName,
        r.unitName,
        r.propertyName,
        r.unitNumber,
        r.tenant || "",
        r.notes,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, propertyFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const value = (r: UnitRow): string | number => {
      switch (sortBy) {
        case "displayName": return r.displayName.toLowerCase();
        case "propertyName": return r.propertyName.toLowerCase();
        case "unitNumber": return r.unitNumber.toLowerCase();
        case "status": return r.status;
        case "ayStatus": return r.ayStatus;
        case "bedBath": return (r.bedrooms ?? -1) * 10 + (r.bathrooms ?? 0);
        case "sqft": return r.sqft ?? -1;
        case "rent": return Number(r.rent) || -1;
        case "tenant": return (r.tenant || "").toLowerCase();
        case "leaseFrom": return r.leaseFrom || "";
        case "leaseTo": return r.leaseTo || "";
        case "moveOut": return r.moveOut || "";
        case "notes": return r.notes.toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const va = value(a);
      const vb = value(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sortBy, sortDir]);

  const handleSort = (key: ColumnKey) => {
    if (sortBy === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("asc");
    }
  };

  const startEditName = (row: UnitRow) => {
    setEditingId(row.appfolioUnitId);
    setEditValue(row.displayName);
  };

  const saveEditName = useCallback(
    async (row: UnitRow) => {
      const next = editValue.trim();
      setEditingId(null);
      // No-op if the entered value matches what's already shown.
      if (next === row.displayName) return;
      // Empty input clears the override (revert to AppFolio value).
      const displayName = next.length === 0 ? null : next;
      // Optimistic
      setOverrides((prev) => ({
        ...prev,
        [row.appfolioUnitId]: {
          ...(prev[row.appfolioUnitId] ?? {
            appfolioUnitId: row.appfolioUnitId,
            displayName: null,
            notes: null,
            customFields: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          displayName,
        },
      }));
      try {
        const r = await fetch(`/api/units/overrides`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appfolio_unit_id: row.appfolioUnitId,
            display_name: displayName,
          }),
        });
        const j = await r.json();
        if (j.override) {
          setOverrides((prev) => ({ ...prev, [row.appfolioUnitId]: j.override }));
        }
      } catch (e) {
        alert(`Couldn't save override: ${(e as Error).message}`);
      }
    },
    [editValue]
  );

  const startEditNotes = (row: UnitRow) => {
    setNotesEditingId(row.appfolioUnitId);
    setNotesValue(row.notes);
  };

  const saveEditNotes = useCallback(
    async (row: UnitRow) => {
      const next = notesValue;
      setNotesEditingId(null);
      if (next === row.notes) return;
      const notes = next.trim().length === 0 ? null : next;
      setOverrides((prev) => ({
        ...prev,
        [row.appfolioUnitId]: {
          ...(prev[row.appfolioUnitId] ?? {
            appfolioUnitId: row.appfolioUnitId,
            displayName: null,
            notes: null,
            customFields: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }),
          notes,
        },
      }));
      try {
        const r = await fetch(`/api/units/overrides`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appfolio_unit_id: row.appfolioUnitId,
            notes,
          }),
        });
        const j = await r.json();
        if (j.override) {
          setOverrides((prev) => ({ ...prev, [row.appfolioUnitId]: j.override }));
        }
      } catch (e) {
        alert(`Couldn't save notes: ${(e as Error).message}`);
      }
    },
    [notesValue]
  );

  const resetOverride = useCallback(async (row: UnitRow) => {
    if (!confirm(`Reset overrides for "${row.displayName}"? This restores the AppFolio values.`)) {
      return;
    }
    // Optimistic
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[row.appfolioUnitId];
      return next;
    });
    try {
      await fetch(
        `/api/units/overrides?appfolio_unit_id=${encodeURIComponent(row.appfolioUnitId)}`,
        { method: "DELETE" }
      );
    } catch (e) {
      alert(`Couldn't reset: ${(e as Error).message}`);
    }
  }, []);

  const target = academicYearDates(academicYear).leaseStart;
  const targetLabel = new Date(target + "T00:00:00").toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const visibleColumns = COLUMNS.filter((c) => visible[c.key]);
  const overrideCount = Object.values(overrides).filter(
    (o) => o.displayName || o.notes
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="w-6 h-6" /> Units
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Every unit in the portfolio. Pulled from AppFolio, with Moxie
            overrides layered on top — edit a unit name or notes here and the
            override is saved by AppFolio unit ID. Reset to fall back to
            AppFolio. Switch academic year to recompute leased / unleased
            status against the lease covering{" "}
            <span className="font-medium text-foreground">{targetLabel}</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <AcademicYearSelector value={academicYear} onChange={setAcademicYear} />
          <button
            onClick={loadAll}
            disabled={refreshing}
            className="px-3 py-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Total units" value={rows.length} />
        <StatCard
          label="Unleased on AY start"
          value={rows.filter((r) => r.ayStatus === "unleased").length}
        />
        <StatCard
          label="Properties"
          value={properties.length}
        />
        <StatCard label="With overrides" value={overrideCount} />
      </div>

      {/* Filter bar */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search unit name, property, tenant, notes…"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
        </div>
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
        >
          <option value="all">All properties</option>
          {properties.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <div className="relative">
          <button
            onClick={() => setColumnPickerOpen((o) => !o)}
            className="px-3 py-2 border border-border rounded-lg hover:bg-muted inline-flex items-center gap-2 text-sm font-medium"
          >
            <Settings2 className="w-4 h-4" /> Columns
          </button>
          {columnPickerOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-lg shadow-lg z-20 p-2 max-h-80 overflow-y-auto">
              {COLUMNS.map((c) => (
                <label
                  key={c.key}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                >
                  <input
                    type="checkbox"
                    checked={visible[c.key]}
                    onChange={(e) =>
                      setVisible((v) => ({ ...v, [c.key]: e.target.checked }))
                    }
                  />
                  {c.header}
                </label>
              ))}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">
          Showing {sorted.length} of {rows.length}
        </span>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading units…</div>
        ) : sorted.length === 0 ? (
          <div className="p-10 text-center">
            <Building2 className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No units match these filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  {visibleColumns.map((c) => (
                    <th
                      key={c.key}
                      onClick={() => handleSort(c.key)}
                      className={`px-4 py-3 font-medium cursor-pointer hover:bg-muted/70 select-none ${
                        c.align === "right" ? "text-right" : "text-left"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.header}
                        {sortBy === c.key && (
                          sortDir === "asc"
                            ? <ChevronUp className="w-3 h-3" />
                            : <ChevronDown className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium w-12"> </th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr
                    key={row.appfolioUnitId}
                    className="border-b border-border last:border-0 hover:bg-muted/30"
                  >
                    {visibleColumns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3 align-top ${
                          c.align === "right" ? "text-right" : ""
                        }`}
                      >
                        {renderCell(c.key, row, {
                          editingId,
                          editValue,
                          setEditValue,
                          startEditName,
                          saveEditName,
                          notesEditingId,
                          notesValue,
                          setNotesValue,
                          startEditNotes,
                          saveEditNotes,
                          cancelEdit: () => setEditingId(null),
                          cancelNotesEdit: () => setNotesEditingId(null),
                        })}
                      </td>
                    ))}
                    <td className="px-2 py-3 text-right">
                      {row.hasOverride && (
                        <button
                          onClick={() => resetOverride(row)}
                          className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title="Reset to AppFolio values"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

type CellProps = {
  editingId: string | null;
  editValue: string;
  setEditValue: (v: string) => void;
  startEditName: (row: UnitRow) => void;
  saveEditName: (row: UnitRow) => void;
  notesEditingId: string | null;
  notesValue: string;
  setNotesValue: (v: string) => void;
  startEditNotes: (row: UnitRow) => void;
  saveEditNotes: (row: UnitRow) => void;
  cancelEdit: () => void;
  cancelNotesEdit: () => void;
};

function renderCell(key: ColumnKey, row: UnitRow, p: CellProps): React.ReactNode {
  switch (key) {
    case "displayName":
      return p.editingId === row.appfolioUnitId ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            value={p.editValue}
            onChange={(e) => p.setEditValue(e.target.value)}
            onBlur={() => p.saveEditName(row)}
            onKeyDown={(e) => {
              if (e.key === "Enter") p.saveEditName(row);
              if (e.key === "Escape") p.cancelEdit();
            }}
            placeholder={row.unitName}
            className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background"
          />
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              p.saveEditName(row);
            }}
            className="p-1 text-green-600 hover:bg-muted rounded"
            title="Save"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              p.cancelEdit();
            }}
            className="p-1 text-muted-foreground hover:bg-muted rounded"
            title="Cancel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => p.startEditName(row)}
          className="text-left font-medium hover:underline inline-flex items-center gap-1.5 group"
          title={row.hasOverride ? `AppFolio: ${row.unitName}` : undefined}
        >
          {row.displayName}
          {row.hasOverride && row.displayName !== row.unitName && (
            <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 py-0.5">
              Edited
            </span>
          )}
          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity" />
        </button>
      );
    case "propertyName":
      return <span className="text-muted-foreground">{row.propertyName}</span>;
    case "unitNumber":
      return <span className="text-muted-foreground">{row.unitNumber || "—"}</span>;
    case "status":
      return <StatusBadge value={row.status} />;
    case "ayStatus":
      return row.ayStatus === "unknown" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <StatusBadge value={row.ayStatus === "leased" ? "occupied" : "vacant"} />
      );
    case "bedBath":
      return (
        <span className="text-muted-foreground">
          {fmtBedBath(row.bedrooms, row.bathrooms)}
        </span>
      );
    case "sqft":
      return (
        <span className="text-muted-foreground">
          {row.sqft != null ? row.sqft.toLocaleString() : "—"}
        </span>
      );
    case "rent":
      return <span className="font-medium">{fmtRent(row.rent)}</span>;
    case "tenant":
      return (
        <span className={row.tenant ? "" : "text-muted-foreground italic"}>
          {row.tenant || "Vacant"}
        </span>
      );
    case "leaseFrom":
      return <span className="text-muted-foreground">{row.leaseFrom || "—"}</span>;
    case "leaseTo":
      return <span className="text-muted-foreground">{row.leaseTo || "—"}</span>;
    case "moveOut":
      return <span className="text-muted-foreground">{row.moveOut || "—"}</span>;
    case "notes":
      return p.notesEditingId === row.appfolioUnitId ? (
        <div className="flex items-start gap-1">
          <textarea
            autoFocus
            value={p.notesValue}
            onChange={(e) => p.setNotesValue(e.target.value)}
            onBlur={() => p.saveEditNotes(row)}
            onKeyDown={(e) => {
              if (e.key === "Escape") p.cancelNotesEdit();
            }}
            placeholder="Notes…"
            rows={2}
            className="flex-1 px-2 py-1 text-sm border border-border rounded bg-background resize-y min-w-[180px]"
          />
        </div>
      ) : (
        <button
          onClick={() => p.startEditNotes(row)}
          className="text-left text-muted-foreground hover:text-foreground hover:underline inline-flex items-start gap-1.5 max-w-[260px] group"
        >
          <span className="line-clamp-2">{row.notes || "—"}</span>
          <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-50 transition-opacity shrink-0 mt-0.5" />
        </button>
      );
  }
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
    </div>
  );
}
