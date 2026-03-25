"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import type {
  Inspection,
  InspectionItem,
  InspectionPhoto,
  ConditionRating,
  Unit,
} from "@/lib/types";

const CONDITIONS: ConditionRating[] = ["excellent", "good", "fair", "poor", "damaged"];
const COMPLETION_STATUSES = ["not_started", "in_progress", "complete", "blocked"] as const;

const DEFAULT_ITEMS = [
  "Walls", "Flooring", "Ceiling", "Windows", "Doors",
  "Lighting", "Outlets/Switches", "Cabinets", "Countertops", "Fixtures",
];

const DEFAULT_ROOMS = [
  "Living Room", "Kitchen", "Bedroom 1", "Bedroom 2",
  "Bathroom 1", "Bathroom 2", "Hallway", "Exterior",
];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankItem(name: string): InspectionItem {
  return { id: newId(), area: "", item: name, condition: "", notes: "", photos: [], costEstimate: 0, isDeduction: false };
}

type View = "list" | "create" | "walking" | "completed";

export default function PunchListInspectionPage() {
  const [inspections, setInspections] = useState<Inspection[]>(() =>
    loadFromStorage<Inspection[]>("inspections_v2", []).filter((i) => i.type === "punch_list")
  );
  const [units, setUnits] = useState<Unit[]>([]);
  const [active, setActive] = useState<Inspection | null>(null);
  const [view, setView] = useState<View>("list");
  const [unitSearch, setUnitSearch] = useState("");
  const [selectedRoomIdx, setSelectedRoomIdx] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [form, setForm] = useState({ unitId: "", inspector: "", scheduledDate: "", projectName: "" });

  useEffect(() => {
    fetch("/api/appfolio/units")
      .then((r) => r.json())
      .then((d) => setUnits(d.units || []))
      .catch(() => {});
  }, []);

  const persist = useCallback((updated: Inspection[]) => {
    const all = loadFromStorage<Inspection[]>("inspections_v2", []);
    const others = all.filter((i) => i.type !== "punch_list");
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
      type: "punch_list", status: "draft",
      scheduledDate: form.scheduledDate || new Date().toISOString().split("T")[0],
      inspector: form.inspector,
      rooms: DEFAULT_ROOMS.map((name) => ({ id: newId(), name, items: DEFAULT_ITEMS.map(blankItem) })),
      floorPlanUrl: null, overallNotes: form.projectName ? `Project: ${form.projectName}` : "",
      invoiceUrl: null, invoiceTotal: null,
      tenantName: null, tenantEmail: null,
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
    save({ ...active, status: "completed", completedDate: new Date().toISOString().split("T")[0], updatedAt: new Date().toISOString() });
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

  // Contractor and completion status stored in notes: "[contractor|status] actual notes"
  function parseMeta(notes: string) {
    const match = notes.match(/^\[([^|]*)\|([^\]]*)\]\s*([\s\S]*)/);
    if (match) return { contractor: match[1], completion: match[2], text: match[3] };
    return { contractor: "", completion: "", text: notes };
  }

  function encodeMeta(contractor: string, completion: string, text: string) {
    return `[${contractor}|${completion}] ${text}`;
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

  // Completion summary for active inspection
  function completionCounts() {
    if (!active) return { not_started: 0, in_progress: 0, complete: 0, blocked: 0 };
    const allItems = active.rooms.flatMap((r) => r.items);
    const counts = { not_started: 0, in_progress: 0, complete: 0, blocked: 0 };
    allItems.forEach((item) => {
      const { completion } = parseMeta(item.notes);
      if (completion in counts) counts[completion as keyof typeof counts]++;
      else counts.not_started++;
    });
    return counts;
  }

  // --- List ---
  if (view === "list" && !active) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/inspections" className="text-sm text-accent hover:underline">&larr; All Inspections</Link>
            <h1 className="text-2xl font-bold mt-1">Punch List Inspections</h1>
            <p className="text-muted-foreground mt-1">Construction &amp; renovation tracking with contractor assignments</p>
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
                <th className="text-left px-4 py-3 font-medium">Property</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Inspector</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {filteredInspections.map((insp) => (
                  <tr key={insp.id} onClick={() => { setActive(insp); setView(insp.status === "completed" ? "completed" : "walking"); }}
                    className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                    <td className="px-4 py-3 font-medium">{insp.unitNumber}</td>
                    <td className="px-4 py-3 text-muted-foreground">{insp.propertyName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{insp.scheduledDate}</td>
                    <td className="px-4 py-3 text-muted-foreground">{insp.inspector}</td>
                    <td className="px-4 py-3"><StatusBadge value={insp.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">No punch list inspections yet. Click &quot;+ New Inspection&quot; to begin.</div>
        )}
      </div>
    );
  }

  // --- Create ---
  if (view === "create") {
    return (
      <div className="space-y-6">
        <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
        <h1 className="text-2xl font-bold">Start Punch List Inspection</h1>
        <p className="text-muted-foreground">Track construction/renovation items with contractor assignments and completion status.</p>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Search Unit *</label>
              <input type="text" placeholder="Type unit address..." value={unitSearch} onChange={(e) => setUnitSearch(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
              {unitSearch && filteredUnits.length > 0 && (
                <div className="border border-border rounded-lg mt-1 max-h-48 overflow-y-auto bg-card">
                  {filteredUnits.slice(0, 20).map((u) => (
                    <button key={u.id} onClick={() => { setForm({ ...form, unitId: u.id }); setUnitSearch(u.unitName); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border last:border-0 ${form.unitId === u.id ? "bg-accent/10 font-medium" : ""}`}>
                      {u.unitName}
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
              <label className="text-xs text-muted-foreground block mb-1">Project Name</label>
              <input type="text" placeholder="e.g. Unit 5 Kitchen Reno" value={form.projectName} onChange={(e) => setForm({ ...form, projectName: e.target.value })} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Scheduled Date</label>
              <input type="date" value={form.scheduledDate} onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
            </div>
          </div>
          <button onClick={createInspection} disabled={!form.unitId || !form.inspector} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50">
            Create Inspection &rarr;
          </button>
        </div>
      </div>
    );
  }

  // --- Walking / Active ---
  if (view === "walking" && active) {
    const currentRoom = active.rooms[selectedRoomIdx];
    const isDraft = active.status === "draft";
    const counts = completionCounts();

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
            <h1 className="text-2xl font-bold mt-1">{active.unitNumber} --- Punch List</h1>
            <p className="text-muted-foreground">Assign contractors, track completion, document with photos</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={active.status} />
            {isDraft && <button onClick={startWalk} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90">Begin Walk</button>}
            {active.status === "walking" && <button onClick={completeInspection} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Complete Inspection</button>}
          </div>
        </div>

        {/* Completion summary */}
        <div className="grid grid-cols-4 gap-3">
          {COMPLETION_STATUSES.map((s) => (
            <div key={s} className={`rounded-lg border p-3 text-center ${s === "complete" ? "border-green-300 bg-green-50" : s === "blocked" ? "border-red-300 bg-red-50" : s === "in_progress" ? "border-blue-300 bg-blue-50" : "border-border bg-muted"}`}>
              <p className="text-xs text-muted-foreground capitalize">{s.replace("_", " ")}</p>
              <p className="text-lg font-bold">{counts[s]}</p>
            </div>
          ))}
        </div>

        {/* Room tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {active.rooms.map((room, idx) => (
            <button key={room.id} onClick={() => setSelectedRoomIdx(idx)}
              className={`shrink-0 px-3 py-1.5 text-sm rounded-lg border transition-colors ${selectedRoomIdx === idx ? "bg-accent text-white border-accent" : "border-border hover:bg-muted"}`}>
              {room.name}
            </button>
          ))}
          <button onClick={() => { const name = prompt("Room name:"); if (name) addRoom(name); }}
            className="shrink-0 px-3 py-1.5 text-sm rounded-lg border border-dashed border-border hover:bg-muted text-muted-foreground">+ Room</button>
        </div>

        {/* Items with contractor & completion */}
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
              {currentRoom.items.map((item, itemIdx) => {
                const meta = parseMeta(item.notes);
                return (
                  <div key={item.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{item.item}</p>
                          {meta.completion === "complete" && <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded">Done</span>}
                          {meta.completion === "blocked" && <span className="text-xs bg-red-100 text-red-800 px-1.5 py-0.5 rounded">Blocked</span>}
                        </div>
                        {item.photos.length > 0 && (
                          <div className="flex gap-2 mt-2">
                            {item.photos.map((photo) => (
                              <div key={photo.id} className="relative">
                                <img src={photo.url} alt="" className="w-16 h-16 object-cover rounded border border-border" />
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
                    {/* Contractor & completion status */}
                    <div className="flex gap-3 items-center">
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground">Contractor</label>
                        <input type="text" placeholder="Contractor name..." value={meta.contractor}
                          onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "notes", encodeMeta(e.target.value, meta.completion, meta.text))}
                          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-card" />
                      </div>
                      <div className="flex-1">
                        <label className="text-[10px] text-muted-foreground">Completion</label>
                        <select value={meta.completion} onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "notes", encodeMeta(meta.contractor, e.target.value, meta.text))}
                          className="w-full text-xs border border-border rounded px-2 py-1.5 bg-card">
                          {COMPLETION_STATUSES.map((s) => (<option key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>))}
                        </select>
                      </div>
                    </div>
                    <input type="text" placeholder="Notes..." value={meta.text} onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "notes", encodeMeta(meta.contractor, meta.completion, e.target.value))}
                      className="w-full text-xs border border-border rounded px-2 py-1.5 bg-card" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Overall notes */}
        <div className="bg-card rounded-xl border border-border p-4">
          <label className="text-xs text-muted-foreground block mb-1">Overall Notes</label>
          <textarea value={active.overallNotes} onChange={(e) => save({ ...active, overallNotes: e.target.value, updatedAt: new Date().toISOString() })}
            rows={3} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none" placeholder="Project notes, contractor contacts, timeline..." />
        </div>
      </div>
    );
  }

  // --- Completed ---
  if (view === "completed" && active) {
    const photoCount = active.rooms.flatMap((r) => r.items).reduce((sum, i) => sum + i.photos.length, 0);
    const counts = completionCounts();
    const totalItems = active.rooms.flatMap((r) => r.items).length;
    return (
      <div className="space-y-6">
        <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-green-600">&#10003;</span>
          </div>
          <h1 className="text-2xl font-bold">Punch List Complete</h1>
          <p className="text-muted-foreground mt-1">{active.unitNumber} --- {active.propertyName}</p>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Total Items</p>
            <p className="text-2xl font-bold mt-1">{totalItems}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Completed</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{counts.complete}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Photos</p>
            <p className="text-2xl font-bold mt-1">{photoCount}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Date</p>
            <p className="text-2xl font-bold mt-1">{active.completedDate || "---"}</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
