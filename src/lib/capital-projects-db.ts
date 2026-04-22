// ============================================
// Capital Projects DB — Supabase-backed
// ============================================
// Previously these lived in browser localStorage, which meant a team
// member couldn't see a project another team member added. Moved to
// Supabase so /portfolio can aggregate active capex per property.

import { getSupabase, type DbCapitalProject } from "./supabase";
import type { CapitalProject, ProjectCategory, ProjectStatus } from "./types";

function dbToProject(row: DbCapitalProject): CapitalProject {
  return {
    id: row.id,
    propertyId: row.property_id,
    propertyName: row.property_name ?? "",
    name: row.name,
    category: (row.category ?? "other") as ProjectCategory,
    status: row.status as ProjectStatus,
    startDate: row.start_date ?? "",
    targetDate: row.target_date ?? "",
    completedDate: row.completed_date ?? "",
    budget: row.budget != null ? Number(row.budget) : 0,
    spent: Number(row.spent ?? 0),
    contractor: row.contractor ?? "",
    description: row.description ?? "",
    milestones: row.milestones ?? [],
  };
}

function projectToDb(p: CapitalProject): Omit<DbCapitalProject, "created_at" | "updated_at"> {
  return {
    id: p.id,
    property_id: p.propertyId,
    property_name: p.propertyName || null,
    name: p.name,
    category: p.category || null,
    status: p.status,
    start_date: p.startDate || null,
    target_date: p.targetDate || null,
    completed_date: p.completedDate || null,
    budget: p.budget || null,
    spent: p.spent || 0,
    contractor: p.contractor || null,
    description: p.description || null,
    milestones: p.milestones ?? [],
  };
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  return /does not exist|not found in schema|relation .* does not exist/i.test(error.message || "");
}

export async function listCapitalProjects(opts?: { propertyId?: string }): Promise<CapitalProject[]> {
  const sb = getSupabase();
  if (!sb) return [];
  let query = sb.from("capital_projects").select("*").order("target_date", { ascending: true, nullsFirst: false });
  if (opts?.propertyId) query = query.eq("property_id", opts.propertyId);
  const { data, error } = await query;
  if (error) {
    if (!isMissingTableError(error)) console.warn("[capital-projects-db] list:", error.message);
    return [];
  }
  return (data ?? []).map((r: DbCapitalProject) => dbToProject(r));
}

export async function upsertCapitalProject(p: CapitalProject): Promise<CapitalProject> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("capital_projects")
    .upsert(projectToDb(p), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[capital-projects-db] upsert: ${error.message}`);
  return dbToProject(data as DbCapitalProject);
}

export async function deleteCapitalProject(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("capital_projects").delete().eq("id", id);
  if (error) throw new Error(`[capital-projects-db] delete: ${error.message}`);
}
