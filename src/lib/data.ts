// ============================================
// Data Layer — AppFolio API v2 (real data)
// ============================================
// Fetches live data from AppFolio report-based API v2.
// Student housing lease year: Aug 15 → Jul 31.
//
// v2 API uses snake_case field names (property_id, unit_name, etc.)
// v1 PascalCase fallbacks retained for backward compatibility.
//
// Portfolio filter: portfolio_id = 24 for Moxie Management.
// Unit identity: "unit_street" from AppFolio = "Unit Name" in Moxie.

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

// The one and only portfolio ID for Moxie Management
const MOXIE_PORTFOLIO_ID = "24";

/**
 * Filter any AppFolio report rows to Moxie Management (portfolio_id = 24).
 * Supports both v2 (snake_case) and v1 (PascalCase) field names for compatibility.
 */
function filterToMoxie(rows: any[]): any[] {
  if (!rows || rows.length === 0) return [];
  const filtered = rows.filter((row) => {
    // v2 uses snake_case; v1 uses PascalCase — try both
    const pid = String(row.portfolio_id || row.PortfolioId || "");
    return pid === MOXIE_PORTFOLIO_ID;
  });
  if (filtered.length === 0) {
    console.warn(
      `[Moxie] filterToMoxie: 0/${rows.length} rows matched portfolio_id=${MOXIE_PORTFOLIO_ID}. ` +
      `Sample row portfolio_id: ${rows[0]?.portfolio_id || rows[0]?.PortfolioId}`
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

  const moxieProps = filterToMoxie(propRows || []);
  const moxieRR = filterToMoxie(rentRollRows || []);

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
export async function fetchProperties(): Promise<{ data: Property[]; source: "appfolio" }> {
  const rows = await afGetProperties();
  const filtered = filterToMoxie(rows || []);
  const properties: Property[] = filtered.map((p: any, i: number) => ({
    // v2 uses snake_case; fallback to v1 PascalCase for compatibility
    id: String(p.property_id || p.PropertyId || `prop-${i}`),
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

  const filtered = filterToMoxie(rentRollRows);

  const units: Unit[] = filtered.map((r: any) => {
    // v2 uses unit_street (primary identifier); fallback to v1 formats
    const unitName = String(
      r.unit_street || r.UnitStreetAddress1 || r["Unit Street Address 1"] || r.unit_address || r.UnitAddress || r.unit || r.Unit || ""
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

  const filtered = filterToMoxie(rentRollRows);

  // Group rows by unit key — v2 snake_case first, v1 PascalCase fallback
  const unitMap = new Map<string, { unit: any; tenants: string[] }>();

  for (const r of filtered) {
    const unitKey = String(r.unit_id || r.UnitId || r.unit_street || r.UnitStreetAddress1 || r.unit || r.Unit || "");
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
    const moxieTenants = filterToMoxie(tenantRows || []);
    for (const t of moxieTenants) {
      const name = String(t.tenant_name || t.TenantName || t.name || t.Name || "").trim();
      const email = String(t.email || t.Email || t.tenant_email || t.TenantEmail || "").trim();
      if (name && email && email !== "null") {
        tenantEmailMap.set(name.toLowerCase(), email);
      }
    }
  } catch {
    // Tenant email lookup is best-effort
  }

  const units: (Unit & { tenants: string[]; tenantEmails: string[] })[] = [];

  for (const [, { unit: r, tenants }] of unitMap) {
    const unitName = String(r.unit_street || r.UnitStreetAddress1 || r.unit_address || r.UnitAddress || r.unit || r.Unit || "");
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

    const moxieTenants = filterToMoxie(tenantRows);
    const normalizedAddress = unitAddress.trim().toLowerCase();

    const matched: { name: string; email: string }[] = [];
    for (const t of moxieTenants) {
      const addr = String(
        t.unit_street || t.UnitStreetAddress1 || t.unit_address || ""
      ).trim().toLowerCase();
      if (!addr || addr !== normalizedAddress) continue;

      const name = String(t.tenant_name || t.TenantName || t.name || t.Name || "").trim();
      const email = String(t.email || t.Email || t.tenant_email || t.TenantEmail || "").trim();
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
  const rows = filterToMoxie(allRows || []);
  const requests: MaintenanceRequest[] = rows.map((wo: any, i: number) => ({
    id: String(wo.work_order_id || wo.WorkOrderId || wo.id || wo.Id || `wo-${i}`),
    unitId: String(wo.unit_id || wo.UnitId || ""),
    propertyId: String(wo.property_id || wo.PropertyId || ""),
    unitNumber: String(
      wo.unit_street || wo.UnitStreetAddress1 || wo.unit || wo.Unit || wo.unit_name || wo.UnitName || ""
    ),
    propertyName: String(wo.property_name || wo.PropertyName || ""),
    tenantName: String(wo.tenant_name || wo.TenantName || wo.tenant || wo.Tenant || "—"),
    tenantPhone: wo.tenant_phone || wo.TenantPhone || undefined,
    tenantEmail: wo.tenant_email || wo.TenantEmail || undefined,
    category: CATEGORY_MAP[String(wo.category || wo.Category || wo.work_order_category || wo.WorkOrderCategory || "general").toLowerCase()] || "general",
    priority: PRIORITY_MAP[String(wo.priority || wo.Priority || "normal").toLowerCase()] || "medium",
    status: STATUS_MAP[String(wo.status || wo.Status || wo.work_order_status || wo.WorkOrderStatus || "open").toLowerCase()] || "submitted",
    title: String(wo.job_description || wo.JobDescription || wo.description || wo.Description || wo.summary || wo.Summary || "Work Order"),
    description: String(wo.detail || wo.Detail || wo.job_description || wo.JobDescription || wo.description || wo.Description || ""),
    photos: [],
    assignedTo: wo.assigned_to || wo.AssignedTo || wo.assigned_users || wo.AssignedUsers || undefined,
    vendor: wo.vendor_name || wo.VendorName || wo.vendor || wo.Vendor || undefined,
    estimatedCost: wo.estimated_cost || wo.EstimatedCost ? Number(wo.estimated_cost || wo.EstimatedCost) : undefined,
    actualCost: wo.actual_cost || wo.ActualCost || wo.total_cost || wo.TotalCost ? Number(wo.actual_cost || wo.ActualCost || wo.total_cost || wo.TotalCost) : undefined,
    scheduledDate: wo.scheduled_end || wo.ScheduledEnd || wo.scheduled_date || wo.ScheduledDate || wo.due_date || wo.DueDate || undefined,
    completedDate: wo.completed_on || wo.CompletedOn || wo.completed_date || wo.CompletedDate || undefined,
    notes: [],
    createdAt: wo.created_at || wo.CreatedAt || wo.created_date || wo.CreatedDate || new Date().toISOString(),
    updatedAt: wo.updated_at || wo.UpdatedAt || wo.last_updated || wo.LastUpdated || new Date().toISOString(),
  }));
  return { data: requests, source: "appfolio" };
}

// --- Applications (from AppFolio tenant directory) ---
// Groups applicants by unit — roommates in same unit form one ApplicationGroup.
export async function fetchApplications(): Promise<{ data: ApplicationGroup[]; source: "appfolio" }> {
  const allTenants = await afGetTenants({ status: "applicant" }).catch(() => [] as any[]);
  const tenants = filterToMoxie(allTenants || []);

  // Group applicants by unit — v2 snake_case first, v1 PascalCase fallback
  const groupMap = new Map<string, any[]>();
  for (const t of tenants) {
    const unitKey = String(
      t.unit_street || t.UnitStreetAddress1 || t.unit_id || t.UnitId || t.unit || t.Unit || ""
    );
    const key = `${t.property_id || t.PropertyId || ""}:${unitKey}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(t);
  }

  const groups: ApplicationGroup[] = [];
  let idx = 0;
  for (const [, members] of groupMap) {
    idx++;
    const first = members[0];
    const unitName = String(
      first.unit_street || first.UnitStreetAddress1 || first.unit || first.Unit || first.unit_name || first.UnitName || ""
    );

    const applicants = members.map((m: any, i: number) => ({
      id: String(m.tenant_id || m.TenantId || `app-${idx}-${i}`),
      groupId: `grp-${idx}`,
      name: String(m.tenant_name || m.TenantName || m.name || m.Name || "Unknown"),
      email: String(m.email || m.Email || m.tenant_email || m.TenantEmail || ""),
      phone: m.phone || m.Phone || m.tenant_phone || m.TenantPhone || undefined,
      role: (i === 0 ? "primary" : "co_applicant") as "primary" | "co_applicant",
      steps: [
        { id: `s-${idx}-${i}-1`, name: "Application Submitted", description: "Complete online application", required: true, status: "complete" as const },
        { id: `s-${idx}-${i}-2`, name: "Background Check", description: "Credit and background screening", required: true, status: (m.screening_status === "completed" || m.ScreeningStatus === "Completed" ? "complete" : "in_review") as "complete" | "in_review" },
        { id: `s-${idx}-${i}-3`, name: "Income Verification", description: "Verify income documentation", required: true, status: "pending" as const },
        { id: `s-${idx}-${i}-4`, name: "Lease Signing", description: "Sign the lease agreement", required: true, status: "pending" as const },
      ],
      documents: [],
      nudges: [],
      status: "in_progress" as const,
      startedAt: m.application_date || m.ApplicationDate || m.created_at || m.CreatedAt || new Date().toISOString(),
    }));

    const hasApproved = members.some((m: any) => {
      const s = String(m.tenant_status || m.TenantStatus || m.status || m.Status || "").toLowerCase();
      return s === "approved" || s === "current";
    });
    const hasDenied = members.some((m: any) => {
      const s = String(m.tenant_status || m.TenantStatus || m.status || m.Status || "").toLowerCase();
      return s === "denied" || s === "rejected";
    });

    groups.push({
      id: `grp-${idx}`,
      propertyId: String(first.property_id || first.PropertyId || ""),
      propertyName: String(first.property_name || first.PropertyName || ""),
      unitNumber: unitName,
      unitDetails: "",
      leaseCycle: "fall_2026",
      targetMoveIn: "08/15/2026",
      monthlyRent: 0,
      applicants,
      status: hasApproved ? "approved" : hasDenied ? "denied" : "incomplete",
      createdAt: first.application_date || first.ApplicationDate || first.created_at || new Date().toISOString(),
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
