"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { loadFromStorage } from "@/lib/storage";
import type { Inspection, InspectionType } from "@/lib/types";
import {
  ClipboardCheck,
  Truck,
  Building2,
  Calendar,
  HardHat,
  ArrowUpRight,
} from "lucide-react";

const INSPECTION_TYPES: {
  type: InspectionType;
  label: string;
  description: string;
  color: string;
  borderColor: string;
  iconBg: string;
  textColor: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    type: "move_out",
    label: "Move-Out Inspection",
    description:
      "Full unit walk with floor plan, photos, AI damage analysis, and CA-law-compliant deposit deduction invoice generation.",
    color: "bg-red-50/80",
    borderColor: "border-l-red-500",
    iconBg: "bg-red-100",
    textColor: "text-red-600",
    href: "/inspections/move-out",
    icon: ClipboardCheck,
  },
  {
    type: "move_in",
    label: "Move-In Inspection",
    description:
      "Tenant-facing photo walkthrough. Send a link for tenants to document unit condition at move-in with timestamped photos.",
    color: "bg-green-50/80",
    borderColor: "border-l-green-500",
    iconBg: "bg-green-100",
    textColor: "text-green-600",
    href: "/inspections/move-in",
    icon: Truck,
  },
  {
    type: "onboarding",
    label: "Onboarding Inspection",
    description:
      "Property-level inspection for newly acquired properties. Document baseline conditions across all units and common areas.",
    color: "bg-blue-50/80",
    borderColor: "border-l-blue-500",
    iconBg: "bg-blue-100",
    textColor: "text-blue-600",
    href: "/inspections/onboarding",
    icon: Building2,
  },
  {
    type: "quarterly",
    label: "Quarterly Inspection",
    description:
      "Scheduled maintenance walkthrough. Document deferred maintenance items with timelines and priority levels.",
    color: "bg-amber-50/80",
    borderColor: "border-l-amber-500",
    iconBg: "bg-amber-100",
    textColor: "text-amber-600",
    href: "/inspections/quarterly",
    icon: Calendar,
  },
  {
    type: "punch_list",
    label: "Punch List",
    description:
      "Construction and renovation tracking. Document items needing completion or correction with photos and contractor assignments.",
    color: "bg-purple-50/80",
    borderColor: "border-l-purple-500",
    iconBg: "bg-purple-100",
    textColor: "text-purple-600",
    href: "/inspections/punch-list",
    icon: HardHat,
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
        <h1 className="text-2xl font-bold tracking-tight">Inspections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Five inspection types for every stage of the tenant lifecycle
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {INSPECTION_TYPES.map((t) => {
          const active = countActiveByType(t.type);
          const total = countByType(t.type);
          const Icon = t.icon;
          return (
            <div key={t.type} className="bg-card rounded-2xl border border-border p-4" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-7 h-7 rounded-lg ${t.iconBg} flex items-center justify-center`}>
                  <Icon size={14} className={t.textColor} />
                </div>
              </div>
              <p className="text-2xl font-bold tracking-tight">{total}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t.label.replace(" Inspection", "")}</p>
              {active > 0 && (
                <p className="text-[11px] text-amber-600 font-medium mt-1">{active} in progress</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Inspection type cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {INSPECTION_TYPES.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.type} href={t.href}>
              <div className={`group ${t.color} rounded-2xl border border-border border-l-4 ${t.borderColor} p-5 card-hover cursor-pointer h-full`}>
                <div className="flex items-start justify-between">
                  <div className={`w-10 h-10 rounded-xl ${t.iconBg} flex items-center justify-center`}>
                    <Icon size={20} className={t.textColor} />
                  </div>
                  <ArrowUpRight size={16} className="text-muted-foreground/0 group-hover:text-muted-foreground transition-all duration-200" />
                </div>
                <h2 className="text-base font-semibold mt-3">{t.label}</h2>
                {countActiveByType(t.type) > 0 && (
                  <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-medium mt-2">
                    {countActiveByType(t.type)} active
                  </span>
                )}
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{t.description}</p>
                <div className="mt-3 pt-2.5 border-t border-border/50">
                  <span className="text-xs font-semibold text-accent">
                    {countByType(t.type)} total &middot; Open &rarr;
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent inspections */}
      {recent.length > 0 && (
        <div className="bg-card rounded-2xl border border-border p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Recent Inspections</h2>
          <div className="space-y-1">
            {recent.map((insp) => (
              <div key={insp.id} className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0">
                <div>
                  <p className="text-sm font-medium">{insp.unitNumber}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
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
