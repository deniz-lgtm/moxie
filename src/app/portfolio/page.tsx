"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  Download,
  ExternalLink,
  LayoutGrid,
  Search,
  Shield,
  Table as TableIcon,
  Wrench,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  CapitalProject,
  DashboardStats,
  MaintenanceRequest,
  Property,
  PropertyAttribute,
  PropertyPnlLineItem,
  Unit,
  VacantUnit,
} from "@/lib/types";
import {
  PNL_EXPENSE_CATEGORIES,
  PNL_INCOME_CATEGORIES,
  isPnlIncomeCategory,
} from "@/lib/types";

type PropertySummary = {
  property: Property;
  units: Unit[];
  occupied: number;
  vacant: number;
  notice: number;
  /**
   * Units in AppFolio that have NO rent-roll row at all. Treated as
   * "not yet leaseable" (under construction / data gap) and kept out
   * of the occupancy denominator so a brand-new empty building
   * doesn't score 100 % occupied.
   */
  underConstruction: number;
  /** occupied + vacant; the denominator used for occupancyRate. */
  leaseable: number;
  /**
   * Percent occupied of the *leaseable* stock. `null` when leaseable
   * is 0 (every unit is still under construction / has no history).
   */
  occupancyRate: number | null;
  totalMonthlyRent: number;
  avgRent: number;
  totalSqft: number;
  avgRentPerSqft: number;
  nextExpiration: string | null;
  expiringNext90: number;
  // Property-side / asset-management
  openWorkOrders: number;
  workOrderSpendYtd: number;
  activeCapexCount: number;
  activeCapexSpend: number;
  activeCapexBudget: number;
  insuranceExpires: string | null;
  insuranceDaysToExpiry: number | null;
  taxNextDue: string | null;
  taxDaysToDue: number | null;
  attribute: PropertyAttribute | null;
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
  | "expiringNext90"
  | "openWorkOrders"
  | "workOrderSpendYtd"
  | "activeCapexSpend"
  | "insuranceDaysToExpiry"
  | "taxDaysToDue";

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
  // Unit IDs that show up on the rent roll at all. Anything in the
  // app's unit list but NOT here has no rent-roll history yet (likely
  // under construction) — we surface those separately and keep them
  // out of the occupancy denominator.
  const [coveredUnitIds, setCoveredUnitIds] = useState<Set<string>>(new Set());
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);
  const [capitalProjects, setCapitalProjects] = useState<CapitalProject[]>([]);
  const [attributes, setAttributes] = useState<Record<string, PropertyAttribute>>({});
  const [loading, setLoading] = useState(true);
  const [vacancyLoading, setVacancyLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Controls
  const [asOfDate, setAsOfDate] = useState<string>(todayIso());
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const refreshAttributes = useCallback(async () => {
    try {
      const j = await fetch("/api/properties/attributes").then((r) => r.json());
      const attrs = (j.attributes as PropertyAttribute[]) ?? [];
      const map: Record<string, PropertyAttribute> = {};
      for (const a of attrs) map[a.propertyId] = a;
      setAttributes(map);
    } catch {
      setAttributes({});
    }
  }, []);

  // Initial load: properties, units, dashboard stats, + operational data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/appfolio/properties").then((r) => r.json()).catch(() => ({})),
      fetch("/api/appfolio/units").then((r) => r.json()).catch(() => ({})),
      fetch("/api/appfolio/dashboard").then((r) => r.json()).catch(() => ({})),
      fetch("/api/maintenance/requests").then((r) => r.json()).catch(() => ({})),
      fetch("/api/capital-projects").then((r) => r.json()).catch(() => ({})),
      fetch("/api/properties/attributes").then((r) => r.json()).catch(() => ({})),
    ])
      .then(([propData, unitData, dashData, woData, capexData, attrData]) => {
        setProperties(propData.properties || []);
        setUnits(unitData.units || []);
        if (dashData.stats) setStats(dashData.stats);
        setWorkOrders(Array.isArray(woData.workOrders) ? woData.workOrders : []);
        setCapitalProjects(Array.isArray(capexData.projects) ? capexData.projects : []);
        const attrs: PropertyAttribute[] = Array.isArray(attrData.attributes)
          ? attrData.attributes
          : [];
        const map: Record<string, PropertyAttribute> = {};
        for (const a of attrs) map[a.propertyId] = a;
        setAttributes(map);
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
        setCoveredUnitIds(new Set((j.coveredUnitIds as string[] | undefined) ?? []));
      })
      .catch(() => {
        if (!cancelled) {
          setVacantUnitIds(new Set());
          setCoveredUnitIds(new Set());
        }
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
    const yearStart = new Date(new Date(asOfDate).getFullYear(), 0, 1).getTime();
    const openWoStatuses = new Set(["submitted", "assigned", "in_progress", "awaiting_parts"]);
    return properties.map((p) => {
      const propUnits = units.filter((u) => u.propertyId === p.id);
      // A unit is considered "leaseable" if it has any presence on the
      // rent roll (coveredUnitIds). Units without rent-roll history
      // are under construction / pre-onboarding — don't count them
      // toward either occupied or unleased.
      const leaseableUnits = propUnits.filter((u) => coveredUnitIds.has(u.id));
      const underConstruction = propUnits.length - leaseableUnits.length;
      const occupiedUnits = leaseableUnits.filter((u) => !vacantUnitIds.has(u.id));
      const occupied = occupiedUnits.length;
      const vacant = leaseableUnits.length - occupied;
      const leaseable = leaseableUnits.length;
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

      // Work orders scoped to this property.
      const propWo = workOrders.filter((w) => w.propertyId === p.id);
      const openWorkOrders = propWo.filter((w) => openWoStatuses.has(w.status)).length;
      const workOrderSpendYtd = propWo
        .filter((w) => {
          if (!w.completedDate) return false;
          const t = new Date(w.completedDate).getTime();
          return !isNaN(t) && t >= yearStart && t <= asOfMs;
        })
        .reduce((s, w) => s + (Number(w.actualCost) || 0), 0);

      // Capital projects scoped to this property; "active" = not completed.
      const propCapex = capitalProjects.filter((c) => c.propertyId === p.id);
      const activeCapex = propCapex.filter((c) => c.status !== "completed");
      const activeCapexCount = activeCapex.length;
      const activeCapexSpend = activeCapex.reduce((s, c) => s + (Number(c.spent) || 0), 0);
      const activeCapexBudget = activeCapex.reduce((s, c) => s + (Number(c.budget) || 0), 0);

      const attr = attributes[p.id] ?? null;
      const insuranceExpires = attr?.insuranceExpires ?? null;
      const insuranceDaysToExpiry = insuranceExpires
        ? daysBetween(asOfDate, insuranceExpires)
        : null;
      const taxNextDue = attr?.taxNextInstallmentDue ?? null;
      const taxDaysToDue = taxNextDue ? daysBetween(asOfDate, taxNextDue) : null;

      return {
        property: p,
        units: propUnits,
        occupied,
        vacant,
        notice,
        underConstruction,
        leaseable,
        occupancyRate: leaseable > 0 ? Math.round((occupied / leaseable) * 100) : null,
        totalMonthlyRent: totalRent,
        avgRent,
        totalSqft,
        avgRentPerSqft,
        nextExpiration,
        expiringNext90,
        openWorkOrders,
        workOrderSpendYtd,
        activeCapexCount,
        activeCapexSpend,
        activeCapexBudget,
        insuranceExpires,
        insuranceDaysToExpiry,
        taxNextDue,
        taxDaysToDue,
        attribute: attr,
      };
    });
  }, [properties, units, vacantUnitIds, asOfDate, workOrders, capitalProjects, attributes]);

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
          // Push null (under-construction-only) to the end of asc sort.
          return s.occupancyRate ?? Number.POSITIVE_INFINITY;
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
        case "openWorkOrders":
          return s.openWorkOrders;
        case "workOrderSpendYtd":
          return s.workOrderSpendYtd;
        case "activeCapexSpend":
          return s.activeCapexSpend;
        case "insuranceDaysToExpiry":
          // null = push to end
          return s.insuranceDaysToExpiry ?? Number.POSITIVE_INFINITY;
        case "taxDaysToDue":
          return s.taxDaysToDue ?? Number.POSITIVE_INFINITY;
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
    const totalVacant = summaries.reduce((s, p) => s + p.vacant, 0);
    const totalUnderConstruction = summaries.reduce((s, p) => s + p.underConstruction, 0);
    const totalLeaseable = summaries.reduce((s, p) => s + p.leaseable, 0);
    const totalRent = summaries.reduce((s, p) => s + p.totalMonthlyRent, 0);
    return {
      totalUnits,
      totalOccupied,
      totalVacant,
      totalUnderConstruction,
      totalLeaseable,
      totalRent,
      // Occupancy is measured against leaseable units only; a fleet of
      // under-construction units doesn't depress it. Null when nothing
      // on the rent roll yet (all properties pre-leaseable).
      occupancy:
        totalLeaseable > 0 ? Math.round((totalOccupied / totalLeaseable) * 100) : null,
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
        "Unleased",
        "Notice",
        "Occupancy %",
        "Monthly Rent",
        "Avg Rent",
        "Total Sqft",
        "Avg Rent/Sqft",
        "Next Lease Expiration",
        "Expirations in next 90d",
        "Open Work Orders",
        "Work Order Spend YTD",
        "Active Capex Count",
        "Active Capex Spend",
        "Active Capex Budget",
        "Insurance Carrier",
        "Insurance Expires",
        "Insurance Premium Annual",
        "Tax APN",
        "Tax Annual",
        "Tax Next Due",
        "Tax YTD Paid",
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
        s.openWorkOrders,
        s.workOrderSpendYtd,
        s.activeCapexCount,
        s.activeCapexSpend,
        s.activeCapexBudget,
        s.attribute?.insuranceCarrier ?? "",
        s.insuranceExpires ?? "",
        s.attribute?.insurancePremiumAnnual ?? "",
        s.attribute?.taxApn ?? "",
        s.attribute?.taxAnnualAmount ?? "",
        s.taxNextDue ?? "",
        s.attribute?.taxYtdPaid ?? "",
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
    return (
      <PropertyDetailView
        selected={selected}
        onBack={() => setSelectedId(null)}
        onAttributeSaved={refreshAttributes}
      />
    );
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
        <KpiCard
          label="Total Units"
          value={totals.totalUnits}
          hint={
            totals.totalUnderConstruction > 0
              ? `${totals.totalLeaseable} leaseable · ${totals.totalUnderConstruction} under construction`
              : undefined
          }
        />
        <KpiCard
          label="Occupancy"
          value={totals.occupancy == null ? "—" : `${totals.occupancy}%`}
          hint={`${totals.totalOccupied} of ${totals.totalLeaseable} leaseable`}
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

function OperatingExpensesCard({
  propertyId,
  totalMonthlyRent,
}: {
  propertyId: string;
  totalMonthlyRent: number;
}) {
  const [month, setMonth] = useState<string>(() => {
    // Default: last full month (YYYY-MM-01)
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  });
  const [items, setItems] = useState<PropertyPnlLineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/properties/pnl?property_id=${encodeURIComponent(propertyId)}&month=${encodeURIComponent(month)}`
      );
      const j = await r.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [propertyId, month]);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(
    async (category: string, amount: number, notes?: string) => {
      setSavingCategory(category);
      try {
        const r = await fetch("/api/properties/pnl", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            propertyId,
            month,
            category,
            amount,
            notes,
          }),
        });
        const j = await r.json();
        if (j.item) {
          setItems((prev) => {
            const idx = prev.findIndex((x) => x.category === category);
            if (idx >= 0) return prev.map((x, i) => (i === idx ? j.item : x));
            return [...prev, j.item];
          });
        }
      } finally {
        setSavingCategory(null);
      }
    },
    [propertyId, month]
  );

  const remove = useCallback(async (id: string) => {
    await fetch(`/api/properties/pnl?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const monthLabel = useMemo(
    () =>
      new Date(month + "T00:00:00").toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      }),
    [month]
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(month + "T00:00:00");
    d.setMonth(d.getMonth() + delta);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`);
  };

  const expenseItems = items.filter((i) => !isPnlIncomeCategory(i.category));
  const incomeItems = items.filter((i) => isPnlIncomeCategory(i.category));
  const totalExpenses = expenseItems.reduce((s, i) => s + i.amount, 0);
  const totalOtherIncome = incomeItems.reduce((s, i) => s + i.amount, 0);
  const noi = totalMonthlyRent + totalOtherIncome - totalExpenses;

  const usedCategories = new Set(items.map((i) => i.category));
  const suggestedExpenses = PNL_EXPENSE_CATEGORIES.filter((c) => !usedCategories.has(c));
  const suggestedIncome = PNL_INCOME_CATEGORIES.filter((c) => !usedCategories.has(c));

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-3">
        <h2 className="font-semibold">Operating Expenses — Monthly</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => shiftMonth(-1)}
            className="px-2 py-1 text-sm border border-border rounded hover:bg-muted"
          >
            ‹
          </button>
          <span className="text-sm font-medium w-32 text-center">{monthLabel}</span>
          <button
            onClick={() => shiftMonth(1)}
            className="px-2 py-1 text-sm border border-border rounded hover:bg-muted"
          >
            ›
          </button>
          <input
            type="month"
            value={month.slice(0, 7)}
            onChange={(e) => setMonth(`${e.target.value}-01`)}
            className="text-sm border border-border rounded px-2 py-1 bg-card ml-2"
          />
        </div>
      </div>

      {loading ? (
        <div className="p-5 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-2 font-medium">Category</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                  <th className="text-left px-4 py-2 font-medium">Notes</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {expenseItems.length === 0 && incomeItems.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm text-muted-foreground">
                      No entries for this month yet. Pick a category below to add one.
                    </td>
                  </tr>
                )}
                {[...expenseItems, ...incomeItems].map((item) => (
                  <LineItemRow
                    key={item.id}
                    item={item}
                    saving={savingCategory === item.category}
                    onSave={(amount, notes) => save(item.category, amount, notes)}
                    onDelete={() => remove(item.id)}
                  />
                ))}
              </tbody>
              <tfoot className="border-t border-border">
                <tr className="bg-muted/50">
                  <td className="px-4 py-2 font-semibold">Total other income</td>
                  <td className="px-4 py-2 text-right font-mono">
                    ${totalOtherIncome.toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
                <tr className="bg-muted/50">
                  <td className="px-4 py-2 font-semibold">Total operating expenses</td>
                  <td className="px-4 py-2 text-right font-mono text-red-700">
                    −${totalExpenses.toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
                <tr className="bg-muted">
                  <td className="px-4 py-2 font-semibold">
                    Net Operating Income
                    <span className="text-xs text-muted-foreground ml-2">
                      (rent ${totalMonthlyRent.toLocaleString()} + other income − opex)
                    </span>
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-semibold font-mono ${
                      noi < 0 ? "text-red-700" : "text-green-700"
                    }`}
                  >
                    ${noi.toLocaleString()}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="p-4 border-t border-border flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">+ Add:</span>
            {suggestedExpenses.map((c) => (
              <button
                key={c}
                onClick={() => save(c, 0)}
                className="text-xs px-2 py-1 rounded border border-border hover:bg-muted"
              >
                {formatCategoryLabel(c)}
              </button>
            ))}
            {suggestedIncome.map((c) => (
              <button
                key={c}
                onClick={() => save(c, 0)}
                className="text-xs px-2 py-1 rounded border border-green-200 bg-green-50 text-green-800 hover:bg-green-100"
              >
                {formatCategoryLabel(c)}
              </button>
            ))}
            <CustomCategoryButton
              onAdd={(c) => {
                if (c.trim()) save(c.trim().toLowerCase().replace(/\s+/g, "_"), 0);
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function LineItemRow({
  item,
  saving,
  onSave,
  onDelete,
}: {
  item: PropertyPnlLineItem;
  saving: boolean;
  onSave: (amount: number, notes?: string) => void;
  onDelete: () => void;
}) {
  const [amount, setAmount] = useState<string>(String(item.amount));
  const [notes, setNotes] = useState<string>(item.notes ?? "");
  useEffect(() => {
    setAmount(String(item.amount));
    setNotes(item.notes ?? "");
  }, [item]);
  const isIncome = isPnlIncomeCategory(item.category);
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2">
        <span className="inline-flex items-center gap-2">
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              isIncome ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {formatCategoryLabel(item.category)}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => {
            const n = Number(amount) || 0;
            if (n !== item.amount) onSave(n, notes || undefined);
          }}
          className="w-28 text-right text-sm font-mono border border-border rounded px-2 py-1 bg-card"
        />
      </td>
      <td className="px-4 py-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (item.notes ?? "")) onSave(Number(amount) || 0, notes || undefined);
          }}
          placeholder="Optional notes"
          className="w-full text-sm border border-border rounded px-2 py-1 bg-card"
        />
      </td>
      <td className="px-4 py-2 text-right">
        {saving ? (
          <span className="text-xs text-muted-foreground">Saving…</span>
        ) : (
          <button
            onClick={onDelete}
            className="text-muted-foreground hover:text-red-600 text-xs"
            title="Delete row"
          >
            ✕
          </button>
        )}
      </td>
    </tr>
  );
}

function CustomCategoryButton({ onAdd }: { onAdd: (category: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="text-xs px-2 py-1 rounded border border-dashed border-border hover:bg-muted"
      >
        + Custom
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onAdd(value);
            setValue("");
            setEditing(false);
          } else if (e.key === "Escape") {
            setValue("");
            setEditing(false);
          }
        }}
        placeholder="category name"
        className="text-xs border border-border rounded px-2 py-1 bg-card w-32"
      />
      <button
        onClick={() => {
          onAdd(value);
          setValue("");
          setEditing(false);
        }}
        className="text-xs text-accent hover:underline"
      >
        Add
      </button>
    </span>
  );
}

function formatCategoryLabel(c: string): string {
  return c
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function PropertyInfoCard({
  propertyId,
  attribute,
  onSaved,
}: {
  propertyId: string;
  attribute: PropertyAttribute | null;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<PropertyAttribute>(
    attribute ?? { propertyId }
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setDraft(attribute ?? { propertyId });
    setSavedAt(null);
  }, [attribute, propertyId]);

  const update = <K extends keyof PropertyAttribute>(k: K, v: PropertyAttribute[K]) =>
    setDraft((prev) => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/properties/attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const j = await r.json();
      if (j.error) {
        alert(j.error);
      } else {
        setSavedAt(new Date().toLocaleTimeString());
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="p-5 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold inline-flex items-center gap-2">
          <Shield className="w-4 h-4" /> Property Info — Insurance & Taxes
        </h2>
        <div className="flex items-center gap-3">
          {savedAt && (
            <span className="text-xs text-green-700">Saved at {savedAt}</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
      <div className="p-5 grid md:grid-cols-2 gap-5">
        <div>
          <h3 className="text-sm font-semibold mb-3">Insurance</h3>
          <div className="space-y-3">
            <Field label="Carrier">
              <input
                value={draft.insuranceCarrier ?? ""}
                onChange={(e) => update("insuranceCarrier", e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </Field>
            <Field label="Policy #">
              <input
                value={draft.insurancePolicyNumber ?? ""}
                onChange={(e) => update("insurancePolicyNumber", e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Expires">
                <input
                  type="date"
                  value={draft.insuranceExpires ?? ""}
                  onChange={(e) => update("insuranceExpires", e.target.value)}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                />
              </Field>
              <Field label="Annual premium">
                <input
                  type="number"
                  value={draft.insurancePremiumAnnual ?? ""}
                  onChange={(e) =>
                    update(
                      "insurancePremiumAnnual",
                      e.target.value === "" ? undefined : Number(e.target.value)
                    )
                  }
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                />
              </Field>
            </div>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">Property Tax</h3>
          <div className="space-y-3">
            <Field label="APN">
              <input
                value={draft.taxApn ?? ""}
                onChange={(e) => update("taxApn", e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Annual amount">
                <input
                  type="number"
                  value={draft.taxAnnualAmount ?? ""}
                  onChange={(e) =>
                    update(
                      "taxAnnualAmount",
                      e.target.value === "" ? undefined : Number(e.target.value)
                    )
                  }
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                />
              </Field>
              <Field label="YTD paid">
                <input
                  type="number"
                  value={draft.taxYtdPaid ?? ""}
                  onChange={(e) =>
                    update(
                      "taxYtdPaid",
                      e.target.value === "" ? undefined : Number(e.target.value)
                    )
                  }
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                />
              </Field>
            </div>
            <Field label="Next installment due">
              <input
                type="date"
                value={draft.taxNextInstallmentDue ?? ""}
                onChange={(e) => update("taxNextInstallmentDue", e.target.value)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </Field>
          </div>
        </div>
      </div>
      {draft.notes !== undefined || true ? (
        <div className="px-5 pb-5">
          <Field label="Notes">
            <textarea
              value={draft.notes ?? ""}
              onChange={(e) => update("notes", e.target.value)}
              rows={2}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              placeholder="Audit flags, compliance items, reminders…"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function ComplianceCell({
  daysToEvent,
  date,
}: {
  daysToEvent: number | null;
  date: string | null;
}) {
  if (daysToEvent == null || !date) {
    return <span className="text-muted-foreground">—</span>;
  }
  let color = "text-muted-foreground";
  if (daysToEvent < 0) color = "text-red-600 font-semibold";
  else if (daysToEvent <= 30) color = "text-red-600";
  else if (daysToEvent <= 60) color = "text-yellow-600";
  else color = "text-muted-foreground";
  const label =
    daysToEvent < 0 ? `${Math.abs(daysToEvent)}d overdue` : `${daysToEvent}d`;
  return (
    <span className={color} title={date}>
      {label}
    </span>
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
  const headers: { key: SortKey; label: string; align?: "right" | "left"; title?: string }[] = [
    { key: "name", label: "Property", align: "left" },
    { key: "units", label: "Units", align: "right" },
    { key: "occupancy", label: "Occupancy", align: "right" },
    { key: "vacant", label: "Unleased", align: "right" },
    { key: "rent", label: "Monthly Rent", align: "right" },
    { key: "avgRent", label: "Avg Rent", align: "right" },
    { key: "avgRentPerSqft", label: "$/Sqft", align: "right" },
    { key: "expiringNext90", label: "Exp 90d", align: "right", title: "Leases expiring in next 90 days" },
    { key: "openWorkOrders", label: "Open WOs", align: "right", title: "Open work orders" },
    { key: "workOrderSpendYtd", label: "WO YTD", align: "right", title: "Work-order spend year-to-date" },
    { key: "activeCapexSpend", label: "Capex", align: "right", title: "Active capital projects — spend" },
    { key: "insuranceDaysToExpiry", label: "Insurance", align: "right", title: "Days until insurance expires" },
    { key: "taxDaysToDue", label: "Tax Due", align: "right", title: "Days until next property-tax installment" },
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
                  title={h.title}
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
                s.occupancyRate == null
                  ? "text-muted-foreground"
                  : s.occupancyRate >= 90
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
                      {s.underConstruction > 0 && (
                        <span className="ml-2 text-[11px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                          {s.underConstruction} under construction
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.units.length}
                    {s.underConstruction > 0 && (
                      <span className="text-[11px] text-amber-700 ml-1">
                        ({s.leaseable} leaseable)
                      </span>
                    )}
                  </td>
                  <td className={`px-4 py-3 text-right font-medium tabular-nums ${occColor}`}>
                    {s.occupancyRate == null ? "—" : `${s.occupancyRate}%`}
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
                  <td className="px-4 py-3 text-right tabular-nums">
                    {s.openWorkOrders > 0 ? (
                      <span className="text-foreground">{s.openWorkOrders}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {s.workOrderSpendYtd > 0
                      ? `$${Math.round(s.workOrderSpendYtd).toLocaleString()}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                    {s.activeCapexCount > 0
                      ? `$${Math.round(s.activeCapexSpend).toLocaleString()} / ${s.activeCapexCount}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <ComplianceCell
                      daysToEvent={s.insuranceDaysToExpiry}
                      date={s.insuranceExpires}
                    />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    <ComplianceCell daysToEvent={s.taxDaysToDue} date={s.taxNextDue} />
                  </td>
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
                  s.occupancyRate == null
                    ? "text-muted-foreground"
                    : s.occupancyRate >= 90
                      ? "text-green-600"
                      : s.occupancyRate >= 70
                        ? "text-yellow-600"
                        : "text-red-600"
                }`}
              >
                {s.occupancyRate == null ? "—" : `${s.occupancyRate}%`}
              </p>
              <p className="text-xs text-muted-foreground">Occupied</p>
            </div>
            <div>
              <p className="text-lg font-bold">${s.avgRent.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Avg Rent</p>
            </div>
          </div>

          {s.underConstruction > 0 && (
            <p className="mt-2 text-[11px] text-amber-700">
              {s.underConstruction} unit{s.underConstruction === 1 ? "" : "s"} under construction
            </p>
          )}

          <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                s.occupancyRate == null
                  ? "bg-muted-foreground/30"
                  : s.occupancyRate >= 90
                    ? "bg-green-500"
                    : s.occupancyRate >= 70
                      ? "bg-yellow-500"
                      : "bg-red-500"
              }`}
              style={{ width: `${s.occupancyRate ?? 0}%` }}
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
  onAttributeSaved,
}: {
  selected: PropertySummary;
  onBack: () => void;
  onAttributeSaved: () => void;
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
        <KpiCard
          label="Occupancy"
          value={selected.occupancyRate == null ? "—" : `${selected.occupancyRate}%`}
          hint={
            selected.underConstruction > 0
              ? `${selected.underConstruction} under construction · ${selected.leaseable} leaseable`
              : undefined
          }
        />
        <KpiCard
          label="Monthly Rent"
          value={`$${selected.totalMonthlyRent.toLocaleString()}`}
        />
        <KpiCard label="Avg Rent" value={`$${selected.avgRent.toLocaleString()}`} />
      </div>

      {/* Operational snapshot */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          label="Open Work Orders"
          value={selected.openWorkOrders}
          hint={
            selected.openWorkOrders > 0 ? undefined : "No open WOs"
          }
          accent={selected.openWorkOrders > 0 ? "red" : undefined}
        />
        <KpiCard
          label="WO Spend YTD"
          value={`$${Math.round(selected.workOrderSpendYtd).toLocaleString()}`}
          hint={`Completed ${new Date().getFullYear()}`}
        />
        <KpiCard
          label="Active Capex"
          value={
            selected.activeCapexCount > 0
              ? `$${Math.round(selected.activeCapexSpend).toLocaleString()}`
              : "—"
          }
          hint={
            selected.activeCapexCount > 0
              ? `${selected.activeCapexCount} active · $${Math.round(
                  selected.activeCapexBudget
                ).toLocaleString()} budget`
              : undefined
          }
        />
        <div className="bg-card rounded-xl border border-border p-4 flex flex-col justify-between">
          <div className="text-sm text-muted-foreground">Quick links</div>
          <div className="flex gap-3 mt-2">
            <Link
              href={`/maintenance?property_id=${encodeURIComponent(selected.property.id)}`}
              className="text-xs text-accent hover:underline inline-flex items-center gap-1"
            >
              <Wrench className="w-3 h-3" />
              Maintenance
              <ExternalLink className="w-3 h-3" />
            </Link>
            <Link
              href={`/capital-projects`}
              className="text-xs text-accent hover:underline inline-flex items-center gap-1"
            >
              Capex
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>

      <PropertyInfoCard
        propertyId={selected.property.id}
        attribute={selected.attribute}
        onSaved={onAttributeSaved}
      />

      <OperatingExpensesCard
        propertyId={selected.property.id}
        totalMonthlyRent={selected.totalMonthlyRent}
      />

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
