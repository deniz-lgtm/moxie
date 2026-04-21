"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, ChevronLeft } from "lucide-react";
import PropertyMeetings from "@/components/PropertyMeetings";
import type { Property, Unit } from "@/lib/types";

type PropertySummary = {
  property: Property;
  units: Unit[];
  occupied: number;
  vacant: number;
  notice: number;
  occupancyRate: number;
};

export default function MeetingsPage() {
  const [summaries, setSummaries] = useState<PropertySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/appfolio/properties").then((r) => r.json()),
      fetch("/api/appfolio/units").then((r) => r.json()),
    ])
      .then(([propData, unitData]) => {
        const properties: Property[] = propData.properties || [];
        const units: Unit[] = unitData.units || [];
        const sums: PropertySummary[] = properties
          .map((p) => {
            const propUnits = units.filter((u) => u.propertyId === p.id);
            const occupied = propUnits.filter((u) => u.status === "current").length;
            const vacant = propUnits.filter((u) => u.status === "vacant").length;
            const notice = propUnits.filter((u) => u.status === "notice").length;
            return {
              property: p,
              units: propUnits,
              occupied,
              vacant,
              notice,
              occupancyRate:
                propUnits.length > 0 ? Math.round((occupied / propUnits.length) * 100) : 0,
            };
          })
          .sort((a, b) => a.property.name.localeCompare(b.property.name));
        setSummaries(sums);
      })
      .catch(() => setSummaries([]))
      .finally(() => setLoading(false));
  }, []);

  const selected = useMemo(
    () => summaries.find((s) => s.property.id === selectedId) ?? null,
    [summaries, selectedId]
  );

  if (selected) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelectedId(null)}
          className="text-sm text-accent hover:underline inline-flex items-center gap-1"
        >
          <ChevronLeft className="w-4 h-4" /> All Properties
        </button>
        <div>
          <h1 className="text-2xl font-bold">Meetings — {selected.property.name}</h1>
          <p className="text-muted-foreground mt-1">{selected.property.address}</p>
        </div>
        <PropertyMeetings
          propertyId={selected.property.id}
          propertyName={selected.property.name}
          units={selected.units}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Meetings</h1>
        <p className="text-muted-foreground mt-1">
          Weekly meetings with transcribed action items, per property. Pick a property to see its
          meeting history or start a new one.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading properties…</p>
      ) : summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No properties found.</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {summaries.map((s) => (
            <button
              key={s.property.id}
              onClick={() => setSelectedId(s.property.id)}
              className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Building2 className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold truncate">{s.property.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {s.property.address}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="text-lg font-bold">{s.units.length}</p>
                  <p className="text-xs text-muted-foreground">Units</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{s.vacant + s.notice}</p>
                  <p className="text-xs text-muted-foreground">Open Units</p>
                </div>
                <div>
                  <p className="text-lg font-bold">{s.occupancyRate}%</p>
                  <p className="text-xs text-muted-foreground">Occupied</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
