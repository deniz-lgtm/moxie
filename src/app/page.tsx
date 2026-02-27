import Link from "next/link";
import {
  dashboardStats,
  inspections,
  unitTurns,
  maintenanceRequests,
} from "@/lib/mock-data";

const toolCards = [
  {
    title: "Inspections",
    href: "/inspections",
    description: "Move-in, move-out, and quarterly inspections with condition tracking and photos.",
    stat: `${dashboardStats.activeInspections} active`,
    icon: "📋",
    color: "border-l-blue-500",
  },
  {
    title: "Unit Turns",
    href: "/unit-turns",
    description: "Manage the full move-out to move-in workflow — cleaning, paint, repairs, and walkthroughs.",
    stat: `${dashboardStats.upcomingTurns} in progress`,
    icon: "🔄",
    color: "border-l-amber-500",
  },
  {
    title: "Maintenance",
    href: "/maintenance",
    description: "Track work orders from submission through completion. Assign vendors and monitor costs.",
    stat: `${dashboardStats.openMaintenanceRequests} open`,
    icon: "🔧",
    color: "border-l-red-500",
  },
];

function StatCard({ label, value, subtext }: { label: string; value: number; subtext?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}

export default function Dashboard() {
  const recentInspections = inspections
    .filter((i) => i.status !== "completed")
    .slice(0, 3);
  const activeTurns = unitTurns.filter((t) => t.status !== "completed");
  const urgentMaintenance = maintenanceRequests
    .filter((m) => m.status !== "completed" && m.status !== "closed")
    .sort((a, b) => {
      const order = { emergency: 0, high: 1, medium: 2, low: 3 };
      return order[a.priority] - order[b.priority];
    })
    .slice(0, 3);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Moxie Management &mdash; USC Off-Campus Housing Overview
        </p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Units" value={dashboardStats.totalUnits} />
        <StatCard label="Occupied" value={dashboardStats.occupiedUnits} subtext={`${Math.round((dashboardStats.occupiedUnits / dashboardStats.totalUnits) * 100)}% occupancy`} />
        <StatCard label="Vacant" value={dashboardStats.vacantUnits} />
        <StatCard label="Turning" value={dashboardStats.turningUnits} />
      </div>

      {/* Tool Cards */}
      <div className="grid md:grid-cols-3 gap-6">
        {toolCards.map((card) => (
          <Link key={card.href} href={card.href}>
            <div
              className={`bg-card rounded-xl border border-border border-l-4 ${card.color} p-6 hover:shadow-lg transition-shadow cursor-pointer h-full`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{card.title}</h2>
                  <p className="text-sm text-muted-foreground mt-2">
                    {card.description}
                  </p>
                </div>
                <span className="text-2xl">{card.icon}</span>
              </div>
              <div className="mt-4 pt-4 border-t border-border">
                <span className="text-sm font-medium text-accent">
                  {card.stat}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Activity Feed */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Recent Inspections */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Upcoming Inspections</h3>
            <Link href="/inspections" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentInspections.map((insp) => (
              <div key={insp.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">
                    {insp.propertyName} #{insp.unitNumber}
                  </p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {insp.type.replace("_", " ")} &middot; {insp.scheduledDate}
                  </p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${insp.status === "scheduled" ? "bg-blue-100 text-blue-800" : "bg-yellow-100 text-yellow-800"}`}>
                  {insp.status.replace("_", " ")}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Active Turns */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Active Unit Turns</h3>
            <Link href="/unit-turns" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {activeTurns.map((turn) => {
              const completed = turn.tasks.filter((t) => t.status === "completed").length;
              const pct = Math.round((completed / turn.tasks.length) * 100);
              return (
                <div key={turn.id} className="py-2 border-b border-border last:border-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {turn.propertyName} #{turn.unitNumber}
                    </p>
                    <span className="text-xs text-muted-foreground">{pct}%</span>
                  </div>
                  <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Target: {turn.targetReadyDate}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Urgent Maintenance */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Urgent Maintenance</h3>
            <Link href="/maintenance" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {urgentMaintenance.map((req) => (
              <div key={req.id} className="py-2 border-b border-border last:border-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{req.title}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${req.priority === "emergency" ? "bg-red-100 text-red-800" : req.priority === "high" ? "bg-orange-100 text-orange-800" : "bg-yellow-100 text-yellow-800"}`}>
                    {req.priority}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {req.propertyName} #{req.unitNumber} &middot; {req.tenantName}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
