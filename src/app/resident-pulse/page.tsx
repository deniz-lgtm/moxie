"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { MaintenanceRequest } from "@/lib/types";

type IssueCategory = string;
type IssueSeverity = "low" | "medium" | "high" | "critical";

type RecurringIssue = {
  category: IssueCategory;
  count: number;
  properties: string[];
  severity: IssueSeverity;
  trend: "increasing" | "stable" | "decreasing";
  recentExamples: string[];
};

export default function ResidentPulsePage() {
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/appfolio/work-orders")
      .then((r) => r.json())
      .then((data) => setWorkOrders(data.workOrders || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filteredOrders = workOrders;

  // Group by category
  const categoryGroups: Record<string, MaintenanceRequest[]> = {};
  for (const wo of filteredOrders) {
    const cat = wo.category || "general";
    if (!categoryGroups[cat]) categoryGroups[cat] = [];
    categoryGroups[cat].push(wo);
  }

  const issues: RecurringIssue[] = Object.entries(categoryGroups)
    .map(([category, orders]) => {
      const props = [...new Set(orders.map((o) => o.propertyName))];
      const severity: IssueSeverity =
        orders.length >= 5 ? "critical" :
        orders.length >= 3 ? "high" :
        orders.length >= 2 ? "medium" : "low";

      return {
        category,
        count: orders.length,
        properties: props,
        severity,
        trend: "stable" as const,
        recentExamples: orders.slice(0, 3).map((o) => o.title),
      };
    })
    .sort((a, b) => b.count - a.count);

  // Priority stats
  const emergencyCount = filteredOrders.filter((w) => w.priority === "emergency").length;
  const highCount = filteredOrders.filter((w) => w.priority === "high").length;
  const openCount = filteredOrders.filter((w) => w.status !== "completed" && w.status !== "closed").length;
  const uniqueProperties = [...new Set(workOrders.map((w) => w.propertyName).filter(Boolean))];
  const avgPerProperty = uniqueProperties.length > 0 ? Math.round(filteredOrders.length / uniqueProperties.length) : 0;

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Resident Pulse</h1>
          <p className="text-muted-foreground mt-1">Loading from AppFolio...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Resident Pulse</h1>
        <p className="text-muted-foreground mt-1">
          Recurring issues surfaced from maintenance tickets — top problems this month
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Tickets</p>
          <p className="text-2xl font-bold mt-1">{filteredOrders.length}</p>
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
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {issue.count} ticket{issue.count !== 1 ? "s" : ""} across {issue.properties.join(", ")}
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
          {filteredOrders.length === 0
            ? "No maintenance tickets found. Issues will appear here once work orders are logged."
            : "No recurring patterns detected."}
        </div>
      )}
    </div>
  );
}
