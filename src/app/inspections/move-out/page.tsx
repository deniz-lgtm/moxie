"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { InspectionCamera, type CameraRoom } from "@/components/InspectionCamera";
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

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function blankItem(name: string): InspectionItem {
  return {
    id: newId(),
    area: "",
    item: name,
    condition: "",
    notes: "",
    photos: [],
    costEstimate: 0,
    isDeduction: false,
  };
}

type WizardStep = "select_unit" | "floor_plan" | "walking" | "ai_review" | "team_review" | "completed";

export default function MoveOutInspectionPage() {
  const [inspections, setInspections] = useState<Inspection[]>(() =>
    loadFromStorage<Inspection[]>("inspections_v2", []).filter((i) => i.type === "move_out")
  );
  const [units, setUnits] = useState<(Unit & { tenants?: string[]; tenantEmails?: string[] })[]>([]);
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [step, setStep] = useState<WizardStep>("select_unit");
  const [showList, setShowList] = useState(true);
  const [unitSearch, setUnitSearch] = useState("");
  const [selectedRoomIdx, setSelectedRoomIdx] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // New inspection form
  const [newForm, setNewForm] = useState({
    unitId: "",
    inspector: "",
    scheduledDate: "",
    tenantName: "",
    tenantEmail: "",
    tenantEmails: [] as string[],
    depositAmount: 0,
  });

  useEffect(() => {
    fetch("/api/appfolio/units?withTenants=1")
      .then((r) => r.json())
      .then((d) => setUnits(d.units || []))
      .catch(() => {});
  }, []);

  // Persist all move-out inspections
  const persist = useCallback(
    (updated: Inspection[]) => {
      // Merge with other types
      const allInspections = loadFromStorage<Inspection[]>("inspections_v2", []);
      const others = allInspections.filter((i) => i.type !== "move_out");
      saveToStorage("inspections_v2", [...others, ...updated]);
    },
    []
  );

  function saveInspection(insp: Inspection) {
    const updated = inspections.map((i) => (i.id === insp.id ? insp : i));
    if (!inspections.find((i) => i.id === insp.id)) updated.push(insp);
    setInspections(updated);
    setActiveInspection(insp);
    persist(updated);
  }

  function startNewInspection() {
    const unit = units.find((u) => u.id === newForm.unitId);
    if (!unit || !newForm.inspector) return;

    const insp: Inspection = {
      id: newId(),
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitNumber: unit.unitName || unit.displayName,
      propertyName: unit.propertyName,
      type: "move_out",
      status: "draft",
      scheduledDate: newForm.scheduledDate || new Date().toISOString().split("T")[0],
      inspector: newForm.inspector,
      rooms: [],
      floorPlanUrl: null,
      overallNotes: "",
      invoiceUrl: null,
      invoiceTotal: null,
      tenantName: newForm.tenantName || unit.tenant,
      tenantEmail: newForm.tenantEmail || null,
      depositAmount: newForm.depositAmount || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveInspection(insp);
    setStep("floor_plan");
    setShowList(false);
  }

  function handleFloorPlanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeInspection || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const updated = {
        ...activeInspection,
        floorPlanUrl: dataUrl,
        updatedAt: new Date().toISOString(),
      };

      // Try AI room detection
      try {
        const res = await fetch("/api/inspections/analyze-floor-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: dataUrl }),
        });
        const data = await res.json();
        if (data.rooms?.length > 0) {
          updated.rooms = data.rooms.map((name: string) => ({
            id: newId(),
            name,
            items: DEFAULT_ITEMS.map((item) => blankItem(item)),
          }));
        }
      } catch {
        // Fall back to default rooms
        updated.rooms = [
          "Living Room", "Kitchen", "Bedroom 1", "Bedroom 2",
          "Bathroom 1", "Bathroom 2", "Hallway", "Closet",
        ].map((name) => ({
          id: newId(),
          name,
          items: DEFAULT_ITEMS.map((item) => blankItem(item)),
        }));
      }

      saveInspection(updated);
    };
    reader.readAsDataURL(file);
  }

  function skipFloorPlan() {
    if (!activeInspection) return;
    const updated = {
      ...activeInspection,
      rooms: [
        "Living Room", "Kitchen", "Bedroom 1", "Bedroom 2",
        "Bathroom 1", "Bathroom 2", "Hallway", "Closet",
      ].map((name) => ({
        id: newId(),
        name,
        items: DEFAULT_ITEMS.map((item) => blankItem(item)),
      })),
      status: "walking" as const,
      updatedAt: new Date().toISOString(),
    };
    saveInspection(updated);
    setStep("walking");
  }

  function startWalk() {
    if (!activeInspection) return;
    saveInspection({
      ...activeInspection,
      status: "walking",
      updatedAt: new Date().toISOString(),
    });
    setStep("walking");
  }

  function addRoom(name: string) {
    if (!activeInspection) return;
    saveInspection({
      ...activeInspection,
      rooms: [
        ...activeInspection.rooms,
        { id: newId(), name, items: DEFAULT_ITEMS.map((item) => blankItem(item)) },
      ],
      updatedAt: new Date().toISOString(),
    });
  }

  function renameRoom(roomIdx: number, name: string) {
    if (!activeInspection) return;
    const rooms = [...activeInspection.rooms];
    rooms[roomIdx] = { ...rooms[roomIdx], name };
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
  }

  function removeRoom(roomIdx: number) {
    if (!activeInspection) return;
    const rooms = activeInspection.rooms.filter((_, i) => i !== roomIdx);
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
    if (selectedRoomIdx >= rooms.length) setSelectedRoomIdx(Math.max(0, rooms.length - 1));
  }

  function updateItem(roomIdx: number, itemIdx: number, field: string, value: any) {
    if (!activeInspection) return;
    const rooms = [...activeInspection.rooms];
    const items = [...rooms[roomIdx].items];
    items[itemIdx] = { ...items[itemIdx], [field]: value };
    // Auto-mark as deduction if condition is poor/damaged
    if (field === "condition" && (value === "poor" || value === "damaged")) {
      items[itemIdx].isDeduction = true;
    }
    rooms[roomIdx] = { ...rooms[roomIdx], items };
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
  }

  function addItemToRoom(roomIdx: number, itemName: string) {
    if (!activeInspection) return;
    const rooms = [...activeInspection.rooms];
    rooms[roomIdx] = {
      ...rooms[roomIdx],
      items: [...rooms[roomIdx].items, blankItem(itemName)],
    };
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
  }

  function handlePhotoUpload(roomIdx: number, itemIdx: number, e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeInspection || !e.target.files?.length) return;
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const photo: InspectionPhoto = {
        id: newId(),
        url: reader.result as string,
        aiAnalysis: null,
        createdAt: new Date().toISOString(),
      };
      const rooms = [...activeInspection.rooms];
      const items = [...rooms[roomIdx].items];
      items[itemIdx] = { ...items[itemIdx], photos: [...items[itemIdx].photos, photo] };
      rooms[roomIdx] = { ...rooms[roomIdx], items };
      saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
    };
    reader.readAsDataURL(file);
  }

  // Camera walk helpers
  function toCameraRooms(rooms: InspectionRoom[]): CameraRoom[] {
    return rooms.map((r) => ({
      id: r.id,
      name: r.name,
      photos: r.items.flatMap((item) =>
        item.photos.map((p) => ({ id: p.id, url: p.url, timestamp: p.createdAt }))
      ),
      notes: "",
    }));
  }

  function handleCameraRoomsChange(cameraRooms: CameraRoom[]) {
    if (!activeInspection) return;
    const rooms = activeInspection.rooms.map((room, idx) => {
      const cRoom = cameraRooms[idx];
      if (!cRoom) return room;
      const existingPhotoIds = new Set(room.items.flatMap((item) => item.photos.map((p) => p.id)));
      const newPhotos = cRoom.photos.filter((p) => !existingPhotoIds.has(p.id));
      if (newPhotos.length === 0) return room;

      const items = [...room.items];

      // If photos have AI analysis, create new checklist items per detected issue
      for (const photo of newPhotos) {
        const ai = photo.aiAnalysis;
        if (ai && ai.item) {
          // Create a new checklist item from AI detection
          const newItem: InspectionItem = {
            id: newId(),
            area: room.name,
            item: ai.item,
            condition: ai.condition as ConditionRating || "fair",
            notes: ai.description,
            photos: [{
              id: photo.id,
              url: photo.url,
              aiAnalysis: ai.description,
              createdAt: photo.timestamp,
            }],
            costEstimate: ai.estimatedCost || 0,
            isDeduction: (ai.estimatedCost || 0) > 0,
          };
          items.push(newItem);
        } else {
          // No AI analysis — add photo to first item
          const firstItem = { ...items[0], photos: [...items[0].photos, {
            id: photo.id,
            url: photo.url,
            aiAnalysis: null,
            createdAt: photo.timestamp,
          }] };
          items[0] = firstItem;
        }
      }

      return { ...room, items };
    });
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
  }

  function handleCameraComplete(cameraRooms: CameraRoom[]) {
    handleCameraRoomsChange(cameraRooms);
    setShowCamera(false);
  }

  async function endWalkAndAnalyze() {
    if (!activeInspection) return;
    setAnalyzing(true);

    const rooms = [...activeInspection.rooms];

    // Analyze photos with AI for items that have photos
    for (let ri = 0; ri < rooms.length; ri++) {
      for (let ii = 0; ii < rooms[ri].items.length; ii++) {
        const item = rooms[ri].items[ii];
        if (item.photos.length === 0) continue;

        try {
          const res = await fetch("/api/inspections/analyze-photo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              photoBase64: item.photos[0].url,
              roomName: rooms[ri].name,
              itemName: item.item,
            }),
          });
          const analysis = await res.json();

          if (analysis.condition) {
            rooms[ri].items[ii] = {
              ...item,
              condition: analysis.condition,
              notes: analysis.description || item.notes,
              costEstimate: analysis.total_estimated_cost || 0,
              isDeduction: (analysis.total_estimated_cost || 0) > 0,
              photos: item.photos.map((p, pi) =>
                pi === 0 ? { ...p, aiAnalysis: analysis.description } : p
              ),
            };
          }
        } catch {
          // Skip failed analysis
        }
      }
    }

    saveInspection({
      ...activeInspection,
      rooms,
      status: "ai_review",
      updatedAt: new Date().toISOString(),
    });
    setStep("ai_review");
    setAnalyzing(false);
  }

  function moveToTeamReview() {
    if (!activeInspection) return;
    saveInspection({
      ...activeInspection,
      status: "team_review",
      updatedAt: new Date().toISOString(),
    });
    setStep("team_review");
  }

  async function completeAndGeneratePDF() {
    if (!activeInspection) return;
    setGeneratingPDF(true);

    try {
      const { generateDepositDeductionPDF, generateDispositionLetterPDF, downloadPDF } = await import("@/lib/pdf-invoice");

      const pdfData = buildPdfData(activeInspection);
      const pdfDataUri = generateDepositDeductionPDF(pdfData);

      const totalDed = activeInspection.rooms
        .flatMap((r) => r.items)
        .filter((item) => item.isDeduction)
        .reduce((sum, item) => sum + item.costEstimate, 0);

      // Download both the deduction statement and disposition letter
      downloadPDF(pdfDataUri, `MoveOut-${activeInspection.unitNumber}-${activeInspection.scheduledDate}.pdf`);
      const letterPdf = generateDispositionLetterPDF(pdfData);
      downloadPDF(letterPdf, `DispositionLetter-${activeInspection.unitNumber}-${activeInspection.scheduledDate}.pdf`);

      saveInspection({
        ...activeInspection,
        status: "completed",
        completedDate: new Date().toISOString().split("T")[0],
        invoiceUrl: pdfDataUri,
        invoiceTotal: totalDed,
        updatedAt: new Date().toISOString(),
      });
      setStep("completed");
    } catch (err) {
      console.error("PDF generation failed:", err);
      alert("PDF generation failed. Check console for details.");
    }

    setGeneratingPDF(false);
  }

  // Build PDF data structure from inspection
  function buildPdfData(insp: Inspection) {
    return {
      inspection: {
        ...insp as any,
        unit_name: insp.unitNumber,
        property_name: insp.propertyName,
        rooms: insp.rooms.map((r) => ({
          id: r.id,
          name: r.name,
          items: r.items.map((item) => ({
            id: item.id,
            name: item.item,
            condition: item.condition || "fair",
            notes: item.notes,
            photos: item.photos.map((p) => ({
              id: p.id,
              url: p.url,
              ai_analysis: p.aiAnalysis,
              created_at: p.createdAt,
            })),
            cost_estimate: item.costEstimate,
            is_deduction: item.isDeduction,
          })),
        })),
        tenant_name: insp.tenantName,
        tenant_email: insp.tenantEmail,
        deposit_amount: insp.depositAmount,
        scheduled_date: insp.scheduledDate,
        completed_date: insp.completedDate,
        inspector: insp.inspector,
      },
      companyName: "Moxie Management",
      companyAddress: "Los Angeles, CA",
      companyPhone: "",
      companyEmail: "",
    };
  }

  // Calculate totals
  const totalDeductions = activeInspection
    ? activeInspection.rooms
        .flatMap((r) => r.items)
        .filter((item) => item.isDeduction)
        .reduce((sum, item) => sum + item.costEstimate, 0)
    : 0;

  const filteredUnits = unitSearch
    ? units.filter((u) => u.unitName.toLowerCase().includes(unitSearch.toLowerCase()))
    : units;

  // ─── List view ────────────────────────────────────

  if (showList && !activeInspection) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/inspections" className="text-sm text-accent hover:underline">
              &larr; All Inspections
            </Link>
            <h1 className="text-2xl font-bold mt-1">Move-Out Inspections</h1>
            <p className="text-muted-foreground mt-1">
              Full walk with floor plan, photos, AI analysis, and deposit deduction invoice
            </p>
          </div>
          <button
            onClick={() => { setShowList(false); setStep("select_unit"); }}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90"
          >
            + Start Inspection
          </button>
        </div>

        {inspections.length > 0 ? (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Unit</th>
                  <th className="text-left px-4 py-3 font-medium">Tenant</th>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Inspector</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Deductions</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((insp) => {
                  const ded = insp.rooms
                    .flatMap((r) => r.items)
                    .filter((item) => item.isDeduction)
                    .reduce((sum, item) => sum + item.costEstimate, 0);
                  return (
                    <tr
                      key={insp.id}
                      onClick={() => {
                        setActiveInspection(insp);
                        setShowList(false);
                        setStep(insp.status === "completed" ? "completed" : insp.status === "team_review" ? "team_review" : insp.status === "ai_review" ? "ai_review" : insp.status === "walking" ? "walking" : "floor_plan");
                      }}
                      className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                    >
                      <td className="px-4 py-3 font-medium">{insp.unitNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">{insp.tenantName || "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{insp.scheduledDate}</td>
                      <td className="px-4 py-3 text-muted-foreground">{insp.inspector}</td>
                      <td className="px-4 py-3"><StatusBadge value={insp.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{ded > 0 ? `$${ded.toLocaleString()}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            No move-out inspections yet. Click &quot;+ Start Inspection&quot; to begin.
          </div>
        )}
      </div>
    );
  }

  // ─── Step: Select Unit ────────────────────────────

  if (step === "select_unit") {
    const selectedUnit = units.find((u) => u.id === newForm.unitId);

    return (
      <div className="space-y-6">
        <button onClick={() => { setShowList(true); setActiveInspection(null); }} className="text-sm text-accent hover:underline">
          &larr; Back to list
        </button>
        <h1 className="text-2xl font-bold">Start Move-Out Inspection</h1>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Step 1: Select Unit & Details</h2>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Select Unit *</label>
              <select
                value={newForm.unitId}
                onChange={(e) => {
                  const unit = units.find((u) => u.id === e.target.value);
                  if (unit) {
                    const allTenants = unit.tenants?.join(", ") || unit.tenant || "";
                    const allEmails = unit.tenantEmails?.join(", ") || "";
                    setNewForm({
                      ...newForm,
                      unitId: unit.id,
                      tenantName: allTenants,
                      tenantEmail: allEmails,
                      tenantEmails: unit.tenantEmails || [],
                    });
                  } else {
                    setNewForm({ ...newForm, unitId: "" });
                  }
                }}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">Select a unit...</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unitName} — {u.tenants?.length ? u.tenants.join(", ") : u.tenant || "Vacant"} ({u.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Show tenant details when unit is selected */}
            {selectedUnit && (selectedUnit.tenants?.length || 0) > 1 && (
              <div className="md:col-span-2 bg-blue-50 rounded-lg border border-blue-200 p-3">
                <p className="text-xs font-medium text-blue-800 mb-1">
                  {selectedUnit.tenants!.length} tenants on this unit
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedUnit.tenants!.map((t, i) => (
                    <span key={i} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                      {t}
                      {selectedUnit.tenantEmails?.[i] && (
                        <span className="text-blue-500 ml-1">({selectedUnit.tenantEmails[i]})</span>
                      )}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-blue-600 mt-1">
                  Disposition letter will be addressed to all tenants
                </p>
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Inspector *</label>
              <input
                type="text"
                placeholder="Inspector name"
                value={newForm.inspector}
                onChange={(e) => setNewForm({ ...newForm, inspector: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Scheduled Date</label>
              <input
                type="date"
                value={newForm.scheduledDate}
                onChange={(e) => setNewForm({ ...newForm, scheduledDate: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tenant Name(s)</label>
              <input
                type="text"
                value={newForm.tenantName}
                onChange={(e) => setNewForm({ ...newForm, tenantName: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                placeholder="Auto-populated from unit selection"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Tenant Email(s)</label>
              <input
                type="text"
                placeholder="For sending disposition letter"
                value={newForm.tenantEmail}
                onChange={(e) => setNewForm({ ...newForm, tenantEmail: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
              {newForm.tenantEmails.length > 1 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  Multiple emails — all will receive the disposition letter
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-muted-foreground block mb-1">Security Deposit ($)</label>
              <input
                type="number"
                placeholder="0"
                value={newForm.depositAmount || ""}
                onChange={(e) => setNewForm({ ...newForm, depositAmount: parseFloat(e.target.value) || 0 })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
          </div>

          <button
            onClick={startNewInspection}
            disabled={!newForm.unitId || !newForm.inspector}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50"
          >
            Continue to Floor Plan &rarr;
          </button>
        </div>
      </div>
    );
  }

  // ─── Step: Floor Plan ─────────────────────────────

  if (step === "floor_plan" && activeInspection) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setShowList(true); setActiveInspection(null); }} className="text-sm text-accent hover:underline">
          &larr; Back to list
        </button>
        <h1 className="text-2xl font-bold">Upload Floor Plan</h1>
        <p className="text-muted-foreground">
          {activeInspection.unitNumber} — Upload an architectural floor plan and AI will identify rooms automatically.
        </p>

        <div className="bg-card rounded-xl border border-border p-6 text-center space-y-4">
          {activeInspection.floorPlanUrl ? (
            <div>
              <img
                src={activeInspection.floorPlanUrl}
                alt="Floor plan"
                className="max-h-96 mx-auto rounded-lg border border-border"
              />
              <p className="text-sm text-green-600 mt-3 font-medium">
                Floor plan uploaded — {activeInspection.rooms.length} rooms detected
              </p>
              <div className="flex flex-wrap gap-2 justify-center mt-2">
                {activeInspection.rooms.map((r) => (
                  <span key={r.id} className="text-xs bg-muted px-2 py-1 rounded-full">{r.name}</span>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-12">
              <p className="text-lg font-medium mb-2">Drop floor plan here or click to upload</p>
              <p className="text-sm text-muted-foreground mb-4">
                Supports JPG, PNG, PDF. AI will scan and identify rooms.
              </p>
            </div>
          )}

          <div className="flex justify-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFloorPlanUpload}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 border border-border text-sm rounded-lg hover:bg-muted"
            >
              {activeInspection.floorPlanUrl ? "Replace Floor Plan" : "Upload Floor Plan"}
            </button>
            <button
              onClick={activeInspection.rooms.length > 0 ? startWalk : skipFloorPlan}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90"
            >
              {activeInspection.rooms.length > 0 ? "Start Walk &rarr;" : "Skip — Use Default Rooms &rarr;"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Walking ────────────────────────────────

  if ((step === "walking" || step === "ai_review" || step === "team_review") && activeInspection) {
    const isReview = step === "ai_review" || step === "team_review";
    const currentRoom = activeInspection.rooms[selectedRoomIdx];

    return (
      <div className="space-y-6">
        {showCamera && step === "walking" && (
          <InspectionCamera
            rooms={toCameraRooms(activeInspection.rooms)}
            onRoomsChange={handleCameraRoomsChange}
            onComplete={handleCameraComplete}
            onCancel={() => setShowCamera(false)}
            title={`Move-Out — ${activeInspection.unitNumber}`}
            enableAiAnalysis={true}
          />
        )}
        <div className="flex items-center justify-between">
          <div>
            <button onClick={() => { setShowList(true); setActiveInspection(null); }} className="text-sm text-accent hover:underline">
              &larr; Back to list
            </button>
            <h1 className="text-2xl font-bold mt-1">
              {activeInspection.unitNumber} — {isReview ? "Review" : "Walk"}
            </h1>
            <p className="text-muted-foreground">
              {isReview ? "Review AI analysis and edit costs before generating invoice" : "Take photos and note conditions for each room"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge value={activeInspection.status} />
            {step === "walking" && (
              <>
                <button
                  onClick={() => setShowCamera(true)}
                  className="px-4 py-2 bg-[#9d1535] text-white text-sm rounded-lg hover:bg-[#b91c42] flex items-center gap-1.5"
                >
                  📷 Camera Walk
                </button>
                <button
                  onClick={endWalkAndAnalyze}
                  disabled={analyzing}
                  className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50"
                >
                  {analyzing ? "Analyzing..." : "End Walk & Analyze"}
                </button>
              </>
            )}
            {step === "ai_review" && (
              <button
                onClick={moveToTeamReview}
                className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90"
              >
                Send to Team Review &rarr;
              </button>
            )}
            {step === "team_review" && (
              <button
                onClick={completeAndGeneratePDF}
                disabled={generatingPDF}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {generatingPDF ? "Generating PDF..." : "Complete & Generate Invoice"}
              </button>
            )}
          </div>
        </div>

        {/* Deduction summary */}
        {isReview && (
          <div className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Total Deductions</p>
              <p className="text-xs text-muted-foreground">
                Deposit: ${(activeInspection.depositAmount || 0).toLocaleString()} — Refund: $
                {Math.max(0, (activeInspection.depositAmount || 0) - totalDeductions).toLocaleString()}
              </p>
            </div>
            <p className="text-2xl font-bold text-red-600">${totalDeductions.toLocaleString()}</p>
          </div>
        )}

        {/* Room tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {activeInspection.rooms.map((room, idx) => (
            <button
              key={room.id}
              onClick={() => setSelectedRoomIdx(idx)}
              className={`shrink-0 px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                selectedRoomIdx === idx
                  ? "bg-accent text-white border-accent"
                  : "border-border hover:bg-muted"
              }`}
            >
              {room.name}
              {room.items.some((i) => i.isDeduction) && (
                <span className="ml-1 text-xs">!</span>
              )}
            </button>
          ))}
          {!isReview && (
            <button
              onClick={() => {
                const name = prompt("Room name:");
                if (name) addRoom(name);
              }}
              className="shrink-0 px-3 py-1.5 text-sm rounded-lg border border-dashed border-border hover:bg-muted text-muted-foreground"
            >
              + Room
            </button>
          )}
        </div>

        {/* Room content */}
        {currentRoom && (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isReview ? (
                  <h2 className="font-semibold">{currentRoom.name}</h2>
                ) : (
                  <input
                    value={currentRoom.name}
                    onChange={(e) => renameRoom(selectedRoomIdx, e.target.value)}
                    className="font-semibold bg-transparent border-b border-dashed border-border px-1"
                  />
                )}
                <span className="text-xs text-muted-foreground">
                  {currentRoom.items.length} items
                </span>
              </div>
              {!isReview && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const name = prompt("Item name:");
                      if (name) addItemToRoom(selectedRoomIdx, name);
                    }}
                    className="text-xs text-accent hover:underline"
                  >
                    + Add Item
                  </button>
                  {activeInspection.rooms.length > 1 && (
                    <button
                      onClick={() => removeRoom(selectedRoomIdx)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Remove Room
                    </button>
                  )}
                </div>
              )}
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
                            <img
                              key={photo.id}
                              src={photo.url}
                              alt=""
                              className="w-16 h-16 object-cover rounded border border-border"
                            />
                          ))}
                        </div>
                      )}
                      {item.photos[0]?.aiAnalysis && (
                        <p className="text-xs text-muted-foreground mt-1 italic">
                          AI: {item.photos[0].aiAnalysis}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Condition */}
                      <select
                        value={item.condition}
                        onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "condition", e.target.value)}
                        className="text-xs border border-border rounded-md px-2 py-1.5 bg-card"
                      >
                        <option value="">—</option>
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>

                      {/* Photo upload */}
                      <label className="text-xs text-accent hover:underline cursor-pointer">
                        + Photo
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(selectedRoomIdx, itemIdx, e)}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Notes and cost (shown in review) */}
                  <div className="flex gap-3">
                    <input
                      type="text"
                      placeholder="Notes..."
                      value={item.notes}
                      onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "notes", e.target.value)}
                      className="flex-1 text-xs border border-border rounded px-2 py-1.5 bg-card"
                    />
                    {isReview && (
                      <>
                        <div className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            checked={item.isDeduction}
                            onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "isDeduction", e.target.checked)}
                          />
                          <span className="text-xs text-muted-foreground">Deduct</span>
                        </div>
                        <input
                          type="number"
                          placeholder="$0"
                          value={item.costEstimate || ""}
                          onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "costEstimate", parseFloat(e.target.value) || 0)}
                          className="w-20 text-xs text-right border border-border rounded px-2 py-1.5 bg-card"
                        />
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overall notes */}
        <div className="bg-card rounded-xl border border-border p-4">
          <label className="text-xs text-muted-foreground block mb-1">Overall Notes</label>
          <textarea
            value={activeInspection.overallNotes}
            onChange={(e) =>
              saveInspection({ ...activeInspection, overallNotes: e.target.value, updatedAt: new Date().toISOString() })
            }
            rows={3}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
            placeholder="General observations about the unit..."
          />
        </div>
      </div>
    );
  }

  // ─── Step: Completed ──────────────────────────────

  if (step === "completed" && activeInspection) {
    return (
      <div className="space-y-6">
        <button onClick={() => { setShowList(true); setActiveInspection(null); }} className="text-sm text-accent hover:underline">
          &larr; Back to list
        </button>

        <div className="text-center py-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-green-600">&#10003;</span>
          </div>
          <h1 className="text-2xl font-bold">Inspection Complete</h1>
          <p className="text-muted-foreground mt-1">
            {activeInspection.unitNumber} — Move-Out Inspection
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Total Deductions</p>
            <p className="text-2xl font-bold mt-1 text-red-600">
              ${(activeInspection.invoiceTotal || totalDeductions).toLocaleString()}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Deposit Held</p>
            <p className="text-2xl font-bold mt-1">
              ${(activeInspection.depositAmount || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-card rounded-xl border border-border p-5 text-center">
            <p className="text-sm text-muted-foreground">Refund Due</p>
            <p className="text-2xl font-bold mt-1 text-green-600">
              ${Math.max(0, (activeInspection.depositAmount || 0) - (activeInspection.invoiceTotal || totalDeductions)).toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-3">
          <h2 className="font-semibold">Documents</h2>
          <button
            onClick={async () => {
              const { generateDispositionLetterPDF, downloadPDF } = await import("@/lib/pdf-invoice");
              const pdfData = buildPdfData(activeInspection);
              const letterPdf = generateDispositionLetterPDF(pdfData);
              downloadPDF(letterPdf, `DispositionLetter-${activeInspection.unitNumber}-${activeInspection.scheduledDate}.pdf`);
            }}
            className="block w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted text-sm"
          >
            <span className="font-medium">Download Disposition Letter</span>
            <span className="block text-xs text-muted-foreground mt-0.5">CA Civil Code 1950.5 — formal cover letter for tenant</span>
          </button>
          {activeInspection.invoiceUrl && (
            <button
              onClick={async () => {
                const { downloadPDF } = await import("@/lib/pdf-invoice");
                downloadPDF(
                  activeInspection.invoiceUrl!,
                  `MoveOut-${activeInspection.unitNumber}-${activeInspection.scheduledDate}.pdf`
                );
              }}
              className="block w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted text-sm"
            >
              <span className="font-medium">Download Itemized Deduction Statement</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Detailed breakdown of all deductions with costs</span>
            </button>
          )}
          {activeInspection.tenantEmail && (
            <a
              href={`mailto:${activeInspection.tenantEmail}?subject=Security Deposit Disposition - ${activeInspection.unitNumber}&body=Dear ${activeInspection.tenantName || "Tenant"},%0A%0APlease find attached your Security Deposit Disposition Letter and Itemized Statement of Deductions pursuant to California Civil Code Section 1950.5.%0A%0ASincerely,%0AMoxie Management`}
              className="block w-full text-left px-4 py-3 border border-border rounded-lg hover:bg-muted text-sm"
            >
              <span className="font-medium">Email to {activeInspection.tenantName || activeInspection.tenantEmail}</span>
              <span className="block text-xs text-muted-foreground mt-0.5">Send disposition letter and statement via email</span>
            </a>
          )}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Per California Civil Code 1950.5, the itemized statement and remaining deposit must be
          returned to the tenant within 21 calendar days of move-out.
        </p>
      </div>
    );
  }

  return null;
}
