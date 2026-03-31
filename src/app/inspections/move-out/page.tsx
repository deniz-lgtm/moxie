"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { StatusBadge } from "@/components/StatusBadge";
import { SaveIndicator } from "@/components/SaveIndicator";
import { InspectionErrorBoundary } from "@/components/InspectionErrorBoundary";
import { InspectionCamera, type CameraRoom } from "@/components/InspectionCamera";
import { useSaveQueue } from "@/hooks/useSaveQueue";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { enqueueOfflineSave, replayOfflineQueue, getOfflineQueue } from "@/lib/offline-queue";
import { loadLogoBase64 } from "@/lib/pdf-logo";
import { validateImage, compressImage, isHeicFile, convertHeicToJpeg } from "@/lib/image-utils";
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

// Room-specific items that get added on top of defaults
const ROOM_EXTRA_ITEMS: Record<string, string[]> = {
  "Kitchen": ["Appliances", "Kitchen Cabinets", "Countertops", "Sink/Faucet"],
  "Bathroom 1": ["Bathroom Cabinets", "Shower Glass", "Toilet", "Sink/Faucet", "Tub/Shower"],
  "Bathroom 2": ["Bathroom Cabinets", "Shower Glass", "Toilet", "Sink/Faucet", "Tub/Shower"],
  "Exterior": ["Front Door", "Patio/Balcony", "Walkway", "Landscaping", "Parking", "Gate/Fence", "Mailbox", "Trash Area"],
};

function itemsForRoom(roomName: string): InspectionItem[] {
  // Exterior uses its own items only
  if (roomName === "Exterior") {
    return (ROOM_EXTRA_ITEMS["Exterior"] || []).map((item) => blankItem(item));
  }
  const base = DEFAULT_ITEMS.map((item) => blankItem(item));
  const extras = ROOM_EXTRA_ITEMS[roomName];
  if (extras) {
    return [...base, ...extras.map((item) => blankItem(item))];
  }
  return base;
}

function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Calculate total deductions for an inspection (per-photo + item-level) */
function calcDeductions(insp: Inspection): number {
  return insp.rooms.flatMap((r) => r.items).reduce((sum, item) => {
    const photoDed = item.photos
      .filter((p) => p.isDeduction && (p.costEstimate || 0) > 0)
      .reduce((s, p) => s + (p.costEstimate || 0), 0);
    return sum + (photoDed > 0 ? photoDed : item.isDeduction ? item.costEstimate : 0);
  }, 0);
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
  return (
    <InspectionErrorBoundary>
      <MoveOutInspectionContent />
    </InspectionErrorBoundary>
  );
}

function MoveOutInspectionContent() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loadingInspections, setLoadingInspections] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [activeInspection, setActiveInspection] = useState<Inspection | null>(null);
  const [step, setStep] = useState<WizardStep>("select_unit");
  const [showList, setShowList] = useState(true);
  const [unitSearch, setUnitSearch] = useState("");
  const [selectedRoomIdx, setSelectedRoomIdx] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [listSearch, setListSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [pdfError, setPdfError] = useState<string | null>(null);

  // ─── Network status & offline sync ─────────────────
  const { isOnline, wasOffline, clearWasOffline } = useNetworkStatus();
  const [syncingOffline, setSyncingOffline] = useState(false);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);

  // Sync offline queue when connectivity returns
  useEffect(() => {
    if (wasOffline && isOnline) {
      clearWasOffline();
      const queue = getOfflineQueue();
      if (queue.length > 0) {
        setSyncingOffline(true);
        setOfflineQueueCount(queue.length);
        replayOfflineQueue().then(({ succeeded }) => {
          setSyncingOffline(false);
          setOfflineQueueCount(getOfflineQueue().length);
          if (succeeded > 0) {
            console.log(`[MoveOut] Synced ${succeeded} offline changes`);
          }
        });
      }
    }
  }, [wasOffline, isOnline, clearWasOffline]);

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

  // ─── Save queue with retry & debounce ──────────────
  const { queueSave, saveStatus, isDirty, flushSave, lastError, retrySave } = useSaveQueue<Inspection>({
    saveFn: async (insp) => {
      const body = JSON.stringify({ inspection: insp });

      // If offline, queue locally and return success
      if (!navigator.onLine) {
        enqueueOfflineSave({ endpoint: "/api/inspections/crud", method: "POST", body });
        setOfflineQueueCount(getOfflineQueue().length);
        return;
      }

      const res = await fetch("/api/inspections/crud", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Network error" }));
        throw new Error(err.error || `Save failed (${res.status})`);
      }
    },
    debounceMs: 500,
    maxRetries: 3,
  });

  // Warn before closing tab with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (isDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Load inspections from API + fetch units + auto-populate
  useEffect(() => {
    async function loadData() {
      try {
        // Fetch inspections and units in parallel
        const [inspRes, unitsRes] = await Promise.all([
          fetch("/api/inspections/crud?type=move_out").then((r) => r.json()),
          fetch("/api/appfolio/units").then((r) => r.json()),
        ]);

        const existingInspections: Inspection[] = inspRes.inspections || [];
        const fetchedUnits: Unit[] = unitsRes.units || [];
        setUnits(fetchedUnits);

        // Auto-populate for units moving out 2026-07-31
        const existingUnitIds = new Set(existingInspections.map((i: Inspection) => i.unitId));
        const moveOutUnits = fetchedUnits.filter((u: Unit) => {
          if (!u.leaseTo || existingUnitIds.has(u.id)) return false;
          const raw = u.leaseTo.trim();
          if (raw === "2026-07-31" || raw === "07/31/2026" || raw === "7/31/2026") return true;
          const parts = raw.includes("/")
            ? raw.split("/").map(Number)
            : raw.split("-").map(Number);
          if (raw.includes("/")) return parts[2] === 2026 && parts[0] === 7 && parts[1] === 31;
          return parts[0] === 2026 && parts[1] === 7 && parts[2] === 31;
        });

        if (moveOutUnits.length === 0) {
          if (existingInspections.length === 0) {
            const withLease = fetchedUnits.filter((u: Unit) => u.leaseTo);
            const sampleDates = [...new Set(withLease.map((u: Unit) => u.leaseTo))].slice(0, 10);
            console.log("[MoveOut] No units matched 2026-07-31. Sample leaseTo values:", sampleDates);
          }
          setInspections(existingInspections);
          setLoadingInspections(false);
          return;
        }

        // Create new inspections for unmatched units
        const newInspections: Inspection[] = moveOutUnits.map((unit: Unit) => ({
          id: crypto.randomUUID(),
          unitId: unit.id,
          propertyId: unit.propertyId,
          unitNumber: unit.unitName || unit.displayName,
          propertyName: unit.propertyName,
          type: "move_out" as const,
          status: "not_started" as const,
          scheduledDate: "2026-07-31",
          inspector: "Moxie Management",
          rooms: [],
          floorPlanUrl: null,
          overallNotes: "",
          invoiceUrl: null,
          invoiceTotal: null,
          tenantName: [unit.tenant, unit.additionalTenants].filter(Boolean).join(", ") || null,
          tenantEmail: null,
          depositAmount: unit.deposit || null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }));

        // Bulk create via API
        await fetch("/api/inspections/crud", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inspections: newInspections }),
        });

        setInspections([...existingInspections, ...newInspections]);
      } catch (err) {
        console.error("[MoveOut] Failed to load data:", err);
      } finally {
        setLoadingInspections(false);
      }
    }
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  function saveInspection(insp: Inspection) {
    const updated = inspections.map((i) => (i.id === insp.id ? insp : i));
    if (!inspections.find((i) => i.id === insp.id)) updated.push(insp);
    setInspections(updated);
    setActiveInspection(insp);
    queueSave(insp);
  }

  function deleteInspection(id: string) {
    const updated = inspections.filter((i) => i.id !== id);
    setInspections(updated);
    if (activeInspection?.id === id) {
      setActiveInspection(null);
      setShowList(true);
    }
    fetch(`/api/inspections/crud?id=${id}`, { method: "DELETE" })
      .catch((err) => console.error("[MoveOut] Delete failed:", err));
  }

  function startNewInspection() {
    const unit = units.find((u) => u.id === newForm.unitId);
    const errors: Record<string, string> = {};

    if (!unit) errors.unitId = "Please select a unit";
    if (!newForm.inspector.trim()) errors.inspector = "Inspector name is required";
    if (newForm.depositAmount < 0) errors.depositAmount = "Deposit cannot be negative";

    // Duplicate guard
    if (unit) {
      const existing = inspections.find((i) => i.unitId === unit.id);
      if (existing && !confirm(`This unit already has a move-out inspection (${existing.status}). Create another?`)) {
        return;
      }
    }

    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;
    if (!unit) return;

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
      tenantName: [unit.tenant, unit.additionalTenants].filter(Boolean).join(", ") || null,
      tenantEmail: null,
      depositAmount: newForm.depositAmount || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveInspection(insp);
    setStep("floor_plan");
    setShowList(false);
  }

  async function handleFloorPlanUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeInspection || !e.target.files?.[0]) return;
    const file = e.target.files[0];

    // Validate file
    const validation = validateImage(file);
    if (!validation.valid) {
      setUploadError(validation.error);
      return;
    }
    setUploadError(null);

    try {
      // Convert HEIC if needed, then compress
      let dataUrl: string;
      if (isHeicFile(file)) {
        const converted = await convertHeicToJpeg(file);
        if (converted.startsWith("blob:")) {
          const resp = await fetch(converted);
          const blob = await resp.blob();
          dataUrl = await compressImage(new File([blob], "plan.jpg", { type: "image/jpeg" }), 1920, 0.8);
          URL.revokeObjectURL(converted);
        } else {
          dataUrl = converted;
        }
      } else {
        dataUrl = await compressImage(file, 1920, 0.8);
      }

      // Upload floor plan to storage
      let floorPlanUrl = dataUrl;
      try {
        const uploadRes = await fetch("/api/inspections/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, inspectionId: activeInspection.id, type: "floor_plan" }),
        });
        const uploadData = await uploadRes.json();
        if (uploadData.url) floorPlanUrl = uploadData.url;
      } catch {
        // Keep compressed data URL as fallback
      }

      const updated = {
        ...activeInspection,
        floorPlanUrl,
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
          const detectedRooms = data.rooms.map((name: string) => ({
            id: newId(),
            name,
            items: itemsForRoom(name),
          }));
          // Always add Exterior if not detected
          if (!data.rooms.some((n: string) => n.toLowerCase() === "exterior")) {
            detectedRooms.push({ id: newId(), name: "Exterior", items: itemsForRoom("Exterior") });
          }
          updated.rooms = detectedRooms;
        }
      } catch {
        // Fall back to default rooms
        updated.rooms = [
          "Living Room", "Kitchen", "Bedroom 1", "Bedroom 2",
          "Bathroom 1", "Bathroom 2", "Hallway", "Closet", "Exterior",
        ].map((name) => ({
          id: newId(),
          name,
          items: itemsForRoom(name),
        }));
      }

      saveInspection(updated);
    } catch (err) {
      setUploadError("Failed to process image. Please try again.");
      console.error("[MoveOut] Floor plan processing failed:", err);
    }
  }

  function skipFloorPlan() {
    if (!activeInspection) return;
    const updated = {
      ...activeInspection,
      rooms: [
        "Living Room", "Kitchen", "Bedroom 1", "Bedroom 2",
        "Bathroom 1", "Bathroom 2", "Hallway", "Closet", "Exterior",
      ].map((name) => ({
        id: newId(),
        name,
        items: itemsForRoom(name),
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
        { id: newId(), name, items: itemsForRoom(name) },
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
    const room = activeInspection.rooms[roomIdx];
    const hasPhotos = room.items.some((i) => i.photos.length > 0);
    if (hasPhotos && !confirm(`"${room.name}" has photos. Remove this room and all its data?`)) return;
    const rooms = activeInspection.rooms.filter((_, i) => i !== roomIdx);
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
    if (selectedRoomIdx >= rooms.length) setSelectedRoomIdx(Math.max(0, rooms.length - 1));
  }

  function updateItem(roomIdx: number, itemIdx: number, field: string, value: any) {
    if (!activeInspection) return;
    const rooms = [...activeInspection.rooms];
    const items = [...rooms[roomIdx].items];
    const oldItem = items[itemIdx];

    // Track edits to deduction-related fields during review steps
    const trackableFields = ["costEstimate", "isDeduction", "condition"];
    if (trackableFields.includes(field) && (step === "ai_review" || step === "team_review") && oldItem[field as keyof typeof oldItem] !== value) {
      const history = [...(oldItem.editHistory || [])];
      history.push({
        field,
        from: oldItem[field as keyof typeof oldItem] as any,
        to: value,
        editor: activeInspection.inspector,
        timestamp: new Date().toISOString(),
      });
      items[itemIdx] = { ...oldItem, [field]: value, editHistory: history };
    } else {
      items[itemIdx] = { ...oldItem, [field]: value };
    }

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

  function updatePhoto(roomIdx: number, itemIdx: number, photoIdx: number, field: string, value: any) {
    if (!activeInspection) return;
    const rooms = [...activeInspection.rooms];
    const items = [...rooms[roomIdx].items];
    const photos = [...items[itemIdx].photos];
    photos[photoIdx] = { ...photos[photoIdx], [field]: value };
    // Auto-mark deduction if condition is poor/damaged
    if (field === "condition" && (value === "poor" || value === "damaged")) {
      photos[photoIdx].isDeduction = true;
    }
    items[itemIdx] = { ...items[itemIdx], photos };
    rooms[roomIdx] = { ...rooms[roomIdx], items };
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
  }

  function removePhoto(roomIdx: number, itemIdx: number, photoIdx: number) {
    if (!activeInspection) return;
    const rooms = [...activeInspection.rooms];
    const items = [...rooms[roomIdx].items];
    items[itemIdx] = { ...items[itemIdx], photos: items[itemIdx].photos.filter((_, i) => i !== photoIdx) };
    rooms[roomIdx] = { ...rooms[roomIdx], items };
    saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
  }

  async function handlePhotoUpload(roomIdx: number, itemIdx: number, e: React.ChangeEvent<HTMLInputElement>) {
    if (!activeInspection || !e.target.files?.length) return;
    const file = e.target.files[0];

    // Validate
    const validation = validateImage(file);
    if (!validation.valid) {
      setUploadError(validation.error);
      return;
    }
    setUploadError(null);

    try {
      // Convert HEIC if needed, then compress
      let dataUrl: string;
      if (isHeicFile(file)) {
        const converted = await convertHeicToJpeg(file);
        if (converted.startsWith("blob:")) {
          const resp = await fetch(converted);
          const blob = await resp.blob();
          dataUrl = await compressImage(new File([blob], "photo.jpg", { type: "image/jpeg" }), 1920, 0.8);
          URL.revokeObjectURL(converted);
        } else {
          dataUrl = converted;
        }
      } else {
        dataUrl = await compressImage(file, 1920, 0.8);
      }
      const photoId = newId();

      // Upload to storage
      let photoUrl = dataUrl;
      try {
        const uploadRes = await fetch("/api/inspections/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, inspectionId: activeInspection.id, photoId }),
        });
        const uploadData = await uploadRes.json();
        if (uploadData.url) photoUrl = uploadData.url;
      } catch {
        // Keep compressed data URL as fallback
      }

      const photo: InspectionPhoto = {
        id: photoId,
        url: photoUrl,
        aiAnalysis: null,
        createdAt: new Date().toISOString(),
      };
      const rooms = [...activeInspection.rooms];
      const items = [...rooms[roomIdx].items];
      items[itemIdx] = { ...items[itemIdx], photos: [...items[itemIdx].photos, photo] };
      rooms[roomIdx] = { ...rooms[roomIdx], items };
      saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
    } catch (err) {
      setUploadError("Failed to process photo. Please try again.");
      console.error("[MoveOut] Photo processing failed:", err);
    }
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

  // AI analysis state
  const [analysisProgress, setAnalysisProgress] = useState<{ current: number; total: number; label: string } | null>(null);
  const [failedAnalyses, setFailedAnalyses] = useState<{ roomIdx: number; itemIdx: number }[]>([]);

  async function endWalkAndAnalyze() {
    if (!activeInspection) return;

    // Check that at least one photo has been taken
    const totalPhotos = activeInspection.rooms.reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.photos.length, 0), 0);
    if (totalPhotos === 0) {
      setUploadError("Take at least one photo before ending the walk.");
      return;
    }
    setUploadError(null);

    setAnalyzing(true);
    setFailedAnalyses([]);

    const rooms = [...activeInspection.rooms];
    const failed: { roomIdx: number; itemIdx: number }[] = [];

    // Count ALL individual photos for progress
    const allPhotos: { ri: number; ii: number; pi: number }[] = [];
    for (let ri = 0; ri < rooms.length; ri++) {
      for (let ii = 0; ii < rooms[ri].items.length; ii++) {
        for (let pi = 0; pi < rooms[ri].items[ii].photos.length; pi++) {
          allPhotos.push({ ri, ii, pi });
        }
      }
    }

    // Analyze every photo individually
    for (let idx = 0; idx < allPhotos.length; idx++) {
      const { ri, ii, pi } = allPhotos[idx];
      const item = rooms[ri].items[ii];
      const photo = item.photos[pi];
      setAnalysisProgress({
        current: idx + 1,
        total: allPhotos.length,
        label: `${rooms[ri].name} — ${item.item} (photo ${pi + 1})`,
      });

      try {
        const res = await fetch("/api/inspections/analyze-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoBase64: photo.url,
            roomName: rooms[ri].name,
            itemName: item.item,
          }),
        });
        const analysis = await res.json();

        if (analysis.condition) {
          // Set per-photo metadata
          rooms[ri].items[ii].photos[pi] = {
            ...photo,
            aiAnalysis: analysis.description,
            condition: analysis.condition,
            notes: analysis.description || "",
            costEstimate: analysis.total_estimated_cost || 0,
            isDeduction: (analysis.total_estimated_cost || 0) > 0,
            aiOriginalCondition: analysis.condition,
            aiOriginalCost: analysis.total_estimated_cost || 0,
          };
          // Also set item-level condition from first photo if not set
          if (pi === 0) {
            rooms[ri].items[ii] = {
              ...rooms[ri].items[ii],
              condition: analysis.condition,
              aiOriginalCondition: analysis.condition,
              editHistory: [],
            };
          }
        } else if (pi === 0) {
          // Only track failure at item level for progress/retry
          failed.push({ roomIdx: ri, itemIdx: ii });
        }
      } catch {
        if (pi === 0) {
          failed.push({ roomIdx: ri, itemIdx: ii });
        }
      }

      // Incremental save after each photo
      saveInspection({
        ...activeInspection,
        rooms,
        updatedAt: new Date().toISOString(),
      });
    }

    setFailedAnalyses(failed);
    setAnalysisProgress(null);

    saveInspection({
      ...activeInspection,
      rooms,
      status: "ai_review",
      updatedAt: new Date().toISOString(),
    });
    setStep("ai_review");
    setAnalyzing(false);
  }

  async function retryFailedAnalysis(roomIdx: number, itemIdx: number) {
    if (!activeInspection) return;
    const rooms = [...activeInspection.rooms];
    const item = rooms[roomIdx].items[itemIdx];
    if (item.photos.length === 0) return;

    let anySuccess = false;
    // Retry all photos in this item
    for (let pi = 0; pi < item.photos.length; pi++) {
      const photo = item.photos[pi];
      if (photo.aiAnalysis) continue; // Already analyzed
      try {
        const res = await fetch("/api/inspections/analyze-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            photoBase64: photo.url,
            roomName: rooms[roomIdx].name,
            itemName: item.item,
          }),
        });
        const analysis = await res.json();
        if (analysis.condition) {
          rooms[roomIdx].items[itemIdx].photos[pi] = {
            ...photo,
            aiAnalysis: analysis.description,
            condition: analysis.condition,
            notes: analysis.description || "",
            costEstimate: analysis.total_estimated_cost || 0,
            isDeduction: (analysis.total_estimated_cost || 0) > 0,
            aiOriginalCondition: analysis.condition,
            aiOriginalCost: analysis.total_estimated_cost || 0,
          };
          if (pi === 0) {
            rooms[roomIdx].items[itemIdx].condition = analysis.condition;
          }
          anySuccess = true;
        }
      } catch {
        // Still failed for this photo
      }
    }
    if (anySuccess) {
      setFailedAnalyses((prev) => prev.filter((f) => !(f.roomIdx === roomIdx && f.itemIdx === itemIdx)));
      saveInspection({ ...activeInspection, rooms, updatedAt: new Date().toISOString() });
    }
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

      const totalDed = calcDeductions(activeInspection);

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
      setPdfError("PDF generation failed. Please try again.");
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
              condition: p.condition,
              notes: p.notes,
              cost_estimate: p.costEstimate,
              is_deduction: p.isDeduction,
              ai_original_cost: p.aiOriginalCost,
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
  // Total deductions: sum item-level + per-photo deductions
  const totalDeductions = activeInspection
    ? calcDeductions(activeInspection)
    : 0;

  const filteredUnits = unitSearch
    ? units.filter((u) => u.unitName.toLowerCase().includes(unitSearch.toLowerCase()))
    : units;

  // ─── List view ────────────────────────────────────

  if (loadingInspections && showList && !activeInspection) {
    return (
      <div className="space-y-6">
        <div>
          <Link href="/inspections" className="text-xs font-medium text-accent hover:underline">&larr; All Inspections</Link>
          <h1 className="text-2xl font-bold tracking-tight mt-1">Move-Out Inspections</h1>
        </div>
        {/* Skeleton loading state */}
        <div className="bg-card rounded-2xl border border-border p-5 animate-pulse" style={{ boxShadow: "var(--shadow-sm)" }}>
          <div className="flex justify-between mb-3">
            <div className="h-4 w-20 bg-muted rounded" />
            <div className="h-4 w-10 bg-muted rounded" />
          </div>
          <div className="w-full bg-muted rounded-full h-2.5 mb-4" />
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="text-center py-2">
                <div className="h-8 w-12 bg-muted rounded mx-auto mb-1" />
                <div className="h-3 w-16 bg-muted rounded mx-auto" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-card rounded-xl border border-border p-4 animate-pulse" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div className="flex items-center justify-between">
                <div className="space-y-2 flex-1">
                  <div className="h-4 w-32 bg-muted rounded" />
                  <div className="h-3 w-48 bg-muted rounded" />
                </div>
                <div className="h-6 w-20 bg-muted rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (showList && !activeInspection) {
    const completedCount = inspections.filter((i) => i.status === "completed").length;
    const notStartedCount = inspections.filter((i) => i.status === "not_started").length;
    const inProgressCount = inspections.filter((i) => i.status !== "completed" && i.status !== "not_started").length;
    const totalCount = inspections.length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    // Get unique property names for filter dropdown
    const propertyNames = [...new Set(inspections.map((i) => i.propertyName))].sort();

    // Apply filters
    let filtered = inspections;
    if (statusFilter !== "all") {
      if (statusFilter === "in_progress") {
        filtered = filtered.filter((i) => !["completed", "not_started"].includes(i.status));
      } else {
        filtered = filtered.filter((i) => i.status === statusFilter);
      }
    }
    if (propertyFilter !== "all") {
      filtered = filtered.filter((i) => i.propertyName === propertyFilter);
    }
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      filtered = filtered.filter((i) =>
        i.unitNumber.toLowerCase().includes(q) ||
        (i.tenantName || "").toLowerCase().includes(q) ||
        i.propertyName.toLowerCase().includes(q)
      );
    }

    // Sort: in-progress first, then not_started, then completed
    const statusOrder: Record<string, number> = { walking: 0, ai_review: 0, team_review: 0, draft: 0, not_started: 1, completed: 2 };
    const sortedInspections = [...filtered].sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1));

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
              <button onClick={() => setStatusFilter(statusFilter === "completed" ? "all" : "completed")} className={`rounded-xl py-2 transition-colors ${statusFilter === "completed" ? "bg-green-50 ring-1 ring-green-200" : "hover:bg-muted/50"}`}>
                <p className="text-2xl font-bold tracking-tight text-green-600">{completedCount}</p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Completed</p>
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "in_progress" ? "all" : "in_progress")} className={`rounded-xl py-2 transition-colors ${statusFilter === "in_progress" ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-muted/50"}`}>
                <p className="text-2xl font-bold tracking-tight text-blue-600">{inProgressCount}</p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">In Progress</p>
              </button>
              <button onClick={() => setStatusFilter(statusFilter === "not_started" ? "all" : "not_started")} className={`rounded-xl py-2 transition-colors ${statusFilter === "not_started" ? "bg-slate-100 ring-1 ring-slate-300" : "hover:bg-muted/50"}`}>
                <p className="text-2xl font-bold tracking-tight text-slate-500">{notStartedCount}</p>
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Not Started</p>
              </button>
            </div>
          </div>
        )}

        {/* Search and filters */}
        {totalCount > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                placeholder="Search unit, tenant, or property..."
                value={listSearch}
                onChange={(e) => setListSearch(e.target.value)}
                className="w-full text-sm border border-border rounded-xl px-3.5 py-2 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              />
            </div>
            {propertyNames.length > 1 && (
              <select
                value={propertyFilter}
                onChange={(e) => setPropertyFilter(e.target.value)}
                className="text-sm border border-border rounded-xl px-3 py-2 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              >
                <option value="all">All Properties</option>
                {propertyNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            )}
            {(statusFilter !== "all" || propertyFilter !== "all" || listSearch) && (
              <button
                onClick={() => { setStatusFilter("all"); setPropertyFilter("all"); setListSearch(""); }}
                className="text-xs font-medium text-accent hover:underline"
              >
                Clear filters
              </button>
            )}
            <span className="text-xs text-muted-foreground">
              {sortedInspections.length} of {totalCount}
            </span>
          </div>
        )}

        {totalCount > 0 ? (
          <div>
            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Unit</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Property</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tenant</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deposit</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Deductions</th>
                    <th className="w-10"></th>
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
                            setNewForm({ unitId: insp.unitId, inspector: insp.inspector, scheduledDate: insp.scheduledDate, depositAmount: insp.depositAmount || 0 });
                            setStep("floor_plan");
                            saveInspection({ ...insp, status: "draft" as const, updatedAt: new Date().toISOString() });
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
                        <td className="px-4 py-3.5">
                          <StatusBadge
                            value={insp.status}
                            options={["not_started", "draft", "walking", "ai_review", "team_review", "completed"]}
                            onChange={(newStatus) => {
                              const updated = { ...insp, status: newStatus as Inspection["status"], updatedAt: new Date().toISOString() };
                              if (newStatus === "completed" && !insp.completedDate) updated.completedDate = new Date().toISOString().split("T")[0];
                              saveInspection(updated);
                            }}
                          />
                        </td>
                        <td className="px-4 py-3.5 font-medium">{ded > 0 ? `$${ded.toLocaleString()}` : "—"}</td>
                        <td className="px-2 py-3.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); if (confirm(`Delete inspection for ${insp.unitNumber}?`)) deleteInspection(insp.id); }}
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-2">
              {sortedInspections.map((insp) => {
                const ded = calcDeductions(insp);
                return (
                  <div
                    key={insp.id}
                    onClick={() => {
                      setActiveInspection(insp);
                      setShowList(false);
                      if (insp.status === "not_started") {
                        setNewForm({ unitId: insp.unitId, inspector: insp.inspector, scheduledDate: insp.scheduledDate, depositAmount: insp.depositAmount || 0 });
                        setStep("floor_plan");
                        saveInspection({ ...insp, status: "draft" as const, updatedAt: new Date().toISOString() });
                      } else {
                        setStep(insp.status === "completed" ? "completed" : insp.status === "team_review" ? "team_review" : insp.status === "ai_review" ? "ai_review" : insp.status === "walking" ? "walking" : "floor_plan");
                      }
                    }}
                    className="bg-card rounded-xl border border-border p-3.5 active:bg-muted/50 transition-colors cursor-pointer"
                    style={{ boxShadow: "var(--shadow-sm)" }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{insp.unitNumber}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{insp.propertyName}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <StatusBadge
                          value={insp.status}
                          options={["not_started", "draft", "walking", "ai_review", "team_review", "completed"]}
                          onChange={(newStatus) => {
                            const updated = { ...insp, status: newStatus as Inspection["status"], updatedAt: new Date().toISOString() };
                            if (newStatus === "completed" && !insp.completedDate) updated.completedDate = new Date().toISOString().split("T")[0];
                            saveInspection(updated);
                          }}
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); if (confirm(`Delete ${insp.unitNumber}?`)) deleteInspection(insp.id); }}
                          className="p-1 rounded-lg text-muted-foreground hover:text-red-600"
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                      <span className="truncate flex-1">{insp.tenantName || "No tenant"}</span>
                      {insp.depositAmount ? <span className="shrink-0">${insp.depositAmount.toLocaleString()}</span> : null}
                      {ded > 0 && <span className="shrink-0 text-red-600 font-medium">-${ded.toLocaleString()}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {sortedInspections.length === 0 && (
              <div className="text-center py-10 bg-card rounded-2xl border border-border" style={{ boxShadow: "var(--shadow-sm)" }}>
                <p className="text-sm text-muted-foreground">No inspections match your filters</p>
                <button
                  onClick={() => { setStatusFilter("all"); setPropertyFilter("all"); setListSearch(""); }}
                  className="text-xs font-medium text-accent hover:underline mt-1"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-16 bg-card rounded-2xl border border-border" style={{ boxShadow: "var(--shadow-sm)" }}>
            <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-accent">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </div>
            <p className="text-sm font-semibold">No move-out inspections yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
              Start your first inspection to walk a unit, capture photos, and generate CA-compliant deposit deduction documents.
            </p>
            <button
              onClick={() => { setShowList(false); setStep("select_unit"); }}
              className="mt-4 px-4 py-2 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent-hover transition-colors shadow-sm"
            >
              + Start First Inspection
            </button>
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
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">Start Move-Out Inspection</h1>
            <SaveIndicator status={saveStatus} onRetry={retrySave} />
          </div>
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
                    onChange={(e) => { setNewForm({ ...newForm, inspector: e.target.value }); setFormErrors((prev) => { const n = { ...prev }; delete n.inspector; return n; }); }}
                    className={`w-full text-sm border rounded-xl px-3.5 py-2.5 bg-card focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors ${formErrors.inspector ? "border-red-300" : "border-border"}`}
                  />
                  {formErrors.inspector && <p className="text-xs text-red-500 mt-1">{formErrors.inspector}</p>}
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Upload Floor Plan</h1>
          <SaveIndicator status={saveStatus} onRetry={retrySave} />
        </div>
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
              accept="image/*,.heic,.heif"
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
        <div className="space-y-3">
          <div>
            <button onClick={() => { setShowList(true); setActiveInspection(null); }} className="text-sm text-accent hover:underline">
              &larr; Back to list
            </button>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold">
                {activeInspection.unitNumber}
              </h1>
              <StatusBadge value={activeInspection.status} />
              <SaveIndicator status={saveStatus} onRetry={retrySave} />
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isReview ? "Review AI analysis and edit costs" : "Photos and conditions for each room"}
            </p>
            {analyzing && analysisProgress && (
              <p className="text-xs text-accent mt-1">
                Analyzing: {analysisProgress.label}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {step === "walking" && (
              <>
                <button
                  onClick={() => setShowCamera(true)}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-[#9d1535] text-white text-sm font-medium rounded-xl hover:bg-[#b91c42] flex items-center justify-center gap-1.5"
                >
                  Camera Walk
                </button>
                <button
                  onClick={endWalkAndAnalyze}
                  disabled={analyzing}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90 disabled:opacity-50"
                >
                  {analyzing && analysisProgress
                    ? `Analyzing ${analysisProgress.current}/${analysisProgress.total}...`
                    : analyzing
                    ? "Starting analysis..."
                    : "End Walk & Analyze"}
                </button>
              </>
            )}
            {step === "ai_review" && (
              <button
                onClick={moveToTeamReview}
                className="w-full sm:w-auto px-4 py-2.5 bg-accent text-white text-sm font-medium rounded-xl hover:bg-accent/90"
              >
                Send to Team Review &rarr;
              </button>
            )}
            {step === "team_review" && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => { setPdfError(null); completeAndGeneratePDF(); }}
                  disabled={generatingPDF}
                  className="w-full sm:w-auto px-4 py-2.5 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 disabled:opacity-50"
                >
                  {generatingPDF ? "Generating PDF..." : "Complete & Generate Invoice"}
                </button>
                {pdfError && (
                  <p className="text-xs text-red-500 font-medium">{pdfError}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Failed analysis banner */}
        {isReview && failedAnalyses.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-amber-800 font-medium">
                {failedAnalyses.length} item{failedAnalyses.length !== 1 ? "s" : ""} failed AI analysis — review manually or retry
              </p>
              <button
                onClick={() => failedAnalyses.forEach((f) => retryFailedAnalysis(f.roomIdx, f.itemIdx))}
                className="text-xs font-medium text-accent hover:underline shrink-0 ml-3"
              >
                Retry All
              </button>
            </div>
          </div>
        )}

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

        {/* Offline banner */}
        {!isOnline && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 shrink-0"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>
            <p className="text-sm text-amber-800 font-medium">
              You&apos;re offline — changes are saved locally and will sync when reconnected
            </p>
          </div>
        )}

        {/* Syncing banner */}
        {syncingOffline && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-center gap-2">
            <div className="w-3.5 h-3.5 border-[1.5px] border-blue-400/30 border-t-blue-500 rounded-full animate-spin shrink-0" />
            <p className="text-sm text-blue-800 font-medium">
              Syncing {offlineQueueCount} pending change{offlineQueueCount !== 1 ? "s" : ""}...
            </p>
          </div>
        )}

        {/* Upload error banner */}
        {uploadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
            <p className="text-sm text-red-700">{uploadError}</p>
            <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 ml-3 shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        )}

        {/* Room tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
          {activeInspection.rooms.map((room, idx) => (
            <button
              key={room.id}
              onClick={() => setSelectedRoomIdx(idx)}
              className={`shrink-0 px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border transition-colors snap-start ${
                selectedRoomIdx === idx
                  ? "bg-accent text-white border-accent shadow-sm"
                  : "border-border hover:bg-muted"
              }`}
            >
              {room.name}
              {room.items.some((i) => i.isDeduction) && (
                <span className="ml-1 text-[10px] text-red-300">!</span>
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
                <div key={item.id} className="p-3 sm:p-4 space-y-2">
                  {/* Item header */}
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium flex-1 min-w-0 truncate">{item.item}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <select
                        value={item.condition}
                        onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "condition", e.target.value)}
                        className="text-xs border border-border rounded-lg px-2 py-1.5 bg-card min-w-[90px]"
                      >
                        <option value="">Condition</option>
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                        ))}
                      </select>
                      <label className="px-2.5 py-1.5 text-xs font-medium text-accent bg-accent/5 rounded-lg cursor-pointer hover:bg-accent/10 transition-colors whitespace-nowrap">
                        + Photo
                        <input
                          type="file"
                          accept="image/*,.heic,.heif"
                          capture="environment"
                          className="hidden"
                          onChange={(e) => handlePhotoUpload(selectedRoomIdx, itemIdx, e)}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Item-level notes */}
                  <input
                    type="text"
                    placeholder="Item notes..."
                    value={item.notes}
                    onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "notes", e.target.value)}
                    className="w-full text-xs border border-border rounded-lg px-2.5 py-2 bg-card"
                  />

                  {/* Per-photo cards */}
                  {item.photos.length > 0 && (
                    <div className="space-y-2 pl-2 border-l-2 border-border/50">
                      {item.photos.map((photo, photoIdx) => (
                        <div key={photo.id} className={`rounded-lg border p-2 space-y-1.5 ${photo.isDeduction ? "border-red-200 bg-red-50/30" : "border-border bg-card"}`}>
                          <div className="flex gap-2">
                            {/* Thumbnail */}
                            <a href={photo.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              <img
                                src={photo.url}
                                alt=""
                                className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-md border border-border"
                              />
                            </a>
                            {/* Photo metadata */}
                            <div className="flex-1 min-w-0 space-y-1">
                              {/* AI analysis text */}
                              {photo.aiAnalysis && (
                                <p className="text-[10px] text-muted-foreground italic line-clamp-2">AI: {photo.aiAnalysis}</p>
                              )}
                              {/* Per-photo condition */}
                              {isReview && (
                                <select
                                  value={photo.condition || ""}
                                  onChange={(e) => updatePhoto(selectedRoomIdx, itemIdx, photoIdx, "condition", e.target.value)}
                                  className="text-[11px] border border-border rounded px-1.5 py-1 bg-card w-full"
                                >
                                  <option value="">Condition</option>
                                  {CONDITIONS.map((c) => (
                                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                                  ))}
                                </select>
                              )}
                              {/* Per-photo notes */}
                              <input
                                type="text"
                                placeholder="Photo notes..."
                                value={photo.notes || ""}
                                onChange={(e) => updatePhoto(selectedRoomIdx, itemIdx, photoIdx, "notes", e.target.value)}
                                className="w-full text-[11px] border border-border rounded px-1.5 py-1 bg-card"
                              />
                              {/* Per-photo deduction controls (review only) */}
                              {isReview && (
                                <div className="flex items-center gap-1.5">
                                  <label className="flex items-center gap-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={photo.isDeduction || false}
                                      onChange={(e) => updatePhoto(selectedRoomIdx, itemIdx, photoIdx, "isDeduction", e.target.checked)}
                                      className="rounded w-3 h-3"
                                    />
                                    <span className="text-[10px] text-muted-foreground">Deduct</span>
                                  </label>
                                  <input
                                    type="number"
                                    placeholder="$0"
                                    value={photo.costEstimate || ""}
                                    onChange={(e) => updatePhoto(selectedRoomIdx, itemIdx, photoIdx, "costEstimate", parseFloat(e.target.value) || 0)}
                                    className="w-20 text-[11px] text-right border border-border rounded px-1.5 py-1 bg-card"
                                  />
                                  {photo.aiOriginalCost !== undefined && (photo.costEstimate || 0) !== photo.aiOriginalCost && (
                                    <span className="text-[9px] text-amber-600">AI: ${photo.aiOriginalCost}</span>
                                  )}
                                </div>
                              )}
                            </div>
                            {/* Remove button */}
                            {!isReview && (
                              <button
                                onClick={() => removePhoto(selectedRoomIdx, itemIdx, photoIdx)}
                                className="self-start p-1 text-muted-foreground hover:text-red-500 shrink-0"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Failed analysis retry */}
                  {isReview && item.photos.length > 0 && !item.photos[0]?.aiAnalysis && failedAnalyses.some((f) => f.roomIdx === selectedRoomIdx && f.itemIdx === itemIdx) && (
                    <button
                      onClick={() => retryFailedAnalysis(selectedRoomIdx, itemIdx)}
                      className="text-xs text-amber-600 hover:text-amber-700 font-medium"
                    >
                      AI analysis failed — tap to retry
                    </button>
                  )}

                  {/* Item-level deduction (fallback when no per-photo deductions) */}
                  {isReview && !item.photos.some((p) => p.isDeduction) && (
                    <div className="flex flex-wrap gap-2">
                      <label className="flex items-center gap-1.5 px-2 py-1.5 border border-border rounded-lg cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.isDeduction}
                          onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "isDeduction", e.target.checked)}
                          className="rounded"
                        />
                        <span className="text-xs text-muted-foreground">Deduct (item-level)</span>
                      </label>
                      {item.isDeduction && (
                        <input
                          type="number"
                          placeholder="$0"
                          value={item.costEstimate || ""}
                          onChange={(e) => updateItem(selectedRoomIdx, itemIdx, "costEstimate", parseFloat(e.target.value) || 0)}
                          className="w-24 text-xs text-right border border-border rounded-lg px-2.5 py-2 bg-card"
                        />
                      )}
                    </div>
                  )}

                  {/* Audit trail */}
                  {isReview && item.editHistory && item.editHistory.length > 0 && (
                    <details className="mt-1">
                      <summary className="text-[10px] text-amber-600 font-medium cursor-pointer hover:text-amber-700">
                        Edited ({item.editHistory.length} change{item.editHistory.length !== 1 ? "s" : ""})
                      </summary>
                      <div className="mt-1 space-y-0.5 pl-2 border-l-2 border-amber-200">
                        {item.editHistory.map((edit, ei) => (
                          <p key={ei} className="text-[10px] text-muted-foreground">
                            <span className="font-medium">{edit.field}</span>: {String(edit.from)} &rarr; {String(edit.to)}
                            <span className="ml-1">by {edit.editor}</span>
                          </p>
                        ))}
                      </div>
                    </details>
                  )}
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

        {/* Photo Evidence Gallery */}
        {(() => {
          const allPhotos = activeInspection.rooms.flatMap((room) =>
            room.items.flatMap((item) =>
              item.photos.map((photo) => ({
                ...photo,
                roomName: room.name,
                itemName: item.item,
                condition: item.condition,
                isDeduction: item.isDeduction,
                costEstimate: item.costEstimate,
              }))
            )
          );

          if (allPhotos.length === 0) return null;

          return (
            <div className="bg-card rounded-2xl border border-border p-6 space-y-4" style={{ boxShadow: "var(--shadow-sm)" }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-600"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </div>
                  <h2 className="text-sm font-semibold">Photo Evidence</h2>
                  <span className="text-xs text-muted-foreground">{allPhotos.length} photos</span>
                </div>
              </div>

              {activeInspection.rooms.map((room) => {
                const roomPhotos = room.items.flatMap((item) =>
                  item.photos.map((p) => ({ photo: p, item }))
                );
                if (roomPhotos.length === 0) return null;

                return (
                  <div key={room.id}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{room.name}</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                      {roomPhotos.map(({ photo, item }) => (
                        <div key={photo.id} className="group relative">
                          <a href={photo.url} target="_blank" rel="noopener noreferrer">
                            <img
                              src={photo.url}
                              alt={`${item.item} - ${room.name}`}
                              className="w-full aspect-square object-cover rounded-lg border border-border hover:ring-2 hover:ring-accent/50 transition-all cursor-pointer"
                            />
                          </a>
                          <div className="mt-1">
                            <p className="text-[10px] font-medium truncate">{item.item}</p>
                            {item.isDeduction && item.costEstimate > 0 && (
                              <p className="text-[10px] text-red-500 font-medium">${item.costEstimate}</p>
                            )}
                          </div>
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(photo.url);
                              } catch {
                                // Fallback: select text
                                const input = document.createElement("input");
                                input.value = photo.url;
                                document.body.appendChild(input);
                                input.select();
                                document.execCommand("copy");
                                document.body.removeChild(input);
                              }
                            }}
                            className="absolute top-1 right-1 w-6 h-6 bg-black/60 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Copy photo link"
                          >
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        <p className="text-[11px] text-muted-foreground text-center">
          Per California Civil Code 1950.5, the itemized statement and remaining deposit must be
          returned to the tenant within 21 calendar days of move-out.
        </p>
      </div>
    );
  }

  return null;
}
