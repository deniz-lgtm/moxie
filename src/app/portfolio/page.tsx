"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Download,
  LayoutGrid,
  Search,
  Table as TableIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { DashboardStats, Property, Unit, VacantUnit } from "@/lib/types";

type PropertySummary = {
  property: Property;
  units: Unit[];
  occupied: number;
  vacant: number;
  notice: number;
  occupancyRate: number;
  totalMonthlyRent: number;
  avgRent: number;
  totalSqft: number;
  avgRentPerSqft: number;
  nextExpiration: string | null;
  expiringNext90: number;
};

type ViewMode = "cards" | "table";
type SortKey =
  | "name"
  | "units"
  | "occupancy"
  | "vacant"
  | "rent"
  | "avgRent"
  | "avgRentPerSqft"
  | "expiringNext90";

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  return Math.round((b - a) / 86400000);
}

export default function PortfolioPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [vacantUnitIds, setVacantUnitIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [vacancyLoading, setVacancyLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Controls
  const [asOfDate, setAsOfDate] = useState<string>(todayIso());
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Initial load: properties, units, dashboard stats
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/appfolio/properties").then((r) => r.json()),
      fetch("/api/appfolio/units").then((r) => r.json()),
      fetch("/api/appfolio/dashboard").then((r) => r.json()),
    ])
      .then(([propData, unitData, dashData]) => {
        setProperties(propData.properties || []);
        setUnits(unitData.units || []);
        if (dashData.stats) setStats(dashData.stats);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Vacancy set refetches when the as-of date changes. unit_vacancy_detail
  // accounts for future signed leases, so a future `asOfDate` answers
  // "which units won't have a lease by that date yet".
  useEffect(() => {
    let cancelled = false;
    setVacancyLoading(true);
    fetch(`/api/appfolio/units?vacancies_on=${asOfDate}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setVacantUnitIds(
          new Set((j.vacancies as VacantUnit[] | undefined)?.map((v) => v.unitId) ?? [])
        );
      })
      .catch(() => {
        if (!cancelled) setVacantUnitIds(new Set());
      })
      .finally(() => {
        if (!cancelled) setVacancyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [asOfDate]);

  const summaries: PropertySummary[] = useMemo(() => {
    const asOfMs = new Date(asOfDate).getTime();
    return properties.map((p) => {
      const propUnits = units.filter((u) => u.propertyId === p.id);
      const occupiedUnits = propUnits.filter((u) => !vacantUnitIds.has(u.id));
      const occupied = occupiedUnits.length;
      const vacant = propUnits.length - occupied;
      const notice = propUnits.filter((u) => u.status === "notice").length;
      const totalRent = occupiedUnits.reduce((s, u) => s + (Number(u.rent) || 0), 0);
      const totalSqft = occupiedUnits.reduce((s, u) => s + (u.sqft || 0), 0);
      const avgRent = occupiedUnits.length > 0 ? Math.round(totalRent / occupiedUnits.length) : 0;
      const avgRentPerSqft = totalSqft > 0 ? totalRent / totalSqft : 0;

      const expirations = propUnits
        .map((u) => u.leaseTo)
        .filter((d): d is string => Boolean(d));
      const future = expirations
        .filter((d) => new Date(d).getTime() >= asOfMs)
        .sort();
      const nextExpiration = future[0] ?? null;
      const expiringNext90 = expirations.filter((d) => {
        const dd = new Date(d).getTime();
        return dd >= asOfMs && daysBetween(asOfDate, d) <= 90;
      }).length;

      return {
        property: p,
        units: propUnits,
        occupied,
        vacant,
        notice,
        occupancyRate:
          propUnits.length > 0 ? Math.round((occupied / propUnits.length) * 100) : 0,
        totalMonthlyRent: totalRent,
        avgRent,
        totalSqft,
        avgRentPerSqft,
        nextExpiration,
        expiringNext90,
      };
    });
  }, [properties, units, vacantUnitIds, asOfDate]);

  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? summaries.filter(
          (s) =>
            s.property.name.toLowerCase().includes(q) ||
            (s.property.address || "").toLowerCase().includes(q)
        )
      : summaries;
    const getKey = (s: PropertySummary): number | string => {
      switch (sortKey) {
        case "name":
          return s.property.name.toLowerCase();
        case "units":
          return s.units.length;
        case "occupancy":
          return s.occupancyRate;
        case "vacant":
          return s.vacant;
        case "rent":
          return s.totalMonthlyRent;
        case "avgRent":
          return s.avgRent;
        case "avgRentPerSqft":
          return s.avgRentPerSqft;
        case "expiringNext90":
          return s.expiringNext90;
      }
    };
    const sorted = [...filtered].sort((a, b) => {
      const av = getKey(a);
      const bv = getKey(b);
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return sortDir === "desc" ? sorted.reverse() : sorted;
  }, [summaries, search, sortKey, sortDir]);

  const selected = useMemo(
    () => summaries.find((s) => s.property.id === selectedId) ?? null,
    [summaries, selectedId]
  );

  const totals = useMemo(() => {
    const totalUnits = summaries.reduce((s, p) => s + p.units.length, 0);
    const totalOccupied = summaries.reduce((s, p) => s + p.occupied, 0);
    const totalRent = summaries.reduce((s, p) => s + p.totalMonthlyRent, 0);
    const totalVacant = summaries.reduce((s, p) => s + p.vacant, 0);
    return {
      totalUnits,
      totalOccupied,
      totalVacant,
      totalRent,
      occupancy: totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0,
    };
  }, [summaries]);

  const toggleSort = useCallback(
    (key: SortKey) => {
      setSortKey((prev) => {
        if (prev === key) {
          setSortDir((d) => (d === "asc" ? "desc" : "asc"));
          return prev;
        }
        setSortDir("asc");
        return key;
      });
    },
    []
  );

  const exportCsv = useCallback(() => {
    const rows = [
      [
        "Property",
        "Address",
        "Units",
        "Occupied",
        "Vacant",
        "Notice",
        "Occupancy %",
        "Monthly Rent",
        "Avg Rent",
        "Total Sqft",
        "Avg Rent/Sqft",
        "Next Lease Expiration",
        "Expirations in next 90d",
      ],
      ...filteredSorted.map((s) => [
        s.property.name,
        s.property.address ?? "",
        s.units.length,
        s.occupied,
        s.vacant,
        s.notice,
        s.occupancyRate,
        s.totalMonthlyRent,
        s.avgRent,
        s.totalSqft,
        s.avgRentPerSqft.toFixed(2),
        s.nextExpiration ?? "",
        s.expiringNext90,
      ]),
    ];
    const csv = rows
      .map((r) =>
        r
          .map((cell) => {
            const v = String(cell ?? "");
            // Quote if contains comma, quote, or newline; escape quotes.
            return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
          })
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${asOfDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredSorted, asOfDate]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Portfolio Overview</h1>
          <p className="text-muted-foreground mt-1">Loading from AppFolio…</p>
        </div>
      </div>
    );
  }

  if (selected) {
    return <PropertyDetailView selected={selected} onBack={() => setSelectedId(null)} />;
  }

  const isFuture = asOfDate > todayIso();

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Portfolio Overview</h1>
          <p className="text-muted-foreground mt-1">
            Property-level performance — occupancy, revenue, and unit details{" "}
            {isFuture && (
              <span className="text-accent font-medium">· projected look-ahead</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">As of</span>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-card"
            />
            {asOfDate !== todayIso() && (
              <button
                onClick={() => setAsOfDate(todayIso())}
                className="text-xs text-accent hover:underline"
                title="Reset to today"
              >
                Today
              </button>
            )}
          </label>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode("table")}
              className={`px-3 py-1.5 text-sm inline-flex items-center gap-1 ${
                viewMode === "table" ? "bg-accent text-white" : "bg-card hover:bg-muted"
              }`}
              title="Table view"
            >
              <TableIcon className="w-4 h-4" /> Table
            </button>
            <button
              onClick={() => setViewMode("cards")}
              className={`px-3 py-1.5 text-sm inline-flex items-center gap-1 ${
                viewMode === "cards" ? "bg-accent text-white" : "bg-card hover:bg-muted"
              }`}
              title="Card view"
            >
              <LayoutGrid className="w-4 h-4" /> Cards
            </button>
          </div>
          <button
            onClick={exportCsv}
            className="px-3 py-1.5 text-sm inline-flex items-center gap-1 border border-border rounded-lg bg-card hover:bg-muted"
            title="Export current view to CSV"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      {/* Portfolio totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Properties" value={summaries.length} />
        <KpiCard label="Total Units" value={totals.totalUnits} />
        <KpiCard
          label="Occupancy"
          value={`${totals.occupancy}%`}
          hint={`${totals.totalOccupied} of ${totals.totalUnits}`}
        />
        <KpiCard label="Unleased" value={totals.totalVacant} accent="red" />
        <KpiCard
          label="Monthly Revenue"
          value={`$${totals.totalRent.toLocaleString()}`}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or address"
          className="w-full text-sm border border-border rounded-lg pl-9 pr-3 py-2 bg-card"
        />
      </div>

      {vacancyLoading && (
        <p className="text-xs text-muted-foreground">
          Recomputing for {asOfDate}…
        </p>
      )}

      {summaries.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No properties found in AppFolio.
        </div>
      ) : viewMode === "table" ? (
        <PropertyTable
          summaries={filteredSorted}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          onSelect={(id) => setSelectedId(id)}
          stats={stats}
        />
      ) : (
        <PropertyCards summaries={filteredSorted} onSelect={(id) => setSelectedId(id)} />
      )}
    </div>
  );
}

function KpiCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: "red" | "green";
}) {
  const color =
    accent === "red"
      ? "text-red-600"
      : accent === "green"
        ? "text-green-600"
        : "";
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function PropertyTable({
  summaries,
  sortKey,
  sortDir,
  onSort,
  onSelect,
}: {
  summaries: PropertySummary[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  onSelect: (id: string) => void;
  stats: DashboardStats | null;
}) {
  const headers: { key: SortKey; label: string; align?: "right" | "left" }[] = [
    { key: "name", label: "Property", align: "left" },
    { key: "units", label: "Units", align: "right" },
    { key: "occupancy", label: "Occupancy", align: "right" },
    { key: "vacant", label: "Unleased", align: "right" },
    { key: "rent", label: "Monthly Rent", align: "right" },
    { key: "avgRent", label: "Avg Rent", align: "right" },
    { key: "avgRentPerSqft", label: "$/Sqft", align: "right" },
    { key: "expiringNext90", label: "Exp. 90d", align: "right" },
  ];
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted">
              {headers.map((h) => (
                <th
                  key={h.key}
                  className={`${
                    h.align === "right" ? "text-right" : "text-left"
                  } px-4 py-3 font-medium cursor-pointer select-none whitespace-nowrap`}
                  onClick={() => onSort(h.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {h.label}
                    {sortKey === h.key &&
                      (sortDir === "asc" ? (
                        <ArrowUpAZ className="w-3 h-3" />
                      ) : (
                        <ArrowDownAZ className="w-3 h-3" />
                      ))}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {summaries.map((s) => {
              const occColor =
                s.occupancyRate >= 90
                  ? "text-green-600"
                  : s.occupancyRate >= 70
                    ? "text-yellow-600"
                    : "text-red-600";
              return (
                <tr
                  key={s.property.id}
                  onClick={() => onSelect(s.property.id)}
                  className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.property.name}</div>
                    <div className="text-xs text-muted-foreground truncate max-w-sm">
                      {s.property.address}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.units.length}</td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${occColor}`}>
                    {s.occupancyRate}%
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.vacant > 0 ? (
                      <span className="text-red-600 font-medium">{s.vacant}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    ${s.totalMonthlyRent.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {s.avgRent > 0 ? `$${s.avgRent.toLocaleString()}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {s.avgRentPerSqft > 0 ? `$${s.avgRentPerSqft.toFixed(2)}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.expiringNext90}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PropertyCards({
  summaries,
  onSelect,
}: {
  summaries: PropertySummary[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {summaries.map((s) => (
        <button
          key={s.property.id}
          onClick={() => onSelect(s.property.id)}
          className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
        >
          <h3 className="font-semibold">{s.property.name}</h3>
          <p className="text-xs text-muted-foreground mt-1 truncate">{s.property.address}</p>

          <div className="mt-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-lg font-bold">{s.units.length}</p>
              <p className="text-xs text-muted-foreground">Units</p>
            </div>
            <div>
              <p
                className={`text-lg font-bold ${
                  s.occupancyRate >= 90
                    ? "text-green-600"
                    : s.occupancyRate >= 70
                      ? "text-yellow-600"
                      : "text-red-600"
                }`}
              >
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
              className={`h-full rounded-full ${
                s.occupancyRate >= 90
                  ? "bg-green-500"
                  : s.occupancyRate >= 70
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${s.occupancyRate}%` }}
            />
          </div>

          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {s.occupied} occupied · {s.vacant} unleased
              {s.notice > 0 ? ` · ${s.notice} notice` : ""}
            </span>
            <span>${s.totalMonthlyRent.toLocaleString()}/mo</span>
          </div>
        </button>
      ))}
    </div>
  );
}

function PropertyDetailView({
  selected,
  onBack,
}: {
  selected: PropertySummary;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-accent hover:underline">
        ← Back to Portfolio
      </button>

      <div>
        <h1 className="text-2xl font-bold">{selected.property.name}</h1>
        <p className="text-muted-foreground mt-1">{selected.property.address}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total Units" value={selected.units.length} />
        <KpiCard label="Occupancy" value={`${selected.occupancyRate}%`} />
        <KpiCard
          label="Monthly Rent"
          value={`$${selected.totalMonthlyRent.toLocaleString()}`}
        />
        <KpiCard label="Avg Rent" value={`$${selected.avgRent.toLocaleString()}`} />
      </div>

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
                  .sort((a, b) =>
                    a.number.localeCompare(b.number, undefined, { numeric: true })
                  )
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
                      <td className="px-4 py-3">
                        <StatusBadge
                          value={u.status === "current" ? "occupied" : u.status}
                        />
                      </td>
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
