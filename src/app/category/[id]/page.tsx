"use client";

import { use, useState, useEffect } from "react";
import Link from "next/link";
import {
  appCategories,
  currentUserRole,
  getAppsForRole,
  getAppsByCategory,
} from "@/lib/mock-data";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import { usePortfolio } from "@/contexts/PortfolioContext";
import type { AppConfig, DashboardStats, AcademicYear } from "@/lib/types";
import {
  ClipboardCheck,
  RefreshCw,
  Wrench,
  Truck,
  Users,
  FileText,
  Calendar,
  Zap,
  BarChart3,
  Building2,
  HardHat,
  Bell,
  TrendingUp,
  MessageSquare,
  ArrowUpRight,
  ArrowLeft,
  type LucideIcon,
} from "lucide-react";

const iconMap: Record<string, LucideIcon> = {
  ClipboardCheck,
  RefreshCw,
  Wrench,
  Truck,
  Users,
  FileText,
  Calendar,
  Zap,
  BarChart3,
  Building2,
  HardHat,
  Bell,
  TrendingUp,
  MessageSquare,
};

const colorMap: Record<string, { border: string; bg: string; text: string; dot: string; iconBg: string }> = {
  red: { border: "border-l-red-500", bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500", iconBg: "bg-red-100" },
  blue: { border: "border-l-blue-500", bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500", iconBg: "bg-blue-100" },
  purple: { border: "border-l-purple-500", bg: "bg-purple-50", text: "text-purple-600", dot: "bg-purple-500", iconBg: "bg-purple-100" },
  emerald: { border: "border-l-emerald-500", bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500", iconBg: "bg-emerald-100" },
  amber: { border: "border-l-amber-500", bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500", iconBg: "bg-amber-100" },
  rose: { border: "border-l-rose-500", bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-500", iconBg: "bg-rose-100" },
  pink: { border: "border-l-pink-500", bg: "bg-pink-50", text: "text-pink-600", dot: "bg-pink-500", iconBg: "bg-pink-100" },
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

function applyLiveStats(appList: AppConfig[], stats: DashboardStats): AppConfig[] {
  const statMap: Record<string, string> = {
    maintenance: `${stats.openMaintenanceRequests} open`,
    vendors: `${stats.vendorCount} vendors`,
    applications: `${stats.activeApplications} active`,
    tours: `${stats.upcomingTours} upcoming`,
    "comp-watch": `${stats.trackedComps} comps tracked`,
    rubs: stats.pendingRubs,
    reports: `${stats.reportsDue} reports due`,
    portfolio: `${stats.totalUnits} units`,
    "capital-projects": `${stats.activeCapitalProjects} active`,
    notices: `${stats.pendingNotices} pending`,
    "resident-pulse": `${stats.recurringIssues} recurring issues`,
  };
  return appList.map((app) => ({
    ...app,
    statLabel: statMap[app.id] || app.statLabel,
  }));
}

function AppCard({ app }: { app: AppConfig }) {
  const Icon = iconMap[app.icon];
  const colors = colorMap[app.categoryColor] || colorMap.blue;

  const card = (
    <div
      className={`group bg-card rounded-2xl border border-border p-5 h-full relative overflow-hidden ${
        app.isBuilt
          ? "card-hover cursor-pointer"
          : "opacity-50 cursor-not-allowed"
      }`}
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className={`absolute top-0 left-0 right-0 h-0.5 ${colors.dot} opacity-60`} />

      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center`}>
          {Icon && <Icon size={20} className={colors.text} />}
        </div>
        {!app.isBuilt ? (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            Coming Soon
          </span>
        ) : (
          <ArrowUpRight size={16} className="text-muted-foreground/0 group-hover:text-muted-foreground transition-all duration-200" />
        )}
      </div>
      <h3 className="text-sm font-semibold mt-3">{app.name}</h3>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">
        {app.description}
      </p>
      {app.statLabel && (
        <div className="mt-3 pt-2.5 border-t border-border">
          <span className={`text-xs font-semibold ${colors.text}`}>
            {app.statLabel}
          </span>
        </div>
      )}
    </div>
  );

  if (!app.isBuilt) return card;

  return (
    <Link href={app.href}>
      {card}
    </Link>
  );
}

export default function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { portfolioId } = usePortfolio();
  const [academicYear, setAcademicYear] = useState<AcademicYear>("2026-2027");
  const [stats, setStats] = useState<DashboardStats>(defaultStats);
  const [loading, setLoading] = useState(true);

  const category = appCategories.find((cat) => cat.id === id);

  useEffect(() => {
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);

    fetch(`/api/appfolio/dashboard?academicYear=${academicYear}&portfolio_id=${portfolioId}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((d) => {
        if (d.stats) {
          setStats(d.stats);
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(timer);
        setLoading(false);
      });

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [academicYear, portfolioId]);

  if (!category) {
    return (
      <div className="space-y-6">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Category not found</h1>
      </div>
    );
  }

  const rawApps = getAppsForRole(currentUserRole);
  const grouped = getAppsByCategory(rawApps);
  const categoryApps = applyLiveStats(grouped[id] || [], stats);
  const colors = colorMap[category.color] || colorMap.blue;

  return (
    <div className="space-y-6">
      {/* Back link + Header */}
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft size={16} />
          Back to Dashboard
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-8 rounded-full ${colors.dot}`} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{category.label}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {categoryApps.length} {categoryApps.length === 1 ? "tool" : "tools"}
              </p>
            </div>
            {loading && (
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
            )}
          </div>
          <AcademicYearSelector value={academicYear} onChange={setAcademicYear} />
        </div>
      </div>

      {/* App Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {categoryApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </div>
  );
}
