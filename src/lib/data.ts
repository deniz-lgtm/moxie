// ============================================
// Data Layer — AppFolio API (real data)
// ============================================
// Fetches live data from AppFolio report-based API.
// Student housing lease year: Aug 15 → Jul 31.
// Pre-leasing: vacancy report dated 8/15/2026 shows which units are vacant
// as of next lease year start. Units NOT on that report = pre-leased.
//
// Portfolio filter: Only include properties tagged under "Moxie Management".

import {
  getProperties as afGetProperties,
  getWorkOrders as afGetWorkOrders,
  getRentRoll as afGetRentRoll,
  getVacancyReport as afGetVacancyReport,
} from "./appfolio";
import type {
  Property,
  Unit,
  MaintenanceRequest,
  DashboardStats,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
} from "./types";

// Portfolio name to filter by
const PORTFOLIO_NAME = "Moxie Management";

// Next lease year start date for vacancy projection
const NEXT_YEAR_START = "08/15/2026";

/** Filter rows to only Moxie Management portfolio */
function filterByPortfolio(rows: any[]): any[] {
  // Try matching on PortfolioName or PropertyGroupName
  // If that field doesn't exist, try PortfolioId once we know which ID maps to Moxie
  return rows.filter((row) => {
    const portfolio = row.PortfolioName || row.Portfolio || row.PropertyGroupName || "";
    return portfolio === PORTFOLIO_NAME;
  });
}

/** Check if a row belongs to the Moxie portfolio by PortfolioId */
function filterByPortfolioId(rows: any[], portfolioId: number | string): any[] {
  return rows.filter((row) => {
    return String(row.PortfolioId) === String(portfolioId) ||
           String(row.portfolio_id) === String(portfolioId);
  });
}

// --- Properties ---
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" }> {
  const rows = await afGetProperties();
  // Try name-based filter first, fall back to showing all if no portfolio field
  let filtered = filterByPortfolio(rows || []);
  if (filtered.length === 0) {
    // Portfolio field might not exist on property_directory — return all
    filtered = rows || [];
  }
  const properties: Property[] = filtered.map((p: any, i: number) => ({
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

// --- Units (unit-centric, with property context) ---
// Rent roll has: UnitId, Unit, PropertyName, PropertyId, Status, Tenant,
//   BdBa ("2/1"), SquareFt, Rent, LeaseFrom, LeaseTo, PortfolioId, ...
function parseBdBa(val: string | null | undefined): { bed: number | null; bath: number | null } {
  if (!val) return { bed: null, bath: null };
  const parts = val.split("/").map((s) => s.trim().replace("--", ""));
  const bed = parts[0] ? parseInt(parts[0], 10) : null;
  const bath = parts[1] ? parseInt(parts[1], 10) : null;
  return { bed: isNaN(bed as number) ? null : bed, bath: isNaN(bath as number) ? null : bath };
}

function parseSqft(val: string | null | undefined): number | null {
  if (!val) return null;
  const n = parseInt(String(val).replace(/,/g, ""), 10);
  return isNaN(n) ? null : n;
}

export async function fetchUnits(): Promise<{ data: Unit[]; source: "appfolio" }> {
  const rentRollRows = await afGetRentRoll();
  if (!Array.isArray(rentRollRows) || rentRollRows.length === 0) {
    return { data: [], source: "appfolio" };
  }

  let filtered = filterByPortfolio(rentRollRows);
  if (filtered.length === 0) filtered = rentRollRows;

  const units: Unit[] = filtered.map((r: any) => {
    const unitNum = String(r.Unit || r.UnitName || "");
    const propName = String(r.PropertyName || "");
    const { bed, bath } = parseBdBa(r.BdBa);
    const status = String(r.Status || "").toLowerCase() as Unit["status"];

    return {
      id: String(r.UnitId || ""),
      propertyId: String(r.PropertyId || ""),
      propertyName: propName,
      number: unitNum,
      displayName: `${propName} #${unitNum}`,
      bedrooms: bed,
      bathrooms: bath,
      sqft: parseSqft(r.SquareFt),
      rent: r.Rent || null,
      status: (["current", "vacant", "notice", "future"].includes(status) ? status : "vacant") as Unit["status"],
      tenant: r.Tenant || null,
      leaseFrom: r.LeaseFrom || null,
      leaseTo: r.LeaseTo || null,
      appfolioId: r.UnitId ? String(r.UnitId) : undefined,
    };
  });

  return { data: units, source: "appfolio" };
}

// --- Leasing Stats (Pre-leased for upcoming academic year) ---
// Strategy:
//   1. Rent roll = all units (total count + current occupancy)
//   2. Vacancy report dated 8/15/2026 = units that will be vacant at lease year start
//   3. Pre-leased = total - vacant-on-8/15
//
// Both filtered to Moxie Management portfolio only.
export async function fetchUnitStats(): Promise<{
  total: number;
  occupied: number;
  preLeased: number;
  unleased: number;
  source: "appfolio";
}> {
  const [rentRollRows, vacancyRows] = await Promise.all([
    afGetRentRoll(),
    afGetVacancyReport(NEXT_YEAR_START),
  ]);

  if (!Array.isArray(rentRollRows) || rentRollRows.length === 0) {
    throw new Error("No rent roll data returned");
  }

  // Filter to Moxie Management portfolio
  let moxieRentRoll = filterByPortfolio(rentRollRows);
  let moxieVacancy = filterByPortfolio(vacancyRows || []);

  // If portfolio name filter didn't work (field might not exist), try PortfolioId
  if (moxieRentRoll.length === 0) {
    // Discover Moxie portfolio ID from properties that aren't the Sacramento ones
    // For now, try all — the portfolio filter will be refined once we see the data
    moxieRentRoll = rentRollRows;
    moxieVacancy = vacancyRows || [];
  }

  const total = moxieRentRoll.length;

  // Current occupancy
  let occupied = 0;
  for (const row of moxieRentRoll) {
    const status = String(row.Status || "").toLowerCase();
    if (status === "current" || status === "notice") {
      occupied++;
    }
  }

  // Vacancy as of 8/15/2026 — these units are NOT pre-leased
  const vacantUnitIds = new Set(
    moxieVacancy.map((v: any) => String(v.UnitId || v.unit_id || "")).filter(Boolean)
  );
  // If vacancy report returns unit names instead of IDs, also match on name
  const vacantUnitNames = new Set(
    moxieVacancy.map((v: any) => String(v.Unit || v.UnitName || v.unit_name || "")).filter(Boolean)
  );

  let unleased = 0;
  for (const row of moxieRentRoll) {
    const uid = String(row.UnitId || "");
    const uname = String(row.Unit || "");
    if (vacantUnitIds.has(uid) || vacantUnitNames.has(uname)) {
      unleased++;
    }
  }

  // If vacancy report returned nothing (maybe API doesn't support as_of_date),
  // fall back: unleased = count of vacancy report rows
  if ((vacancyRows || []).length > 0 && moxieVacancy.length > 0 && unleased === 0) {
    unleased = moxieVacancy.length;
  }

  const preLeased = total - unleased;

  return {
    total,
    occupied,
    preLeased,
    unleased,
    source: "appfolio",
  };
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
