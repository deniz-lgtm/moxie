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
  ai_analysis: string | null;
  created_at: string;
};
