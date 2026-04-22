// ============================================
// Data Layer — AppFolio API (real data)
// ============================================
// Fetches live data from AppFolio report-based API.
// Student housing lease year: Aug 15 → Jul 31.
//
// Portfolio filter: portfolio_id = 24 for Moxie Management.
// NOTE: portfolio_id=10 also says "Moxie Management" but is a DIFFERENT portfolio.
// Unit identity: the `unit` field in rent_roll = the unit name/address in Moxie.

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
  VacantUnit,
} from "./types";
import { academicYearDates } from "./types";

// Moxie Management portfolio_id = 24 (strictly).
// NOTE: portfolio_id=10 also shows "Moxie Management" name but is a DIFFERENT set
// of properties (e.g. 1000 K Street). Do NOT match by portfolio name.
const MOXIE_PORTFOLIO_ID = "24";

/** Cache for Moxie property IDs (from portfolio_id=24 across all reports) */
let _moxiePropertyIdCache: Set<string> | null = null;
let _moxiePropertyIdCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get the set of property_ids that belong to Moxie (portfolio_id = 24).
 * Scans both property_directory and rent_roll for portfolio_id=24.
 */
async function getMoxiePropertyIds(): Promise<Set<string>> {
  const now = Date.now();
  if (_moxiePropertyIdCache && now - _moxiePropertyIdCacheTime < CACHE_TTL) {
    return _moxiePropertyIdCache;
  }

  const ids = new Set<string>();

  // property_directory: 57 properties have portfolio_id=24
  const propRows = await afGetProperties();
  for (const p of (propRows || [])) {
    if (String(p.portfolio_id ?? "").trim() === MOXIE_PORTFOLIO_ID) {
      const propId = String(p.property_id || "");
      if (propId) ids.add(propId);
    }
  }

  // rent_roll: 255 rows have portfolio_id=24 (may include properties not in directory)
  const rentRollRows = await afGetRentRoll();
  for (const r of (rentRollRows || [])) {
    if (String(r.portfolio_id ?? "").trim() === MOXIE_PORTFOLIO_ID) {
      const propId = String(r.property_id || "");
      if (propId) ids.add(propId);
    }
  }

  _moxiePropertyIdCache = ids;
  _moxiePropertyIdCacheTime = now;
  console.log(`[Moxie] Cached ${ids.size} Moxie property IDs (portfolio_id=${MOXIE_PORTFOLIO_ID})`);
  return ids;
}

/**
 * Filter any report's rows to Moxie properties (portfolio_id = 24).
 * Primary: direct portfolio_id match. Fallback: property_id membership
 * in the Moxie set (for rows where portfolio_id is null).
 */
async function filterToMoxie(rows: any[]): Promise<any[]> {
  if (!rows || rows.length === 0) return [];
  const moxieIds = await getMoxiePropertyIds();
  const filtered = rows.filter((row) => {
    // Direct portfolio_id match (present on rent_roll, property_directory, etc.)
    const pid = String(row.portfolio_id ?? "").trim();
    if (pid === MOXIE_PORTFOLIO_ID) return true;

    // Fallback: property_id membership — used by reports that don't carry
    // portfolio_id, e.g. work_order.
    const propId = String(row.property_id ?? "");
    if (propId && moxieIds.has(propId)) return true;

    return false;
  });
  if (filtered.length === 0 && rows.length > 0) {
    console.warn(
      `[Moxie] filterToMoxie: 0/${rows.length} rows matched. ` +
      `Moxie property IDs: ${moxieIds.size}. ` +
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
    // The `unit` field is the unit name/address (e.g. "2414 S Catalina St" or "101")
    const unitName = String(r.unit || r.Unit || r.UnitStreetAddress1 || "");
    const unitNum = unitName;
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
      moveIn: r.move_in || null,
      moveOut: r.move_out || null,
      deposit: r.deposit ? Number(r.deposit) : null,
      additionalTenants: r.additional_tenants || null,
      additionalTenantIds: r.additional_tenant_ids || null,
      tenantId: r.tenant_id ? String(r.tenant_id) : null,
      leaseExpiresMonth: r.lease_expires_month || null,
      appfolioId: r.unit_id || r.UnitId ? String(r.unit_id || r.UnitId) : undefined,
    };
  });

  // If academic year is specified, re-classify statuses for that year.
  // Academic year = Aug 15 → Jul 31 (e.g. 2026-27 = 2026-08-15 to 2027-07-31).
  // A unit is "leased" for the year if:
  //   - It has a lease covering the start date (lease_from <= ayStart AND lease_to >= ayStart)
  //   - OR it's month-to-month (lease_to is null = tenant went MTM after lease ended)
  //   - OR it has a future lease starting on/before ayStart (renewals may start earlier)
  // A unit is "vacant" (unleased) if no lease covers the start date.
  if (academicYear) {
    const { leaseStart } = academicYearDates(academicYear);
    const ayStart = new Date(leaseStart); // e.g. 2026-08-15

    for (const unit of units) {
      // Month-to-month: lease_to is null but has a lease_from/move_in = currently occupied
      if (!unit.leaseTo && unit.leaseFrom) {
        unit.status = "current"; // MTM tenants are leased
        continue;
      }

      if (unit.leaseTo) {
        const leaseTo = new Date(unit.leaseTo);
        // Lease ends before the academic year starts → vacant for that year
        if (leaseTo < ayStart) {
          unit.status = "vacant";
          continue;
        }
      }

      if (unit.leaseFrom) {
        const leaseFrom = new Date(unit.leaseFrom);
        // Lease starts on or before ayStart and covers it → leased
        if (leaseFrom <= ayStart) {
          if (unit.status === "future") unit.status = "current";
          continue;
        }
        // Future lease starting after ayStart → still pre-leased
        if (leaseFrom > ayStart && unit.status === "future") {
          continue;
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
    const unitName = String(r.unit || r.Unit || r.UnitStreetAddress1 || "");
    const unitNum = unitName;
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
      moveIn: r.move_in || r.MoveIn || null,
      moveOut: r.move_out || r.MoveOut || null,
      deposit: r.deposit != null ? Number(r.deposit) : null,
      additionalTenants: r.additional_tenants || null,
      additionalTenantIds: r.additional_tenant_ids || null,
      tenantId: r.tenant_id ? String(r.tenant_id) : null,
      leaseExpiresMonth: r.lease_to ? new Date(r.lease_to).toLocaleString("default", { month: "long", year: "numeric" }) : null,
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
  unleased: { unit: string; status: string; tenant: string; leaseFrom: string; leaseTo: string }[];
  source: "appfolio";
}> {
  const ayStart = academicYear
    ? academicYearDates(academicYear).leaseStart
    : null;

  // Parallel: rent roll (for total + occupied counts) and unit_vacancy_detail
  // (the authoritative "which units are NOT leased on the AY start date",
  // which correctly accounts for future signed leases — the rent roll is
  // a point-in-time snapshot that doesn't surface future leases).
  const [rentRollRaw, vacancyRaw] = await Promise.all([
    afGetRentRoll(),
    ayStart
      ? afGetVacancyReport(ayStart).catch((err) => {
          console.error("[Moxie] vacancy report failed:", err);
          return [] as any[];
        })
      : Promise.resolve([] as any[]),
  ]);

  if (!Array.isArray(rentRollRaw) || rentRollRaw.length === 0) {
    return { total: 0, occupied: 0, preLeased: 0, unleased: [], source: "appfolio" };
  }

  const filtered = await filterToMoxie(rentRollRaw);
  const vacancyRows = Array.isArray(vacancyRaw) && vacancyRaw.length > 0
    ? await filterToMoxie(vacancyRaw)
    : [];

  // Group rent roll by unit_id for total + occupied counts.
  const unitRows = new Map<string, any[]>();
  for (const r of filtered) {
    const key = String(r.unit_id || r.UnitId || "");
    if (!key) continue;
    if (!unitRows.has(key)) unitRows.set(key, []);
    unitRows.get(key)!.push(r);
  }

  const total = unitRows.size;
  let occupied = 0;
  for (const rows of unitRows.values()) {
    const isOccupied = rows.some((r: any) => {
      const s = String(r.status || r.Status || "").toLowerCase();
      return s === "current" || s === "notice";
    });
    if (isOccupied) occupied++;
  }

  // Unique set of unit_ids that AppFolio says are vacant on the target date.
  const vacantUnitIds = new Set<string>();
  for (const v of vacancyRows) {
    const id = String(v.unit_id || v.UnitId || "");
    if (id) vacantUnitIds.add(id);
  }

  const preLeased = ayStart ? Math.max(0, total - vacantUnitIds.size) : 0;

  // Build an "unleased" diagnostic list from the same authoritative source.
  const unleased: { unit: string; status: string; tenant: string; leaseFrom: string; leaseTo: string }[] = [];
  for (const id of vacantUnitIds) {
    const rows = unitRows.get(id) ?? [];
    const r = rows[0] ?? {};
    unleased.push({
      unit: String(r.unit || r.Unit || ""),
      status: String(r.status || r.Status || ""),
      tenant: String(r.tenant || r.Tenant || ""),
      leaseFrom: String(r.lease_from || r.LeaseFrom || ""),
      leaseTo: String(r.lease_to || r.LeaseTo || ""),
    });
  }

  return { total, occupied, preLeased, unleased, source: "appfolio" };
}

// --- Vacancy Detection (date-aware) ---
/**
 * Units that will NOT be leased on a given date. Authoritative source is
 * AppFolio's `unit_vacancy_detail` report, which — unlike `rent_roll` —
 * accounts for future signed leases. The rent roll is still fetched as an
 * enrichment source so each vacancy row can surface the last tenant and
 * their lease-end date for context during the meeting.
 *
 * Used by the Monday meeting agenda to answer "which units will be vacant
 * on 2026-08-15".
 */
export async function fetchVacanciesOnDate(
  targetDate: string
): Promise<{ data: VacantUnit[]; target: string; source: "appfolio" }> {
  const target = new Date(targetDate);
  if (isNaN(target.getTime())) {
    throw new Error(`Invalid targetDate: ${targetDate}`);
  }

  const [rawVacancy, rawRentRoll] = await Promise.all([
    afGetVacancyReport(targetDate).catch((err) => {
      console.error("[Moxie] vacancy report failed:", err);
      return [] as any[];
    }),
    afGetRentRoll().catch((err) => {
      console.error("[Moxie] rent roll (for enrichment) failed:", err);
      return [] as any[];
    }),
  ]);

  const vacancyRows = Array.isArray(rawVacancy) && rawVacancy.length > 0
    ? await filterToMoxie(rawVacancy)
    : [];
  const rentRollRows = Array.isArray(rawRentRoll) && rawRentRoll.length > 0
    ? await filterToMoxie(rawRentRoll)
    : [];

  // Index rent roll by unit_id — keep the row with the latest lease_to so
  // "last tenant / last lease-end" refers to the most recent lease on file.
  const rentRollByUnit = new Map<string, any>();
  for (const r of rentRollRows) {
    const key = String(r.unit_id || r.UnitId || "");
    if (!key) continue;
    const existing = rentRollByUnit.get(key);
    if (!existing) {
      rentRollByUnit.set(key, r);
      continue;
    }
    const existingTo = String(existing.lease_to || existing.LeaseTo || "");
    const candidateTo = String(r.lease_to || r.LeaseTo || "");
    if (candidateTo > existingTo) rentRollByUnit.set(key, r);
  }

  const vacancies: VacantUnit[] = [];
  const seenUnitIds = new Set<string>();

  for (const v of vacancyRows) {
    const unitId = String(v.unit_id || v.UnitId || "");
    if (!unitId) continue;
    // The vacancy report can have more than one row per unit if AppFolio
    // is showing a gap + a future lease. Dedupe.
    if (seenUnitIds.has(unitId)) continue;
    seenUnitIds.add(unitId);

    const rr = rentRollByUnit.get(unitId);
    const unitName = String(
      v.unit ||
        v.Unit ||
        v.unit_street_address_1 ||
        v.UnitStreetAddress1 ||
        rr?.unit ||
        rr?.Unit ||
        rr?.unit_street_address_1 ||
        rr?.UnitStreetAddress1 ||
        ""
    );
    const { bed, bath } = parseBdBa(v.bd_ba || v.BdBa || rr?.bd_ba || rr?.BdBa);
    const rent =
      v.market_rent ||
      v.MarketRent ||
      v.rent ||
      v.Rent ||
      rr?.rent ||
      rr?.Rent ||
      null;
    const lastTenant = rr ? String(rr.tenant || rr.Tenant || "") || null : null;
    const lastLeaseTo = rr
      ? String(rr.lease_to || rr.LeaseTo || "") || null
      : null;

    let daysVacantOnTarget: number | null = null;
    if (lastLeaseTo) {
      const endDay = new Date(lastLeaseTo);
      if (!isNaN(endDay.getTime())) {
        daysVacantOnTarget = Math.max(
          0,
          Math.round((target.getTime() - endDay.getTime()) / 86400000)
        );
      }
    }

    vacancies.push({
      unitId,
      unitName,
      propertyId:
        String(
          v.property_id || v.PropertyId || rr?.property_id || rr?.PropertyId || ""
        ) || null,
      propertyName: String(
        v.property_name ||
          v.PropertyName ||
          rr?.property_name ||
          rr?.PropertyName ||
          ""
      ),
      bedrooms: bed,
      bathrooms: bath,
      sqft: parseSqft(v.square_ft || v.SquareFt || rr?.sqft || rr?.SquareFt),
      rent,
      lastTenant,
      lastLeaseTo,
      // unit_vacancy_detail means no future lease covers target; leave null
      // unless AppFolio exposes a "next available" field we can surface.
      nextLeaseFrom: null,
      daysVacantOnTarget,
    });
  }

  // Sort by propertyName, unitName for a stable, readable agenda.
  vacancies.sort((a, b) => {
    const pc = a.propertyName.localeCompare(b.propertyName);
    return pc !== 0 ? pc : a.unitName.localeCompare(b.unitName, undefined, { numeric: true });
  });

  return { data: vacancies, target: targetDate, source: "appfolio" };
}

// --- Work Orders / Maintenance ---
// Normalize AppFolio `work_order_type` values to our internal categories.
// AppFolio's field is free-form-ish, so we check an exact map first and
// fall back to keyword patterns — "A/C Repair", "Water Heater", "Garbage
// Disposal" etc. should land in the right bucket instead of "general".
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

const CATEGORY_PATTERNS: ReadonlyArray<readonly [RegExp, MaintenanceCategory]> = [
  [/plumb|leak|drain|toilet|faucet|sink|shower|tub|water.?heater|hot.?water|sewer/i, "plumbing"],
  [/electric|wiring|outlet|breaker|fuse|light(?!.?ing)|lightbulb|lighting/i, "electrical"],
  [/hvac|a\/?c\b|air.?cond|heating|heat(?!er)|thermostat|furnace|ventilat/i, "hvac"],
  [/appliance|refrigerator|fridge|washer|dryer|oven|dishwasher|stove|range|microwave|disposal/i, "appliance"],
  [/roof|wall|floor|window|door|ceiling|drywall|paint|fence|gate|balcony|railing|stairs|concrete/i, "structural"],
  [/pest|rodent|roach|mice|rat|ant|insect|bug|termite|bedbug/i, "pest"],
  [/lock|key(?!pad)|deadbolt|keypad/i, "locksmith"],
];

export function categorizeWorkOrderType(rawType: unknown): MaintenanceCategory {
  const t = String(rawType ?? "").toLowerCase().trim();
  if (!t) return "general";
  if (CATEGORY_MAP[t]) return CATEGORY_MAP[t];
  for (const [pattern, category] of CATEGORY_PATTERNS) {
    if (pattern.test(t)) return category;
  }
  return "general";
}

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

/** Truncate to the first N words; strip trailing punctuation and add an ellipsis. */
function summarizeText(text: string, maxWords = 12): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = clean.split(/\s+/);
  if (words.length <= maxWords) return clean;
  return words.slice(0, maxWords).join(" ").replace(/[,;:.]$/, "") + "…";
}

/**
 * Decide a scannable heading for a work order.
 * - Prefer `job_description` if it's already a short PM-written summary and
 *   meaningfully different from the body text.
 * - Otherwise summarize the body text (what the tenant/submitter wrote) to
 *   roughly 12 words so the card heading stays glanceable.
 */
function workOrderTitle(jobDescription: string, description: string, workOrderNumber: string): string {
  const jd = jobDescription.trim();
  const jdWordCount = jd ? jd.split(/\s+/).length : 0;
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const jdIsConciseSummary =
    jd.length > 0 &&
    jd.length <= 80 &&
    jdWordCount <= 14 &&
    normalize(jd) !== normalize(description);
  if (jdIsConciseSummary) return jd;
  if (description) return summarizeText(description, 12);
  return `Work Order #${workOrderNumber}`;
}

/**
 * Map a single AppFolio `work_order` row (snake_case JSON from the
 * Reports API) to the internal `MaintenanceRequest` shape. Exported so
 * the same mapping is used whether the row came from a live AppFolio
 * fetch or from the Supabase `work_orders.raw` snapshot.
 */
export function mapWorkOrderRow(wo: Record<string, any>, index = 0): MaintenanceRequest {
  return {
    id: String(wo.work_order_id || wo.work_order_number || `wo-${index}`),
    unitId: String(wo.unit_id || ""),
    propertyId: String(wo.property_id || ""),
    unitNumber: String(wo.unit_name || wo.unit_address || ""),
    propertyName: String(wo.property_name || ""),
    tenantName: String(wo.primary_tenant || "—"),
    tenantPhone: wo.primary_tenant_phone_number || undefined,
    tenantEmail: wo.primary_tenant_email || undefined,
    category: categorizeWorkOrderType(wo.work_order_type),
    priority: PRIORITY_MAP[String(wo.priority || "normal").toLowerCase()] || "medium",
    status: STATUS_MAP[String(wo.status || "open").toLowerCase()] || "submitted",
    // Body: the verbatim text the tenant / submitter wrote. Prefer
    // service_request_description, then instructions, then job_description.
    description: String(
      wo.service_request_description || wo.instructions || wo.job_description || ""
    ),
    // Heading: a scannable summary. Computed below so it can reference the
    // resolved description.
    title: workOrderTitle(
      String(wo.job_description || ""),
      String(wo.service_request_description || wo.instructions || wo.job_description || ""),
      String(wo.work_order_number || "")
    ),
    photos: [],
    assignedTo: wo.assigned_user || undefined,
    vendor: wo.vendor || undefined,
    estimatedCost: wo.estimate_amount ? Number(wo.estimate_amount) : undefined,
    actualCost: wo.amount ? Number(wo.amount) : undefined,
    scheduledDate: wo.scheduled_end || wo.scheduled_start || undefined,
    completedDate: wo.completed_on || wo.work_completed_on || undefined,
    notes: wo.status_notes ? [String(wo.status_notes)] : [],
    createdAt: wo.created_at || new Date().toISOString(),
    updatedAt: wo.created_at || new Date().toISOString(),
    appfolioWorkOrderId: wo.work_order_id ? String(wo.work_order_id) : undefined,
  };
}

/** Fetch raw work-order rows from AppFolio, filtered to the Moxie portfolio. */
export async function fetchMoxieWorkOrderRows(params?: {
  property_id?: string;
  status?: string;
}): Promise<any[]> {
  const allRows = await afGetWorkOrders(params);
  console.log(`[Moxie] Work orders raw: ${(allRows || []).length} rows`);
  if (allRows?.length > 0) {
    console.log(`[Moxie] Work order sample fields:`, Object.keys(allRows[0]).join(", "));
  }
  const rows = await filterToMoxie(allRows || []);
  console.log(`[Moxie] Work orders after filter: ${rows.length} rows`);
  return rows;
}

export async function fetchMaintenanceRequests(params?: {
  property_id?: string;
  status?: string;
}): Promise<{ data: MaintenanceRequest[]; source: "appfolio" }> {
  const rows = await fetchMoxieWorkOrderRows(params);
  return { data: rows.map((wo, i) => mapWorkOrderRow(wo, i)), source: "appfolio" };
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
    fetchUnitStats(academicYear).catch((err) => {
      console.error("[Moxie] fetchUnitStats failed:", err);
      return { total: 0, occupied: 0, preLeased: 0, unleased: [] as { unit: string; status: string; tenant: string; leaseFrom: string; leaseTo: string }[], source: "appfolio" as const };
    }),
    fetchMaintenanceRequests().catch((err) => {
      console.error("[Moxie] fetchMaintenanceRequests failed:", err);
      return { data: [] as MaintenanceRequest[], source: "appfolio" as const };
    }),
    fetchApplications().catch(() => ({ data: [] as ApplicationGroup[], source: "appfolio" as const })),
  ]);

  const openStatuses = new Set(["submitted", "assigned", "in_progress", "awaiting_parts"]);
  const openMaintenance = maintenanceResult.data.filter((r) => openStatuses.has(r.status)).length;
  const activeApps = applicationsResult.data.filter((g) => g.status === "incomplete" || g.status === "under_review").length;

  const stats: DashboardStats = {
    totalUnits: unitStats.total,
    occupiedUnits: unitStats.occupied,
    vacantUnits: unitStats.total - unitStats.preLeased,
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
