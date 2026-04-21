import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("[Moxie] Supabase not configured — using localStorage fallback");
    return null;
  }
  if (!_client) {
    _client = createClient(supabaseUrl, supabaseAnonKey);
  }
  return _client;
}

/** Check if Supabase is available */
export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

// ─── Database types ─────────────────────────────────────────────

export type DbInspection = {
  id: string;
  unit_id: string;
  unit_name: string;
  property_name: string;
  type: "move_out" | "move_in" | "onboarding" | "quarterly" | "punch_list";
  status: "not_started" | "draft" | "walking" | "ai_review" | "team_review" | "completed";
  inspector: string;
  scheduled_date: string;
  completed_date: string | null;
  floor_plan_url: string | null;
  rooms: DbRoom[];
  overall_notes: string;
  invoice_url: string | null;
  invoice_total: number | null;
  tenant_name: string | null;
  tenant_email: string | null;
  deposit_amount: number | null;
  created_at: string;
  updated_at: string;
};

export type DbRoom = {
  id: string;
  name: string;
  items: DbInspectionItem[];
  panorama_url?: string | null;
};

export type DbItemEditRecord = {
  field: string;
  from: string | number | boolean;
  to: string | number | boolean;
  editor: string;
  timestamp: string;
};

export type DbInspectionItem = {
  id: string;
  name: string;
  condition: "excellent" | "good" | "fair" | "poor" | "damaged" | "";
  notes: string;
  photos: DbPhoto[];
  cost_estimate: number;
  is_deduction: boolean;
  ai_original_condition?: string;
  ai_original_cost?: number;
  edit_history?: DbItemEditRecord[];
};

export type DbPhoto = {
  id: string;
  url: string; // Supabase storage URL or data URL
  /**
   * Transient base64 data URL snapshot of the photo used for PDF embedding.
   * Populated just-in-time by the client before generating a document;
   * never persisted to Supabase.
   */
  data_url?: string;
  ai_analysis: string | null;
  created_at: string;
  /** Per-photo deduction metadata */
  condition?: string;
  notes?: string;
  cost_estimate?: number;
  is_deduction?: boolean;
  ai_original_condition?: string;
  ai_original_cost?: number;
};

// ─── RUBS Database Types ────────────────────────────────────────
// Mirror the RubsBill / MeterMapping / OccupancyData / PropertyAlias
// types from rubs-types.ts but in snake_case for Postgres. See
// supabase/migrations/20260408_rubs_tables.sql for the schema.

export type DbMeterMapping = {
  id: string;
  property_name: string;
  meter_type: "water" | "gas" | "electric" | "sewer";
  metering_method: "master" | "sub_metered";
  meter_id: string;
  unit_ids: string[];
  split_method: "sqft" | "occupancy" | "equal" | "custom";
  custom_shares: Record<string, number> | null;
  created_at: string;
  updated_at: string;
};

export type DbRubsBill = {
  id: string;
  property_name: string;
  month: string;
  meter_type: "water" | "gas" | "electric" | "sewer";
  total_amount: number;
  mapping_id: string;
  status: "draft" | "calculated" | "posted";
  allocations: Array<{
    unitId: string;
    unitName: string;
    tenant: string;
    sqft: number;
    occupants: number;
    share: number;
    amount: number;
  }>;
  source_file: string | null;
  created_at: string;
  updated_at: string;
};

export type DbOccupancy = {
  id: "singleton";
  records: Array<{
    propertyName: string;
    unitName: string;
    occupancyUid: string;
    tenantName: string;
    occupancyId: string;
  }>;
  imported_at: string;
  filename: string;
};

export type DbPropertyAlias = {
  id: string;
  canonical_name: string;
  aliases: string[];
  notes: string | null;
  created_at: string;
};

// ─── Work Orders (AppFolio snapshot) ────────────────────────────
// Mirrors supabase/migrations/20260421_work_orders.sql. Populated by
// POST /api/maintenance/sync from the AppFolio `work_order` report
// (snake_case fields preserved as-is).

export type DbWorkOrder = {
  id: string;
  work_order_number: string | null;
  service_request_number: string | null;
  property_id: string | null;
  property_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  primary_tenant: string | null;
  primary_tenant_email: string | null;
  primary_tenant_phone_number: string | null;
  work_order_type: string | null;
  priority: string | null;
  status: string | null;
  job_description: string | null;
  service_request_description: string | null;
  instructions: string | null;
  vendor: string | null;
  vendor_id: string | null;
  assigned_user: string | null;
  estimate_amount: number | null;
  amount: number | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  completed_on: string | null;
  work_completed_on: string | null;
  appfolio_created_at: string | null;
  status_notes: string | null;
  raw: Record<string, unknown>;
  synced_at: string;
  created_at: string;
  updated_at: string;
};
