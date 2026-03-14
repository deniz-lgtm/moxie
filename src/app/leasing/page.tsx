import Link from "next/link";
import { applicationGroups, tourSlots } from "@/lib/mock-data";

export default function LeasingPage() {
  const incompleteApps = applicationGroups.filter((g) => g.status === "incomplete");
  const reviewApps = applicationGroups.filter((g) => g.status === "under_review");
  const upcomingTours = tourSlots.filter((t) => new Date(t.date) >= new Date("2026-03-14"));

  // Find the most behind applicant across all groups
  const allApplicants = applicationGroups
    .filter((g) => g.status === "incomplete")
    .flatMap((g) =>
      g.applicants.map((a) => ({
        ...a,
        propertyName: g.propertyName,
        unitNumber: g.unitNumber,
      }))
    )
    .filter((a) => a.status !== "complete")
    .sort((a, b) => {
      const aPct = a.steps.filter((s) => s.status === "complete").length / a.steps.length;
      const bPct = b.steps.filter((s) => s.status === "complete").length / b.steps.length;
      return aPct - bPct;
    });

  const totalRegistrations = upcomingTours.reduce(
    (sum, t) => sum + t.registrations.filter((r) => r.status !== "cancelled").length,
    0
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Leasing</h1>
        <p className="text-muted-foreground mt-1">
          Application tracking and tour scheduling for USC off-campus housing
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Active Applications</p>
          <p className="text-3xl font-bold mt-1">{applicationGroups.length}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {incompleteApps.length} incomplete · {reviewApps.length} in review
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Upcoming Tours</p>
          <p className="text-3xl font-bold mt-1">{upcomingTours.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{totalRegistrations} prospects registered</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Needs Attention</p>
          <p className="text-3xl font-bold mt-1 text-red-600">
            {allApplicants.filter((a) => {
              const pct = a.steps.filter((s) => s.status === "complete").length / a.steps.length;
              return pct < 0.5;
            }).length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Applicants below 50%</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Guarantors Pending</p>
          <p className="text-3xl font-bold mt-1 text-amber-600">
            {applicationGroups
              .flatMap((g) => g.applicants)
              .filter((a) => a.role === "guarantor" && a.status !== "complete").length}
          </p>
          <p className="text-xs text-muted-foreground mt-1">Awaiting completion</p>
        </div>
      </div>

      {/* Tool Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <Link href="/leasing/applications">
          <div className="bg-card rounded-xl border border-border border-l-4 border-l-purple-500 p-6 hover:shadow-lg transition-shadow cursor-pointer h-full">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Applications</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Track lease applications, co-applicant progress, document uploads, and guarantor status. Automated nudges keep applicants moving.
                </p>
              </div>
              <span className="text-2xl">📄</span>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-sm font-medium text-accent">
                {incompleteApps.length} incomplete &middot; {reviewApps.length} under review
              </span>
            </div>
          </div>
        </Link>

        <Link href="/leasing/tours">
          <div className="bg-card rounded-xl border border-border border-l-4 border-l-green-500 p-6 hover:shadow-lg transition-shadow cursor-pointer h-full">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Tour Scheduling</h2>
                <p className="text-sm text-muted-foreground mt-2">
                  Manage open house tours — multiple prospects per showing. Automated pre-tour reminders and post-tour application follow-ups.
                </p>
              </div>
              <span className="text-2xl">🏠</span>
            </div>
            <div className="mt-4 pt-4 border-t border-border">
              <span className="text-sm font-medium text-accent">
                {upcomingTours.length} upcoming &middot; {totalRegistrations} registered
              </span>
            </div>
          </div>
        </Link>
      </div>

      {/* Attention Needed */}
      {allApplicants.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Applicants Needing Attention</h3>
            <Link href="/leasing/applications" className="text-sm text-accent hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {allApplicants.slice(0, 5).map((a) => {
              const done = a.steps.filter((s) => s.status === "complete").length;
              const total = a.steps.length;
              const pct = Math.round((done / total) * 100);
              return (
                <div key={a.id} className="flex items-center gap-4 py-2 border-b border-border last:border-0">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                    pct < 30 ? "bg-red-100 text-red-700" : pct < 60 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"
                  }`}>
                    {pct}%
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.propertyName} #{a.unitNumber} · {a.role === "guarantor" ? "Guarantor" : a.role === "co_applicant" ? "Co-Applicant" : "Primary"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct < 30 ? "bg-red-500" : "bg-accent"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{done}/{total}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
