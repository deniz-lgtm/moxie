// ============================================
// Data Layer — AppFolio API with mock fallback
// ============================================
// Tries to fetch real data from AppFolio report-based API.
// Falls back to mock data if API credentials aren't configured or API fails.

import {
  getProperties as afGetProperties,
  getWorkOrders as afGetWorkOrders,
  getRentRoll as afGetRentRoll,
} from "./appfolio";
import {
  properties as mockProperties,
  maintenanceRequests as mockMaintenance,
  dashboardStats as mockDashboardStats,
} from "./mock-data";
import type {
  Property,
  MaintenanceRequest,
  DashboardStats,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from "./types";

function isAppFolioConfigured(): boolean {
  return !!(
    process.env.APPFOLIO_CLIENT_ID &&
    process.env.APPFOLIO_CLIENT_SECRET &&
    process.env.APPFOLIO_DATABASE_NAME
  );
}

// --- Properties ---
// AppFolio property_directory report returns rows like:
// { property_name, property_address, property_city, property_state, property_zip, unit_count, ... }
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" | "mock" }> {
  if (!isAppFolioConfigured()) {
    return { data: mockProperties, source: "mock" };
  }
  try {
    const rows = await afGetProperties();
    if (!Array.isArray(rows) || rows.length === 0) {
      return { data: mockProperties, source: "mock" };
    }
    const properties: Property[] = rows.map((p: any, i: number) => ({
      id: String(p.property_id || p.id || `prop-${i}`),
      name: p.property_name || p.name || p.description || "",
      address: [p.property_address || p.address_line_1 || p.address, p.property_city || p.city, p.property_state || p.state, p.property_zip || p.zip]
        .filter(Boolean)
        .join(", "),
      unitCount: Number(p.unit_count || p.total_units || 0),
    }));
    return { data: properties, source: "appfolio" };
  } catch (error) {
    console.error("AppFolio properties fetch failed, using mock data:", error);
    return { data: mockProperties, source: "mock" };
  }
}

// --- Units & Vacancy ---
// unit_directory gives total unit count (RentStatus is unreliable/null).
// rent_roll gives currently occupied units (units with an active lease).
export async function fetchUnitStats(): Promise<{
  total: number;
  occupied: number;
  vacant: number;
  turning: number;
  source: "appfolio" | "mock";
}> {
  if (!isAppFolioConfigured()) {
    return {
      total: mockDashboardStats.totalUnits,
      occupied: mockDashboardStats.occupiedUnits,
      vacant: mockDashboardStats.vacantUnits,
      turning: mockDashboardStats.turningUnits,
      source: "mock",
    };
  }
  try {
    // Rent roll includes ALL units with a Status field:
    //   "Current" = occupied, "Vacant" = vacant, etc.
    const rentRollRows = await afGetRentRoll();

    if (!Array.isArray(rentRollRows) || rentRollRows.length === 0) {
      throw new Error("No rent roll data returned");
    }

    const total = rentRollRows.length;
    let occupied = 0;
    let vacant = 0;

    for (const row of rentRollRows) {
      const status = String(row.Status || row.status || "").toLowerCase();
      if (status === "current" || status === "notice") {
        occupied++;
      } else {
        vacant++;
      }
    }

    return { total, occupied, vacant, turning: 0, source: "appfolio" };
  } catch (error) {
    console.error("AppFolio units fetch failed, using mock data:", error);
    return {
      total: mockDashboardStats.totalUnits,
      occupied: mockDashboardStats.occupiedUnits,
      vacant: mockDashboardStats.vacantUnits,
      turning: mockDashboardStats.turningUnits,
      source: "mock",
    };
  }
}

// --- Work Orders / Maintenance ---
// AppFolio work_order_detail report returns rows like:
// { work_order_id, property_name, unit_name, description, status, priority, category,
//   assigned_to, vendor_name, tenant_name, created_date, completed_date, ... }
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
}): Promise<{ data: MaintenanceRequest[]; source: "appfolio" | "mock" }> {
  if (!isAppFolioConfigured()) {
    return { data: mockMaintenance, source: "mock" };
  }
  try {
    const rows = await afGetWorkOrders(params);
    if (!Array.isArray(rows) || rows.length === 0) {
      return { data: mockMaintenance, source: "mock" };
    }
    const requests: MaintenanceRequest[] = rows.map((wo: any, i: number) => ({
      id: String(wo.work_order_id || wo.id || `wo-${i}`),
      unitId: String(wo.unit_id || ""),
      propertyId: String(wo.property_id || ""),
      unitNumber: String(wo.unit_name || wo.unit_number || ""),
      propertyName: String(wo.property_name || wo.property || ""),
      tenantName: String(wo.tenant_name || wo.reported_by || "—"),
      tenantPhone: wo.tenant_phone || undefined,
      tenantEmail: wo.tenant_email || undefined,
      category: CATEGORY_MAP[String(wo.category || wo.work_order_category || "general").toLowerCase()] || "general",
      priority: PRIORITY_MAP[String(wo.priority || "normal").toLowerCase()] || "medium",
      status: STATUS_MAP[String(wo.status || wo.work_order_status || "open").toLowerCase()] || "submitted",
      title: String(wo.job_description || wo.description || wo.summary || wo.subject || "Work Order"),
      description: String(wo.detail || wo.job_description || wo.description || ""),
      photos: [],
      assignedTo: wo.assigned_to || wo.assigned_users || undefined,
      vendor: wo.vendor_name || wo.vendor || undefined,
      estimatedCost: wo.estimated_cost ? Number(wo.estimated_cost) : undefined,
      actualCost: wo.actual_cost || wo.total_cost ? Number(wo.actual_cost || wo.total_cost) : undefined,
      scheduledDate: wo.scheduled_end || wo.scheduled_date || wo.due_date || undefined,
      completedDate: wo.completed_on || wo.completed_date || undefined,
      notes: [],
      createdAt: wo.created_at || wo.created_date || new Date().toISOString(),
      updatedAt: wo.updated_at || wo.last_updated || new Date().toISOString(),
    }));
    return { data: requests, source: "appfolio" };
  } catch (error) {
    console.error("AppFolio work orders fetch failed, using mock data:", error);
    return { data: mockMaintenance, source: "mock" };
  }
}

// --- Aggregated Dashboard Stats ---
export async function fetchDashboardStats(): Promise<{ data: DashboardStats; source: "appfolio" | "mock" }> {
  if (!isAppFolioConfigured()) {
    return { data: mockDashboardStats, source: "mock" };
  }
  try {
    const [unitStats, maintenanceResult] = await Promise.all([
      fetchUnitStats(),
      fetchMaintenanceRequests(),
    ]);

    const openStatuses = new Set(["submitted", "assigned", "in_progress", "awaiting_parts"]);
    const openMaintenance = maintenanceResult.data.filter((r) => openStatuses.has(r.status)).length;

    const stats: DashboardStats = {
      ...mockDashboardStats,
      totalUnits: unitStats.total,
      occupiedUnits: unitStats.occupied,
      vacantUnits: unitStats.vacant,
      turningUnits: unitStats.turning,
      openMaintenanceRequests: openMaintenance,
    };

    return { data: stats, source: unitStats.source === "appfolio" ? "appfolio" : "mock" };
  } catch (error) {
    console.error("Dashboard stats fetch failed, using mock data:", error);
    return { data: mockDashboardStats, source: "mock" };
  }
}
