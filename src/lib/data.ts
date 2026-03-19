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
  getTenants as afGetTenants,
} from "./appfolio";
import type {
  Property,
  Unit,
  MaintenanceRequest,
  DashboardStats,
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceStatus,
  ApplicationGroup,
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

  try {
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

    console.log(`[Moxie] getMoxiePropertyIds: found ${ids.size} Moxie properties, ${portfolioIds.size} portfolio IDs`);
    _moxiePropertyIds = ids;
    _moxiePortfolioIds = portfolioIds;
    _moxiePropertyAddresses = addrs;
    return ids;
  } catch (e) {
    console.error("[Moxie] getMoxiePropertyIds failed:", e);
    // Return empty set — filterToMoxie will fall through to returning all rows
    _moxiePropertyIds = new Set<string>();
    _moxiePortfolioIds = new Set<string>();
    _moxiePropertyAddresses = new Set<string>();
    return _moxiePropertyIds;
  }
}

// Known Moxie Management PortfolioId values (from property_directory).
// Used as a guaranteed fallback when the property_directory API call fails.
const MOXIE_PORTFOLIO_IDS = new Set(["10", "24"]);

/**
 * Filter any report's rows to only Moxie Management properties.
 * 1. PropertyId cross-ref from property_directory (if available)
 * 2. PortfolioId matching (known Moxie PortfolioIds: 10, 24)
 * 3. Address matching
 * 4. Last resort: return all rows
 */
async function filterToMoxie(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return rows;

  const moxieIds = await getMoxiePropertyIds();

  // Try filtering by PropertyId (cross-ref from property_directory)
  if (moxieIds.size > 0) {
    const byId = rows.filter((row) => {
      const pid = String(row.PropertyId || row.property_id || "");
      return moxieIds.has(pid);
    });
    if (byId.length > 0) {
      console.log(`[Moxie] filterToMoxie: matched ${byId.length}/${rows.length} rows by PropertyId`);
      return byId;
    }
  }

  // Fallback 1: PortfolioId from dynamic lookup or hardcoded known values
  const portfolioIds = (_moxiePortfolioIds && _moxiePortfolioIds.size > 0)
    ? _moxiePortfolioIds
    : MOXIE_PORTFOLIO_IDS;
  const byPortfolioId = rows.filter((row) => {
    const pid = row.PortfolioId || row.portfolio_id;
    return pid != null && portfolioIds.has(String(pid));
  });
  if (byPortfolioId.length > 0) {
    console.log(`[Moxie] filterToMoxie: matched ${byPortfolioId.length}/${rows.length} rows by PortfolioId`);
    return byPortfolioId;
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
    `portfolioIds tried: ${[...portfolioIds].join(",")}, ` +
    `sample row: PropertyId=${rows[0]?.PropertyId}, PortfolioId=${rows[0]?.PortfolioId}`
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
  // Pre-warm the Moxie property ID cache BEFORE fetching rent roll
  // to avoid concurrent API calls that trigger AppFolio rate limiting.
  await getMoxiePropertyIds();

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
  // Fetch Moxie property IDs FIRST (sequential) to avoid concurrent API calls
  // that trigger AppFolio rate limiting. The cache is then used by filterToMoxie.
  await getMoxiePropertyIds();

  // Now fetch rent roll and vacancy in parallel (property_directory is already cached).
  // Vacancy report with future as_of_date may fail (400) — make it non-fatal.
  const [rentRollRows, vacancyRows] = await Promise.all([
    afGetRentRoll(),
    afGetVacancyReport(NEXT_YEAR_START).catch(() => [] as any[]),
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
  // Ensure Moxie property IDs are cached before fetching work orders
  await getMoxiePropertyIds();
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

// --- Applications (from AppFolio tenant directory) ---
// AppFolio tenant_directory includes applicants (TenantStatus = "Applicant" or similar).
// We group them by property+unit to create ApplicationGroup-like records.
export async function fetchApplications(): Promise<{ data: ApplicationGroup[]; source: "appfolio" }> {
  await getMoxiePropertyIds();
  const allTenants = await afGetTenants({ status: "applicant" }).catch(() => [] as any[]);
  const tenants = await filterToMoxie(allTenants || []);

  // Group applicants by property + unit
  const groupMap = new Map<string, any[]>();
  for (const t of tenants) {
    const propName = String(t.PropertyName || t.property_name || "");
    const unit = String(t.Unit || t.UnitName || t.unit_name || "");
    const key = `${t.PropertyId || t.property_id || ""}:${unit}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t);
  }

  const groups: ApplicationGroup[] = [];
  let idx = 0;
  for (const [key, members] of groupMap) {
    idx++;
    const first = members[0];
    const propName = String(first.PropertyName || first.property_name || "");
    const unit = String(first.Unit || first.UnitName || first.unit_name || "");

    const applicants = members.map((m: any, i: number) => ({
      id: String(m.TenantId || m.tenant_id || `app-${idx}-${i}`),
      groupId: `grp-${idx}`,
      name: String(m.TenantName || m.tenant_name || m.Name || "Unknown"),
      email: String(m.Email || m.TenantEmail || m.email || ""),
      phone: m.Phone || m.TenantPhone || m.phone || undefined,
      role: (i === 0 ? "primary" : "co_applicant") as "primary" | "co_applicant",
      steps: [
        { id: `s-${idx}-${i}-1`, name: "Application Submitted", description: "Complete online application", required: true, status: "complete" as const },
        { id: `s-${idx}-${i}-2`, name: "Background Check", description: "Credit and background screening", required: true, status: (m.ScreeningStatus === "Completed" || m.screening_status === "completed" ? "complete" : "in_review") as "complete" | "in_review" },
        { id: `s-${idx}-${i}-3`, name: "Income Verification", description: "Verify income documentation", required: true, status: "pending" as const },
        { id: `s-${idx}-${i}-4`, name: "Lease Signing", description: "Sign the lease agreement", required: true, status: "pending" as const },
      ],
      documents: [],
      nudges: [],
      status: "in_progress" as const,
      startedAt: m.ApplicationDate || m.application_date || m.CreatedAt || new Date().toISOString(),
    }));

    // Determine group status based on member data
    const hasApproved = members.some((m: any) => {
      const s = String(m.TenantStatus || m.tenant_status || m.Status || "").toLowerCase();
      return s === "approved" || s === "current";
    });
    const hasDenied = members.some((m: any) => {
      const s = String(m.TenantStatus || m.tenant_status || m.Status || "").toLowerCase();
      return s === "denied" || s === "rejected";
    });

    groups.push({
      id: `grp-${idx}`,
      propertyId: String(first.PropertyId || first.property_id || ""),
      propertyName: propName,
      unitNumber: unit,
      unitDetails: "",
      leaseCycle: "fall_2026",
      targetMoveIn: "08/15/2026",
      monthlyRent: 0,
      applicants,
      status: hasApproved ? "approved" : hasDenied ? "denied" : "incomplete",
      createdAt: first.ApplicationDate || first.application_date || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return { data: groups, source: "appfolio" };
}

// --- Aggregated Dashboard Stats ---
export async function fetchDashboardStats(): Promise<{ data: DashboardStats; source: "appfolio" }> {
  // getMoxiePropertyIds() is called inside each sub-function and cached,
  // but we pre-warm it here to serialize the property_directory call.
  await getMoxiePropertyIds();

  const [unitStats, maintenanceResult, applicationsResult] = await Promise.all([
    fetchUnitStats(),
    fetchMaintenanceRequests().catch(() => ({ data: [] as MaintenanceRequest[], source: "appfolio" as const })),
    fetchApplications().catch(() => ({ data: [] as ApplicationGroup[], source: "appfolio" as const })),
  ]);

  const openStatuses = new Set(["submitted", "assigned", "in_progress", "awaiting_parts"]);
  const openMaintenance = maintenanceResult.data.filter((r) => openStatuses.has(r.status)).length;
  const activeApps = applicationsResult.data.filter((g) => g.status === "incomplete" || g.status === "under_review").length;

  // Count upcoming move-outs from rent roll (leases ending within 60 days)
  const now = new Date();
  const sixtyDaysOut = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const stats: DashboardStats = {
    totalUnits: unitStats.total,
    occupiedUnits: unitStats.occupied,
    vacantUnits: unitStats.unleased,
    turningUnits: 0,
    preLeasedUnits: unitStats.preLeased,
    openMaintenanceRequests: openMaintenance,
    activeInspections: 0,
    upcomingTurns: 0,
    activeApplications: activeApps || applicationsResult.data.length,
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
