"use client";

import { useState } from "react";
import { applicationGroups } from "@/lib/mock-data";
import { StatusBadge } from "@/components/StatusBadge";
import type { ApplicationGroup, Applicant, StepStatus } from "@/lib/types";

// Applicant-facing portal — accessed via /apply/[applicantId]
// In production this would be a public route with auth token, not behind the PM login

export default function ApplyPortal({ params }: { params: Promise<{ id: string }> }) {
  // For the mock, we find the applicant across all groups
  const [allGroups] = useState<ApplicationGroup[]>(applicationGroups);

  let applicant: Applicant | null = null;
  let group: ApplicationGroup | null = null;

  // In a real app we'd use the URL param + auth. For now, default to first incomplete applicant.
  for (const g of allGroups) {
    for (const a of g.applicants) {
      if (a.status !== "complete" && a.role !== "guarantor") {
        applicant = a;
        group = g;
        break;
      }
    }
    if (applicant) break;
  }

  const [currentApplicant, setCurrentApplicant] = useState<Applicant | null>(applicant);
  const [selectedView, setSelectedView] = useState<"checklist" | "documents" | "roommates">("checklist");

  if (!currentApplicant || !group) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-muted-foreground">Application not found or already completed.</p>
      </div>
    );
  }

  const completedSteps = currentApplicant.steps.filter((s) => s.status === "complete").length;
  const totalSteps = currentApplicant.steps.length;
  const pct = Math.round((completedSteps / totalSteps) * 100);

  const applicants = group.applicants.filter((a) => a.role !== "guarantor");
  const myGuarantor = group.applicants.find((a) => a.guarantorFor === currentApplicant.id);

  function simulateCompleteStep(stepId: string) {
    if (!currentApplicant) return;
    setCurrentApplicant({
      ...currentApplicant,
      steps: currentApplicant.steps.map((s) =>
        s.id === stepId ? { ...s, status: "complete" as StepStatus, completedAt: new Date().toISOString() } : s
      ),
    });
  }

  function simulateUpload(docId: string) {
    if (!currentApplicant) return;
    setCurrentApplicant({
      ...currentApplicant,
      documents: currentApplicant.documents.map((d) =>
        d.id === docId
          ? { ...d, status: "uploaded" as const, fileName: "uploaded_file.pdf", uploadedAt: new Date().toISOString() }
          : d
      ),
    });
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-12 h-12 bg-[#9d1535] rounded-xl flex items-center justify-center mx-auto mb-4">
          <span className="text-white font-bold text-lg">M</span>
        </div>
        <h1 className="text-2xl font-bold">Your Application</h1>
        <p className="text-muted-foreground mt-1">
          {group.propertyName} #{group.unitNumber} · {group.unitDetails}
        </p>
        <p className="text-sm text-muted-foreground">
          ${group.monthlyRent.toLocaleString()}/mo · Move-in: {group.targetMoveIn}
        </p>
      </div>

      {/* Progress Ring */}
      <div className="bg-card rounded-xl border border-border p-6 text-center">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-full border-4 border-muted relative mb-3">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
            <circle
              cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="8"
              className={pct === 100 ? "text-green-500" : "text-[#9d1535]"}
              strokeDasharray={`${pct * 2.89} 289`}
              strokeLinecap="round"
            />
          </svg>
          <span className="text-xl font-bold relative z-10">{pct}%</span>
        </div>
        <p className="text-sm text-muted-foreground">
          {completedSteps} of {totalSteps} steps completed
        </p>
        {pct < 100 && (
          <p className="text-xs text-accent mt-1">
            Complete all steps to finalize your application
          </p>
        )}
        {pct === 100 && (
          <p className="text-xs text-green-600 mt-1 font-medium">
            Your application is complete and under review!
          </p>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border">
        {[
          { key: "checklist" as const, label: "My Checklist" },
          { key: "documents" as const, label: "Documents" },
          { key: "roommates" as const, label: "Roommates" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSelectedView(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              selectedView === tab.key
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Checklist View */}
      {selectedView === "checklist" && (
        <div className="space-y-2">
          {currentApplicant.steps.map((step, i) => (
            <div
              key={step.id}
              className={`bg-card rounded-xl border p-4 ${
                step.status === "complete" ? "border-green-200 bg-green-50/50" : "border-border"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5 ${
                  step.status === "complete" ? "bg-green-500 text-white" :
                  step.status === "in_review" ? "bg-purple-500 text-white" :
                  "bg-slate-200 text-slate-600"
                }`}>
                  {step.status === "complete" ? "✓" : i + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm font-medium ${step.status === "complete" ? "line-through text-muted-foreground" : ""}`}>
                      {step.name}
                      {step.required && <span className="text-red-500 ml-1">*</span>}
                    </p>
                    {step.status === "complete" && (
                      <span className="text-xs text-green-600 font-medium">Done</span>
                    )}
                    {step.status === "in_review" && (
                      <span className="text-xs text-purple-600 font-medium">Under Review</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{step.description}</p>
                  {step.status === "pending" && (
                    <button
                      onClick={() => simulateCompleteStep(step.id)}
                      className="mt-2 px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent/90 transition-colors"
                    >
                      Complete This Step
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents View */}
      {selectedView === "documents" && (
        <div className="space-y-3">
          {currentApplicant.documents.map((doc) => (
            <div key={doc.id} className={`bg-card rounded-xl border p-4 ${
              doc.status === "verified" ? "border-green-200 bg-green-50/50" :
              doc.status === "uploaded" ? "border-blue-200 bg-blue-50/50" :
              "border-border"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{doc.label}</p>
                  {doc.fileName ? (
                    <p className="text-xs text-muted-foreground mt-1">
                      {doc.fileName} · {doc.status === "verified" ? "Verified" : "Uploaded"} {doc.uploadedAt && new Date(doc.uploadedAt).toLocaleDateString()}
                    </p>
                  ) : (
                    <p className="text-xs text-red-600 mt-1">Required — not yet uploaded</p>
                  )}
                </div>
                {doc.status === "missing" ? (
                  <button
                    onClick={() => simulateUpload(doc.id)}
                    className="px-3 py-1.5 bg-accent text-white text-xs rounded-lg hover:bg-accent/90 transition-colors"
                  >
                    Upload
                  </button>
                ) : doc.status === "verified" ? (
                  <span className="text-green-600 text-sm">✓ Verified</span>
                ) : (
                  <span className="text-blue-600 text-sm">Pending Review</span>
                )}
              </div>
            </div>
          ))}

          {/* Guarantor docs section */}
          {myGuarantor && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                Guarantor Documents ({myGuarantor.name})
              </h3>
              {myGuarantor.documents.map((doc) => (
                <div key={doc.id} className={`bg-card rounded-xl border p-4 mb-2 ${
                  doc.status !== "missing" ? "border-green-200 bg-green-50/50" : "border-border"
                }`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{doc.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {doc.fileName ? `${doc.fileName} · Uploaded` : "Waiting on guarantor"}
                      </p>
                    </div>
                    <StatusBadge value={doc.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roommates View */}
      {selectedView === "roommates" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            All applicants on this lease must complete their applications before review.
          </p>
          {applicants.map((a) => {
            const done = a.steps.filter((s) => s.status === "complete").length;
            const total = a.steps.length;
            const p = Math.round((done / total) * 100);
            const isMe = a.id === currentApplicant.id;
            const guarantor = group!.applicants.find((g) => g.guarantorFor === a.id);
            const gDone = guarantor ? guarantor.steps.filter((s) => s.status === "complete").length : 0;
            const gTotal = guarantor ? guarantor.steps.length : 0;

            return (
              <div key={a.id} className={`bg-card rounded-xl border p-4 ${isMe ? "border-accent/30 bg-accent-light/30" : "border-border"}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {a.name} {isMe && <span className="text-xs text-accent">(You)</span>}
                    </p>
                    <StatusBadge value={a.role} />
                  </div>
                  <StatusBadge value={a.status} />
                </div>
                <div className="flex items-center gap-3 mb-1">
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${p === 100 ? "bg-green-500" : "bg-accent"}`} style={{ width: `${p}%` }} />
                  </div>
                  <span className="text-xs text-muted-foreground">{done}/{total}</span>
                </div>
                {guarantor && (
                  <div className="mt-2 pl-4 border-l-2 border-amber-300">
                    <p className="text-xs text-amber-700 font-medium">
                      Guarantor: {guarantor.name || "Not provided"}
                    </p>
                    {guarantor.status !== "not_started" ? (
                      <div className="flex items-center gap-3 mt-1">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${gDone === gTotal ? "bg-green-500" : "bg-amber-500"}`} style={{ width: `${gTotal > 0 ? (gDone / gTotal) * 100 : 0}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground">{gDone}/{gTotal}</span>
                      </div>
                    ) : (
                      <p className="text-xs text-red-600 mt-1">Not started</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
