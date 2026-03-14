"use client";

import { useState } from "react";
import { applicationGroups } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApplicationGroup, Applicant } from "@/lib/types";

export default function ApplicationsPage() {
  const [allGroups, setAllGroups] = useState<ApplicationGroup[]>(applicationGroups);
  const [selectedGroup, setSelectedGroup] = useState<ApplicationGroup | null>(null);
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const filtered = allGroups.filter((g) => {
    if (filterStatus !== "all" && g.status !== filterStatus) return false;
    return true;
  });

  // ─── Applicant Detail View ───
  if (selectedApplicant && selectedGroup) {
    const completedSteps = selectedApplicant.steps.filter((s) => s.status === "complete").length;
    const totalSteps = selectedApplicant.steps.length;
    const pct = Math.round((completedSteps / totalSteps) * 100);
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
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={selectedApplicant.role} />
            <StatusBadge value={selectedApplicant.status} />
          </div>
        </div>

        {/* Progress summary */}
        <div className="grid grid-cols-3 gap-4">
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
            <p className="text-sm text-muted-foreground">Nudges Sent</p>
            <p className="text-2xl font-bold mt-1">{selectedApplicant.nudges.filter((n) => n.status !== "scheduled").length}</p>
          </div>
        </div>

        {selectedApplicant.role === "guarantor" && selectedApplicant.guarantorFor && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-sm font-medium text-amber-800">
              Guarantor for: {selectedGroup.applicants.find((a) => a.id === selectedApplicant.guarantorFor)?.name || "Unknown"}
            </p>
          </div>
        )}

        {/* Application Steps Checklist */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Application Checklist</h2>
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

        {/* Documents */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Documents</h2>
          </div>
          <div className="divide-y divide-border">
            {selectedApplicant.documents.map((doc) => (
              <div key={doc.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{doc.label}</p>
                  {doc.fileName ? (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {doc.fileName} · Uploaded {new Date(doc.uploadedAt!).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-xs text-red-600 mt-0.5">Not yet uploaded</p>
                  )}
                </div>
                <StatusBadge value={doc.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Nudge History */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold">Nudge History</h2>
            <button className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors">
              Send Reminder
            </button>
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

  // ─── Group Detail View ───
  if (selectedGroup) {
    const allApplicants = selectedGroup.applicants.filter((a) => a.role !== "guarantor");
    const guarantors = selectedGroup.applicants.filter((a) => a.role === "guarantor");

    const totalStepsAll = selectedGroup.applicants.reduce((sum, a) => sum + a.steps.length, 0);
    const completedStepsAll = selectedGroup.applicants.reduce(
      (sum, a) => sum + a.steps.filter((s) => s.status === "complete").length,
      0
    );
    const overallPct = totalStepsAll > 0 ? Math.round((completedStepsAll / totalStepsAll) * 100) : 0;

    return (
      <div className="space-y-6">
        <button onClick={() => { setSelectedGroup(null); setSelectedApplicant(null); }} className="text-sm text-accent hover:underline">
          &larr; Back to Applications
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {selectedGroup.propertyName} #{selectedGroup.unitNumber}
            </h1>
            <p className="text-muted-foreground mt-1">
              {selectedGroup.unitDetails} · ${selectedGroup.monthlyRent.toLocaleString()}/mo · Move-in: {selectedGroup.targetMoveIn}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={selectedGroup.leaseCycle.replace("_", " ")} />
            <StatusBadge value={selectedGroup.status} />
          </div>
        </div>

        {/* Overall Progress */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold">Overall Application Progress</h2>
            <span className="text-lg font-bold">{overallPct}%</span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${overallPct === 100 ? "bg-green-500" : "bg-accent"}`}
              style={{ width: `${overallPct}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            {completedStepsAll} of {totalStepsAll} total steps completed across all applicants and guarantors
          </p>
        </div>

        {/* Applicants */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Applicants ({allApplicants.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {allApplicants.map((applicant) => {
              const completed = applicant.steps.filter((s) => s.status === "complete").length;
              const total = applicant.steps.length;
              const pct = Math.round((completed / total) * 100);
              const nudgesSent = applicant.nudges.filter((n) => n.status !== "scheduled").length;

              return (
                <button
                  key={applicant.id}
                  onClick={() => setSelectedApplicant(applicant)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        pct === 100 ? "bg-green-100 text-green-700" : pct > 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                      }`}>
                        {pct}%
                      </div>
                      <div>
                        <p className="text-sm font-medium">{applicant.name}</p>
                        <p className="text-xs text-muted-foreground">{applicant.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge value={applicant.role} />
                      <StatusBadge value={applicant.status} />
                      {nudgesSent > 0 && (
                        <span className="text-xs text-muted-foreground">{nudgesSent} nudge{nudgesSent !== 1 ? "s" : ""}</span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-accent"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">{completed}/{total} steps</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Guarantors */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Parental Guarantors ({guarantors.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {guarantors.map((guarantor) => {
              const completed = guarantor.steps.filter((s) => s.status === "complete").length;
              const total = guarantor.steps.length;
              const pct = Math.round((completed / total) * 100);
              const forApplicant = selectedGroup.applicants.find((a) => a.id === guarantor.guarantorFor);

              return (
                <button
                  key={guarantor.id}
                  onClick={() => setSelectedApplicant(guarantor)}
                  className="w-full text-left p-4 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                        pct === 100 ? "bg-green-100 text-green-700" : pct > 50 ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
                      }`}>
                        {pct === 100 ? "✓" : `${pct}%`}
                      </div>
                      <div>
                        <p className="text-sm font-medium">
                          {guarantor.name}
                          {guarantor.status === "not_started" && !guarantor.email && (
                            <span className="text-red-500 ml-2 text-xs font-normal">No info submitted</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Guarantor for {forApplicant?.name || "Unknown"}
                          {guarantor.email && ` · ${guarantor.email}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge value="guarantor" />
                      <StatusBadge value={guarantor.status} />
                    </div>
                  </div>
                  {guarantor.status !== "not_started" && (
                    <div className="mt-3 flex items-center gap-3">
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-amber-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{completed}/{total} steps</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ─── Application List View ───
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Applications</h1>
        <p className="text-muted-foreground mt-1">
          Track lease applications, co-applicant progress, and guarantor documents
        </p>
      </div>

      <div className="flex gap-3">
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
      </div>

      <div className="space-y-4">
        {filtered.map((group) => {
          const applicants = group.applicants.filter((a) => a.role !== "guarantor");
          const guarantors = group.applicants.filter((a) => a.role === "guarantor");
          const totalSteps = group.applicants.reduce((s, a) => s + a.steps.length, 0);
          const doneSteps = group.applicants.reduce(
            (s, a) => s + a.steps.filter((st) => st.status === "complete").length, 0
          );
          const pct = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

          return (
            <button
              key={group.id}
              onClick={() => setSelectedGroup(group)}
              className="w-full text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{group.propertyName} #{group.unitNumber}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {group.unitDetails} · ${group.monthlyRent.toLocaleString()}/mo · Move-in: {group.targetMoveIn}
                  </p>
                </div>
                <StatusBadge value={group.status} />
              </div>

              {/* Per-person bars */}
              <div className="mt-4 space-y-2">
                {applicants.map((a) => {
                  const done = a.steps.filter((s) => s.status === "complete").length;
                  const total = a.steps.length;
                  const p = Math.round((done / total) * 100);
                  return (
                    <div key={a.id} className="flex items-center gap-3">
                      <span className="text-xs w-28 truncate">{a.name}</span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${p === 100 ? "bg-green-500" : "bg-accent"}`} style={{ width: `${p}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{done}/{total}</span>
                    </div>
                  );
                })}
                {guarantors.map((g) => {
                  const done = g.steps.filter((s) => s.status === "complete").length;
                  const total = g.steps.length;
                  const p = Math.round((done / total) * 100);
                  const forName = group.applicants.find((a) => a.id === g.guarantorFor)?.name;
                  return (
                    <div key={g.id} className="flex items-center gap-3">
                      <span className="text-xs w-28 truncate text-amber-700">
                        {g.status === "not_started" && !g.email ? `⚠ ${forName}'s guarantor` : g.name}
                      </span>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${p === 100 ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${p}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">{done}/{total}</span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">{applicants.length} applicant{applicants.length !== 1 ? "s" : ""}</span>
                  <span className="text-xs text-muted-foreground">{guarantors.length} guarantor{guarantors.length !== 1 ? "s" : ""}</span>
                </div>
                <span className="text-sm font-medium">{pct}% complete</span>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No applications match the current filters.
        </div>
      )}
    </div>
  );
}
