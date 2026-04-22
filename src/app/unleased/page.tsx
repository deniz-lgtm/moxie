"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { AcademicYearSelector } from "@/components/AcademicYearSelector";
import type { AcademicYear, VacantUnit } from "@/lib/types";

function daysSinceIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / 86400000));
}

export default function UnleasedPage() {
  const [ay, setAy] = useState<AcademicYear>("2026-2027");
  const [unleased, setUnleased] = useState<VacantUnit[]>([]);
  const [target, setTarget] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/appfolio/units?vacancies_ay=${ay}`)
      .then((r) => r.json())
      .then((j) => {
        setUnleased(Array.isArray(j.vacancies) ? j.vacancies : []);
        setTarget(j.target ?? "");
      })
      .catch(() => setUnleased([]))
      .finally(() => setLoading(false));
  }, [ay]);

  const grouped = useMemo(() => {
    const byProperty = new Map<string, VacantUnit[]>();
    for (const u of unleased) {
      const k = u.propertyName || "—";
      if (!byProperty.has(k)) byProperty.set(k, []);
      byProperty.get(k)!.push(u);
    }
    return [...byProperty.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [unleased]);

  const targetLabel = target
    ? new Date(target + "T00:00:00").toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "";

  return (
    <div className="space-y-6">
      <Link href="/" className="text-sm text-accent hover:underline inline-flex items-center gap-1">
        <ChevronLeft className="w-4 h-4" /> Dashboard
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Unleased Units</h1>
          <p className="text-muted-foreground mt-1">
            Units with no lease (current, future-signed, or replacement) covering{" "}
            <span className="font-medium text-foreground">{targetLabel || "the target date"}</span>. These
            are the only truly open rooms for the {ay.replace("-", "–")} academic year.
          </p>
        </div>
        <AcademicYearSelector value={ay} onChange={setAy} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Unleased" value={unleased.length} />
        <StatCard
          label="Properties affected"
          value={new Set(unleased.map((u) => u.propertyName)).size}
        />
        <StatCard
          label="Lost monthly rent"
          value={`$${unleased
            .reduce((s, u) => s + (Number(u.rent) || 0), 0)
            .toLocaleString()}`}
        />
        <StatCard label="Target date" value={targetLabel || "—"} />
      </div>

      {loading ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : unleased.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-sm font-medium">No unleased units.</p>
          <p className="text-xs text-muted-foreground mt-1">
            Every unit has a lease covering {targetLabel || "the target date"}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([propertyName, units]) => (
            <div
              key={propertyName}
              className="bg-card rounded-xl border border-border overflow-hidden"
            >
              <div className="p-4 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold">{propertyName}</h2>
                <span className="text-xs text-muted-foreground">
                  {units.length} {units.length === 1 ? "unit" : "units"}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted">
                      <th className="text-left px-4 py-3 font-medium">Unit</th>
                      <th className="text-left px-4 py-3 font-medium">Beds/Bath</th>
                      <th className="text-right px-4 py-3 font-medium">Rent</th>
                      <th className="text-left px-4 py-3 font-medium">Last tenant</th>
                      <th className="text-left px-4 py-3 font-medium">Lease ends</th>
                      <th className="text-right px-4 py-3 font-medium">Days empty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units
                      .sort((a, b) => a.unitName.localeCompare(b.unitName, undefined, { numeric: true }))
                      .map((u) => {
                        const daysEmpty = u.daysVacantOnTarget ?? daysSinceIso(u.lastLeaseTo);
                        return (
                          <tr key={u.unitId} className="border-b border-border last:border-0">
                            <td className="px-4 py-3 font-medium">{u.unitName || "—"}</td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {u.bedrooms != null
                                ? `${u.bedrooms}bd / ${u.bathrooms ?? "—"}ba`
                                : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-medium">
                              {u.rent ? `$${Number(u.rent).toLocaleString()}` : "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {u.lastTenant || "—"}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              {u.lastLeaseTo || "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {daysEmpty != null ? `${daysEmpty}d` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-2xl font-bold mt-2 tracking-tight">{value}</p>
    </div>
  );
}
