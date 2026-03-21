"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { loadFromStorage } from "@/lib/storage";
import type { Inspection, InspectionType } from "@/lib/types";

const INSPECTION_TYPES: {
  type: InspectionType;
  label: string;
  description: string;
  color: string;
  borderColor: string;
  href: string;
}[] = [
  {
    type: "move_out",
    label: "Move-Out Inspection",
    description:
      "Full unit walk with floor plan, photos, AI damage analysis, and LA-law-compliant deposit deduction invoice generation.",
    color: "bg-red-50",
    borderColor: "border-l-red-500",
    href: "/inspections/move-out",
  },
  {
    type: "move_in",
    label: "Move-In Inspection",
    description:
      "Tenant-facing photo walkthrough. Send a link for tenants to document unit condition at move-in with timestamped photos.",
    color: "bg-green-50",
    borderColor: "border-l-green-500",
    href: "/inspections/move-in",
  },
  {
    type: "onboarding",
    label: "Onboarding Inspection",
    description:
      "Property-level inspection for newly acquired properties. Document baseline conditions across all units and common areas.",
    color: "bg-blue-50",
    borderColor: "border-l-blue-500",
    href: "/inspections/onboarding",
  },
  {
    type: "quarterly",
    label: "Quarterly Inspection",
    description:
      "Scheduled maintenance walkthrough. Document deferred maintenance items with timelines and priority levels.",
    color: "bg-amber-50",
    borderColor: "border-l-amber-500",
    href: "/inspections/quarterly",
  },
  {
    type: "punch_list",
    label: "Punch List",
    description:
      "Construction and renovation tracking. Document items needing completion or correction with photos and contractor assignments.",
    color: "bg-purple-50",
    borderColor: "border-l-purple-500",
    href: "/inspections/punch-list",
  },
];

export default function InspectionsHub() {
  const [inspections, setInspections] = useState<Inspection[]>([]);

  useEffect(() => {
    setInspections(loadFromStorage<Inspection[]>("inspections_v2", []));
  }, []);

  function countByType(type: InspectionType) {
    return inspections.filter((i) => i.type === type).length;
  }

  function countActiveByType(type: InspectionType) {
    return inspections.filter(
      (i) => i.type === type && i.status !== "completed"
    ).length;
  }

  const recent = [...inspections]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 8);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Inspections</h1>
        <p className="text-muted-foreground mt-1">
          Five inspection types for every stage — move-out, move-in, onboarding,
          quarterly maintenance, and punch lists
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {INSPECTION_TYPES.map((t) => {
          const active = countActiveByType(t.type);
          const total = countByType(t.type);
          return (
            <div key={t.type} className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">{t.label}</p>
              <p className="text-2xl font-bold mt-1">{total}</p>
              {active > 0 && (
                <p className="text-xs text-amber-600 mt-1">{active} in progress</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Inspection type cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {INSPECTION_TYPES.map((t) => (
          <Link key={t.type} href={t.href}>
            <div className={`${t.color} rounded-xl border border-border border-l-4 ${t.borderColor} p-6 hover:shadow-lg transition-shadow cursor-pointer h-full`}>
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold">{t.label}</h2>
                {countActiveByType(t.type) > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium">
                    {countActiveByType(t.type)} active
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-2">{t.description}</p>
              <div className="mt-4 pt-3 border-t border-border/50">
                <span className="text-sm font-medium text-accent">
                  {countByType(t.type)} total &middot; Open {t.label.toLowerCase()} &rarr;
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Recent inspections */}
      {recent.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Recent Inspections</h2>
          <div className="space-y-3">
            {recent.map((insp) => (
              <div key={insp.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium">{insp.unitNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    {INSPECTION_TYPES.find((t) => t.type === insp.type)?.label} &middot;{" "}
                    {insp.inspector || "Unassigned"} &middot; {insp.scheduledDate}
                  </p>
                </div>
                <StatusBadge value={insp.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
