// ============================================
// Data Layer — AppFolio API (real data)
// ============================================
// Fetches live data from AppFolio report-based API.
// Student housing lease year: Aug 15 → Jul 31.
// "Pre-leased" = unit has a signed lease covering the upcoming academic year.

import {
  getProperties as afGetProperties,
  getWorkOrders as afGetWorkOrders,
  getRentRoll as afGetRentRoll,
} from "./appfolio";
import type {
  Property,
  MaintenanceRequest,
  DashboardStats,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from "./types";

// Upcoming lease year boundaries
const NEXT_YEAR_START = new Date("2026-08-15");
const NEXT_YEAR_END = new Date("2027-07-31");

/** Parse AppFolio date strings like "MM/DD/YYYY" or "YYYY-MM-DD" into Date */
function parseAFDate(val: string | null | undefined): Date | null {
  if (!val) return null;
  // Handle MM/DD/YYYY
  const mdyMatch = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdyMatch) {
    return new Date(Number(mdyMatch[3]), Number(mdyMatch[1]) - 1, Number(mdyMatch[2]));
  }
  // Handle ISO / YYYY-MM-DD
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

// --- Properties ---
// AppFolio property_directory fields (PascalCase):
//   PropertyId, PropertyName, PropertyAddress, PropertyCity, PropertyState, PropertyZip, UnitCount, ...
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" }> {
  const rows = await afGetProperties();
  const properties: Property[] = (rows || []).map((p: any, i: number) => ({
    id: String(p.PropertyId || p.property_id || `prop-${i}`),
    name: p.PropertyName || p.property_name || "",
    address: [
      p.PropertyAddress || p.property_address || "",
      p.PropertyCity || p.property_city || "",
      p.PropertyState || p.property_state || "",
      p.PropertyZip || p.property_zip || "",
    ]
      .filter(Boolean)
      .join(", "),
    unitCount: Number(p.UnitCount || p.unit_count || 0),
  }));
  return { data: properties, source: "appfolio" };
}

// --- Leasing Stats (Pre-leased for upcoming academic year) ---
// Uses rent_roll report. Fields (PascalCase):
//   UnitId, Unit, Status, Tenant, LeaseFrom, LeaseTo, PropertyName, PropertyId, ...
//
// A unit is "pre-leased" for 2026-2027 if:
//   - LeaseTo >= 2027-07-31 (lease extends through next academic year), OR
//   - LeaseFrom >= 2026-08-01 (new lease starting next fall)
export async function fetchUnitStats(): Promise<{
  total: number;
  occupied: number;   // currently occupied (Status = Current/Notice)
  preLeased: number;  // signed lease covering next academic year
  unleased: number;   // no lease covering next academic year
  source: "appfolio";
}> {
  const rentRollRows = await afGetRentRoll();
  if (!Array.isArray(rentRollRows) || rentRollRows.length === 0) {
    throw new Error("No rent roll data returned");
  }

  const total = rentRollRows.length;
  let occupied = 0;
  let preLeased = 0;

  for (const row of rentRollRows) {
    // Current occupancy
    const status = String(row.Status || "").toLowerCase();
    if (status === "current" || status === "notice") {
      occupied++;
    }

    // Pre-leased for next year
    const leaseTo = parseAFDate(row.LeaseTo);
    const leaseFrom = parseAFDate(row.LeaseFrom);

    const coversNextYear = leaseTo && leaseTo >= NEXT_YEAR_END;
    const startsNextFall = leaseFrom && leaseFrom >= new Date("2026-08-01") && leaseFrom <= new Date("2026-09-15");

    if (coversNextYear || startsNextFall) {
      preLeased++;
    }
  }

  return {
    total,
    occupied,
    preLeased,
    unleased: total - preLeased,
    source: "appfolio",
  };
}

// --- Work Orders / Maintenance ---
// AppFolio work_order_detail fields (PascalCase):
//   WorkOrderId, PropertyName, PropertyId, Unit, UnitId, Description, Status,
//   Priority, Category, AssignedTo, VendorName, TenantName, CreatedDate,
//   CompletedDate, ScheduledEnd, Detail, ...
const CATEGORY_MAP: Record<string, MaintenanceCategory> = {
  plumbing: "plumbing",
  electrical: "electrical",
  hvac: "hvac",
  appliance: "appliance",
  appliances: "appliance",
  structural: "structural",
  pest: "pest",
  pest_control: "pest",
  locksmith: "locksmith",
  lock: "locksmith",
  general: "general",
};

const PRIORITY_MAP: Record<string, MaintenancePriority> = {
  emergency: "emergency",
  urgent: "emergency",
  high: "high",
  normal: "medium",
  medium: "medium",
  low: "low",
};

const STATUS_MAP: Record<string, MaintenanceStatus> = {
  open: "submitted",
  new: "submitted",
  submitted: "submitted",
  assigned: "assigned",
  in_progress: "in_progress",
  "in progress": "in_progress",
  on_hold: "awaiting_parts",
  awaiting_parts: "awaiting_parts",
  completed: "completed",
  complete: "completed",
  closed: "closed",
  resolved: "closed",
};

export async function fetchMaintenanceRequests(params?: {
  property_id?: string;
  status?: string;
}): Promise<{ data: MaintenanceRequest[]; source: "appfolio" }> {
  const rows = await afGetWorkOrders(params);
  const requests: MaintenanceRequest[] = (rows || []).map((wo: any, i: number) => ({
    id: String(wo.WorkOrderId || wo.work_order_id || wo.Id || `wo-${i}`),
    unitId: String(wo.UnitId || wo.unit_id || ""),
    propertyId: String(wo.PropertyId || wo.property_id || ""),
    unitNumber: String(wo.Unit || wo.unit_name || wo.UnitName || ""),
    propertyName: String(wo.PropertyName || wo.property_name || ""),
    tenantName: String(wo.TenantName || wo.tenant_name || wo.Tenant || "—"),
    tenantPhone: wo.TenantPhone || wo.tenant_phone || undefined,
    tenantEmail: wo.TenantEmail || wo.tenant_email || undefined,
    category: CATEGORY_MAP[String(wo.Category || wo.WorkOrderCategory || "general").toLowerCase()] || "general",
    priority: PRIORITY_MAP[String(wo.Priority || "normal").toLowerCase()] || "medium",
    status: STATUS_MAP[String(wo.Status || wo.WorkOrderStatus || "open").toLowerCase()] || "submitted",
    title: String(wo.JobDescription || wo.Description || wo.Summary || "Work Order"),
    description: String(wo.Detail || wo.JobDescription || wo.Description || ""),
    photos: [],
    assignedTo: wo.AssignedTo || wo.AssignedUsers || undefined,
    vendor: wo.VendorName || wo.Vendor || undefined,
    estimatedCost: wo.EstimatedCost ? Number(wo.EstimatedCost) : undefined,
    actualCost: wo.ActualCost || wo.TotalCost ? Number(wo.ActualCost || wo.TotalCost) : undefined,
    scheduledDate: wo.ScheduledEnd || wo.ScheduledDate || wo.DueDate || undefined,
    completedDate: wo.CompletedOn || wo.CompletedDate || undefined,
    notes: [],
    createdAt: wo.CreatedAt || wo.CreatedDate || new Date().toISOString(),
    updatedAt: wo.UpdatedAt || wo.LastUpdated || new Date().toISOString(),
  }));
  return { data: requests, source: "appfolio" };
}

// --- Aggregated Dashboard Stats ---
export async function fetchDashboardStats(): Promise<{ data: DashboardStats; source: "appfolio" }> {
  const [unitStats, maintenanceResult] = await Promise.all([
    fetchUnitStats(),
    fetchMaintenanceRequests().catch(() => ({ data: [] as MaintenanceRequest[], source: "appfolio" as const })),
  ]);

  const openStatuses = new Set(["submitted", "assigned", "in_progress", "awaiting_parts"]);
  const openMaintenance = maintenanceResult.data.filter((r) => openStatuses.has(r.status)).length;

  const stats: DashboardStats = {
    totalUnits: unitStats.total,
    occupiedUnits: unitStats.occupied,
    vacantUnits: unitStats.unleased,
    turningUnits: 0,
    preLeasedUnits: unitStats.preLeased,
    openMaintenanceRequests: openMaintenance,
    activeInspections: 0,
    upcomingTurns: 0,
    activeApplications: 0,
    upcomingTours: 0,
    upcomingMoveOuts: 0,
    vendorCount: 0,
    pendingRubs: "—",
    reportsDue: 0,
    activeCapitalProjects: 0,
    pendingNotices: 0,
    trackedComps: 0,
    recurringIssues: 0,
  };

  return { data: stats, source: "appfolio" };
}
