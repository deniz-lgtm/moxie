// ============================================
// Moxie Management — Core Types
// ============================================

// --- Properties ---
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
  number: string;
  bedrooms: number;
  bathrooms: number;
  sqft?: number;
  currentTenantId?: string;
  status: "occupied" | "vacant" | "turning" | "ready";
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

// --- Dashboard Stats ---
export interface DashboardStats {
  totalUnits: number;
  occupiedUnits: number;
  vacantUnits: number;
  turningUnits: number;
  activeInspections: number;
  openMaintenanceRequests: number;
  upcomingTurns: number;
}
