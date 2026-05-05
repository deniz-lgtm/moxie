"use client";

import { useState, useEffect, useMemo } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/contexts/PortfolioContext";
import type { ApplicationGroup, Applicant } from "@/lib/types";

// Categorize an applicant by where they are in the funnel. We key nudges
// off this — a "needs_screening" applicant gets a different push than a
// "needs_income" one.
function applicantStage(a: Applicant): {
  key: "approved" | "screening" | "docs" | "started" | "stalled";
  label: string;
} {
  const status = (a.applicationStatus || "").toLowerCase();
  if (/approved|converted/.test(status)) return { key: "approved", label: "Approved" };

  const screening = (a.screeningStatus || "").toLowerCase();
  if (screening && !/done|complete|passed|cleared/.test(screening)) {
    return { key: "screening", label: "Screening incomplete" };
  }

  const docsMissing = a.documents.some((d) => d.status === "missing");
  if (docsMissing) return { key: "docs", label: "Documents missing" };

  if (a.steps.some((s) => s.status === "pending" && s.required)) {
    return { key: "started", label: "Steps pending" };
  }

  return { key: "stalled", label: "Awaiting review" };
}

function groupCompletion(group: ApplicationGroup): {
  done: number;
  total: number;
  pct: number;
  blockers: Applicant[];
} {
  const total = group.applicants.length;
  const blockers = group.applicants.filter(
    (a) => applicantStage(a).key !== "approved"
  );
  const done = total - blockers.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct, blockers };
}

// "Closed" applications are ones we don't need to nudge on anymore — every
// applicant in the group is in a terminal state (already approved/converted
// to a lease, or denied/cancelled). We hide these by default so the page
// stays focused on apps that still need work.
function isClosedGroup(group: ApplicationGroup): boolean {
  if (group.applicants.length === 0) return true;
  return group.applicants.every((a) => {
    const s = (a.applicationStatus || "").toLowerCase();
    return /approved|converted|denied|cancelled|canceled|withdrawn|rejected/.test(s);
  });
}

export default function ApplicationsPage() {
  const { portfolioId } = usePortfolio();
  const [allGroups, setAllGroups] = useState<ApplicationGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<ApplicationGroup | null>(null);
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [showClosed, setShowClosed] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/appfolio/applications?portfolio_id=${portfolioId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.applications) {
          setAllGroups(data.applications);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [portfolioId]);

  // Refresh selected group reference when underlying data changes.
  useEffect(() => {
    if (selectedGroup) {
      const fresh = allGroups.find((g) => g.id === selectedGroup.id);
      if (fresh && fresh !== selectedGroup) setSelectedGroup(fresh);
    }
  }, [allGroups, selectedGroup]);

  const closedCount = useMemo(
    () => allGroups.filter(isClosedGroup).length,
    [allGroups]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allGroups.filter((g) => {
      if (!showClosed && isClosedGroup(g)) return false;
      if (filterStatus !== "all" && g.status !== filterStatus) return false;
      if (filterStage !== "all") {
        const hit = g.applicants.some((a) => applicantStage(a).key === filterStage);
        if (!hit) return false;
      }
      if (q) {
        const hay = [
          g.propertyName,
          g.unitNumber,
          g.rentalApplicationGroupId ?? "",
          ...g.applicants.flatMap((a) => [a.name, a.email, a.rentalApplicationId ?? ""]),
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allGroups, filterStatus, filterStage, search]);

  const totals = useMemo(() => {
    let pending = 0;
    let screening = 0;
    let approved = 0;
    for (const g of allGroups) {
      for (const a of g.applicants) {
        const s = applicantStage(a).key;
        if (s === "approved") approved++;
        else if (s === "screening") screening++;
        else pending++;
      }
    }
    return { pending, screening, approved };
  }, [allGroups]);

  // ─── Applicant Detail View ───
  if (selectedApplicant && selectedGroup) {
    const stage = applicantStage(selectedApplicant);
    const completedSteps = selectedApplicant.steps.filter((s) => s.status === "complete").length;
    const totalSteps = selectedApplicant.steps.length;
    const pct = totalSteps > 0 ? Math.round((completedSteps / totalSteps) * 100) : 0;
    const uploadedDocs = selectedApplicant.documents.filter((d) => d.status !== "missing").length;

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setSelectedApplicant(null)} className="text-accent hover:underline">
            &larr; {selectedGroup.propertyName} #{selectedGroup.unitNumber}
          </button>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{selectedApplicant.name}</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selectedApplicant.name}</h1>
            <p className="text-muted-foreground mt-1">
              {selectedApplicant.email}
              {selectedApplicant.phone && ` · ${selectedApplicant.phone}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {selectedApplicant.rentalApplicationId && (
                <span>Application ID: <span className="font-mono">{selectedApplicant.rentalApplicationId}</span></span>
              )}
              {selectedGroup.rentalApplicationGroupId && (
                <span>Group ID: <span className="font-mono">{selectedGroup.rentalApplicationGroupId}</span></span>
              )}
              {selectedApplicant.tenantId && (
                <span>Tenant ID: <span className="font-mono">{selectedApplicant.tenantId}</span></span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={selectedApplicant.role} />
            <StatusBadge value={stage.label} />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Steps Complete</p>
            <p className="text-2xl font-bold mt-1">{completedSteps}/{totalSteps}</p>
            <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Documents</p>
            <p className="text-2xl font-bold mt-1">{uploadedDocs}/{selectedApplicant.documents.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Screening</p>
            <p className="text-sm font-medium mt-2 capitalize">{selectedApplicant.screeningStatus || "—"}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Lead Source</p>
            <p className="text-sm font-medium mt-2">{selectedApplicant.leadSource || "—"}</p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Application Checklist</h2>
            <button
              className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50"
              disabled={!selectedApplicant.rentalApplicationId}
              title={
                selectedApplicant.rentalApplicationId
                  ? `Send nudge for application ${selectedApplicant.rentalApplicationId}`
                  : "No rental_application_id available"
              }
            >
              Nudge {selectedApplicant.name.split(" ")[0]}
            </button>
          </div>
          <div className="divide-y divide-border">
            {selectedApplicant.steps.map((step, i) => (
              <div key={step.id} className="p-4 flex items-center gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm font-medium ${
                  step.status === "complete" ? "bg-green-100 text-green-700" :
                  step.status === "in_review" ? "bg-purple-100 text-purple-700" :
                  "bg-slate-100 text-slate-500"
                }`}>
                  {step.status === "complete" ? "✓" : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${step.status === "complete" ? "text-muted-foreground line-through" : ""}`}>
                    {step.name}
                    {step.required && <span className="text-red-500 ml-1">*</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
                <StatusBadge value={step.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Nudge History</h2>
          </div>
          {selectedApplicant.nudges.length > 0 ? (
            <div className="divide-y divide-border">
              {selectedApplicant.nudges.map((nudge) => (
                <div key={nudge.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${nudge.channel === "email" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                        {nudge.channel.toUpperCase()}
                      </span>
                      <StatusBadge value={nudge.status} />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {nudge.sentAt ? new Date(nudge.sentAt).toLocaleString() : `Scheduled: ${new Date(nudge.scheduledAt).toLocaleString()}`}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{nudge.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 text-sm text-muted-foreground">No nudges sent yet.</div>
          )}
        </div>
      </div>
    );
  }

  // ─── Group / Unit Detail View ───
  if (selectedGroup) {
    const { done, total, pct, blockers } = groupCompletion(selectedGroup);

    return (
      <div className="space-y-6">
        <button
          onClick={() => { setSelectedGroup(null); setSelectedApplicant(null); }}
          className="text-sm text-accent hover:underline"
        >
          &larr; Back to Applications
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {selectedGroup.propertyName} #{selectedGroup.unitNumber}
            </h1>
            <p className="text-muted-foreground mt-1">
              {selectedGroup.unitDetails || "—"} · ${selectedGroup.monthlyRent.toLocaleString()}/mo
              {selectedGroup.targetMoveIn && ` · Move-in: ${selectedGroup.targetMoveIn}`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {selectedGroup.rentalApplicationGroupId ? (
                <span>Group ID: <span className="font-mono">{selectedGroup.rentalApplicationGroupId}</span></span>
              ) : (
                <span className="italic">No AppFolio group_id — clustered by unit</span>
              )}
              {selectedGroup.unitId && (
                <span>Unit ID: <span className="font-mono">{selectedGroup.unitId}</span></span>
              )}
              {selectedGroup.propertyId && (
                <span>Property ID: <span className="font-mono">{selectedGroup.propertyId}</span></span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={selectedGroup.status} />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Group Progress</h2>
            <span className="text-lg font-bold">{done}/{total} ready</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {blockers.length > 0 ? (
            <p className="text-xs text-muted-foreground mt-2">
              Waiting on: {blockers.map((b) => b.name).join(", ")}
            </p>
          ) : (
            <p className="text-xs text-green-700 mt-2">All applicants in this group are ready.</p>
          )}
        </div>

        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Applicants ({selectedGroup.applicants.length})</h2>
            {blockers.length > 0 && (
              <button
                className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
                title={`Send nudge to ${blockers.length} applicant${blockers.length === 1 ? "" : "s"} who are behind`}
              >
                Nudge {blockers.length} behind
              </button>
            )}
          </div>
          <div className="divide-y divide-border">
            {selectedGroup.applicants.map((a) => {
              const stage = applicantStage(a);
              return (
                <button
                  key={a.id}
                  onClick={() => setSelectedApplicant(a)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        stage.key === "approved" ? "bg-green-100 text-green-700" :
                        stage.key === "screening" ? "bg-amber-100 text-amber-700" :
                        stage.key === "docs" ? "bg-red-100 text-red-700" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {a.name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{a.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {a.email || "—"}
                          {a.rentalApplicationId && (
                            <span className="ml-2 font-mono">#{a.rentalApplicationId}</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge value={a.role} />
                      <StatusBadge value={stage.label} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── List View — grouped by unit ───
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Applications</h1>
        <p className="text-muted-foreground mt-1">
          Track rental applications by unit and group, and nudge individual applicants who are behind.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Pending applicants</p>
          <p className="text-2xl font-bold mt-1">{totals.pending}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">In screening</p>
          <p className="text-2xl font-bold mt-1">{totals.screening}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">Approved</p>
          <p className="text-2xl font-bold mt-1">{totals.approved}</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, unit, or ID…"
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card flex-1 min-w-[240px]"
        />
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Statuses</option>
          <option value="incomplete">Incomplete</option>
          <option value="under_review">Under Review</option>
          <option value="approved">Approved</option>
          <option value="denied">Denied</option>
        </select>
        <select
          value={filterStage}
          onChange={(e) => setFilterStage(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">Any Stage</option>
          <option value="screening">Has screening incomplete</option>
          <option value="docs">Has missing documents</option>
          <option value="started">Has steps pending</option>
          <option value="approved">Has approved</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-muted-foreground border border-border rounded-lg px-3 py-2 bg-card cursor-pointer">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
          />
          Show closed ({closedCount})
        </label>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading applications…</div>
      ) : (
        <div className="space-y-4">
          {filtered.map((group) => {
            const { done, total, pct, blockers } = groupCompletion(group);
            return (
              <button
                key={group.id}
                onClick={() => setSelectedGroup(group)}
                className="w-full text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">
                      {group.propertyName} {group.unitNumber && `#${group.unitNumber}`}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {group.applicants.length} applicant{group.applicants.length === 1 ? "" : "s"}
                      {group.targetMoveIn && ` · Move-in: ${group.targetMoveIn}`}
                      {group.monthlyRent > 0 && ` · $${group.monthlyRent.toLocaleString()}/mo`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1 font-mono">
                      {group.rentalApplicationGroupId
                        ? `Group ${group.rentalApplicationGroupId}`
                        : "Unit-clustered"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusBadge value={group.status} />
                    <p className="text-xs text-muted-foreground mt-1">
                      {done}/{total} ready
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {group.applicants.map((a) => {
                    const stage = applicantStage(a);
                    return (
                      <div key={a.id} className="flex items-center gap-3 text-xs">
                        <span className="w-32 truncate">{a.name}</span>
                        <span className="font-mono text-muted-foreground w-20 truncate">
                          {a.rentalApplicationId ? `#${a.rentalApplicationId}` : "—"}
                        </span>
                        <span className="flex-1 truncate text-muted-foreground">
                          {a.leadSource || ""}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full whitespace-nowrap ${
                            stage.key === "approved" ? "bg-green-100 text-green-700" :
                            stage.key === "screening" ? "bg-amber-100 text-amber-700" :
                            stage.key === "docs" ? "bg-red-100 text-red-700" :
                            "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {stage.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <div className="flex-1 mr-4 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-accent"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {blockers.length === 0
                      ? "Ready"
                      : `${blockers.length} behind`}
                  </span>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No applications match the current filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
