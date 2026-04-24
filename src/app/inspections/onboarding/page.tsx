"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { InspectionCamera, type CameraRoom } from "@/components/InspectionCamera";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import { usePortfolio } from "@/contexts/PortfolioContext";
import type {
  Inspection,
  InspectionItem,
  InspectionPhoto,
  InspectionRoom,
  ConditionRating,
  Property,
} from "@/lib/types";

const CONDITIONS: ConditionRating[] = ["excellent", "good", "fair", "poor", "damaged"];

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankItem(name: string): InspectionItem {
  return { id: newId(), area: "", item: name, condition: "", notes: "", photos: [], costEstimate: 0, isDeduction: false };
}

// Comprehensive property management onboarding checklist sections
const ONBOARDING_SECTIONS: { name: string; items: string[] }[] = [
  {
    name: "Exterior & Curb Appeal",
    items: [
      "Building facade condition", "Roof condition & gutters", "Landscaping & irrigation",
      "Parking lot / driveway surface", "Exterior lighting", "Signage & address numbers",
      "Fencing & gates", "Sidewalks & walkways", "Mailbox area", "Dumpster / trash enclosure",
    ],
  },
  {
    name: "Common Areas & Lobby",
    items: [
      "Entry / lobby condition", "Hallway walls & flooring", "Stairwells & handrails",
      "Elevator (if applicable)", "Common area lighting", "Security cameras & intercom",
      "Bulletin board / notice area", "Common area furnishings", "ADA compliance signage",
    ],
  },
  {
    name: "Fire Safety & Life Safety",
    items: [
      "Smoke detectors (all units & common)", "Carbon monoxide detectors", "Fire extinguisher locations & tags",
      "Fire extinguisher expiration dates", "Emergency exit signs & lighting", "Fire escape / egress routes clear",
      "Fire alarm panel location & test", "Sprinkler system (if applicable)", "Fire department access / Knox box",
      "Emergency evacuation plan posted",
    ],
  },
  {
    name: "Utilities & Meters",
    items: [
      "Electric meter locations & labels", "Gas meter locations & labels", "Water meter location & main shutoff",
      "Individual unit shutoff valves", "Electrical panel location & labeling", "Utility account numbers documented",
      "Water heater location & condition", "Irrigation meter (if separate)", "Common area meter identification",
    ],
  },
  {
    name: "Mechanical Systems",
    items: [
      "HVAC system type & condition", "HVAC filter sizes & schedule", "Furnace / boiler condition",
      "Central AC / heat pump condition", "Thermostat type & programming", "Ventilation & exhaust fans",
      "Plumbing main lines condition", "Sewer cleanout locations", "Washer/dryer hookups or shared laundry",
      "Hot water capacity adequate",
    ],
  },
  {
    name: "Electrical & Technology",
    items: [
      "Electrical panel capacity", "GFCI outlets in wet areas", "Light fixture condition (all units)",
      "Outlet & switch plate condition", "Internet / cable infrastructure", "Doorbell / buzzer system",
      "Outdoor electrical outlets", "Generator (if applicable)",
    ],
  },
  {
    name: "Unit Interiors (per unit)",
    items: [
      "Walls & paint condition", "Flooring type & condition", "Ceiling condition",
      "Windows & screens", "Doors & locks (entry & interior)", "Kitchen appliances working",
      "Kitchen cabinets & countertops", "Bathroom fixtures & plumbing", "Closet doors & shelving",
      "Smoke / CO detector in unit", "Blinds / window coverings",
    ],
  },
  {
    name: "Storage & Laundry",
    items: [
      "Storage units / lockers", "Laundry room condition", "Washer / dryer condition",
      "Laundry venting proper", "Payment system (coin/card)", "Utility sink condition",
    ],
  },
  {
    name: "Compliance & Documentation",
    items: [
      "Lead paint disclosure (pre-1978)", "Asbestos inspection records", "Mold / moisture issues noted",
      "Local rental registration / license", "Certificate of occupancy on file", "Insurance policy documentation",
      "Property tax current", "HOA rules (if applicable)", "Pest control history & schedule",
      "ADA compliance (if required)", "Local jurisdiction inspection schedule noted",
    ],
  },
  {
    name: "Security & Access",
    items: [
      "Master key / key inventory", "Lock re-key needed per unit", "Gate / garage door openers inventory",
      "Security system (alarm company)", "Exterior security lighting", "Deadbolts on all exterior doors",
      "Window locks functional", "Peephole / door viewer installed",
    ],
  },
];

type View = "list" | "create" | "walking" | "completed";

export default function OnboardingInspectionPage() {
  const { portfolioId } = usePortfolio();
  const [inspections, setInspections] = useState<Inspection[]>(() =>
    loadFromStorage<Inspection[]>("inspections_v2", []).filter((i) => i.type === "onboarding")
  );
  const [properties, setProperties] = useState<Property[]>([]);
  const [active, setActive] = useState<Inspection | null>(null);
  const [view, setView] = useState<View>("list");
  const [propSearch, setPropSearch] = useState("");
  const [selectedRoomIdx, setSelectedRoomIdx] = useState(0);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCamera, setShowCamera] = useState(false);

  const [form, setForm] = useState({
    propertyId: "", propertyName: "", inspector: "", scheduledDate: "",
  });

  useEffect(() => {
    fetch(`/api/appfolio/properties?portfolio_id=${portfolioId}`)
      .then((r) => r.json())
      .then((d) => setProperties(d.properties || []))
      .catch(() => {});
  }, [portfolioId]);

  const persist = useCallback((updated: Inspection[]) => {
    const all = loadFromStorage<Inspection[]>("inspections_v2", []);
    const others = all.filter((i) => i.type !== "onboarding");
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
    if (!form.propertyId || !form.inspector) return;
    const insp: Inspection = {
      id: newId(), unitId: "", propertyId: form.propertyId,
      unitNumber: "", propertyName: form.propertyName,
      type: "onboarding", status: "draft",
      scheduledDate: form.scheduledDate || new Date().toISOString().split("T")[0],
      inspector: form.inspector,
      rooms: ONBOARDING_SECTIONS.map((section) => ({
        id: newId(), name: section.name, items: section.items.map(blankItem),
      })),
      floorPlanUrl: null, overallNotes: "",
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
    save({ ...active, rooms: [...active.rooms, { id: newId(), name, items: [blankItem("General Condition")] }], updatedAt: new Date().toISOString() });
  }

  function addItemToRoom(roomIdx: number, itemName: string) {
    if (!active) return;
    const rooms = [...active.rooms];
    rooms[roomIdx] = { ...rooms[roomIdx], items: [...rooms[roomIdx].items, blankItem(itemName)] };
    save({ ...active, rooms, updatedAt: new Date().toISOString() });
  }

  // Camera helpers
  function toCameraRooms(rooms: InspectionRoom[]): CameraRoom[] {
    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      photos: r.items.flatMap((item) =>
        item.photos.map((p) => ({ id: p.id, url: p.url, timestamp: p.createdAt }))
      ),
      notes: "",
      panoramaUrl: r.panoramaUrl || null,
    }));
  }

  function handleCameraRoomsChange(cameraRooms: CameraRoom[]) {
    if (!active) return;
    const rooms = active.rooms.map((room, idx) => {
      const cRoom = cameraRooms[idx];
      if (!cRoom) return room;
      const existingPhotoIds = new Set(room.items.flatMap((item) => item.photos.map((p) => p.id)));
      const newPhotos = cRoom.photos.filter((p) => !existingPhotoIds.has(p.id));
      if (newPhotos.length === 0) return room;
      const items = [...room.items];
      const firstItem = { ...items[0], photos: [...items[0].photos, ...newPhotos.map((p) => ({
        id: p.id, url: p.url, aiAnalysis: null, createdAt: p.timestamp,
      }))] };
      items[0] = firstItem;
      return { ...room, items, panoramaUrl: cRoom.panoramaUrl };
    });
    save({ ...active, rooms, updatedAt: new Date().toISOString() });
  }

  function handleCameraComplete(cameraRooms: CameraRoom[]) {
    handleCameraRoomsChange(cameraRooms);
    setShowCamera(false);
  }

  const filteredProps = propSearch ? properties.filter((p) => p.name.toLowerCase().includes(propSearch.toLowerCase())) : properties;
  const filteredInspections = statusFilter === "all" ? inspections : inspections.filter((i) => i.status === statusFilter);

  // --- List ---
  if (view === "list" && !active) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/inspections" className="text-sm text-accent hover:underline">&larr; All Inspections</Link>
            <h1 className="text-2xl font-bold mt-1">Onboarding Inspections</h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive property condition documentation for new acquisitions &mdash; covers {ONBOARDING_SECTIONS.length} checklist sections
            </p>
          </div>
          <button onClick={() => { setView("create"); setActive(null); }} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90">+ New Inspection</button>
        </div>

        {/* Section overview */}
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
          <h3 className="text-sm font-semibold text-blue-800 mb-2">Checklist Coverage</h3>
          <div className="flex flex-wrap gap-2">
            {ONBOARDING_SECTIONS.map((s) => (
              <span key={s.name} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                {s.name} ({s.items.length})
              </span>
            ))}
          </div>
          <p className="text-xs text-blue-600 mt-2">
            {ONBOARDING_SECTIONS.reduce((sum, s) => sum + s.items.length, 0)} total inspection points across {ONBOARDING_SECTIONS.length} sections
          </p>
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
                <th className="text-left px-4 py-3 font-medium">Property</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Inspector</th>
                <th className="text-left px-4 py-3 font-medium">Progress</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr></thead>
              <tbody>
                {filteredInspections.map((insp) => {
                  const totalItems = insp.rooms.flatMap((r) => r.items).length;
                  const documented = insp.rooms.flatMap((r) => r.items).filter((i) => i.condition !== "").length;
                  return (
                    <tr key={insp.id} onClick={() => { setActive(insp); setView(insp.status === "completed" ? "completed" : "walking"); }}
                      className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                      <td className="px-4 py-3 font-medium">{insp.propertyName}</td>
                      <td className="px-4 py-3 text-muted-foreground">{insp.scheduledDate}</td>
                      <td className="px-4 py-3 text-muted-foreground">{insp.inspector}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 rounded-full" style={{ width: `${totalItems > 0 ? (documented / totalItems) * 100 : 0}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{documented}/{totalItems}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusBadge value={insp.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">No onboarding inspections yet. Click &quot;+ New Inspection&quot; to begin.</div>
        )}
      </div>
    );
  }

  // --- Create ---
  if (view === "create") {
    return (
      <div className="space-y-6">
        <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
        <h1 className="text-2xl font-bold">Start Onboarding Inspection</h1>
        <p className="text-muted-foreground">
          Comprehensive property walkthrough covering {ONBOARDING_SECTIONS.length} sections and {ONBOARDING_SECTIONS.reduce((sum, s) => sum + s.items.length, 0)} inspection points.
          Includes fire safety, utilities, meters, compliance, and unit condition documentation.
        </p>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Search Property *</label>
              <input type="text" placeholder="Type property name..." value={propSearch} onChange={(e) => setPropSearch(e.target.value)} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card" />
              {propSearch && filteredProps.length > 0 && (
                <div className="border border-border rounded-lg mt-1 max-h-48 overflow-y-auto bg-card">
                  {filteredProps.slice(0, 20).map((p) => (
                    <button key={p.id} onClick={() => { setForm({ ...form, propertyId: p.id, propertyName: p.name }); setPropSearch(p.name); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted border-b border-border last:border-0 ${form.propertyId === p.id ? "bg-accent/10 font-medium" : ""}`}>
                      {p.name} <span className="text-muted-foreground">&mdash; {p.unitCount} units</span>
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
          </div>

          {/* Preview sections */}
          <div className="border-t border-border pt-4">
            <h3 className="text-sm font-semibold mb-3">Inspection Sections</h3>
            <div className="grid md:grid-cols-2 gap-2">
              {ONBOARDING_SECTIONS.map((s) => (
                <div key={s.name} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2">
                  <span className="text-sm">{s.name}</span>
                  <span className="text-xs text-muted-foreground">{s.items.length} items</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={createInspection} disabled={!form.propertyId || !form.inspector} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50">
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
    const totalItems = active.rooms.flatMap((r) => r.items).length;
    const documented = active.rooms.flatMap((r) => r.items).filter((i) => i.condition !== "").length;
    const totalPhotos = active.rooms.flatMap((r) => r.items).reduce((sum, i) => sum + i.photos.length, 0);

    return (
      <div className="space-y-6">
        {showCamera && active.status === "walking" && (
          <InspectionCamera
            rooms={toCameraRooms(active.rooms)}
            onRoomsChange={handleCameraRoomsChange}
            onComplete={handleCameraComplete}
            onCancel={() => setShowCamera(false)}
            title={`Onboarding — ${active.propertyName}`}
            showNotes={true}
          />
        )}

        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
            <h1 className="text-2xl font-bold mt-1">{active.propertyName} &mdash; Onboarding</h1>
            <p className="text-muted-foreground">
              {documented}/{totalItems} items documented &middot; {totalPhotos} photos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={active.status} />
            {isDraft && <button onClick={startWalk} className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90">Begin Walk</button>}
            {active.status === "walking" && (
              <>
                <button
                  onClick={() => setShowCamera(true)}
                  className="px-4 py-2 bg-[#9d1535] text-white text-sm rounded-lg hover:bg-[#b91c42] flex items-center gap-1.5"
                >
                  📷 Camera Walk
                </button>
                <button onClick={completeInspection} className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">Complete Inspection</button>
              </>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="text-sm text-muted-foreground">{totalItems > 0 ? Math.round((documented / totalItems) * 100) : 0}%</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${totalItems > 0 ? (documented / totalItems) * 100 : 0}%` }} />
          </div>
          <div className="flex flex-wrap gap-3 mt-3">
            {active.rooms.map((room, idx) => {
              const roomDone = room.items.filter((i) => i.condition !== "").length;
              const roomTotal = room.items.length;
              return (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomIdx(idx)}
                  className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                    selectedRoomIdx === idx ? "bg-accent text-white border-accent" :
                    roomDone === roomTotal && roomTotal > 0 ? "bg-green-50 text-green-700 border-green-200" :
                    roomDone > 0 ? "bg-amber-50 text-amber-700 border-amber-200" :
                    "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {room.name} {roomDone > 0 && `(${roomDone}/${roomTotal})`}
                </button>
              );
            })}
            <button onClick={() => { const name = prompt("Section name:"); if (name) addRoom(name); }}
              className="text-xs px-2 py-1 rounded-full border border-dashed border-border hover:bg-muted text-muted-foreground">+ Section</button>
          </div>
        </div>

        {/* Items */}
        {currentRoom && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-muted/30">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{currentRoom.name}</h2>
                <span className="text-xs text-muted-foreground">{currentRoom.items.length} items</span>
                {(() => {
                  const done = currentRoom.items.filter((i) => i.condition !== "").length;
                  if (done === currentRoom.items.length && currentRoom.items.length > 0) {
                    return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Complete</span>;
                  }
                  if (done > 0) {
                    return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{done}/{currentRoom.items.length}</span>;
                  }
                  return null;
                })()}
              </div>
              <button onClick={() => { const name = prompt("Item name:"); if (name) addItemToRoom(selectedRoomIdx, name); }}
                className="text-xs text-accent hover:underline">+ Add Item</button>
            </div>
            <div className="divide-y divide-border">
              {currentRoom.items.map((item, itemIdx) => (
                <div key={item.id} className={`p-4 space-y-3 ${item.condition === "poor" || item.condition === "damaged" ? "bg-red-50/50" : ""}`}>
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
                        <option value="">&mdash;</option>
                        {CONDITIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
                      </select>
                      <label className="text-xs text-accent hover:underline cursor-pointer">
                        + Photo
                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhoto(selectedRoomIdx, itemIdx, e)} />
                      </label>
                    </div>
                  </div>
                  <input type="text" placeholder="Notes (e.g., meter #, serial #, expiration date, location details...)" value={item.notes} onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "notes", e.target.value)}
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
            rows={3} className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none" placeholder="General observations about property condition, key contacts, access codes..." />
        </div>

        {/* Navigation between sections */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedRoomIdx(Math.max(0, selectedRoomIdx - 1))}
            disabled={selectedRoomIdx === 0}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            &larr; Previous Section
          </button>
          <span className="text-xs text-muted-foreground">
            Section {selectedRoomIdx + 1} of {active.rooms.length}
          </span>
          <button
            onClick={() => setSelectedRoomIdx(Math.min(active.rooms.length - 1, selectedRoomIdx + 1))}
            disabled={selectedRoomIdx === active.rooms.length - 1}
            className="px-4 py-2 text-sm text-accent hover:underline disabled:opacity-30"
          >
            Next Section &rarr;
          </button>
        </div>
      </div>
    );
  }

  // --- Completed ---
  if (view === "completed" && active) {
    const photoCount = active.rooms.flatMap((r) => r.items).reduce((sum, i) => sum + i.photos.length, 0);
    const itemsDocumented = active.rooms.flatMap((r) => r.items).filter((i) => i.condition !== "").length;
    const totalItems = active.rooms.flatMap((r) => r.items).length;
    const issueCount = active.rooms.flatMap((r) => r.items).filter((i) => i.condition === "poor" || i.condition === "damaged").length;

    return (
      <div className="space-y-6">
        <button onClick={() => { setView("list"); setActive(null); }} className="text-sm text-accent hover:underline">&larr; Back to list</button>
        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-green-600">&#10003;</span>
          </div>
          <h1 className="text-2xl font-bold">Onboarding Inspection Complete</h1>
          <p className="text-muted-foreground mt-1">{active.propertyName}</p>
        </div>
        <div className="grid md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Sections</p>
            <p className="text-2xl font-bold mt-1">{active.rooms.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Items Documented</p>
            <p className="text-2xl font-bold mt-1">{itemsDocumented}/{totalItems}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Photos Taken</p>
            <p className="text-2xl font-bold mt-1">{photoCount}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Issues Found</p>
            <p className={`text-2xl font-bold mt-1 ${issueCount > 0 ? "text-red-600" : "text-green-600"}`}>{issueCount}</p>
          </div>
        </div>

        {/* Issues summary */}
        {issueCount > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <h3 className="text-sm font-semibold text-red-800 mb-2">Items Requiring Attention</h3>
            <div className="space-y-1">
              {active.rooms.flatMap((room) =>
                room.items
                  .filter((i) => i.condition === "poor" || i.condition === "damaged")
                  .map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <span><span className="font-medium">{room.name}</span> &mdash; {item.item}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${item.condition === "damaged" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                        {item.condition}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          This onboarding condition report documents the baseline state of the property at acquisition.
          All {ONBOARDING_SECTIONS.length} checklist sections were available for documentation.
        </p>
      </div>
    );
  }

  return null;
}
