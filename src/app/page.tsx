import Link from "next/link";
import {
  appCategories,
  currentUserRole,
  getAppsForRole,
  getAppsByCategory,
  apps,
} from "@/lib/mock-data";
import { fetchDashboardStats } from "@/lib/data";
import type { AppConfig, DashboardStats } from "@/lib/types";
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

const colorMap: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  red: { border: "border-t-red-500", bg: "bg-red-50", text: "text-red-600", dot: "bg-red-500" },
  blue: { border: "border-t-blue-500", bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500" },
  purple: { border: "border-t-purple-500", bg: "bg-purple-50", text: "text-purple-600", dot: "bg-purple-500" },
  emerald: { border: "border-t-emerald-500", bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" },
  amber: { border: "border-t-amber-500", bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500" },
  rose: { border: "border-t-rose-500", bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-500" },
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
      className={`bg-card rounded-2xl border border-border border-t-4 ${colors.border} p-6 h-full ${
        app.isBuilt
          ? "hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
          : "opacity-60 cursor-not-allowed"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center`}>
          {Icon && <Icon size={28} className={colors.text} />}
        </div>
        {!app.isBuilt && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
            Coming Soon
          </span>
        )}
      </div>
      <h3 className="text-base font-semibold mt-4">{app.name}</h3>
      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
        {app.description}
      </p>
      {app.statLabel && (
        <div className="mt-4 pt-3 border-t border-border">
          <span className={`text-sm font-medium ${colors.text}`}>
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

function CategorySection({
  label,
  color,
  apps: categoryApps,
}: {
  label: string;
  color: string;
  apps: AppConfig[];
}) {
  const colors = colorMap[color] || colorMap.blue;
  return (
    <section>
      <div className="flex items-center gap-2 mb-5">
        <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
        <h2 className="text-lg font-semibold">{label}</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {categoryApps.map((app) => (
          <AppCard key={app.id} app={app} />
        ))}
      </div>
    </section>
  );
}

const DASHBOARD_TIMEOUT_MS = 5000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Dashboard stats timeout")), ms)
    ),
  ]);
}

export default async function Dashboard() {
  let stats: DashboardStats;
  let source: string = "mock";
  try {
    const result = await withTimeout(fetchDashboardStats(), DASHBOARD_TIMEOUT_MS);
    stats = result.data;
    source = result.source;
  } catch (e) {
    console.error("Dashboard stats fetch failed, using defaults:", e);
    stats = {
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
  }

  const rawApps = getAppsForRole(currentUserRole);
  const visibleApps = applyLiveStats(rawApps, stats);
  const grouped = getAppsByCategory(visibleApps);
  const sortedCategories = appCategories
    .filter((cat) => grouped[cat.id]?.length)
    .sort((a, b) => a.order - b.order);

  const preLeasedPct = stats.totalUnits > 0
    ? Math.round((stats.preLeasedUnits / stats.totalUnits) * 100)
    : 0;
  const currentOccPct = stats.totalUnits > 0
    ? Math.round((stats.occupiedUnits / stats.totalUnits) * 100)
    : 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Dashboard</h1>
          {source === "appfolio" && (
            <span className="text-xs px-2 py-1 rounded-full bg-green-50 text-green-700 font-medium">
              Live from AppFolio
            </span>
          )}
        </div>
        <p className="text-muted-foreground mt-1">
          Choose a tool to get started
        </p>
      </div>

      {/* Leasing Stats Strip — Upcoming Year (Aug 2026 – Jul 2027) */}
      <div className="bg-card rounded-xl border border-border px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            2026–2027 Lease Year
          </span>
          <span className="text-xs text-muted-foreground">
            {currentOccPct}% currently occupied
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <div>
            <span className="font-semibold text-foreground">{stats.totalUnits}</span>{" "}
            <span className="text-muted-foreground">total units</span>
          </div>
          <div className="text-border">|</div>
          <div>
            <span className="font-semibold text-green-600">{preLeasedPct}%</span>{" "}
            <span className="text-muted-foreground">pre-leased</span>
          </div>
          <div className="text-border">|</div>
          <div>
            <span className="font-semibold text-green-600">{stats.preLeasedUnits}</span>{" "}
            <span className="text-muted-foreground">leased</span>
          </div>
          <div className="text-border">|</div>
          <div>
            <span className="font-semibold text-amber-600">{stats.vacantUnits}</span>{" "}
            <span className="text-muted-foreground">unleased</span>
          </div>
        </div>
      </div>

      {/* App Grid by Category */}
      <div className="space-y-10">
        {sortedCategories.map((cat) => (
          <CategorySection
            key={cat.id}
            label={cat.label}
            color={cat.color}
            apps={grouped[cat.id]}
          />
        ))}
      </div>
    </div>
  );
}
