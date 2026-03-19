// ============================================
// Data Layer — AppFolio API with mock fallback
// ============================================
// Tries to fetch real data from AppFolio API.
// Falls back to mock data if API credentials aren't configured or API fails.

import {
  getProperties as afGetProperties,
  getUnits as afGetUnits,
  getWorkOrders as afGetWorkOrders,
  getVacancyReport as afGetVacancyReport,
} from "./appfolio";
import {
  properties as mockProperties,
  units as mockUnits,
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
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" | "mock" }> {
  if (!isAppFolioConfigured()) {
    return { data: mockProperties, source: "mock" };
  }
  try {
    const result = await afGetProperties();
    const properties: Property[] = (result.properties || result || []).map((p: any) => ({
      id: String(p.id),
      name: p.name || p.description || "",
      address: [p.address_line_1, p.city, p.state, p.zip].filter(Boolean).join(", "),
      unitCount: p.unit_count || 0,
      appfolioId: String(p.id),
    }));
    return { data: properties, source: "appfolio" };
  } catch (error) {
    console.error("AppFolio properties fetch failed, using mock data:", error);
    return { data: mockProperties, source: "mock" };
  }
}

// --- Units & Vacancy ---
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
    const result = await afGetUnits();
    const units = result.units || result || [];
    const total = units.length;
    let occupied = 0;
    let vacant = 0;
    let turning = 0;
    for (const u of units) {
      const status = (u.status || "").toLowerCase();
      if (status === "occupied" || status === "current" || u.tenant_id || u.current_tenant_id) {
        occupied++;
      } else if (status === "turning" || status === "make_ready") {
        turning++;
      } else {
        vacant++;
      }
    }
    return { total, occupied, vacant, turning, source: "appfolio" };
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
    const result = await afGetWorkOrders(params);
    const workOrders = result.work_orders || result || [];
    const requests: MaintenanceRequest[] = workOrders.map((wo: any) => ({
      id: String(wo.id),
      unitId: wo.unit_id ? String(wo.unit_id) : "",
      propertyId: wo.property_id ? String(wo.property_id) : "",
      unitNumber: wo.unit_number || wo.unit_name || "",
      propertyName: wo.property_name || wo.property_description || "",
      tenantName: wo.tenant_name || wo.reported_by || "—",
      tenantPhone: wo.tenant_phone || undefined,
      tenantEmail: wo.tenant_email || undefined,
      category: CATEGORY_MAP[(wo.category || "general").toLowerCase()] || "general",
      priority: PRIORITY_MAP[(wo.priority || "normal").toLowerCase()] || "medium",
      status: STATUS_MAP[(wo.status || "open").toLowerCase()] || "submitted",
      title: wo.description || wo.summary || wo.subject || "Work Order",
      description: wo.detail || wo.description || wo.notes || "",
      photos: wo.photos || wo.attachments || [],
      assignedTo: wo.assigned_to || wo.assignee || undefined,
      vendor: wo.vendor || wo.vendor_name || undefined,
      estimatedCost: wo.estimated_cost ? Number(wo.estimated_cost) : undefined,
      actualCost: wo.actual_cost ? Number(wo.actual_cost) : undefined,
      scheduledDate: wo.scheduled_date || wo.due_date || undefined,
      completedDate: wo.completed_date || wo.resolved_date || undefined,
      notes: wo.work_order_notes
        ? wo.work_order_notes.map((n: any) => typeof n === "string" ? n : n.body || n.note || "")
        : [],
      createdAt: wo.created_at || wo.created_date || new Date().toISOString(),
      updatedAt: wo.updated_at || wo.modified_date || new Date().toISOString(),
      appfolioWorkOrderId: String(wo.id),
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
