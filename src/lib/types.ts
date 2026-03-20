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
  appfolioId?: string;
}

// --- Inspections ---
export type InspectionType = "move_in" | "move_out" | "routine" | "quarterly";
export type InspectionStatus = "scheduled" | "in_progress" | "completed" | "needs_review";
export type ConditionRating = "excellent" | "good" | "fair" | "poor" | "damaged";

export interface InspectionItem {
  id: string;
  area: string;
  item: string;
  condition: ConditionRating;
  notes: string;
  photos: string[];
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
  items: InspectionItem[];
  overallNotes: string;
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
export type AppCategory = "operations" | "leasing" | "finance" | "asset_management" | "communications";

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
