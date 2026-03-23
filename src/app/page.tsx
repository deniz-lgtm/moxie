"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  appCategories,
  currentUserRole,
  getAppsForRole,
  getAppsByCategory,
} from "@/lib/mock-data";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import type { DashboardStats, AcademicYear } from "@/lib/types";
import {
  ClipboardCheck,
  Wrench,
  FileText,
  Zap,
  Building2,
  Bell,
  ArrowUpRight,
  type LucideIcon,
} from "lucide-react";

const categoryIconMap: Record<string, LucideIcon> = {
  inspections: ClipboardCheck,
  operations: Wrench,
  leasing: FileText,
  finance: Zap,
  asset_management: Building2,
  communications: Bell,
};

const colorMap: Record<string, { border: string; bg: string; text: string; dot: string; iconBg: string; gradientFrom: string; gradientTo: string }> = {
  red: { border: "border-red-200", bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", iconBg: "bg-red-100", gradientFrom: "from-red-500", gradientTo: "to-red-600" },
  blue: { border: "border-blue-200", bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500", iconBg: "bg-blue-100", gradientFrom: "from-blue-500", gradientTo: "to-blue-600" },
  purple: { border: "border-purple-200", bg: "bg-purple-50", text: "text-purple-600", dot: "bg-purple-500", iconBg: "bg-purple-100", gradientFrom: "from-purple-500", gradientTo: "to-purple-600" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", iconBg: "bg-emerald-100", gradientFrom: "from-emerald-500", gradientTo: "to-emerald-600" },
  amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", iconBg: "bg-amber-100", gradientFrom: "from-amber-500", gradientTo: "to-amber-600" },
  rose: { border: "border-rose-200", bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-500", iconBg: "bg-rose-100", gradientFrom: "from-rose-500", gradientTo: "to-rose-600" },
};

const defaultStats: DashboardStats = {
  totalUnits: 0,
  occupiedUnits: 0,
  vacantUnits: 0,
  turningUnits: 0,
  preLeasedUnits: 0,
  openMaintenanceRequests: 0,
  activeInspections: 0,
  upcomingTurns: 0,
  activeApplications: 0,
  upcomingTours: 0,
  upcomingMoveOuts: 0,
  vendorCount: 0,
  pendingRubs: "—",
  reportsDue: 0,
  activeCapitalProjects: 0,
  pendingNotices: 0,
  trackedComps: 0,
  recurringIssues: 0,
};

function CategoryCard({
  id,
  label,
  color,
  appCount,
  appNames,
}: {
  id: string;
  label: string;
  color: string;
  appCount: number;
  appNames: string[];
}) {
  const colors = colorMap[color] || colorMap.blue;
  const Icon = categoryIconMap[id];

  return (
    <Link href={`/category/${id}`}>
      <div
        className={`group bg-card rounded-2xl border ${colors.border} p-6 h-full relative overflow-hidden card-hover cursor-pointer transition-all duration-200`}
        style={{ boxShadow: "var(--shadow-sm)", minHeight: "220px" }}
      >
        {/* Top color bar */}
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${colors.gradientFrom} ${colors.gradientTo}`} />

        <div className="flex items-start justify-between">
          <div className={`w-14 h-14 rounded-2xl ${colors.iconBg} flex items-center justify-center`}>
            {Icon && <Icon size={28} className={colors.text} />}
          </div>
          <ArrowUpRight
            size={20}
            className="text-muted-foreground/0 group-hover:text-muted-foreground transition-all duration-200"
          />
        </div>

        <h2 className="text-lg font-bold mt-4">{label}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {appCount} {appCount === 1 ? "tool" : "tools"}
        </p>

        <div className="mt-4 pt-3 border-t border-border">
          <div className="flex flex-wrap gap-1.5">
            {appNames.map((name) => (
              <span
                key={name}
                className={`text-[11px] px-2 py-0.5 rounded-full ${colors.bg} ${colors.text} font-medium`}
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [academicYear, setAcademicYear] = useState<AcademicYear>("2026-2027");
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [source, setSource] = useState<string>("mock");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    fetch(`/api/appfolio/dashboard?academicYear=${academicYear}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.stats) {
          setStats(d.stats);
          setSource(d.source || "appfolio");
        }
      })
      .catch(() => {
        // Keep previous stats or defaults
      })
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [academicYear]);

  const rawApps = getAppsForRole(currentUserRole);
  const grouped = getAppsByCategory(rawApps);
  const sortedCategories = appCategories
    .filter((cat) => grouped[cat.id]?.length)
    .sort((a, b) => a.order - b.order);

  const preLeasedPct = stats.totalUnits > 0
    ? Math.round((stats.preLeasedUnits / stats.totalUnits) * 100)
    : 0;
  const currentOccPct = stats.totalUnits > 0
    ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
    : 0;

  const yearLabel = `${academicYear.split("-")[0]}–${academicYear.split("-")[1].slice(2)}`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
            {source === "appfolio" && !loading && (
              <span className="inline-flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-full bg-green-50 text-green-700 font-semibold border border-green-100">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse-dot" />
                Live
              </span>
            )}
            {loading && (
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {yearLabel} Lease Year &middot; Leases starting Aug 15
          </p>
        </div>
        <AcademicYearSelector value={academicYear} onChange={setAcademicYear} />
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card rounded-2xl border border-border p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Units</p>
          <p className="text-3xl font-bold mt-2 tracking-tight">{stats.totalUnits}</p>
          <p className="text-xs text-muted-foreground mt-1">{currentOccPct}% occupied</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Pre-Leased</p>
          <p className="text-3xl font-bold mt-2 tracking-tight text-green-600">{preLeasedPct}%</p>
          <p className="text-xs text-muted-foreground mt-1">{stats.preLeasedUnits} of {stats.totalUnits} units</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Unleased</p>
          <p className="text-3xl font-bold mt-2 tracking-tight text-amber-600">{stats.vacantUnits}</p>
          <p className="text-xs text-muted-foreground mt-1">{yearLabel} lease year</p>
        </div>
        <div className="bg-card rounded-2xl border border-border p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Maintenance</p>
          <p className="text-3xl font-bold mt-2 tracking-tight text-blue-600">{stats.openMaintenanceRequests}</p>
          <p className="text-xs text-muted-foreground mt-1">open work orders</p>
        </div>
      </div>

      {/* Category Cards Grid */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Tools</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {sortedCategories.map((cat) => (
            <CategoryCard
              key={cat.id}
              id={cat.id}
              label={cat.label}
              color={cat.color}
              appCount={grouped[cat.id].length}
              appNames={grouped[cat.id].map((app) => app.name)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
