// ============================================
// Data Layer — AppFolio API v2 (real data)
// ============================================
// Fetches live data from AppFolio report-based API v2.
// Student housing lease year: Aug 15 → Jul 31.
//
// v2 field names (from API docs):
//   Property Directory: property, property_name, property_address, portfolio, units, sqft, ...
//   Rent Roll: property, property_name, unit, tenant, status, bd_ba, sqft, rent, lease_from, lease_to, ...
//   Tenant Directory: property, property_name, unit, tenant, status, emails, phone_numbers, ...
//   Work Order: property, property_name, unit_name, unit_street, primary_tenant, status, priority, ...
//   Unit Vacancy Detail: property, property_name, unit, unit_status, bed_and_bath, sqft, ...
//
// Portfolio filter: Only Property Directory has `portfolio` field.
//   Other reports are filtered by matching `property` against Moxie property refs.

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

// --- Moxie Portfolio Filtering ---
// Only property_directory has the `portfolio` field ("Moxie Management").
// All other reports must be filtered by matching `property` against Moxie property refs.
const MOXIE_PORTFOLIO_NAME = "Moxie Management";

let _moxiePropertyRefs: Set<string> | null = null;
let _moxiePropertyRefsCacheTime = 0;
const CACHE_TTL = 300_000; // 5 minutes

/**
 * Fetch Moxie property references from property_directory.
 * Cached for 5 minutes. Returns set of `property` field values.
 */
async function getMoxiePropertyRefs(): Promise<Set<string>> {
  const now = Date.now();
  if (_moxiePropertyRefs && now - _moxiePropertyRefsCacheTime < CACHE_TTL) {
    return _moxiePropertyRefs;
  }

  const propRows = await afGetProperties();
  const moxieProps = (propRows || []).filter((p: any) => {
    const portfolio = String(p.portfolio || p.Portfolio || "");
    return portfolio.toLowerCase().includes("moxie");
  });

  _moxiePropertyRefs = new Set(
    moxieProps.map((p: any) => String(p.property || p.Property || ""))
  );
  _moxiePropertyRefsCacheTime = now;

  if (_moxiePropertyRefs.size === 0 && (propRows || []).length > 0) {
    console.warn(
      `[Moxie] getMoxiePropertyRefs: 0/${(propRows || []).length} properties matched portfolio="${MOXIE_PORTFOLIO_NAME}". ` +
      `Sample portfolio value: ${propRows[0]?.portfolio || propRows[0]?.Portfolio || "N/A"}`
    );
  }

  return _moxiePropertyRefs;
}

/**
 * Filter property_directory rows by portfolio name.
 */
function filterPropertiesToMoxie(rows: any[]): any[] {
  if (!rows || rows.length === 0) return [];
  return rows.filter((row) => {
    const portfolio = String(row.portfolio || row.Portfolio || "");
    return portfolio.toLowerCase().includes("moxie");
  });
}

/**
 * Filter any report rows to Moxie by matching `property` field against Moxie property refs.
 * Use this for rent_roll, work_order, tenant_directory, etc.
 */
async function filterToMoxie(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return [];
  const moxieRefs = await getMoxiePropertyRefs();
  if (moxieRefs.size === 0) {
    console.warn("[Moxie] filterToMoxie: No Moxie property refs found — returning all rows as fallback.");
    return rows;
  }
  const filtered = rows.filter((row) => {
    const prop = String(row.property || row.Property || "");
    return moxieRefs.has(prop);
  });
  if (filtered.length === 0 && rows.length > 0) {
    console.warn(
      `[Moxie] filterToMoxie: 0/${rows.length} rows matched Moxie properties. ` +
      `Sample property value: "${rows[0]?.property || rows[0]?.Property || "N/A"}". ` +
      `Moxie refs: [${[...moxieRefs].slice(0, 5).join(", ")}]`
    );
  }
  return filtered;
}

/** Diagnostic: show raw data for debugging */
export async function debugMoxieFilter() {
  const propRows = await afGetProperties();
  const rentRollRows = await afGetRentRoll();

  const propFields = propRows?.length > 0 ? Object.keys(propRows[0]) : [];
  const rrFields = rentRollRows?.length > 0 ? Object.keys(rentRollRows[0]) : [];

  const moxieProps = filterPropertiesToMoxie(propRows || []);
  const moxieRR = await filterToMoxie(rentRollRows || []);

  return {
    propertyDirectory: {
      totalRows: (propRows || []).length,
      fields: propFields,
      moxieMatchCount: moxieProps.length,
      sampleRow: propRows?.[0] || null,
      moxieSampleRow: moxieProps[0] || null,
    },
    rentRoll: {
      totalRows: (rentRollRows || []).length,
      fields: rrFields,
      moxieMatchCount: moxieRR.length,
      sampleRow: rentRollRows?.[0] || null,
      moxieSampleRow: moxieRR[0] || null,
    },
  };
}

// --- Properties ---
// v2 Property Directory fields: property, property_name, property_address,
//   property_street, property_street2, property_city, property_state, property_zip,
//   portfolio, units, sqft, property_type, owners, ...
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" }> {
  const rows = await afGetProperties();
  const filtered = filterPropertiesToMoxie(rows || []);
  const properties: Property[] = filtered.map((p: any, i: number) => ({
    id: String(p.property || p.Property || `prop-${i}`),
    name: p.property_name || p.PropertyName || "",
    address: [
      p.property_address || p.PropertyAddress || "",
      p.property_city || p.PropertyCity || "",
      p.property_state || p.PropertyState || "",
      p.property_zip || p.PropertyZip || "",
    ]
      .filter(Boolean)
      .join(", "),
    unitCount: Number(p.units || p.Units || 0),
  }));
  return { data: properties, source: "appfolio" };
}

// --- Units (unit-centric) ---
// v2 Rent Roll fields: property, property_name, property_address, property_type,
//   unit, unit_tags, unit_type, bd_ba, tenant, status, sqft, market_rent, rent,
//   deposit, lease_from, lease_to, move_in, move_out, monthly_charges, ...
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
    // v2 Rent Roll: "unit" is the unit identifier (no unit_street in rent roll)
    const unitNum = String(r.unit || r.Unit || "");
    const propName = String(r.property_name || r.PropertyName || "");
    const { bed, bath } = parseBdBa(r.bd_ba || r.BdBa);
    const rawStatus = String(r.status || r.Status || "").toLowerCase();
    const status = (["current", "vacant", "notice", "future"].includes(rawStatus)
      ? rawStatus
      : "vacant") as Unit["status"];

    return {
      id: unitNum, // Rent Roll uses "unit" as the identifier
      propertyId: String(r.property || r.Property || ""),
      propertyName: propName,
      number: unitNum,
      unitName: unitNum,
      displayName: unitNum || `${propName} #${unitNum}`,
      bedrooms: bed,
      bathrooms: bath,
      sqft: parseSqft(r.sqft || r.SquareFt),
      rent: r.rent || r.Rent || null,
      status,
      tenant: r.tenant || r.Tenant || null,
      leaseFrom: r.lease_from || r.LeaseFrom || null,
      leaseTo: r.lease_to || r.LeaseTo || null,
      appfolioId: unitNum || undefined,
    };
  });

  // If academic year is specified, re-classify statuses based on lease overlap
  if (academicYear) {
    const { leaseStart } = academicYearDates(academicYear);
    const ayStart = new Date(leaseStart);

    for (const unit of units) {
      if (unit.leaseTo) {
        const leaseTo = new Date(unit.leaseTo);
        if (leaseTo < ayStart) {
          unit.status = "vacant";
          continue;
        }
      }
      if (unit.leaseFrom) {
        const leaseFrom = new Date(unit.leaseFrom);
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
 * This function deduplicates by unit field and groups all tenants.
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

  // Group rows by unit key — v2 rent roll uses `unit` as the unit identifier
  const unitMap = new Map<string, { unit: any; tenants: string[] }>();

  for (const r of filtered) {
    const unitKey = String(r.unit || r.Unit || "");
    const tenant = String(r.tenant || r.Tenant || "").trim();

    if (!unitMap.has(unitKey)) {
      unitMap.set(unitKey, { unit: r, tenants: [] });
    }
    if (tenant && tenant !== "null" && tenant !== "undefined") {
      unitMap.get(unitKey)!.tenants.push(tenant);
    }
  }

  // Also fetch tenant directory for emails
  // v2 Tenant Directory: tenant, emails (plural), phone_numbers, status, ...
  let tenantEmailMap = new Map<string, string>();
  try {
    const tenantRows = await afGetTenants();
    const moxieTenants = await filterToMoxie(tenantRows || []);
    for (const t of moxieTenants) {
      const name = String(t.tenant || t.Tenant || "").trim();
      const emails = String(t.emails || t.Emails || "").trim();
      // emails may be comma-separated; take the first one
      const email = emails.split(",")[0]?.trim() || "";
      if (name && email && email !== "null") {
        tenantEmailMap.set(name.toLowerCase(), email);
      }
    }
  } catch {
    // Tenant email lookup is best-effort
  }

  const units: (Unit & { tenants: string[]; tenantEmails: string[] })[] = [];

  for (const [, { unit: r, tenants }] of unitMap) {
    const unitNum = String(r.unit || r.Unit || "");
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
      id: unitNum,
      propertyId: String(r.property || r.Property || ""),
      propertyName: propName,
      number: unitNum,
      unitName: unitNum,
      displayName: unitNum || `${propName} #${unitNum}`,
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
      appfolioId: unitNum || undefined,
    });
  }

  return { data: units, source: "appfolio" };
}

/**
 * Fetch all tenants for a specific unit.
 * v2 Tenant Directory: property, unit, tenant, first_name, last_name, emails, phone_numbers, status, ...
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
      // v2 tenant_directory: "unit" is the unit identifier
      const addr = String(t.unit || t.Unit || "").trim().toLowerCase();
      if (!addr || addr !== normalizedAddress) continue;

      const name = String(t.tenant || t.Tenant || "").trim();
      const emails = String(t.emails || t.Emails || "").trim();
      const email = emails.split(",")[0]?.trim() || "";
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
// v2 Work Order fields: property, property_name, property_street, unit_address,
//   unit_street, unit_name, priority, work_order_type, work_order_number,
//   job_description, instructions, status, vendor, primary_tenant,
//   primary_tenant_email, primary_tenant_phone_number, created_at, created_by,
//   assigned_user, estimate_amount, scheduled_start, scheduled_end,
//   work_completed_on, completed_on, amount, invoice, ...
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
    id: String(wo.work_order_number || wo.WorkOrderNumber || wo.service_request_number || `wo-${i}`),
    unitId: String(wo.unit_name || wo.UnitName || ""),
    propertyId: String(wo.property || wo.Property || ""),
    unitNumber: String(wo.unit_name || wo.UnitName || wo.unit_street || wo.UnitStreet || ""),
    propertyName: String(wo.property_name || wo.PropertyName || ""),
    tenantName: String(wo.primary_tenant || wo.PrimaryTenant || "—"),
    tenantPhone: wo.primary_tenant_phone_number || wo.PrimaryTenantPhoneNumber || undefined,
    tenantEmail: wo.primary_tenant_email || wo.PrimaryTenantEmail || undefined,
    category: CATEGORY_MAP[String(wo.work_order_type || wo.WorkOrderType || "general").toLowerCase()] || "general",
    priority: PRIORITY_MAP[String(wo.priority || wo.Priority || "normal").toLowerCase()] || "medium",
    status: STATUS_MAP[String(wo.status || wo.Status || "open").toLowerCase()] || "submitted",
    title: String(wo.job_description || wo.JobDescription || wo.service_request_description || "Work Order"),
    description: String(wo.instructions || wo.Instructions || wo.job_description || wo.JobDescription || ""),
    photos: [],
    assignedTo: wo.assigned_user || wo.AssignedUser || undefined,
    vendor: wo.vendor || wo.Vendor || undefined,
    estimatedCost: wo.estimate_amount || wo.EstimateAmount ? Number(wo.estimate_amount || wo.EstimateAmount) : undefined,
    actualCost: wo.amount || wo.Amount ? Number(wo.amount || wo.Amount) : undefined,
    scheduledDate: wo.scheduled_end || wo.ScheduledEnd || wo.scheduled_start || wo.ScheduledStart || undefined,
    completedDate: wo.completed_on || wo.CompletedOn || wo.work_completed_on || wo.WorkDoneOn || undefined,
    notes: wo.status_notes ? [wo.status_notes] : [],
    createdAt: wo.created_at || wo.CreatedAt || new Date().toISOString(),
    updatedAt: wo.completed_on || wo.CompletedOn || wo.created_at || wo.CreatedAt || new Date().toISOString(),
    appfolioWorkOrderId: wo.work_order_number || wo.WorkOrderNumber || undefined,
  }));
  return { data: requests, source: "appfolio" };
}

// --- Applications (from AppFolio tenant directory) ---
// Groups applicants by unit — roommates in same unit form one ApplicationGroup.
// v2 Tenant Directory: property, property_name, unit, tenant, first_name, last_name,
//   status, emails, phone_numbers, lease_from, lease_to, move_in, ...
export async function fetchApplications(): Promise<{ data: ApplicationGroup[]; source: "appfolio" }> {
  const allTenants = await afGetTenants({ status: "applicant" }).catch(() => [] as any[]);
  const tenants = await filterToMoxie(allTenants || []);

  // Group applicants by unit
  const groupMap = new Map<string, any[]>();
  for (const t of tenants) {
    const unitKey = String(t.unit || t.Unit || "");
    const key = `${t.property || t.Property || ""}:${unitKey}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t);
  }

  const groups: ApplicationGroup[] = [];
  let idx = 0;
  for (const [, members] of groupMap) {
    idx++;
    const first = members[0];
    const unitName = String(first.unit || first.Unit || "");

    const applicants = members.map((m: any, i: number) => {
      const name = String(m.tenant || m.Tenant || "Unknown");
      const emails = String(m.emails || m.Emails || "");
      const email = emails.split(",")[0]?.trim() || "";
      const phones = String(m.phone_numbers || m.PhoneNumbers || "");
      const phone = phones.split(",")[0]?.trim() || undefined;

      return {
        id: String(`app-${idx}-${i}`),
        groupId: `grp-${idx}`,
        name,
        email,
        phone,
        role: (i === 0 ? "primary" : "co_applicant") as "primary" | "co_applicant",
        steps: [
          { id: `s-${idx}-${i}-1`, name: "Application Submitted", description: "Complete online application", required: true, status: "complete" as const },
          { id: `s-${idx}-${i}-2`, name: "Background Check", description: "Credit and background screening", required: true, status: "in_review" as const },
          { id: `s-${idx}-${i}-3`, name: "Income Verification", description: "Verify income documentation", required: true, status: "pending" as const },
          { id: `s-${idx}-${i}-4`, name: "Lease Signing", description: "Sign the lease agreement", required: true, status: "pending" as const },
        ],
        documents: [],
        nudges: [],
        status: "in_progress" as const,
        startedAt: m.move_in || m.MoveIn || new Date().toISOString(),
      };
    });

    const hasApproved = members.some((m: any) => {
      const s = String(m.status || m.Status || "").toLowerCase();
      return s === "approved" || s === "current";
    });
    const hasDenied = members.some((m: any) => {
      const s = String(m.status || m.Status || "").toLowerCase();
      return s === "denied" || s === "rejected";
    });

    groups.push({
      id: `grp-${idx}`,
      propertyId: String(first.property || first.Property || ""),
      propertyName: String(first.property_name || first.PropertyName || ""),
      unitNumber: unitName,
      unitDetails: "",
      leaseCycle: "fall_2026",
      targetMoveIn: "08/15/2026",
      monthlyRent: 0,
      applicants,
      status: hasApproved ? "approved" : hasDenied ? "denied" : "incomplete",
      createdAt: first.move_in || first.MoveIn || new Date().toISOString(),
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
