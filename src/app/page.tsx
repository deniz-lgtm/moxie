import Link from "next/link";
import {
  dashboardStats,
  appCategories,
  currentUserRole,
  getAppsForRole,
  getAppsByCategory,
} from "@/lib/mock-data";
import type { AppConfig } from "@/lib/types";
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
  blue: { border: "border-t-blue-500", bg: "bg-blue-50", text: "text-blue-600", dot: "bg-blue-500" },
  purple: { border: "border-t-purple-500", bg: "bg-purple-50", text: "text-purple-600", dot: "bg-purple-500" },
  emerald: { border: "border-t-emerald-500", bg: "bg-emerald-50", text: "text-emerald-600", dot: "bg-emerald-500" },
  amber: { border: "border-t-amber-500", bg: "bg-amber-50", text: "text-amber-600", dot: "bg-amber-500" },
  rose: { border: "border-t-rose-500", bg: "bg-rose-50", text: "text-rose-600", dot: "bg-rose-500" },
};

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

export default function Dashboard() {
  const visibleApps = getAppsForRole(currentUserRole);
  const grouped = getAppsByCategory(visibleApps);
  const sortedCategories = appCategories
    .filter((cat) => grouped[cat.id]?.length)
    .sort((a, b) => a.order - b.order);

  const occupancyPct = Math.round(
    (dashboardStats.occupiedUnits / dashboardStats.totalUnits) * 100
  );

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Choose a tool to get started
        </p>
      </div>

      {/* Compact Stats Strip */}
      <div className="bg-card rounded-xl border border-border px-6 py-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="font-semibold text-foreground">{dashboardStats.totalUnits}</span>{" "}
          <span className="text-muted-foreground">units</span>
        </div>
        <div className="text-border">|</div>
        <div>
          <span className="font-semibold text-foreground">{occupancyPct}%</span>{" "}
          <span className="text-muted-foreground">occupied</span>
        </div>
        <div className="text-border">|</div>
        <div>
          <span className="font-semibold text-foreground">{dashboardStats.vacantUnits}</span>{" "}
          <span className="text-muted-foreground">vacant</span>
        </div>
        <div className="text-border">|</div>
        <div>
          <span className="font-semibold text-foreground">{dashboardStats.turningUnits}</span>{" "}
          <span className="text-muted-foreground">turning</span>
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
