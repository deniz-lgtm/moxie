"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { InspectionCamera, type CameraRoom } from "@/components/InspectionCamera";
import { loadFromStorage, saveToStorage } from "@/lib/storage";
import { loadLogoBase64 } from "@/lib/pdf-logo";
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
  const [units, setUnits] = useState<Unit[]>([]);
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

  // New inspection form (tenant info is resolved at send time, not creation)
  const [newForm, setNewForm] = useState({
    unitId: "",
    inspector: "Moxie Management",
    scheduledDate: "",
    depositAmount: 0,
  });
  const [selectedProperty, setSelectedProperty] = useState("");

  // Tenant picker state for completed step
  const [unitTenants, setUnitTenants] = useState<{ name: string; email: string }[]>([]);
  const [selectedTenants, setSelectedTenants] = useState<Set<number>>(new Set());
  const [loadingTenants, setLoadingTenants] = useState(false);

  const [populating, setPopulating] = useState(false);

  useEffect(() => {
    fetch("/api/appfolio/units")
      .then((r) => r.json())
      .then((d) => setUnits(d.units || []))
      .catch(() => {});
  }, []);

  // Auto-populate "not_started" inspections for all units moving out 2025-07-31
  useEffect(() => {
    if (units.length === 0) return;

    const moveOutUnits = units.filter((u) => {
      if (!u.leaseTo) return false;
      // Normalize date: AppFolio may return "MM/DD/YYYY" or "YYYY-MM-DD"
      const d = new Date(u.leaseTo);
      return d.getFullYear() === 2026 && d.getMonth() === 6 && d.getDate() === 31; // July = 6
    });

    if (moveOutUnits.length === 0) return;

    const existing = loadFromStorage<Inspection[]>("inspections_v2", []).filter((i) => i.type === "move_out");
    const existingUnitIds = new Set(existing.map((i) => i.unitId));

    const newInspections: Inspection[] = [];
    for (const unit of moveOutUnits) {
      if (existingUnitIds.has(unit.id)) continue;
      newInspections.push({
        id: newId(),
        unitId: unit.id,
        propertyId: unit.propertyId,
        unitNumber: unit.unitName || unit.displayName,
        propertyName: unit.propertyName,
        type: "move_out",
        status: "not_started",
        scheduledDate: "2026-07-31",
        inspector: "Moxie Management",
        rooms: [],
        floorPlanUrl: null,
        overallNotes: "",
        invoiceUrl: null,
        invoiceTotal: null,
        tenantName: unit.tenant || null,
        tenantEmail: null,
        depositAmount: unit.deposit || null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (newInspections.length > 0) {
      const all = [...existing, ...newInspections];
      setInspections(all.filter((i) => i.type === "move_out"));
      // Persist — merge with other types
      const allStored = loadFromStorage<Inspection[]>("inspections_v2", []);
      const others = allStored.filter((i) => i.type !== "move_out");
      saveToStorage("inspections_v2", [...others, ...all]);
    }
  }, [units]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch tenants when entering the completed step
  useEffect(() => {
    if (step !== "completed" || !activeInspection) return;
    setLoadingTenants(true);
    const unitAddress = activeInspection.unitNumber;
    fetch(`/api/appfolio/units?tenants_for=${encodeURIComponent(unitAddress)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.tenants?.length > 0) {
          setUnitTenants(data.tenants);
          setSelectedTenants(new Set(data.tenants.map((_: any, i: number) => i)));
        }
      })
      .catch(() => {})
      .finally(() => setLoadingTenants(false));
  }, [step, activeInspection]);

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
      tenantName: null,
      tenantEmail: null,
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

      const logo = await loadLogoBase64();
      const pdfData = buildPdfData(activeInspection, logo);
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
  function buildPdfData(insp: Inspection, logoBase64?: string | null): import("@/lib/pdf-invoice").InvoiceData {
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
      logoBase64: logoBase64 || null,
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
    const completedCount = inspections.filter((i) => i.status === "completed").length;
    const notStartedCount = inspections.filter((i) => i.status === "not_started").length;
    const inProgressCount = inspections.filter((i) => i.status !== "completed" && i.status !== "not_started").length;
    const totalCount = inspections.length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Sort: in-progress first, then not_started, then completed
    const statusOrder: Record<string, number> = { walking: 0, ai_review: 0, team_review: 0, draft: 0, not_started: 1, completed: 2 };
    const sortedInspections = [...inspections].sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1));

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Link href="/inspections" className="text-xs font-medium text-accent hover:underline">
              &larr; All Inspections
            </Link>
            <h1 className="text-2xl font-bold tracking-tight mt-1">Move-Out Inspections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              July 31, 2026 move-outs &mdash; full walk with floor plan, photos, AI analysis, and deposit deduction invoice
            </p>
          </div>
          <button
            onClick={() => { setShowList(false); setStep("select_unit"); }}
            className="px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover transition-colors shadow-sm"
          >
            + Start Inspection
          </button>
        </div>

        {/* Progress summary */}
        {totalCount > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5" style={{ boxShadow: "var(--shadow-sm)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">Progress</h2>
              <span className="text-sm font-bold text-accent">{progressPct}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5 mb-4">
              <div
                className="h-2.5 rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct === 100 ? "#16a34a" : "var(--accent)",
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold tracking-tight text-green-600">{completedCount}</p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight text-blue-600">{inProgressCount}</p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">In Progress</p>
              </div>
              <div>
                <p className="text-2xl font-bold tracking-tight text-slate-500">{notStartedCount}</p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Not Started</p>
              </div>
            </div>
          </div>
        )}

        {totalCount > 0 ? (
          <div className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unit</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Property</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tenant</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deposit</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deductions</th>
                </tr>
              </thead>
              <tbody>
                {sortedInspections.map((insp) => {
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
                        if (insp.status === "not_started") {
                          // Pre-fill form with unit info and go to floor plan step
                          setNewForm({
                            unitId: insp.unitId,
                            inspector: insp.inspector,
                            scheduledDate: insp.scheduledDate,
                            depositAmount: insp.depositAmount || 0,
                          });
                          setStep("floor_plan");
                          // Update status to draft
                          const updated = { ...insp, status: "draft" as const, updatedAt: new Date().toISOString() };
                          saveInspection(updated);
                        } else {
                          setStep(insp.status === "completed" ? "completed" : insp.status === "team_review" ? "team_review" : insp.status === "ai_review" ? "ai_review" : insp.status === "walking" ? "walking" : "floor_plan");
                        }
                      }}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3.5 font-medium">{insp.unitNumber}</td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs">{insp.propertyName}</td>
                      <td className="px-4 py-3.5 text-muted-foreground text-xs">{insp.tenantName || "—"}</td>
                      <td className="px-4 py-3.5 text-muted-foreground">{insp.depositAmount ? `$${insp.depositAmount.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3.5"><StatusBadge value={insp.status} /></td>
                      <td className="px-4 py-3.5 font-medium">{ded > 0 ? `$${ded.toLocaleString()}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 bg-card rounded-2xl border border-border" style={{ boxShadow: "var(--shadow-sm)" }}>
            <div className="w-14 h-14 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl text-muted-foreground">+</span>
            </div>
            <p className="text-sm font-medium">No move-out inspections yet</p>
            <p className="text-xs text-muted-foreground mt-1">Click &quot;+ Start Inspection&quot; to begin your first walk</p>
          </div>
        )}
      </div>
    );
  }

  // ─── Step: Select Unit ────────────────────────────

  if (step === "select_unit") {
    return (
      <div className="space-y-6 max-w-2xl">
        <button onClick={() => { setShowList(true); setActiveInspection(null); }} className="text-xs font-medium text-accent hover:underline">
          &larr; Back to list
        </button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Start Move-Out Inspection</h1>
          <p className="text-sm text-muted-foreground mt-1">Select a unit and fill in the details to begin</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 space-y-5" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-accent/10 flex items-center justify-center">
              <span className="text-accent font-bold text-xs">1</span>
            </div>
            <h2 className="text-sm font-semibold">Unit & Details</h2>
          </div>

          {(() => {
            const propertyNames = [...new Set(units.map((u) => u.propertyName))].sort();
            const filteredUnits = selectedProperty
              ? units.filter((u) => u.propertyName === selectedProperty)
              : [];
            return (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Select Property *</label>
                  <select
                    value={selectedProperty}
                    onChange={(e) => {
                      setSelectedProperty(e.target.value);
                      setNewForm({ ...newForm, unitId: "", depositAmount: 0 });
                    }}
                    className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
                  >
                    <option value="">Select a property...</option>
                    {propertyNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Select Unit *</label>
                  <select
                    value={newForm.unitId}
                    onChange={(e) => {
                      const unitId = e.target.value;
                      const unit = units.find((u) => u.id === unitId);
                      setNewForm({
                        ...newForm,
                        unitId,
                        depositAmount: unit?.deposit ?? 0,
                      });
                    }}
                    disabled={!selectedProperty}
                    className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors disabled:opacity-40"
                  >
                    <option value="">{selectedProperty ? "Select a unit..." : "Select a property first"}</option>
                    {filteredUnits.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.unitName || u.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Inspector *</label>
                  <input
                    type="text"
                    placeholder="Inspector name"
                    value={newForm.inspector}
                    onChange={(e) => setNewForm({ ...newForm, inspector: e.target.value })}
                    className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Inspection Date</label>
                  <input
                    type="date"
                    value={newForm.scheduledDate}
                    onChange={(e) => setNewForm({ ...newForm, scheduledDate: e.target.value })}
                    className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">Security Deposit ($)</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={newForm.depositAmount || ""}
                    onChange={(e) => setNewForm({ ...newForm, depositAmount: parseFloat(e.target.value) || 0 })}
                    className="w-full text-sm border border-border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
                  />
                </div>
              </div>
            );
          })()}

          <button
            onClick={startNewInspection}
            disabled={!newForm.unitId || !newForm.inspector}
            className="px-5 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover transition-colors disabled:opacity-40 shadow-sm"
          >
            Continue to Floor Plan →
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
              {activeInspection.rooms.length > 0 ? "Start Walk →" : "Skip — Use Default Rooms →"}
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
    const selectedTenantList = unitTenants.filter((_, i) => selectedTenants.has(i));
    const selectedEmails = selectedTenantList.map((t) => t.email).filter(Boolean);

    return (
      <div className="space-y-6">
        <button onClick={() => { setShowList(true); setActiveInspection(null); setUnitTenants([]); setSelectedTenants(new Set()); }} className="text-xs font-medium text-accent hover:underline">
          &larr; Back to list
        </button>

        <div className="text-center py-10">
          <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto mb-4 ring-4 ring-green-100">
            <span className="text-3xl text-green-600">&#10003;</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Inspection Complete</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {activeInspection.unitNumber} — Move-Out Inspection
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-card rounded-2xl border border-border p-5 text-center" style={{ boxShadow: "var(--shadow-sm)" }}>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Total Deductions</p>
            <p className="text-2xl font-bold mt-2 tracking-tight text-red-600">
              ${(activeInspection.invoiceTotal || totalDeductions).toLocaleString()}
            </p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 text-center" style={{ boxShadow: "var(--shadow-sm)" }}>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Deposit Held</p>
            <p className="text-2xl font-bold mt-2 tracking-tight">
              ${(activeInspection.depositAmount || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-card rounded-2xl border border-border p-5 text-center" style={{ boxShadow: "var(--shadow-sm)" }}>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Refund Due</p>
            <p className="text-2xl font-bold mt-2 tracking-tight text-green-600">
              ${Math.max(0, (activeInspection.depositAmount || 0) - (activeInspection.invoiceTotal || totalDeductions)).toLocaleString()}
            </p>
          </div>
        </div>

        {/* Tenant Selection */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-4" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <span className="text-blue-600 font-bold text-xs">@</span>
            </div>
            <h2 className="text-sm font-semibold">Send To Tenants</h2>
          </div>
          {loadingTenants ? (
            <div className="flex items-center gap-2 py-4">
              <div className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading tenants from AppFolio...</p>
            </div>
          ) : unitTenants.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">No tenants found for this unit in AppFolio.</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSelectedTenants(new Set(unitTenants.map((_, i) => i)))}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Select All
                </button>
                <span className="text-muted-foreground text-xs">&middot;</span>
                <button
                  onClick={() => setSelectedTenants(new Set())}
                  className="text-xs font-medium text-accent hover:underline"
                >
                  Deselect All
                </button>
                <span className="text-xs text-muted-foreground ml-auto">
                  {selectedTenants.size} of {unitTenants.length} selected
                </span>
              </div>
              <div className="space-y-2">
                {unitTenants.map((t, i) => (
                  <label key={i} className={`flex items-center gap-3 px-4 py-3 border rounded-xl cursor-pointer transition-all ${selectedTenants.has(i) ? "border-accent/30 bg-accent-light" : "border-border hover:bg-muted/50"}`}>
                    <input
                      type="checkbox"
                      checked={selectedTenants.has(i)}
                      onChange={() => {
                        const next = new Set(selectedTenants);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        setSelectedTenants(next);
                      }}
                      className="rounded accent-accent"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium">{t.name}</span>
                      {t.email && <span className="text-xs text-muted-foreground ml-2 truncate">{t.email}</span>}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Documents */}
        <div className="bg-card rounded-2xl border border-border p-6 space-y-3" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
              <span className="text-emerald-600 font-bold text-xs">&#8595;</span>
            </div>
            <h2 className="text-sm font-semibold">Documents</h2>
          </div>
          <button
            onClick={async () => {
              const { generateDispositionLetterPDF, downloadPDF } = await import("@/lib/pdf-invoice");
              const logo = await loadLogoBase64();
              const pdfData = buildPdfData(activeInspection, logo);
              if (selectedTenantList.length > 0) {
                pdfData.tenants = selectedTenantList;
              }
              const letterPdf = generateDispositionLetterPDF(pdfData);
              downloadPDF(letterPdf, `DispositionLetter-${activeInspection.unitNumber}-${activeInspection.scheduledDate}.pdf`);
            }}
            disabled={unitTenants.length > 0 && selectedTenants.size === 0}
            className="group block w-full text-left px-4 py-3.5 border border-border rounded-xl hover:bg-muted/50 text-sm disabled:opacity-40 transition-colors"
          >
            <span className="font-medium group-hover:text-accent transition-colors">Generate & Download Disposition Letter</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              {selectedTenantList.length > 0
                ? `Addressed to: ${selectedTenantList.map((t) => t.name).join(", ")}`
                : "CA Civil Code 1950.5 — formal cover letter for tenant"}
            </span>
          </button>
          <button
            onClick={async () => {
              const { generateDepositDeductionPDF, downloadPDF } = await import("@/lib/pdf-invoice");
              const logo = await loadLogoBase64();
              const pdfData = buildPdfData(activeInspection, logo);
              if (selectedTenantList.length > 0) {
                pdfData.tenants = selectedTenantList;
              }
              const deductionPdf = generateDepositDeductionPDF(pdfData);
              downloadPDF(deductionPdf, `MoveOut-${activeInspection.unitNumber}-${activeInspection.scheduledDate}.pdf`);
            }}
            className="group block w-full text-left px-4 py-3.5 border border-border rounded-xl hover:bg-muted/50 text-sm transition-colors"
          >
            <span className="font-medium group-hover:text-accent transition-colors">Download Itemized Deduction Statement</span>
            <span className="block text-xs text-muted-foreground mt-0.5">Forensic assessment with quantified findings and costs</span>
          </button>
          {selectedEmails.length > 0 && (
            <a
              href={`mailto:${selectedEmails.join(",")}?subject=Security Deposit Disposition - ${activeInspection.unitNumber}&body=Dear ${selectedTenantList.map((t) => t.name).join(", ")},%0A%0APlease find attached your Security Deposit Disposition Letter and Itemized Statement of Deductions pursuant to California Civil Code Section 1950.5.%0A%0ASincerely,%0AMoxie Management`}
              className="group block w-full text-left px-4 py-3.5 border border-accent/20 bg-accent-light rounded-xl hover:bg-accent/10 text-sm transition-colors"
            >
              <span className="font-medium text-accent">Send via Email</span>
              <span className="block text-xs text-muted-foreground mt-0.5">
                To: {selectedEmails.join(", ")}
              </span>
            </a>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground text-center">
          Per California Civil Code 1950.5, the itemized statement and remaining deposit must be
          returned to the tenant within 21 calendar days of move-out.
        </p>
      </div>
    );
  }

  return null;
}
