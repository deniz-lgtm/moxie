"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import type {
  Inspection,
  InspectionRoom,
  InspectionItem,
  InspectionPhoto,
  ConditionRating,
  Unit,
} from "@/lib/types";

const CONDITIONS: ConditionRating[] = ["excellent", "good", "fair", "poor", "damaged"];

const DEFAULT_ITEMS = [
  "Walls", "Flooring", "Ceiling", "Windows", "Doors",
  "Lighting", "Outlets/Switches", "Closet", "Fixtures",
];

const DEFAULT_ROOMS = [
  "Living Room", "Kitchen", "Bedroom 1", "Bedroom 2",
  "Bathroom 1", "Bathroom 2", "Hallway", "Closet",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankItem(name: string): InspectionItem {
  return { id: newId(), area: "", item: name, condition: "", notes: "", photos: [], costEstimate: 0, isDeduction: false };
}

type View = "list" | "create" | "walking" | "completed";

export default function MoveInInspectionPage() {
  const [inspections, setInspections] = useState<Inspection[]>(() =>
    loadFromStorage<Inspection[]>("inspections_v2", []).filter((i) => i.type === "move_in")
  );
  const [units, setUnits] = useState<Unit[]>([]);
  const [active, setActive] = useState<Inspection | null>(null);
  const [view, setView] = useState<View>("list");
  const [unitSearch, setUnitSearch] = useState("");
  const [selectedRoomIdx, setSelectedRoomIdx] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [form, setForm] = useState({
    unitId: "", inspector: "", scheduledDate: "", tenantName: "", tenantEmail: "",
  });

  useEffect(() => {
    fetch("/api/appfolio/units")
      .then((r) => r.json())
      .then((d) => setUnits(d.units || []))
      .catch(() => {});
  }, []);

  const persist = useCallback((updated: Inspection[]) => {
    const all = loadFromStorage<Inspection[]>("inspections_v2", []);
    const others = all.filter((i) => i.type !== "move_in");
    saveToStorage("inspections_v2", [...others, ...updated]);
  }, []);

  function save(insp: Inspection) {
    const updated = inspections.map((i) => (i.id === insp.id ? insp : i));
    if (!inspections.find((i) => i.id === insp.id)) updated.push(insp);
    setInspections(updated);
    setActive(insp);
    persist(updated);
  }

  function createInspection() {
    const unit = units.find((u) => u.id === form.unitId);
    if (!unit || !form.inspector) return;
    const insp: Inspection = {
      id: newId(), unitId: unit.id, propertyId: unit.propertyId,
      unitNumber: unit.unitName || unit.displayName, propertyName: unit.propertyName,
      type: "move_in", status: "draft",
      scheduledDate: form.scheduledDate || new Date().toISOString().split("T")[0],
      inspector: form.inspector,
      rooms: DEFAULT_ROOMS.map((name) => ({ id: newId(), name, items: DEFAULT_ITEMS.map(blankItem) })),
      floorPlanUrl: null, overallNotes: "",
      invoiceUrl: null, invoiceTotal: null,
      tenantName: form.tenantName || unit.tenant, tenantEmail: form.tenantEmail || null,
      depositAmount: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    save(insp);
    setView("walking");
  }

  function startWalk() {
    if (!active) return;
    save({ ...active, status: "walking", updatedAt: new Date().toISOString() });
    setView("walking");
  }

  function completeInspection() {
    if (!active) return;
    save({
      ...active, status: "completed",
      completedDate: new Date().toISOString().split("T")[0],
      updatedAt: new Date().toISOString(),
    });
    setView("completed");
  }

  function updateItem(roomIdx: number, itemIdx: number, field: string, value: unknown) {
    if (!active) return;
    const rooms = [...active.rooms];
    const items = [...rooms[roomIdx].items];
    items[itemIdx] = { ...items[itemIdx], [field]: value };
    rooms[roomIdx] = { ...rooms[roomIdx], items };
    save({ ...active, rooms, updatedAt: new Date().toISOString() });
  }

  function handlePhoto(roomIdx: number, itemIdx: number, e: React.ChangeEvent<HTMLInputElement>) {
    if (!active || !e.target.files?.length) return;
    const reader = new FileReader();
    reader.onload = () => {
      const photo: InspectionPhoto = { id: newId(), url: reader.result as string, aiAnalysis: null, createdAt: new Date().toISOString() };
      const rooms = [...active.rooms];
      const items = [...rooms[roomIdx].items];
      items[itemIdx] = { ...items[itemIdx], photos: [...items[itemIdx].photos, photo] };
      rooms[roomIdx] = { ...rooms[roomIdx], items };
      save({ ...active, rooms, updatedAt: new Date().toISOString() });
    };
    reader.readAsDataURL(e.target.files[0]);
  }

  function addRoom(name: string) {
    if (!active) return;
    save({ ...active, rooms: [...active.rooms, { id: newId(), name, items: DEFAULT_ITEMS.map(blankItem) }], updatedAt: new Date().toISOString() });
  }

  function addItemToRoom(roomIdx: number, itemName: string) {
    if (!active) return;
    const rooms = [...active.rooms];
    rooms[roomIdx] = { ...rooms[roomIdx], items: [...rooms[roomIdx].items, blankItem(itemName)] };
    save({ ...active, rooms, updatedAt: new Date().toISOString() });
  }

  const filteredUnits = unitSearch ? units.filter((u) => u.unitName.toLowerCase().includes(unitSearch.toLowerCase())) : units;
  const filteredInspections = statusFilter === "all" ? inspections : inspections.filter((i) => i.status === statusFilter);

  // ─── List ───────────────────────────────────────────
  if (view === "list" && !active) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/inspections" className="text-sm text-accent hover:underline">&larr; All Inspections</Link>
            <h1 className="text-2xl font-bold mt-1">Move-In Inspections</h1>
            <p className="text-muted-foreground mt-1">Tenant-facing photo walkthrough to document unit condition at move-in</p>
          </div>
          <button onClick={() => { setView("create"); setActive(null); }} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90">+ New Inspection</button>
        </div>

        <div className="flex gap-2">
          {["all", "draft", "walking", "completed"].map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 text-xs rounded-full border ${statusFilter === s ? "bg-accent text-white border-accent" : "border-border hover:bg-muted"}`}>
              {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>

        {filteredInspections.length > 0 ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-muted">
                <th className="text-left px-4 py-3 font-medium">Unit</th>
                <th className="text-left px-4 py-3 font-medium">Tenant</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Inspector</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {filteredInspections.map((insp) => (
                  <tr key={insp.id} onClick={() => { setActive(insp); setView(insp.status === "completed" ? "completed" : "walking"); }}
                    className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                    <td className="px-4 py-3 font-medium">{insp.unitNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{insp.tenantName || "---"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{insp.scheduledDate}</td>
                    <td className="px-4 py-3 text-muted-foreground">{insp.inspector}</td>
                    <td className="px-4 py-3"><StatusBadge value={insp.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">No move-in inspections yet. Click &quot;+ New Inspection&quot; to begin.</div>
        )}
      </div>
    );
  }

  // ─── Create ─────────────────────────────────────────
  if (view === "create") {
    return (
      <div className="space-y-6">
        <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
        <h1 className="text-2xl font-bold">Start Move-In Inspection</h1>
        <p className="text-muted-foreground">Create an inspection and share the link with the tenant to document unit condition with timestamped photos.</p>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Search Unit *</label>
              <input type="text" placeholder="Type unit address..." value={unitSearch} onChange={(e) => setUnitSearch(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
              {unitSearch && filteredUnits.length > 0 && (
                <div className="border border-border rounded-lg mt-1 max-h-48 overflow-y-auto bg-card">
                  {filteredUnits.slice(0, 20).map((u) => (
                    <button key={u.id} onClick={() => { setForm({ ...form, unitId: u.id, tenantName: u.tenant || "" }); setUnitSearch(u.unitName); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border last:border-0 ${form.unitId === u.id ? "bg-accent/10 font-medium" : ""}`}>
                      {u.unitName} <span className="text-muted-foreground">--- {u.tenant || "Vacant"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Inspector *</label>
              <input type="text" placeholder="Inspector name" value={form.inspector} onChange={(e) => setForm({ ...form, inspector: e.target.value })} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Scheduled Date</label>
              <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tenant Name</label>
              <input type="text" value={form.tenantName} onChange={(e) => setForm({ ...form, tenantName: e.target.value })} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tenant Email</label>
              <input type="email" placeholder="For sending shareable link" value={form.tenantEmail} onChange={(e) => setForm({ ...form, tenantEmail: e.target.value })} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
            </div>
          </div>
          <button onClick={createInspection} disabled={!form.unitId || !form.inspector} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50">
            Create Inspection &rarr;
          </button>
        </div>
      </div>
    );
  }

  // ─── Walking / Active ──────────────────────────────
  if (view === "walking" && active) {
    const currentRoom = active.rooms[selectedRoomIdx];
    const isDraft = active.status === "draft";

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
            <h1 className="text-2xl font-bold mt-1">{active.unitNumber} --- Move-In Walk</h1>
            <p className="text-muted-foreground">Document condition of each item with photos and notes. {active.tenantEmail && `Shareable link: /inspections/move-in/${active.id}`}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={active.status} />
            {isDraft && (
              <button onClick={startWalk} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90">Begin Walk</button>
            )}
            {active.status === "walking" && (
              <button onClick={completeInspection} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Complete Inspection</button>
            )}
          </div>
        </div>

        {/* Shareable link concept */}
        {active.tenantEmail && (
          <div className="bg-green-50 rounded-xl border border-green-200 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-900">Shareable Tenant Link</p>
              <p className="text-xs text-green-700 mt-0.5">Send this to {active.tenantName || "tenant"} so they can upload photos during their walk-through</p>
            </div>
            <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/inspections/move-in/${active.id}`)}
              className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">Copy Link</button>
          </div>
        )}

        {/* Room tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {active.rooms.map((room, idx) => (
            <button key={room.id} onClick={() => setSelectedRoomIdx(idx)}
              className={`shrink-0 px-3 py-1.5 text-sm rounded-lg border transition-colors ${selectedRoomIdx === idx ? "bg-accent text-white border-accent" : "border-border hover:bg-muted"}`}>
              {room.name}
              {room.items.filter((i) => i.photos.length > 0).length > 0 && <span className="ml-1 text-xs opacity-70">({room.items.filter((i) => i.photos.length > 0).length})</span>}
            </button>
          ))}
          <button onClick={() => { const name = prompt("Room name:"); if (name) addRoom(name); }}
            className="shrink-0 px-3 py-1.5 text-sm rounded-lg border border-dashed border-border hover:bg-muted text-muted-foreground">+ Room</button>
        </div>

        {/* Room items */}
        {currentRoom && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{currentRoom.name}</h2>
                <span className="text-xs text-muted-foreground">{currentRoom.items.length} items</span>
              </div>
              <button onClick={() => { const name = prompt("Item name:"); if (name) addItemToRoom(selectedRoomIdx, name); }}
                className="text-xs text-accent hover:underline">+ Add Item</button>
            </div>
            <div className="divide-y divide-border">
              {currentRoom.items.map((item, itemIdx) => (
                <div key={item.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.item}</p>
                      {item.photos.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {item.photos.map((photo) => (
                            <div key={photo.id} className="relative">
                              <img src={photo.url} alt="" className="w-16 h-16 object-cover rounded border border-border" />
                              <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[9px] text-center py-0.5 rounded-b">
                                {new Date(photo.createdAt).toLocaleTimeString()}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <select value={item.condition} onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "condition", e.target.value)}
                        className="text-xs border border-border rounded-md px-2 py-1.5 bg-card">
                        <option value="">---</option>
                        {CONDITIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                      <label className="text-xs text-accent hover:underline cursor-pointer">
                        + Photo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(selectedRoomIdx, itemIdx, e)} />
                      </label>
                    </div>
                  </div>
                  <input type="text" placeholder="Notes..." value={item.notes} onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "notes", e.target.value)}
                    className="w-full text-xs border border-border rounded px-2 py-1.5 bg-card" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overall notes */}
        <div className="bg-card rounded-xl border border-border p-4">
          <label className="text-xs text-muted-foreground block mb-1">Overall Notes</label>
          <textarea value={active.overallNotes} onChange={(e) => save({ ...active, overallNotes: e.target.value, updatedAt: new Date().toISOString() })}
            rows={3} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none" placeholder="General observations about unit condition at move-in..." />
        </div>
      </div>
    );
  }

  // ─── Completed ─────────────────────────────────────
  if (view === "completed" && active) {
    const photoCount = active.rooms.flatMap((r) => r.items).reduce((sum, i) => sum + i.photos.length, 0);
    const itemsDocumented = active.rooms.flatMap((r) => r.items).filter((i) => i.condition !== "").length;
    return (
      <div className="space-y-6">
        <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-green-600">&#10003;</span>
          </div>
          <h1 className="text-2xl font-bold">Move-In Inspection Complete</h1>
          <p className="text-muted-foreground mt-1">{active.unitNumber} --- {active.tenantName || "Tenant"}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Photos Taken</p>
            <p className="text-2xl font-bold mt-1">{photoCount}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Items Documented</p>
            <p className="text-2xl font-bold mt-1">{itemsDocumented}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold mt-1">{active.completedDate || "---"}</p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center">
          This move-in condition report is timestamped and stored for reference during future move-out inspections.
        </p>
      </div>
    );
  }

  return null;
}
