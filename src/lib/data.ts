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

/**
 * Get the set of PropertyIds that belong to "Moxie Management" portfolio.
 * The property_directory report has a `Portfolio` field; the rent roll does not.
 * So we cross-reference: fetch property_directory → extract Moxie PropertyIds →
 * use those to filter rent roll / vacancy / work order rows by PropertyId.
 *
 * We also build a set of Moxie property addresses for fallback matching.
 */
let _moxiePropertyIds: Set<string> | null = null;
let _moxiePortfolioIds: Set<string> | null = null;
let _moxiePropertyAddresses: Set<string> | null = null;

function normalizeAddress(addr: string): string {
  return addr.toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

async function getMoxiePropertyIds(): Promise<Set<string>> {
  if (_moxiePropertyIds) return _moxiePropertyIds;

  const rows = await afGetProperties();
  const ids = new Set<string>();
  const portfolioIds = new Set<string>();
  const addrs = new Set<string>();

  for (const row of rows || []) {
    // Try every plausible field name for the portfolio column
    // Note: AppFolio sometimes has trailing spaces (e.g. "Moxie Management ")
    const portfolio = String(
      row.Portfolio || row.PortfolioName || row.portfolio ||
      row.portfolio_name || row.PropertyGroupName || ""
    ).trim();
    if (portfolio === PORTFOLIO_NAME) {
      const id = String(row.PropertyId || row.property_id || "");
      if (id) ids.add(id);
      // Collect PortfolioId values for fallback matching on rent roll
      const pid = row.PortfolioId || row.portfolio_id;
      if (pid != null) portfolioIds.add(String(pid));
      // Also store address for fallback matching
      const addr = String(row.PropertyAddress || row.property_address || row.PropertyStreetAddress1 || "");
      if (addr) addrs.add(normalizeAddress(addr));
    }
  }

  _moxiePropertyIds = ids;
  _moxiePortfolioIds = portfolioIds;
  _moxiePropertyAddresses = addrs;
  return ids;
}

/**
 * Filter any report's rows to only Moxie Management properties.
 * Primary: match by PropertyId cross-ref.
 * Fallback: if PropertyId match yields 0 rows, try matching by address.
 * Last resort: if nothing matches, return all rows (better than showing 0).
 */
async function filterToMoxie(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return rows;

  const moxieIds = await getMoxiePropertyIds();

  // If we couldn't find any Moxie properties at all, return everything
  if (moxieIds.size === 0) return rows;

  // Try filtering by PropertyId
  const byId = rows.filter((row) => {
    const pid = String(row.PropertyId || row.property_id || "");
    return moxieIds.has(pid);
  });
  if (byId.length > 0) return byId;

  // Fallback 1: try matching by PortfolioId (rent roll has this field)
  if (_moxiePortfolioIds && _moxiePortfolioIds.size > 0) {
    const byPortfolioId = rows.filter((row) => {
      const pid = row.PortfolioId || row.portfolio_id;
      return pid != null && _moxiePortfolioIds!.has(String(pid));
    });
    if (byPortfolioId.length > 0) return byPortfolioId;
  }

  // Fallback 2: try matching by property address substring
  if (_moxiePropertyAddresses && _moxiePropertyAddresses.size > 0) {
    const byAddr = rows.filter((row) => {
      const addr = normalizeAddress(
        String(row.PropertyAddress || row.property_address || row.PropertyName || row.property_name || "")
      );
      if (!addr) return false;
      for (const moxieAddr of _moxiePropertyAddresses!) {
        if (addr.includes(moxieAddr) || moxieAddr.includes(addr)) return true;
      }
      return false;
    });
    if (byAddr.length > 0) return byAddr;
  }

  // Last resort: return all rows rather than showing 0
  console.warn(
    `[Moxie] filterToMoxie: no matches found. Moxie IDs: ${[...(moxieIds)].slice(0, 5).join(",")}, ` +
    `sample row PropertyId: ${rows[0]?.PropertyId || rows[0]?.property_id || "N/A"}`
  );
  return rows;
}

/** Diagnostic: show cross-reference details for debugging the Moxie filter */
export async function debugMoxieFilter() {
  const propRows = await afGetProperties();
  const rentRollRows = await afGetRentRoll();

  // What fields does property_directory have?
  const propFields = propRows?.length > 0 ? Object.keys(propRows[0]) : [];

  // What fields does rent_roll have?
  const rrFields = rentRollRows?.length > 0 ? Object.keys(rentRollRows[0]) : [];

  // Show all unique values for every portfolio-like field
  const portfolioFieldValues: Record<string, string[]> = {};
  for (const field of propFields) {
    if (/portfolio|group|management/i.test(field)) {
      const vals = Array.from(new Set((propRows || []).map((p: any) => String(p[field] || "")))) as string[];
      portfolioFieldValues[field] = vals.slice(0, 10);
    }
  }

  // Which property_directory rows match "Moxie Management"?
  const moxieProps = (propRows || []).filter((p: any) => {
    const portfolio = String(
      p.Portfolio || p.PortfolioName || p.portfolio || p.portfolio_name || p.PropertyGroupName || ""
    ).trim();
    return portfolio === PORTFOLIO_NAME;
  });
  const moxiePropertyIds = moxieProps.map((p: any) => String(p.PropertyId || p.property_id || ""));

  // What PropertyIds exist in rent roll?
  const rrPropertyIds = [...new Set((rentRollRows || []).map((r: any) => String(r.PropertyId || r.property_id || "")))];

  // How many rent roll rows match?
  const moxieIdSet = new Set(moxiePropertyIds);
  const matchCount = (rentRollRows || []).filter((r: any) => moxieIdSet.has(String(r.PropertyId || r.property_id || ""))).length;

  return {
    propertyDirectory: {
      totalRows: (propRows || []).length,
      fields: propFields,
      portfolioRelatedFields: propFields.filter(k => /portfolio|group|management/i.test(k)),
      sampleRow: propRows?.[0] || null,
      portfolioFieldValues,
      moxieMatchCount: moxieProps.length,
      moxiePropertyIds: moxiePropertyIds.slice(0, 30),
      moxieSampleRow: moxieProps[0] || null,
    },
    rentRoll: {
      totalRows: (rentRollRows || []).length,
      fields: rrFields,
      uniquePropertyIds: rrPropertyIds.slice(0, 30),
      sampleRow: rentRollRows?.[0] || null,
    },
    crossRef: {
      matchingRentRollRows: matchCount,
      moxieIdSetSize: moxieIdSet.size,
    },
  };
}

// --- Properties ---
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" }> {
  const rows = await afGetProperties();
  const moxieIds = await getMoxiePropertyIds();
  const filtered = moxieIds.size > 0
    ? (rows || []).filter((p: any) => moxieIds.has(String(p.PropertyId || p.property_id || "")))
    : rows || [];
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

  const filtered = await filterToMoxie(rentRollRows);

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
  // Pre-warm the Moxie property ID cache alongside the other fetches
  // so we don't do a serial property_directory fetch inside filterToMoxie
  const [rentRollRows, vacancyRows] = await Promise.all([
    afGetRentRoll(),
    afGetVacancyReport(NEXT_YEAR_START),
    getMoxiePropertyIds().catch(() => new Set<string>()), // pre-warm cache
  ]);

  if (!Array.isArray(rentRollRows) || rentRollRows.length === 0) {
    return { total: 0, occupied: 0, preLeased: 0, unleased: 0, source: "appfolio" as const };
  }

  // Filter to Moxie Management portfolio (cross-ref property_directory)
  const moxieRentRoll = await filterToMoxie(rentRollRows);
  const moxieVacancy = await filterToMoxie(vacancyRows || []);

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
  const allRows = await afGetWorkOrders(params);
  const rows = await filterToMoxie(allRows || []);
  const requests: MaintenanceRequest[] = rows.map((wo: any, i: number) => ({
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
