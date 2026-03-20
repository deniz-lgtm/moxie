"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Inspection, InspectionType, InspectionStatus, ConditionRating, InspectionItem, Property, Unit } from "@/lib/types";

const AREAS = ["Kitchen", "Bathroom", "Living Room", "Bedroom", "Hallway", "Closet", "Patio/Balcony"];
const ITEMS_BY_AREA: Record<string, string[]> = {
  Kitchen: ["Countertops", "Cabinets", "Appliances", "Sink/Faucet", "Flooring", "Walls", "Lighting"],
  Bathroom: ["Fixtures", "Toilet", "Shower/Tub", "Vanity", "Mirror", "Flooring", "Plumbing"],
  "Living Room": ["Flooring", "Walls", "Windows", "Ceiling", "Lighting", "Outlets"],
  Bedroom: ["Flooring", "Walls", "Windows", "Closet Door", "Ceiling", "Lighting"],
  Hallway: ["Flooring", "Walls", "Lighting", "Smoke Detector"],
  Closet: ["Shelving", "Door", "Rod", "Flooring"],
  "Patio/Balcony": ["Surface", "Railing", "Lighting", "Door"],
};
const CONDITIONS: ConditionRating[] = ["excellent", "good", "fair", "poor", "damaged"];
const INSPECTION_TYPES: { value: InspectionType; label: string }[] = [
  { value: "move_in", label: "Move In" },
  { value: "move_out", label: "Move Out" },
  { value: "quarterly", label: "Quarterly" },
  { value: "routine", label: "Routine" },
];

export default function InspectionsPage() {
  const [allInspections, setAllInspections] = useState<Inspection[]>([]);
  const [selected, setSelected] = useState<Inspection | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newInspection, setNewInspection] = useState({
    propertyId: "",
    unitId: "",
    type: "routine" as InspectionType,
    scheduledDate: "",
    inspector: "",
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/appfolio/properties").then((r) => r.json()),
      fetch("/api/appfolio/units").then((r) => r.json()),
    ])
      .then(([propData, unitData]) => {
        setProperties(propData.properties || []);
        setUnits(unitData.units || []);
        if (propData.properties?.length > 0) {
          setNewInspection((n) => ({ ...n, propertyId: propData.properties[0].id }));
        }
      })
      .catch(() => {});
  }, []);

  const propertyUnits = units.filter((u) => u.propertyId === newInspection.propertyId);

  function createInspection() {
    if (!newInspection.unitId || !newInspection.scheduledDate) return;
    const unit = units.find((u) => u.id === newInspection.unitId);
    const property = properties.find((p) => p.id === newInspection.propertyId);
    if (!unit || !property) return;

    const inspection: Inspection = {
      id: `insp-${Date.now()}`,
      unitId: unit.id,
      propertyId: property.id,
      unitNumber: unit.number,
      propertyName: property.name,
      type: newInspection.type,
      status: "scheduled",
      scheduledDate: newInspection.scheduledDate,
      inspector: newInspection.inspector || "Unassigned",
      items: [],
      overallNotes: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setAllInspections((prev) => [inspection, ...prev]);
    setShowCreateForm(false);
    setSelected(inspection);
    setNewInspection({ propertyId: properties[0]?.id || "", unitId: "", type: "routine", scheduledDate: "", inspector: "" });
  }

  const filtered = allInspections.filter((i) => {
    if (filterStatus !== "all" && i.status !== filterStatus) return false;
    if (filterType !== "all" && i.type !== filterType) return false;
    return true;
  });

  // Add item to inspection
  function addItem(area: string, item: string) {
    if (!selected) return;
    const newItem: InspectionItem = {
      id: `item-${Date.now()}`,
      area,
      item,
      condition: "good",
      notes: "",
      photos: [],
    };
    const updated = {
      ...selected,
      items: [...selected.items, newItem],
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllInspections((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i))
    );
  }

  function updateItem(itemId: string, updates: Partial<InspectionItem>) {
    if (!selected) return;
    const updated = {
      ...selected,
      items: selected.items.map((it) =>
        it.id === itemId ? { ...it, ...updates } : it
      ),
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllInspections((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i))
    );
  }

  function updateInspectionStatus(status: InspectionStatus) {
    if (!selected) return;
    const updated = {
      ...selected,
      status,
      completedDate: status === "completed" ? new Date().toISOString().split("T")[0] : selected.completedDate,
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllInspections((prev) =>
      prev.map((i) => (i.id === updated.id ? updated : i))
    );
  }

  if (selected) {
    return (
      <div className="space-y-6">
        {/* Back + Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setSelected(null)}
            className="text-sm text-accent hover:underline"
          >
            &larr; Back to Inspections
          </button>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {selected.propertyName} #{selected.unitNumber}
            </h1>
            <p className="text-muted-foreground mt-1 capitalize">
              {selected.type.replace("_", " ")} Inspection &middot; {selected.scheduledDate}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge value={selected.status} />
            <select
              value={selected.status}
              onChange={(e) => updateInspectionStatus(e.target.value as InspectionStatus)}
              className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card"
            >
              <option value="scheduled">Scheduled</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="needs_review">Needs Review</option>
            </select>
          </div>
        </div>

        {/* Inspector info */}
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm">
            <span className="text-muted-foreground">Inspector:</span>{" "}
            <span className="font-medium">{selected.inspector}</span>
          </p>
        </div>

        {/* Add items */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Add Inspection Items</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {AREAS.map((area) => (
              <div key={area}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{area}</h3>
                <div className="flex flex-wrap gap-1.5">
                  {ITEMS_BY_AREA[area].map((item) => {
                    const exists = selected.items.some(
                      (i) => i.area === area && i.item === item
                    );
                    return (
                      <button
                        key={item}
                        onClick={() => !exists && addItem(area, item)}
                        disabled={exists}
                        className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                          exists
                            ? "bg-green-50 border-green-200 text-green-700 cursor-default"
                            : "border-border hover:bg-accent-light hover:border-accent text-foreground cursor-pointer"
                        }`}
                      >
                        {exists ? "✓ " : ""}{item}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Inspection items table */}
        {selected.items.length > 0 && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold">
                Inspection Items ({selected.items.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 font-medium">Area</th>
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-left px-4 py-3 font-medium">Condition</th>
                    <th className="text-left px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {selected.items.map((item) => (
                    <tr key={item.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-muted-foreground">{item.area}</td>
                      <td className="px-4 py-3 font-medium">{item.item}</td>
                      <td className="px-4 py-3">
                        <select
                          value={item.condition}
                          onChange={(e) =>
                            updateItem(item.id, { condition: e.target.value as ConditionRating })
                          }
                          className="text-xs border border-border rounded-md px-2 py-1 bg-card"
                        >
                          {CONDITIONS.map((c) => (
                            <option key={c} value={c}>
                              {c.charAt(0).toUpperCase() + c.slice(1)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={item.notes}
                          onChange={(e) =>
                            updateItem(item.id, { notes: e.target.value })
                          }
                          placeholder="Add notes..."
                          className="w-full text-sm border border-border rounded-md px-2 py-1 bg-card placeholder:text-muted-foreground"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Overall notes */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Overall Notes</h2>
          <textarea
            value={selected.overallNotes}
            onChange={(e) => {
              const updated = { ...selected, overallNotes: e.target.value };
              setSelected(updated);
              setAllInspections((prev) =>
                prev.map((i) => (i.id === updated.id ? updated : i))
              );
            }}
            placeholder="Add overall inspection notes..."
            rows={4}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card placeholder:text-muted-foreground resize-none"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Inspections</h1>
          <p className="text-muted-foreground mt-1">
            Move-in, move-out, and quarterly inspections
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ New Inspection"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Schedule Inspection</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Property</label>
              <select
                value={newInspection.propertyId}
                onChange={(e) => setNewInspection({ ...newInspection, propertyId: e.target.value, unitId: "" })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Unit *</label>
              <select
                value={newInspection.unitId}
                onChange={(e) => setNewInspection({ ...newInspection, unitId: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">Select unit...</option>
                {propertyUnits.map((u) => (
                  <option key={u.id} value={u.id}>#{u.number} — {u.tenant || "Vacant"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Type</label>
              <select
                value={newInspection.type}
                onChange={(e) => setNewInspection({ ...newInspection, type: e.target.value as InspectionType })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {INSPECTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Scheduled Date *</label>
              <input
                type="date"
                value={newInspection.scheduledDate}
                onChange={(e) => setNewInspection({ ...newInspection, scheduledDate: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Inspector</label>
              <input
                type="text"
                value={newInspection.inspector}
                onChange={(e) => setNewInspection({ ...newInspection, inspector: e.target.value })}
                placeholder="Inspector name"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
          </div>
          <button
            onClick={createInspection}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Create Inspection
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="needs_review">Needs Review</option>
        </select>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Types</option>
          <option value="move_in">Move In</option>
          <option value="move_out">Move Out</option>
          <option value="quarterly">Quarterly</option>
          <option value="routine">Routine</option>
        </select>
      </div>

      {/* Inspection Cards */}
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((insp) => (
          <button
            key={insp.id}
            onClick={() => setSelected(insp)}
            className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold">
                  {insp.propertyName} #{insp.unitNumber}
                </h3>
                <p className="text-sm text-muted-foreground capitalize mt-1">
                  {insp.type.replace("_", " ")} Inspection
                </p>
              </div>
              <StatusBadge value={insp.status} />
            </div>
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>{insp.scheduledDate}</span>
              <span>{insp.inspector}</span>
            </div>
            {insp.items.length > 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                {insp.items.length} items inspected
              </p>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No inspections match the current filters.
        </div>
      )}
    </div>
  );
}
