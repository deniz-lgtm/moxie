"use client";

import { useState, useEffect, useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/contexts/PortfolioContext";
import type { MaintenanceRequest } from "@/lib/types";

type IssueSeverity = "low" | "medium" | "high" | "critical";

type RecurringIssue = {
  category: string;
  count: number;
  properties: string[];
  severity: IssueSeverity;
  trend: "increasing" | "stable" | "decreasing";
  recentExamples: string[];
  avgResolutionDays: number | null;
};

type TimeRange = "30d" | "90d" | "6m" | "all";

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

export default function ResidentPulsePage() {
  const { portfolioId } = usePortfolio();
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>("90d");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");

  useEffect(() => {
    fetch(`/api/appfolio/work-orders?portfolio_id=${portfolioId}`)
      .then((r) => r.json())
      .then((data) => setWorkOrders(data.workOrders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portfolioId]);

  const allProperties = useMemo(
    () => [...new Set(workOrders.map((w) => w.propertyName).filter(Boolean))].sort(),
    [workOrders]
  );

  const cutoffDate = useMemo(() => {
    switch (timeRange) {
      case "30d": return daysAgo(30);
      case "90d": return daysAgo(90);
      case "6m": return daysAgo(180);
      default: return "";
    }
  }, [timeRange]);

  // Split into current period and previous period (same length) for trend calc
  const { currentOrders, previousOrders } = useMemo(() => {
    let filtered = workOrders;
    if (propertyFilter !== "all") {
      filtered = filtered.filter((w) => w.propertyName === propertyFilter);
    }

    if (!cutoffDate) {
      return { currentOrders: filtered, previousOrders: [] as MaintenanceRequest[] };
    }

    const periodMs = new Date().getTime() - new Date(cutoffDate).getTime();
    const prevCutoff = new Date(new Date(cutoffDate).getTime() - periodMs).toISOString();

    const current = filtered.filter((w) => w.createdAt >= cutoffDate);
    const previous = filtered.filter((w) => w.createdAt >= prevCutoff && w.createdAt < cutoffDate);
    return { currentOrders: current, previousOrders: previous };
  }, [workOrders, cutoffDate, propertyFilter]);

  // Build previous period category counts for trend comparison
  const prevCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const wo of previousOrders) {
      const cat = wo.category || "general";
      counts[cat] = (counts[cat] || 0) + 1;
    }
    return counts;
  }, [previousOrders]);

  // Group by category
  const issues: RecurringIssue[] = useMemo(() => {
    const categoryGroups: Record<string, MaintenanceRequest[]> = {};
    for (const wo of currentOrders) {
      const cat = wo.category || "general";
      if (!categoryGroups[cat]) categoryGroups[cat] = [];
      categoryGroups[cat].push(wo);
    }

    return Object.entries(categoryGroups)
      .map(([category, orders]) => {
        const props = [...new Set(orders.map((o) => o.propertyName))];
        const severity: IssueSeverity =
          orders.length >= 5 ? "critical" :
          orders.length >= 3 ? "high" :
          orders.length >= 2 ? "medium" : "low";

        // Trend: compare current vs previous period
        const prevCount = prevCategoryCounts[category] || 0;
        const trend =
          prevCount === 0 && orders.length > 0 ? "increasing" as const :
          orders.length > prevCount * 1.2 ? "increasing" as const :
          orders.length < prevCount * 0.8 ? "decreasing" as const :
          "stable" as const;

        // Avg resolution time for completed orders
        const completed = orders.filter((o) => o.completedDate && o.createdAt);
        const avgResolutionDays = completed.length > 0
          ? Math.round(completed.reduce((sum, o) => sum + daysBetween(o.createdAt, o.completedDate!), 0) / completed.length)
          : null;

        return {
          category,
          count: orders.length,
          properties: props,
          severity,
          trend,
          recentExamples: orders.slice(0, 3).map((o) => o.title),
          avgResolutionDays,
        };
      })
      .sort((a, b) => b.count - a.count);
  }, [currentOrders, prevCategoryCounts]);

  // Priority stats
  const emergencyCount = currentOrders.filter((w) => w.priority === "emergency").length;
  const highCount = currentOrders.filter((w) => w.priority === "high").length;
  const openCount = currentOrders.filter((w) => w.status !== "completed" && w.status !== "closed").length;
  const uniqueProperties = [...new Set(currentOrders.map((w) => w.propertyName).filter(Boolean))];
  const avgPerProperty = uniqueProperties.length > 0 ? Math.round(currentOrders.length / uniqueProperties.length) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Maintenance Analytics</h1>
          <p className="text-muted-foreground mt-1">Loading from AppFolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Recurring issues surfaced from maintenance tickets — patterns, trends, and resolution times
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value as TimeRange)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="6m">Last 6 months</option>
          <option value="all">All time</option>
        </select>
        <select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Properties</option>
          {allProperties.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Tickets</p>
          <p className="text-2xl font-bold mt-1">{currentOrders.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {previousOrders.length > 0
              ? `${currentOrders.length > previousOrders.length ? "+" : ""}${currentOrders.length - previousOrders.length} vs prev period`
              : "in selected period"}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Open</p>
          <p className="text-2xl font-bold mt-1 text-yellow-600">{openCount}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Emergency / High</p>
          <p className={`text-2xl font-bold mt-1 ${emergencyCount > 0 ? "text-red-600" : ""}`}>
            {emergencyCount + highCount}
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Avg Per Property</p>
          <p className="text-2xl font-bold mt-1">{avgPerProperty}</p>
        </div>
      </div>

      {/* Issue categories */}
      {issues.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Issues by Category</h2>
          {issues.map((issue) => (
            <div key={issue.category} className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold capitalize">{issue.category.replace(/_/g, " ")}</h3>
                    <StatusBadge value={issue.severity} />
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      issue.trend === "increasing" ? "bg-red-50 text-red-700" :
                      issue.trend === "decreasing" ? "bg-green-50 text-green-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>
                      {issue.trend === "increasing" ? "Trending up" :
                       issue.trend === "decreasing" ? "Trending down" :
                       "Stable"}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {issue.count} ticket{issue.count !== 1 ? "s" : ""} across {issue.properties.join(", ")}
                    {issue.avgResolutionDays !== null && (
                      <> &middot; Avg resolution: {issue.avgResolutionDays}d</>
                    )}
                  </p>
                </div>
                <span className="text-2xl font-bold text-muted-foreground">{issue.count}</span>
              </div>

              {/* Bar */}
              <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    issue.severity === "critical" ? "bg-red-500" :
                    issue.severity === "high" ? "bg-orange-500" :
                    issue.severity === "medium" ? "bg-yellow-500" :
                    "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min((issue.count / (issues[0]?.count || 1)) * 100, 100)}%` }}
                />
              </div>

              {issue.recentExamples.length > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <p className="text-xs text-muted-foreground mb-1">Recent examples:</p>
                  <ul className="space-y-1">
                    {issue.recentExamples.map((ex, i) => (
                      <li key={i} className="text-xs text-muted-foreground">
                        &middot; {ex}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {currentOrders.length === 0
            ? "No maintenance tickets found for this period. Issues will appear here once work orders are logged."
            : "No recurring patterns detected."}
        </div>
      )}
    </div>
  );
}
