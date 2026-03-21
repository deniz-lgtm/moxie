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
  status: "draft" | "walking" | "ai_review" | "team_review" | "completed";
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

export type DbInspectionItem = {
  id: string;
  name: string;
  condition: "excellent" | "good" | "fair" | "poor" | "damaged" | "";
  notes: string;
  photos: DbPhoto[];
  cost_estimate: number;
  is_deduction: boolean;
};

export type DbPhoto = {
  id: string;
  url: string; // data URL or Supabase storage URL
  ai_analysis: string | null;
  created_at: string;
};

// ─── Supabase SQL schema (run this in Supabase SQL editor) ──────

export const SCHEMA_SQL = `
-- Inspections table
create table if not exists inspections (
  id uuid primary key default gen_random_uuid(),
  unit_id text not null,
  unit_name text not null,
  property_name text not null default '',
  type text not null check (type in ('move_out', 'move_in', 'onboarding', 'quarterly', 'punch_list')),
  status text not null default 'draft' check (status in ('draft', 'walking', 'ai_review', 'team_review', 'completed')),
  inspector text not null default '',
  scheduled_date date,
  completed_date date,
  floor_plan_url text,
  rooms jsonb not null default '[]',
  overall_notes text not null default '',
  invoice_url text,
  invoice_total numeric(10,2),
  tenant_name text,
  tenant_email text,
  deposit_amount numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table inspections enable row level security;

-- Allow all operations for now (tighten with auth later)
create policy "Allow all" on inspections for all using (true) with check (true);

-- Storage bucket for photos and floor plans
-- Run in Supabase Dashboard > Storage > New bucket: "inspection-files" (public)
`;
