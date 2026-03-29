// ============================================
// Inspections Data Layer — Supabase with localStorage fallback
// ============================================
// All inspection CRUD goes through here. If Supabase is configured,
// data persists to Postgres + Storage. Otherwise falls back to localStorage.

import { getSupabase, isSupabaseConfigured } from "./supabase";
import type { DbInspection } from "./supabase";
import type { Inspection, InspectionType } from "./types";
import { loadFromStorage, saveToStorage } from "./storage";

const STORAGE_KEY = "inspections_v2";
const BUCKET = "inspection-files";

// ─── Conversion helpers ─────────────────────────────────────────

/** Client Inspection → DB row */
function toDb(insp: Inspection): Omit<DbInspection, "created_at" | "updated_at"> {
  return {
    id: insp.id,
    unit_id: insp.unitId,
    unit_name: insp.unitNumber,
    property_name: insp.propertyName,
    type: insp.type,
    status: insp.status,
    inspector: insp.inspector,
    scheduled_date: insp.scheduledDate,
    completed_date: insp.completedDate || null,
    floor_plan_url: insp.floorPlanUrl,
    rooms: insp.rooms.map((r) => ({
      id: r.id,
      name: r.name,
      items: r.items.map((item) => ({
        id: item.id,
        name: item.item,
        condition: item.condition,
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
    overall_notes: insp.overallNotes,
    invoice_url: insp.invoiceUrl,
    invoice_total: insp.invoiceTotal,
    tenant_name: insp.tenantName,
    tenant_email: insp.tenantEmail,
    deposit_amount: insp.depositAmount,
  };
}

/** DB row → Client Inspection */
function fromDb(row: DbInspection): Inspection {
  return {
    id: row.id,
    unitId: row.unit_id,
    propertyId: "", // not stored in DB, resolved from AppFolio at runtime
    unitNumber: row.unit_name,
    propertyName: row.property_name,
    type: row.type as InspectionType,
    status: row.status as Inspection["status"],
    scheduledDate: row.scheduled_date,
    completedDate: row.completed_date || undefined,
    inspector: row.inspector,
    rooms: (row.rooms || []).map((r) => ({
      id: r.id,
      name: r.name,
      items: (r.items || []).map((item) => ({
        id: item.id,
        area: r.name,
        item: item.name,
        condition: item.condition as Inspection["status"] extends string ? any : never || "",
        notes: item.notes,
        photos: (item.photos || []).map((p) => ({
          id: p.id,
          url: p.url,
          aiAnalysis: p.ai_analysis,
          createdAt: p.created_at,
        })),
        costEstimate: item.cost_estimate,
        isDeduction: item.is_deduction,
      })),
    })),
    floorPlanUrl: row.floor_plan_url,
    overallNotes: row.overall_notes,
    invoiceUrl: row.invoice_url,
    invoiceTotal: row.invoice_total,
    tenantName: row.tenant_name,
    tenantEmail: row.tenant_email,
    depositAmount: row.deposit_amount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── Photo uploads ──────────────────────────────────────────────

/** Upload a base64 data URL to Supabase Storage. Returns the public URL. */
export async function uploadPhoto(dataUrl: string, inspectionId: string, photoId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) return dataUrl; // fallback: keep data URL

  // Convert data URL to blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const path = `inspections/${inspectionId}/${photoId}.${ext}`;

  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: true,
  });

  if (error) {
    console.error("[Moxie] Photo upload failed:", error.message);
    return dataUrl; // fallback
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Upload a floor plan data URL. Returns the public URL. */
export async function uploadFloorPlan(dataUrl: string, inspectionId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) return dataUrl;

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes("png") ? "png" : blob.type.includes("pdf") ? "pdf" : "jpg";
  const path = `inspections/${inspectionId}/floor-plan.${ext}`;

  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: blob.type,
    upsert: true,
  });

  if (error) {
    console.error("[Moxie] Floor plan upload failed:", error.message);
    return dataUrl;
  }

  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── CRUD operations ────────────────────────────────────────────

/** Fetch all inspections of a given type */
export async function fetchInspections(type: InspectionType): Promise<Inspection[]> {
  const sb = getSupabase();
  if (!sb) {
    return loadFromStorage<Inspection[]>(STORAGE_KEY, []).filter((i) => i.type === type);
  }

  const { data, error } = await sb
    .from("inspections")
    .select("*")
    .eq("type", type)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[Moxie] fetchInspections error:", error.message);
    return [];
  }

  return (data || []).map(fromDb);
}

/** Upsert a single inspection */
export async function saveInspectionToDb(insp: Inspection): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    // localStorage fallback
    const all = loadFromStorage<Inspection[]>(STORAGE_KEY, []);
    const idx = all.findIndex((i) => i.id === insp.id);
    if (idx >= 0) all[idx] = insp;
    else all.push(insp);
    saveToStorage(STORAGE_KEY, all);
    return;
  }

  const row = toDb(insp);
  const { error } = await sb
    .from("inspections")
    .upsert({
      ...row,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });

  if (error) {
    console.error("[Moxie] saveInspection error:", error.message);
  }
}

/** Delete an inspection by ID */
export async function deleteInspectionFromDb(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) {
    const all = loadFromStorage<Inspection[]>(STORAGE_KEY, []);
    saveToStorage(STORAGE_KEY, all.filter((i) => i.id !== id));
    return;
  }

  const { error } = await sb.from("inspections").delete().eq("id", id);
  if (error) {
    console.error("[Moxie] deleteInspection error:", error.message);
  }
}

/** Bulk insert inspections (for auto-population). Skips existing unit_ids. */
export async function bulkCreateInspections(inspections: Inspection[]): Promise<void> {
  if (inspections.length === 0) return;

  const sb = getSupabase();
  if (!sb) {
    // localStorage fallback
    const all = loadFromStorage<Inspection[]>(STORAGE_KEY, []);
    const existingIds = new Set(all.map((i) => i.id));
    const newOnes = inspections.filter((i) => !existingIds.has(i.id));
    if (newOnes.length > 0) {
      saveToStorage(STORAGE_KEY, [...all, ...newOnes]);
    }
    return;
  }

  const rows = inspections.map((insp) => ({
    ...toDb(insp),
    created_at: insp.createdAt,
    updated_at: insp.updatedAt,
  }));

  const { error } = await sb
    .from("inspections")
    .upsert(rows, { onConflict: "id", ignoreDuplicates: true });

  if (error) {
    console.error("[Moxie] bulkCreateInspections error:", error.message);
  }
}

/** Check which unit IDs already have inspections of a given type */
export async function getExistingUnitIds(type: InspectionType): Promise<Set<string>> {
  const sb = getSupabase();
  if (!sb) {
    const all = loadFromStorage<Inspection[]>(STORAGE_KEY, []);
    return new Set(all.filter((i) => i.type === type).map((i) => i.unitId));
  }

  const { data, error } = await sb
    .from("inspections")
    .select("unit_id")
    .eq("type", type);

  if (error) {
    console.error("[Moxie] getExistingUnitIds error:", error.message);
    return new Set();
  }

  return new Set((data || []).map((r: { unit_id: string }) => r.unit_id));
}
