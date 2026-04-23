// ============================================
// Moxie Management — Core Types
// ============================================

// --- Academic Year ---
// USC student housing lease cycle: Aug 15 → Jul 31
export type AcademicYear = "2025-2026" | "2026-2027" | "2027-2028";

export function academicYearDates(year: AcademicYear): { leaseStart: string; leaseEnd: string } {
  const startYear = parseInt(year.split("-")[0]);
  return {
    leaseStart: `${startYear}-08-15`,
    leaseEnd: `${startYear + 1}-07-31`,
  };
}

// --- Properties & Units ---
// Units are the primary entity. "Unit Name" = AppFolio "Unit Street Address 1".
// Property is just context (which LLC/building the unit belongs to).
export interface Property {
  id: string;
  name: string;
  address: string;
  unitCount: number;
  appfolioId?: string;
}

export interface Unit {
  id: string;
  propertyId: string;
  propertyName: string;
  number: string;
  /** The primary display label — pulled from AppFolio "Unit Street Address 1" */
  unitName: string;
  /** Legacy display label */
  displayName: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  rent: string | number | null;
  status: "current" | "vacant" | "notice" | "future";
  tenant: string | null;
  leaseFrom: string | null;
  leaseTo: string | null;
  moveIn: string | null;
  moveOut: string | null;
  deposit: number | null;
  additionalTenants: string | null;
  additionalTenantIds: string | null;
  tenantId: string | null;
  leaseExpiresMonth: string | null;
  appfolioId?: string;
}

// --- Property Attributes (Moxie overlay) ---
// Per-property facts that aren't in AppFolio: insurance, taxes, notes.
export interface PropertyAttribute {
  propertyId: string;
  insuranceCarrier?: string;
  insurancePolicyNumber?: string;
  insuranceExpires?: string;          // YYYY-MM-DD
  insurancePremiumAnnual?: number;
  taxApn?: string;
  taxAnnualAmount?: number;
  taxNextInstallmentDue?: string;     // YYYY-MM-DD
  taxYtdPaid?: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// --- Capital Projects (Moxie-managed) ---
export type ProjectCategory =
  | "roof"
  | "hvac"
  | "plumbing"
  | "electrical"
  | "renovation"
  | "landscaping"
  | "other";
export type ProjectStatus = "planning" | "in_progress" | "on_hold" | "completed";

export interface CapitalProjectMilestone {
  id: string;
  name: string;
  completed: boolean;
  date: string;
}

export interface CapitalProject {
  id: string;
  propertyId: string;
  propertyName: string;
  name: string;
  category: ProjectCategory;
  status: ProjectStatus;
  startDate: string;
  targetDate: string;
  completedDate: string;
  budget: number;
  spent: number;
  contractor: string;
  description: string;
  milestones: CapitalProjectMilestone[];
}

// --- Property P&L Line Items (monthly opex + other income) ---
// Canonical categories used by the UI. The DB stores category as free
// text, so the team can add new buckets without a migration. The
// separation into expense vs income is purely UI sign convention for
// NOI rollups — "expense" categories are subtracted, "income" added.
export const PNL_EXPENSE_CATEGORIES = [
  "utilities",
  "property_mgmt",
  "insurance",
  "property_tax",
  "landscaping",
  "pest_control",
  "cleaning",
  "repairs_maintenance",
  "admin",
  "debt_service",
  "other_opex",
] as const;
export const PNL_INCOME_CATEGORIES = ["other_income"] as const;
export type PnlExpenseCategory = (typeof PNL_EXPENSE_CATEGORIES)[number];
export type PnlIncomeCategory = (typeof PNL_INCOME_CATEGORIES)[number];
export type PnlCategory = PnlExpenseCategory | PnlIncomeCategory | string;

export function isPnlIncomeCategory(c: string): boolean {
  return (PNL_INCOME_CATEGORIES as readonly string[]).includes(c);
}

export interface PropertyPnlLineItem {
  id: string;
  propertyId: string;
  month: string;             // YYYY-MM-01
  category: PnlCategory;
  amount: number;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

// A unit that has no lease covering a given target date. Produced by
// `fetchVacanciesOnDate` in lib/data.ts; consumed by the meetings agenda
// to answer "which units will be empty on 2026-08-15?"
export interface VacantUnit {
  unitId: string;
  unitName: string;
  propertyId: string | null;
  propertyName: string;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  rent: string | number | null;
  lastTenant: string | null;
  lastLeaseTo: string | null;
  nextLeaseFrom: string | null;
  daysVacantOnTarget: number | null;
}

// --- Inspections ---
export type InspectionType = "move_in" | "move_out" | "onboarding" | "quarterly" | "punch_list";
export type InspectionStatus = "not_started" | "draft" | "walking" | "ai_review" | "team_review" | "completed";
export type ConditionRating = "excellent" | "good" | "fair" | "poor" | "damaged";

export interface InspectionPhoto {
  id: string;
  url: string; // data URL or storage URL
  aiAnalysis: string | null;
  createdAt: string;
  /** Per-photo metadata for individual deductions */
  condition?: ConditionRating | "";
  notes?: string;
  costEstimate?: number;
  isDeduction?: boolean;
  aiOriginalCondition?: ConditionRating | "";
  aiOriginalCost?: number;
}

export interface ItemEditRecord {
  field: string;
  from: string | number | boolean;
  to: string | number | boolean;
  editor: string;
  timestamp: string;
}

export interface InspectionItem {
  id: string;
  area: string;
  item: string;
  condition: ConditionRating | "";
  notes: string;
  photos: InspectionPhoto[];
  costEstimate: number;
  isDeduction: boolean;
  /** Original AI-suggested values (set once after analysis, never mutated) */
  aiOriginalCondition?: ConditionRating | "";
  aiOriginalCost?: number;
  /** Chronological log of manual edits to deduction fields */
  editHistory?: ItemEditRecord[];
}

export interface InspectionRoom {
  id: string;
  name: string;
  items: InspectionItem[];
  panoramaUrl?: string | null;
}

export interface Inspection {
  id: string;
  unitId: string;
  propertyId: string;
  unitNumber: string;
  propertyName: string;
  type: InspectionType;
  status: InspectionStatus;
  scheduledDate: string;
  completedDate?: string;
  inspector: string;
  rooms: InspectionRoom[];
  floorPlanUrl: string | null;
  overallNotes: string;
  invoiceUrl: string | null;
  invoiceTotal: number | null;
  tenantName: string | null;
  tenantEmail: string | null;
  depositAmount: number | null;
  createdAt: string;
  updatedAt: string;
}

// --- Unit Turns ---
export type TurnStatus = "pending" | "in_progress" | "completed";
export type TurnTaskStatus = "not_started" | "in_progress" | "completed" | "blocked";

export interface TurnTask {
  id: string;
  name: string;
  category: "cleaning" | "paint" | "repairs" | "flooring" | "appliances" | "final_walk";
  status: TurnTaskStatus;
  assignedTo?: string;
  vendor?: string;
  estimatedCost?: number;
  actualCost?: number;
  notes: string;
  dueDate?: string;
  completedDate?: string;
}

export interface UnitTurn {
  id: string;
  unitId: string;
  propertyId: string;
  unitNumber: string;
  propertyName: string;
  moveOutDate: string;
  targetReadyDate: string;
  moveInDate?: string;
  status: TurnStatus;
  outgoingTenant?: string;
  incomingTenant?: string;
  tasks: TurnTask[];
  totalBudget?: number;
  totalSpent: number;
  createdAt: string;
  updatedAt: string;
}

// --- Maintenance Requests ---
export type MaintenancePriority = "emergency" | "high" | "medium" | "low";
export type MaintenanceStatus = "submitted" | "assigned" | "in_progress" | "awaiting_parts" | "completed" | "closed";
export type MaintenanceCategory = "plumbing" | "electrical" | "hvac" | "appliance" | "structural" | "pest" | "locksmith" | "general";

export interface MaintenanceRequest {
  id: string;
  unitId: string;
  propertyId: string;
  unitNumber: string;
  propertyName: string;
  tenantName: string;
  tenantPhone?: string;
  tenantEmail?: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  title: string;
  description: string;
  photos: string[];
  assignedTo?: string;
  vendor?: string;
  estimatedCost?: number;
  actualCost?: number;
  scheduledDate?: string;
  completedDate?: string;
  notes: string[];
  createdAt: string;
  updatedAt: string;
  appfolioWorkOrderId?: string;
  /** Moxie-side follow-up date from work_order_annotations.follow_up_on. */
  followUpOn?: string;
}

// --- Vendors ---
export type VendorStatus = "active" | "inactive" | "preferred";

export interface Vendor {
  id: string;
  name: string;
  category?: string;
  /** Free-form description of what the vendor does — e.g. "drain cleaning, water heaters". */
  scope?: string;
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
  contactName?: string;
  licenseNumber?: string;
  insuranceExpiry?: string;
  status?: VendorStatus;
  rating?: number;
  notes?: string;
  isInternal: boolean;
  notionPageId?: string;
  notionLastSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Contacts (internal team directory) ---
export type ContactRole =
  | "property_manager"
  | "maintenance"
  | "leasing"
  | "asset_manager"
  | "owner_rep"
  | "other";

export interface Contact {
  id: string;
  name: string;
  role?: ContactRole;
  email?: string;
  phone?: string;
  department?: string;
  notes?: string;
  isActive: boolean;
  /** Supabase auth user id if this contact was created from a real login. */
  userId?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Leasing: Applications ---
export type ApplicantRole = "primary" | "co_applicant" | "guarantor";
export type StepStatus = "pending" | "complete" | "in_review" | "rejected";
export type DocType = "government_id" | "proof_of_enrollment" | "proof_of_income" | "guarantor_form" | "other";
export type NudgeStatus = "scheduled" | "sent" | "delivered" | "opened" | "failed";
export type NudgeChannel = "email" | "sms";
export type ApplicationGroupStatus = "incomplete" | "under_review" | "approved" | "denied";
export type LeaseCycle = "fall_2026" | "spring_2027" | "summer_2026";

export interface ApplicantStep {
  id: string;
  name: string;
  description: string;
  required: boolean;
  status: StepStatus;
  completedAt?: string;
}

export interface DocumentUpload {
  id: string;
  type: DocType;
  label: string;
  fileName?: string;
  uploadedAt?: string;
  status: "missing" | "uploaded" | "verified" | "rejected";
}

export interface Nudge {
  id: string;
  channel: NudgeChannel;
  message: string;
  scheduledAt: string;
  sentAt?: string;
  status: NudgeStatus;
}

export interface Applicant {
  id: string;
  groupId: string;
  name: string;
  email: string;
  phone?: string;
  role: ApplicantRole;
  guarantorFor?: string;
  steps: ApplicantStep[];
  documents: DocumentUpload[];
  nudges: Nudge[];
  status: "not_started" | "in_progress" | "complete";
  startedAt?: string;
  completedAt?: string;
}

export interface ApplicationGroup {
  id: string;
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  unitDetails: string;
  leaseCycle: LeaseCycle;
  targetMoveIn: string;
  monthlyRent: number;
  applicants: Applicant[];
  status: ApplicationGroupStatus;
  createdAt: string;
  updatedAt: string;
}

// --- Leasing: Showings (open-house sign-up flow) ---
// Distinct from the older TourSlot concept below (localStorage-only,
// one-on-one appointments). Showings are scheduled open-house blocks
// a leasing manager publishes; students sign up via a public token URL.
export type ShowingSlotStatus = "open" | "cancelled" | "completed";
export type ShowingRegistrationStatus =
  | "confirmed"
  | "attended"
  | "no_show"
  | "cancelled";

export interface ShowingRegistration {
  id: string;
  slotId: string;
  prospectName: string;
  prospectEmail?: string;
  prospectPhone?: string;
  partySize: number;
  status: ShowingRegistrationStatus;
  notes?: string;
  guestCardId?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ShowingSlot {
  id: string;
  propertyId?: string;
  propertyName?: string;
  unitId?: string;
  unitName?: string;
  startsAt: string;   // ISO
  endsAt: string;     // ISO
  hostUserId?: string;
  hostName?: string;
  capacity: number;
  notes?: string;
  publicDescription?: string;
  publicToken: string;
  status: ShowingSlotStatus;
  registrations?: ShowingRegistration[];
  createdAt?: string;
  updatedAt?: string;
}

// --- Leasing: Tours ---
export type TourRegistrationStatus = "confirmed" | "pending" | "attended" | "no_show" | "rescheduled" | "cancelled";

export interface TourRegistration {
  id: string;
  prospectName: string;
  prospectEmail: string;
  prospectPhone?: string;
  status: TourRegistrationStatus;
  registeredAt: string;
  source?: string;
  notes?: string;
  followUpSent?: boolean;
}

export interface TourSlot {
  id: string;
  propertyId: string;
  propertyName: string;
  date: string;
  startTime: string;
  endTime: string;
  host: string;
  capacity: number;
  registrations: TourRegistration[];
  preReminderStatus: "scheduled" | "sent" | "not_set";
  postFollowUpStatus: "scheduled" | "sent" | "not_set";
  notes: string;
  createdAt: string;
}

// --- Dashboard Stats ---
export interface DashboardStats {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  turningUnits: number;
  preLeasedUnits: number;
  activeInspections: number;
  openMaintenanceRequests: number;
  upcomingTurns: number;
  activeApplications: number;
  upcomingTours: number;
  upcomingMoveOuts: number;
  vendorCount: number;
  pendingRubs: string;
  reportsDue: number;
  activeCapitalProjects: number;
  pendingNotices: number;
  trackedComps: number;
  recurringIssues: number;
}

// --- App Launcher ---
export type UserRole = "property_manager" | "maintenance_tech" | "leasing_agent" | "asset_manager" | "owner";
export type AppCategory = "inspections" | "operations" | "leasing" | "finance" | "asset_management" | "communications" | "marketing" | "team";

export interface AppConfig {
  id: string;
  name: string;
  description: string;
  href: string;
  icon: string;
  category: AppCategory;
  categoryLabel: string;
  categoryColor: string;
  roles: UserRole[];
  isBuilt: boolean;
  statLabel?: string;
}

export interface AppCategoryConfig {
  id: AppCategory;
  label: string;
  color: string;
  order: number;
}
