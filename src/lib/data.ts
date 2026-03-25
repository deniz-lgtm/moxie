// ============================================
// Data Layer — AppFolio API (real data)
// ============================================
// Fetches live data from AppFolio report-based API.
// Student housing lease year: Aug 15 → Jul 31.
//
// Portfolio filter: portfolio_id = 10 (v2) for Moxie Management.
// Rent roll has portfolio_id = null — cross-reference via property_id from property_directory.
// Unit identity: "Unit Street Address 1" from AppFolio = "Unit Name" in Moxie.

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
  AcademicYear,
} from "./types";
import { academicYearDates } from "./types";

// Moxie Management portfolio identification:
// - v1 API used PortfolioId = 24
// - v2 API uses portfolio_id = 10 in property_directory, and portfolio_id = null in rent_roll
// - The portfolio name field is "Moxie Management" (sometimes with trailing space)
// Strategy: derive Moxie property_ids from property_directory (portfolio_id=10),
// then use those property_ids to filter rent_roll and other reports.
const MOXIE_PORTFOLIO_ID = "10"; // v2 property_directory portfolio_id for Moxie

/** Cache for Moxie property IDs (derived from property_directory where portfolio_id=10) */
let _moxiePropertyIdCache: Set<string> | null = null;
let _moxiePropertyIdCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the set of property_ids that belong to Moxie Management.
 * Derived from the property_directory report where portfolio_id = 10.
 */
async function getMoxiePropertyIds(): Promise<Set<string>> {
  const now = Date.now();
  if (_moxiePropertyIdCache && now - _moxiePropertyIdCacheTime < CACHE_TTL) {
    return _moxiePropertyIdCache;
  }
  const propRows = await afGetProperties();
  const ids = new Set<string>();
  for (const p of (propRows || [])) {
    const pid = String(p.portfolio_id ?? "").trim();
    if (pid === MOXIE_PORTFOLIO_ID) {
      const propId = String(p.property_id || "");
      if (propId) ids.add(propId);
    }
  }
  _moxiePropertyIdCache = ids;
  _moxiePropertyIdCacheTime = now;
  console.log(`[Moxie] Cached ${ids.size} Moxie property IDs from property_directory (portfolio_id=${MOXIE_PORTFOLIO_ID})`);
  return ids;
}

/**
 * Filter any report's rows to Moxie properties.
 * Checks portfolio_id = 10 (property_directory) OR property_id membership
 * in the Moxie set (for rent_roll/work_orders/tenants where portfolio_id is null).
 */
async function filterToMoxie(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return [];
  const moxieIds = await getMoxiePropertyIds();
  const filtered = rows.filter((row) => {
    // Match by portfolio_id (works for property_directory)
    const pid = String(row.portfolio_id ?? row.PortfolioId ?? "").trim();
    if (pid === MOXIE_PORTFOLIO_ID) return true;

    // Match by property_id membership (works for rent_roll, work_orders, tenants
    // where portfolio_id is null but property_id links to a Moxie property)
    const propId = String(row.property_id || row.PropertyId || "");
    if (propId && moxieIds.has(propId)) return true;

    return false;
  });
  if (filtered.length === 0 && rows.length > 0) {
    console.warn(
      `[Moxie] filterToMoxie: 0/${rows.length} rows matched. ` +
      `Moxie property IDs available: ${moxieIds.size}. ` +
      `Sample: portfolio_id=${rows[0]?.portfolio_id}, property_id=${rows[0]?.property_id}`
    );
  }
  return filtered;
}

/** Diagnostic: show raw data for debugging portfolio filtering */
export async function debugMoxieFilter() {
  const propRows = await afGetProperties();
  const rentRollRows = await afGetRentRoll();

  const propFields = propRows?.length > 0 ? Object.keys(propRows[0]) : [];
  const rrFields = rentRollRows?.length > 0 ? Object.keys(rentRollRows[0]) : [];

  // Show ALL unique portfolio_id values and their counts in property_directory
  const propPortfolioBreakdown: Record<string, { count: number; sampleProperty: string; portfolioName: string }> = {};
  for (const p of (propRows || [])) {
    const pid = String(p.portfolio_id ?? "null");
    const pname = String(p.portfolio ?? p.portfolio_name ?? "").trim();
    if (!propPortfolioBreakdown[pid]) {
      propPortfolioBreakdown[pid] = {
        count: 0,
        sampleProperty: p.property_name || p.property || "",
        portfolioName: pname,
      };
    }
    propPortfolioBreakdown[pid].count++;
  }

  // Show ALL unique portfolio_id values in rent_roll
  const rrPortfolioBreakdown: Record<string, { count: number; sampleProperty: string }> = {};
  for (const r of (rentRollRows || [])) {
    const pid = String(r.portfolio_id ?? "null");
    if (!rrPortfolioBreakdown[pid]) {
      rrPortfolioBreakdown[pid] = {
        count: 0,
        sampleProperty: r.property_name || r.property || "",
      };
    }
    rrPortfolioBreakdown[pid].count++;
  }

  // Find 2414 Catalina St specifically in both reports
  const catalinaProps = (propRows || []).filter((p: any) => {
    const searchable = JSON.stringify(p).toLowerCase();
    return searchable.includes("catalina") || searchable.includes("1481 w 25th");
  });
  const catalinaRR = (rentRollRows || []).filter((r: any) => {
    const searchable = JSON.stringify(r).toLowerCase();
    return searchable.includes("catalina") || searchable.includes("1481 w 25th");
  });

  // Apply current filters
  const moxieProps = await filterToMoxie(propRows || []);
  const moxieRR = await filterToMoxie(rentRollRows || []);

  // Check if 2414 Catalina made it through the filter
  const catalinaInFilteredRR = moxieRR.filter((r: any) => {
    const searchable = JSON.stringify(r).toLowerCase();
    return searchable.includes("catalina") || searchable.includes("1481 w 25th");
  });

  // Cross-reference property IDs
  const propIds = moxieProps.map((p: any) => String(p.property_id || p.PropertyId || p.id || ""));
  const rrPropIds = [...new Set(moxieRR.map((r: any) => String(r.property_id || r.PropertyId || "")))];

  return {
    portfolioBreakdown: {
      propertyDirectory: propPortfolioBreakdown,
      rentRoll: rrPortfolioBreakdown,
    },
    catalinaSearch: {
      inPropertyDirectory: catalinaProps,
      inRentRoll: catalinaRR,
      inFilteredRentRoll: catalinaInFilteredRR,
      catalinaPassedFilter: catalinaInFilteredRR.length > 0,
    },
    filterResults: {
      propertyDirectory: {
        totalRows: (propRows || []).length,
        moxieMatchCount: moxieProps.length,
        moxieSampleRow: moxieProps[0] || null,
      },
      rentRoll: {
        totalRows: (rentRollRows || []).length,
        moxieMatchCount: moxieRR.length,
        moxieSampleRow: moxieRR[0] || null,
      },
    },
    crossReference: {
      moxiePropertyIds: propIds.slice(0, 20),
      rentRollPropertyIds: rrPropIds.slice(0, 20),
      matchingPropertyIds: propIds.filter((id: string) => rrPropIds.includes(id)).length,
    },
    fields: {
      propertyDirectory: propFields,
      rentRoll: rrFields,
    },
  };
}

// --- Properties ---
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" }> {
  const rows = await afGetProperties();
  const filtered = await filterToMoxie(rows || []);
  const properties: Property[] = filtered.map((p: any, i: number) => ({
    // v2 uses snake_case; fallback to v1 PascalCase; also try generic "id"
    id: String(p.property_id || p.PropertyId || p.id || `prop-${i}`),
    name: p.property_name || p.PropertyName || "",
    address: [
      p.property_address || p.PropertyAddress || "",
      p.property_city || p.PropertyCity || "",
      p.property_state || p.PropertyState || "",
      p.property_zip || p.PropertyZip || "",
    ]
      .filter(Boolean)
      .join(", "),
    unitCount: Number(p.units || p.UnitCount || 0),
  }));
  return { data: properties, source: "appfolio" };
}

// --- Units (unit-centric) ---
// Rent roll fields: UnitId, Unit, UnitStreetAddress1, PropertyName, PropertyId,
//   Status, Tenant, BdBa ("2/1"), SquareFt, Rent, LeaseFrom, LeaseTo, PortfolioId
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

/**
 * Fetch all Moxie units from AppFolio rent roll.
 * Optional academicYear filter: when provided, derives lease date range and
 * classifies units based on their lease overlap with that academic year.
 */
export async function fetchUnits(academicYear?: AcademicYear): Promise<{ data: Unit[]; source: "appfolio" }> {
  const rentRollRows = await afGetRentRoll();
  if (!Array.isArray(rentRollRows) || rentRollRows.length === 0) {
    return { data: [], source: "appfolio" };
  }

  const filtered = await filterToMoxie(rentRollRows);

  const units: Unit[] = filtered.map((r: any) => {
    // v2 rent_roll doesn't have a dedicated unit street address field;
    // construct from property_street + property_street2, or fall back to v1 fields
    const unitStreet = r.property_street && r.property_street2
      ? `${r.property_street} ${r.property_street2}`.trim()
      : "";
    const unitName = String(
      unitStreet || r.unit_street || r.UnitStreetAddress1 || r["Unit Street Address 1"] || r.unit_address || r.UnitAddress || r.unit || r.Unit || ""
    );
    const unitNum = String(r.unit || r.Unit || r.unit_name || r.UnitName || "");
    const propName = String(r.property_name || r.PropertyName || "");
    const { bed, bath } = parseBdBa(r.bd_ba || r.BdBa);
    const rawStatus = String(r.status || r.Status || "").toLowerCase();
    const status = (["current", "vacant", "notice", "future"].includes(rawStatus)
      ? rawStatus
      : "vacant") as Unit["status"];

    return {
      id: String(r.unit_id || r.UnitId || ""),
      propertyId: String(r.property_id || r.PropertyId || ""),
      propertyName: propName,
      number: unitNum,
      unitName,
      displayName: unitName || `${propName} #${unitNum}`,
      bedrooms: bed,
      bathrooms: bath,
      sqft: parseSqft(r.sqft || r.SquareFt),
      rent: r.rent || r.Rent || null,
      status,
      tenant: r.tenant || r.Tenant || null,
      leaseFrom: r.lease_from || r.LeaseFrom || null,
      leaseTo: r.lease_to || r.LeaseTo || null,
      appfolioId: r.unit_id || r.UnitId ? String(r.unit_id || r.UnitId) : undefined,
    };
  });

  // If academic year is specified, re-classify statuses based on lease overlap
  if (academicYear) {
    const { leaseStart, leaseEnd } = academicYearDates(academicYear);
    const ayStart = new Date(leaseStart);
    const ayEnd = new Date(leaseEnd);

    for (const unit of units) {
      if (unit.leaseTo) {
        const leaseTo = new Date(unit.leaseTo);
        // If lease ends before academic year starts, unit is vacant for that year
        if (leaseTo < ayStart) {
          unit.status = "vacant";
          continue;
        }
      }
      if (unit.leaseFrom) {
        const leaseFrom = new Date(unit.leaseFrom);
        // Future lease starting in this academic year = pre-leased
        if (leaseFrom >= ayStart && unit.status === "future") {
          continue; // keep "future" status
        }
      }
    }
  }

  return { data: units, source: "appfolio" };
}

/**
 * Fetch units with all tenants grouped per unit.
 * The rent roll may have multiple rows per unit (one per tenant on the lease).
 * This function deduplicates by UnitId/UnitStreetAddress1 and groups all tenants.
 */
export async function fetchUnitsWithTenants(): Promise<{
  data: (Unit & { tenants: string[]; tenantEmails: string[] })[];
  source: "appfolio";
}> {
  const rentRollRows = await afGetRentRoll();
  if (!Array.isArray(rentRollRows) || rentRollRows.length === 0) {
    return { data: [], source: "appfolio" };
  }

  const filtered = await filterToMoxie(rentRollRows);

  // Group rows by unit key (unit_id for v2, UnitId for v1)
  const unitMap = new Map<string, { unit: any; tenants: string[] }>();

  for (const r of filtered) {
    const unitKey = String(r.unit_id || r.UnitId || r.unit || r.Unit || "");
    const tenant = String(r.tenant || r.Tenant || "").trim();

    if (!unitMap.has(unitKey)) {
      unitMap.set(unitKey, { unit: r, tenants: [] });
    }
    if (tenant && tenant !== "null" && tenant !== "undefined") {
      unitMap.get(unitKey)!.tenants.push(tenant);
    }
  }

  // Also fetch tenant directory for emails
  let tenantEmailMap = new Map<string, string>();
  try {
    const tenantRows = await afGetTenants();
    const moxieTenants = await filterToMoxie(tenantRows || []);
    for (const t of moxieTenants) {
      const name = String(t.tenant_name || t.TenantName || t.Name || "").trim();
      const email = String(t.email || t.Email || t.TenantEmail || "").trim();
      if (name && email && email !== "null") {
        tenantEmailMap.set(name.toLowerCase(), email);
      }
    }
  } catch {
    // Tenant email lookup is best-effort
  }

  const units: (Unit & { tenants: string[]; tenantEmails: string[] })[] = [];

  for (const [, { unit: r, tenants }] of unitMap) {
    // v2: construct unit name from property_street fields; v1: use UnitStreetAddress1
    const unitStreet = r.property_street && r.property_street2
      ? `${r.property_street} ${r.property_street2}`.trim()
      : "";
    const unitName = String(
      unitStreet || r.unit_street || r.UnitStreetAddress1 || r["Unit Street Address 1"] || r.unit || r.Unit || ""
    );
    const unitNum = String(r.unit || r.Unit || r.unit_name || r.UnitName || "");
    const propName = String(r.property_name || r.PropertyName || "");
    const { bed, bath } = parseBdBa(r.bd_ba || r.BdBa);
    const rawStatus = String(r.status || r.Status || "").toLowerCase();
    const status = (["current", "vacant", "notice", "future"].includes(rawStatus)
      ? rawStatus
      : "vacant") as Unit["status"];

    const tenantEmails = tenants
      .map((t) => tenantEmailMap.get(t.toLowerCase()) || "")
      .filter(Boolean);

    units.push({
      id: String(r.unit_id || r.UnitId || ""),
      propertyId: String(r.property_id || r.PropertyId || ""),
      propertyName: propName,
      number: unitNum,
      unitName,
      displayName: unitName || `${propName} #${unitNum}`,
      bedrooms: bed,
      bathrooms: bath,
      sqft: parseSqft(r.sqft || r.SquareFt),
      rent: r.rent || r.Rent || null,
      status,
      tenant: tenants.length > 0 ? tenants.join(", ") : null,
      tenants,
      tenantEmails,
      leaseFrom: r.lease_from || r.LeaseFrom || null,
      leaseTo: r.lease_to || r.LeaseTo || null,
      appfolioId: r.unit_id || r.UnitId ? String(r.unit_id || r.UnitId) : undefined,
    });
  }

  return { data: units, source: "appfolio" };
}

/**
 * Fetch all tenants for a specific unit by matching UnitStreetAddress1.
 * More reliable than name-based matching since it uses the address directly.
 */
export async function fetchTenantsForUnit(
  unitAddress: string
): Promise<{ name: string; email: string }[]> {
  try {
    const tenantRows = await afGetTenants();
    if (!Array.isArray(tenantRows) || tenantRows.length === 0) return [];

    const moxieTenants = await filterToMoxie(tenantRows);
    const normalizedAddress = unitAddress.trim().toLowerCase();

    const matched: { name: string; email: string }[] = [];
    for (const t of moxieTenants) {
      // v2: construct from property_street fields; v1: UnitStreetAddress1
      const tStreet = t.property_street && t.property_street2
        ? `${t.property_street} ${t.property_street2}`.trim()
        : "";
      const addr = String(
        tStreet || t.unit_street || t.UnitStreetAddress1 || t["Unit Street Address 1"] || ""
      ).trim().toLowerCase();
      if (!addr || addr !== normalizedAddress) continue;

      const name = String(t.tenant_name || t.TenantName || t.Name || "").trim();
      const email = String(t.email || t.Email || t.TenantEmail || "").trim();
      if (name && name !== "null") {
        matched.push({ name, email: email && email !== "null" ? email : "" });
      }
    }

    return matched;
  } catch (err) {
    console.error("[fetchTenantsForUnit] Error:", err);
    return [];
  }
}

// --- Leasing Stats ---
export async function fetchUnitStats(academicYear?: AcademicYear): Promise<{
  total: number;
  occupied: number;
  preLeased: number;
  unleased: number;
  source: "appfolio";
}> {
  const { data: units } = await fetchUnits(academicYear);

  let occupied = 0;
  let vacant = 0;
  let future = 0;
  let notice = 0;

  for (const unit of units) {
    switch (unit.status) {
      case "current": occupied++; break;
      case "notice": notice++; break;
      case "future": future++; break;
      default: vacant++; break;
    }
  }

  return {
    total: units.length,
    occupied: occupied + notice,
    preLeased: future,
    unleased: vacant,
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
    unitNumber: String(
      wo.UnitStreetAddress1 || wo["Unit Street Address 1"] || wo.Unit || wo.unit_name || wo.UnitName || ""
    ),
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
// Groups applicants by unit — roommates in same unit form one ApplicationGroup.
export async function fetchApplications(): Promise<{ data: ApplicationGroup[]; source: "appfolio" }> {
  const allTenants = await afGetTenants({ status: "applicant" }).catch(() => [] as any[]);
  const tenants = await filterToMoxie(allTenants || []);

  // Group applicants by unit (UnitStreetAddress1 or UnitId)
  const groupMap = new Map<string, any[]>();
  for (const t of tenants) {
    const unitKey = String(
      t.UnitStreetAddress1 || t["Unit Street Address 1"] || t.UnitId || t.Unit || ""
    );
    const key = `${t.PropertyId || t.property_id || ""}:${unitKey}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t);
  }

  const groups: ApplicationGroup[] = [];
  let idx = 0;
  for (const [, members] of groupMap) {
    idx++;
    const first = members[0];
    const unitName = String(
      first.UnitStreetAddress1 || first["Unit Street Address 1"] || first.Unit || first.UnitName || ""
    );

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
      propertyName: String(first.PropertyName || first.property_name || ""),
      unitNumber: unitName,
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
export async function fetchDashboardStats(academicYear?: AcademicYear): Promise<{ data: DashboardStats; source: "appfolio" }> {
  const [unitStats, maintenanceResult, applicationsResult] = await Promise.all([
    fetchUnitStats(academicYear),
    fetchMaintenanceRequests().catch(() => ({ data: [] as MaintenanceRequest[], source: "appfolio" as const })),
    fetchApplications().catch(() => ({ data: [] as ApplicationGroup[], source: "appfolio" as const })),
  ]);

  const openStatuses = new Set(["submitted", "assigned", "in_progress", "awaiting_parts"]);
  const openMaintenance = maintenanceResult.data.filter((r) => openStatuses.has(r.status)).length;
  const activeApps = applicationsResult.data.filter((g) => g.status === "incomplete" || g.status === "under_review").length;

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
