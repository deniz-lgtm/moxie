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

// ─── Work Order Annotations (Moxie-side overlay) ────────────────
// Mirrors supabase/migrations/20260421_work_order_annotations.sql.
// Shares `id` with `work_orders`; overrides layer on top of AppFolio
// fields so edits survive AppFolio syncs.

export type DbWorkOrderNote = {
  text: string;
  created_at: string;
  author?: string;
};

export type DbWorkOrderAnnotation = {
  id: string;
  notes: DbWorkOrderNote[];
  internal_status: string | null;
  assigned_to_override: string | null;
  vendor_override: string | null;
  scheduled_date_override: string | null;
  tags: string[];
  follow_up_on: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Vendors + Contacts ─────────────────────────────────────────
// Mirrors supabase/migrations/20260421_vendors_contacts.sql.

export type DbVendor = {
  id: string;
  name: string;
  category: string | null;
  scope: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  contact_name: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  status: string | null;
  rating: number | null;
  notes: string | null;
  is_internal: boolean;
  notion_page_id: string | null;
  notion_last_synced_at: string | null;
  raw: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type DbContact = {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
  notes: string | null;
  is_active: boolean;
  user_id: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Property Attributes (Moxie overlay per property) ───────────
// Mirrors supabase/migrations/20260423_property_attributes.sql.

export type DbPropertyAttribute = {
  property_id: string;
  insurance_carrier: string | null;
  insurance_policy_number: string | null;
  insurance_expires: string | null;
  insurance_premium_annual: number | null;
  tax_apn: string | null;
  tax_annual_amount: number | null;
  tax_next_installment_due: string | null;
  tax_ytd_paid: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Capital Projects ───────────────────────────────────────────
// Mirrors supabase/migrations/20260423_capital_projects.sql.

export type DbCapitalProjectMilestone = {
  id: string;
  name: string;
  completed: boolean;
  date: string;
};

export type DbCapitalProject = {
  id: string;
  property_id: string;
  property_name: string | null;
  name: string;
  category: string | null;
  status: "planning" | "in_progress" | "completed" | "on_hold";
  start_date: string | null;
  target_date: string | null;
  completed_date: string | null;
  budget: number | null;
  spent: number;
  contractor: string | null;
  description: string | null;
  milestones: DbCapitalProjectMilestone[];
  created_at: string;
  updated_at: string;
};

// ─── Showings (open-house scheduling) ──────────────────────────
// Mirrors supabase/migrations/20260424_showings.sql.

export type ShowingSlotStatus = "open" | "cancelled" | "completed";
export type ShowingRegistrationStatus =
  | "confirmed"
  | "attended"
  | "no_show"
  | "cancelled";

export type DbShowingSlot = {
  id: string;
  property_id: string | null;
  property_name: string | null;
  unit_id: string | null;
  unit_name: string | null;
  starts_at: string;
  ends_at: string;
  host_user_id: string | null;
  host_name: string | null;
  capacity: number;
  notes: string | null;
  public_description: string | null;
  public_token: string;
  status: ShowingSlotStatus;
  created_at: string;
  updated_at: string;
};

export type DbShowingRegistration = {
  id: string;
  slot_id: string;
  prospect_name: string;
  prospect_email: string | null;
  prospect_phone: string | null;
  party_size: number;
  status: ShowingRegistrationStatus;
  notes: string | null;
  guest_card_id: string | null;
  source: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Property P&L Line Items (monthly opex + other income) ──────
// Mirrors supabase/migrations/20260423_property_pnl_line_items.sql.
// One row per property × month × category. Rent comes from rent roll;
// this table is for everything AppFolio doesn't surface cleanly.

export type DbPropertyPnlLineItem = {
  id: string;
  property_id: string;
  month: string;       // YYYY-MM-01 date
  category: string;
  amount: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

// ─── Property Meetings (Monday morning meetings) ────────────────
// Mirrors supabase/migrations/20260421_property_meetings.sql.

export type MeetingStatus = "scheduled" | "in_progress" | "completed";
export type ActionItemStatus = "open" | "in_progress" | "completed" | "cancelled";
export type ActionItemSource = "manual" | "transcript" | "work_order" | "vacancy";

export type DbAgendaWorkOrder = {
  id: string;
  workOrderNumber?: string | null;
  title: string;
  priority?: string | null;
  status?: string | null;
  propertyName?: string | null;
  unitName?: string | null;
  vendor?: string | null;
};

export type DbAgendaVacancy = {
  unitId: string;
  unitName: string;
  propertyName?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  rent?: number | string | null;
  daysVacant?: number | null;
  leaseEnded?: string | null;
};

export type DbAgendaCarryOver = {
  id: string;
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  dueDate?: string | null;
  status: ActionItemStatus;
  fromMeetingDate?: string | null;
};

export type DbAgendaApplication = {
  id: string;
  propertyName: string;
  unitNumber?: string | null;
  primaryApplicant?: string | null;
  applicantCount: number;
  status: string;
  daysInReview?: number | null;
};

export type DbAgendaMove = {
  unitId: string;
  unitName: string;
  propertyName?: string | null;
  direction: "move_in" | "move_out";
  date: string;
  tenant?: string | null;
  daysUntil?: number | null;
};

export type DbAgendaInspection = {
  id: string;
  type: string;
  propertyName?: string | null;
  unitNumber?: string | null;
  inspector?: string | null;
  scheduledDate?: string | null;
  status: string;
};

export type DbAgendaSnapshot = {
  // Legacy flat keys (kept so older meetings keep rendering)
  workOrders?: DbAgendaWorkOrder[];
  vacancies?: DbAgendaVacancy[];
  carryOverActions?: DbAgendaCarryOver[];
  // New three-category structure
  leasing?: {
    vacancies?: DbAgendaVacancy[];
    applications?: DbAgendaApplication[];
    upcomingMoves?: DbAgendaMove[];
  };
  maintenance?: {
    openWorkOrders?: DbAgendaWorkOrder[];
  };
  propertyManagement?: {
    upcomingInspections?: DbAgendaInspection[];
  };
};

export type DbPropertyMeeting = {
  id: string;
  property_id: string | null;
  property_name: string | null;
  meeting_date: string;
  status: MeetingStatus;
  title: string | null;
  audio_url: string | null;
  transcript: string | null;
  summary: string | null;
  notes: string | null;
  agenda_snapshot: DbAgendaSnapshot;
  attendees: string[];
  recorded_at: string | null;
  recording_duration_seconds: number | null;
  created_at: string;
  updated_at: string;
};

export type DbActionItemComment = {
  id: string;
  text: string;
  author?: string | null;
  created_at: string;
};

export type DbActionItemAttachment = {
  id: string;
  name: string;
  url: string;
  content_type?: string | null;
  size?: number | null;
  uploaded_at: string;
  uploaded_by?: string | null;
  storage_path?: string | null;
};

export type DbMeetingActionItem = {
  id: string;
  meeting_id: string;
  property_id: string | null;
  title: string;
  description: string | null;
  assigned_to: string | null;
  due_date: string | null;
  status: ActionItemStatus;
  priority: string | null;
  source: ActionItemSource;
  completed_at: string | null;
  completed_by: string | null;
  linked_work_order_id: string | null;
  linked_unit_id: string | null;
  comments: DbActionItemComment[];
  attachments: DbActionItemAttachment[];
  created_at: string;
  updated_at: string;
};
