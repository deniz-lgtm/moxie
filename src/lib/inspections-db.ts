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
const MIGRATION_DONE_KEY = "inspections_supabase_migrated";
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
      panorama_url: r.panoramaUrl || null,
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
          condition: p.condition,
          notes: p.notes,
          cost_estimate: p.costEstimate,
          is_deduction: p.isDeduction,
          ai_original_condition: p.aiOriginalCondition,
          ai_original_cost: p.aiOriginalCost,
        })),
        cost_estimate: item.costEstimate,
        is_deduction: item.isDeduction,
        ai_original_condition: item.aiOriginalCondition,
        ai_original_cost: item.aiOriginalCost,
        edit_history: item.editHistory,
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
      panoramaUrl: r.panorama_url || null,
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
          condition: (p.condition as any) || undefined,
          notes: p.notes,
          costEstimate: p.cost_estimate,
          isDeduction: p.is_deduction,
          aiOriginalCondition: (p.ai_original_condition as any) || undefined,
          aiOriginalCost: p.ai_original_cost,
        })),
        costEstimate: item.cost_estimate,
        isDeduction: item.is_deduction,
        aiOriginalCondition: item.ai_original_condition as any,
        aiOriginalCost: item.ai_original_cost,
        editHistory: item.edit_history,
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

/** Upload a 360 panorama data URL. Returns the public URL. */
export async function uploadPanorama(dataUrl: string, inspectionId: string, roomId: string): Promise<string> {
  const sb = getSupabase();
  if (!sb) return dataUrl;

  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = `inspections/${inspectionId}/panorama-${roomId}.jpg`;

  const { error } = await sb.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (error) {
    console.error("[Moxie] Panorama upload failed:", error.message);
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

/** Fetch all inspections (every type). Used by the /inspections hub page. */
export async function fetchAllInspections(): Promise<Inspection[]> {
  const sb = getSupabase();
  if (!sb) {
    return loadFromStorage<Inspection[]>(STORAGE_KEY, []);
  }

  const { data, error } = await sb
    .from("inspections")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[Moxie] fetchAllInspections error:", error.message);
    return [];
  }

  return (data || []).map(fromDb);
}

// ─── One-time localStorage → Supabase migration ────────────────
// The /inspections sub-pages used to write directly to localStorage,
// bypassing this module. On first authenticated load after the page
// rewire, lift any local rows into Supabase so users don't lose
// inspections they captured before the migration.

export async function migrateLocalToSupabaseIfNeeded(): Promise<{
  migrated: boolean;
  count?: number;
}> {
  if (typeof window === "undefined") return { migrated: false };
  if (loadFromStorage<boolean>(MIGRATION_DONE_KEY, false)) return { migrated: false };
  if (!isSupabaseConfigured()) return { migrated: false };

  const sb = getSupabase();
  if (!sb) return { migrated: false };

  const local = loadFromStorage<Inspection[]>(STORAGE_KEY, []);

  // Confirm the table exists and check whether Supabase already has data
  const { data: existing, error: checkError } = await sb
    .from("inspections")
    .select("id")
    .limit(1);

  if (checkError) {
    // Table probably doesn't exist yet; user hasn't run the migration SQL.
    return { migrated: false };
  }

  if ((existing || []).length > 0) {
    // Supabase already has data — skip migration, mark done so we don't
    // keep checking (other devices will have already populated it).
    saveToStorage(MIGRATION_DONE_KEY, true);
    return { migrated: false };
  }

  if (local.length > 0) {
    const rows = local.map((insp) => ({
      ...toDb(insp),
      created_at: insp.createdAt,
      updated_at: insp.updatedAt,
    }));
    const { error: upsertError } = await sb
      .from("inspections")
      .upsert(rows, { onConflict: "id" });
    if (upsertError) {
      console.warn("[inspections-db] migration upsert failed:", upsertError.message);
      return { migrated: false };
    }
  }

  saveToStorage(MIGRATION_DONE_KEY, true);
  return { migrated: true, count: local.length };
}
