// ============================================
// AppFolio Property Manager API Integration (v2)
// ============================================
// AppFolio v2 uses a report-based API at:
//   POST https://{database}.appfolio.com/api/v2/reports/{report_name}.json
//
// Auth: HTTP Basic Auth with Client ID + Client Secret
// Credentials: AppFolio PM → General Settings → Manage API Settings → Reports API Credentials
//
// Required env vars:
//   APPFOLIO_CLIENT_ID
//   APPFOLIO_CLIENT_SECRET
//   APPFOLIO_DATABASE_NAME    (your AppFolio subdomain, e.g. "mbtenants")
//
// v2 API:
// - All endpoints use POST with JSON body for filters
// - Dates use ISO 8601 format (YYYY-MM-DD)
// - Pagination: uses next_page_url in response
// - Rate limit: 7 requests per 15 seconds (pagination exempt)

const getBaseUrl = () =>
  `https://${process.env.APPFOLIO_DATABASE_NAME}.appfolio.com/api/v2`;

function getAuthHeaders() {
  const clientId = process.env.APPFOLIO_CLIENT_ID;
  const clientSecret = process.env.APPFOLIO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "AppFolio API credentials not configured. Set APPFOLIO_CLIENT_ID and APPFOLIO_CLIENT_SECRET."
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return {
    Authorization: `Basic ${credentials}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

// AppFolio v2 rate limit is 7 requests per 15 seconds. When we go over
// the API returns 429 with body "Retry later\n" (optionally an HTTP
// Retry-After header). Rather than fail the whole page, retry with
// exponential backoff a few times before giving up.
async function fetchWithRateLimit(
  input: string,
  init: RequestInit,
  label: string
): Promise<Response> {
  const backoffMs = [500, 1500, 3500]; // up to ~5.5 s total
  for (let attempt = 0; attempt <= backoffMs.length; attempt++) {
    const res = await fetch(input, init);
    if (res.status !== 429) return res;
    if (attempt === backoffMs.length) return res; // out of retries, propagate
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0
      ? Math.min(retryAfter * 1000, 10000)
      : backoffMs[attempt];
    console.warn(
      `[AppFolio] 429 on ${label}; waiting ${wait}ms (attempt ${attempt + 1}/${backoffMs.length + 1})`
    );
    await new Promise((r) => setTimeout(r, wait));
  }
  // Unreachable, TS needs it.
  return fetch(input, init);
}

async function appfolioFetch(endpoint: string, body?: Record<string, string>) {
  const url = `${getBaseUrl()}${endpoint}`;

  // v2 uses POST with JSON body; paginate_results is always included
  const requestBody = { paginate_results: true, ...body };

  const response = await fetchWithRateLimit(
    url,
    {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(requestBody),
      next: { revalidate: 300 }, // cache for 5 minutes
    },
    endpoint
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AppFolio API error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json();
}

// Helper to follow paginated results
async function appfolioFetchAll(endpoint: string, body?: Record<string, string>) {
  let result = await appfolioFetch(endpoint, body);
  let allResults = result.results || [];

  while (result.next_page_url) {
    // Pagination URLs are fetched with GET (they contain auth info in the URL)
    const response = await fetchWithRateLimit(
      result.next_page_url,
      { headers: getAuthHeaders() },
      `${endpoint} [paginate]`
    );
    if (!response.ok) break;
    result = await response.json();
    allResults = allResults.concat(result.results || []);
  }

  return allResults;
}

// --- Property Directory ---
export async function getProperties() {
  return appfolioFetchAll("/reports/property_directory.json");
}

// --- Unit Directory ---
export async function getUnits(propertyId?: string) {
  const body: Record<string, string> = {};
  if (propertyId) body.property_id = propertyId;
  return appfolioFetchAll("/reports/unit_directory.json", body);
}

// --- Tenant Directory ---
export async function getTenants(params?: { property_id?: string; status?: string }) {
  const body: Record<string, string> = {};
  if (params?.property_id) body.property_id = params.property_id;
  if (params?.status) body.tenant_status = params.status;
  return appfolioFetchAll("/reports/tenant_directory.json", body);
}

// --- Work Orders ---
// work_order requires from_date and to_date (ISO 8601: YYYY-MM-DD)
export async function getWorkOrders(params?: {
  property_id?: string;
  status?: string;
  created_after?: string;
}) {
  const body: Record<string, string> = {};
  if (params?.property_id) body.property_id = params.property_id;
  if (params?.status) body.status = params.status;
  // Default to last 12 months
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);
  body.from_date = params?.created_after || formatDate(fromDate);
  body.to_date = formatDate(toDate);
  return appfolioFetchAll("/reports/work_order.json", body);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0]; // YYYY-MM-DD
}

// --- GET fetcher for reports that don't accept POST body params ---
// AppFolio's `unit_vacancy_detail` report does NOT honor filters posted
// via JSON body (confirmed: passing `as_of_date` in the body returns an
// empty set). The `/api/appfolio/debug` route successfully calls the
// same report with GET + query params; we mirror that here.
async function appfolioGet(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${getBaseUrl()}${endpoint}`);
  url.searchParams.set("paginate_results", "true");
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
  }
  const headers = getAuthHeaders();
  const res = await fetchWithRateLimit(
    url.toString(),
    { headers, next: { revalidate: 300 } },
    endpoint
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio API error ${res.status}: ${text.slice(0, 300)}`);
  }
  let data = await res.json();
  let rows: any[] = data.results || [];
  while (data.next_page_url) {
    const np = await fetchWithRateLimit(
      data.next_page_url,
      { headers },
      `${endpoint} [paginate]`
    );
    if (!np.ok) break;
    data = await np.json();
    rows = rows.concat(data.results || []);
  }
  return rows;
}

// --- Unit Vacancy ---
// unit_vacancy_detail is authoritative for "is this unit leased on DATE":
// it accounts for FUTURE signed leases, unlike rent_roll which is a
// point-in-time snapshot of the current tenant. The v2 report takes
// `as_of_date` in MM/DD/YYYY format, and filters must be supplied as
// query-string params rather than JSON body (POST body filters are
// silently ignored on this report).
export async function getVacancyReport(asOfDate?: string) {
  const params: Record<string, string> = {};
  if (asOfDate) {
    const iso = asOfDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    params.as_of_date = iso ? `${iso[2]}/${iso[3]}/${iso[1]}` : asOfDate;
  }
  return appfolioGet("/reports/unit_vacancy_detail.json", params);
}

// --- Rent Roll ---
export async function getRentRoll(propertyId?: string) {
  const body: Record<string, string> = {};
  if (propertyId) body.property_id = propertyId;
  return appfolioFetchAll("/reports/rent_roll.json", body);
}

// --- Rental Applications (v2 rental_applications) ---
// One row per applicant, with a rental_application_id / group reference
// that's stable across syncs.
//
// AppFolio v2 requires `from_date` on this report and rejects calls that
// omit it with a misleading 400 "Id is not a valid report" error. We
// default to ~2 years back so we capture the full active leasing window
// without forcing every caller to think about it.
//
// NOTE: the report id is `rental_applications`, not `rental_application_detail`
// (an earlier version of this code called the wrong endpoint and the
// 400 was misread as a credentials problem).
export async function getRentalApplications(opts?: {
  propertyId?: string;
  fromDate?: string;
  toDate?: string;
}) {
  const body: Record<string, string> = {};
  if (opts?.propertyId) body.property_id = opts.propertyId;
  body.from_date = opts?.fromDate ?? defaultRentalAppFromDate();
  if (opts?.toDate) body.to_date = opts.toDate;
  return appfolioFetchAll("/reports/rental_applications.json", body);
}

function defaultRentalAppFromDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 2);
  return d.toISOString().slice(0, 10);
}

// --- Aged Receivables ---
export async function getAgedReceivables() {
  return appfolioFetchAll("/reports/aged_receivables_detail.json");
}

// --- General Ledger ---
export async function getGeneralLedger(params?: {
  from_date?: string;
  to_date?: string;
}) {
  const body: Record<string, string> = {};
  if (params?.from_date) body.from_date = params.from_date;
  if (params?.to_date) body.to_date = params.to_date;
  return appfolioFetchAll("/reports/general_ledger.json", body);
}

// --- Guest Cards ---
// AppFolio v2 guest card endpoint (REST, not report-based):
//   POST /api/v2/guest_cards
// Creates a prospect/lead in the AppFolio CRM. Returns the guest_card_id.
// Required fields: first_name, last_name, email or phone.
// Optional: property_id, unit_id, showing_date, showing_time, source, notes.
//
// When showing_date / showing_time are provided, the prospect appears on
// AppFolio's showing schedule for that property/unit — the structured
// fields are how AppFolio's calendar/CRM picks up scheduled showings.
//
// See AppFolio API docs: Guest Card — Create
export interface GuestCardInput {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  propertyId?: string;
  unitId?: string;
  /** ISO 8601 datetime — split into showing_date + showing_time for AppFolio. */
  showingAt?: string;
  /** Free-text source label (e.g. "Moxie Showings"). */
  source?: string;
  notes?: string;
}

export interface GuestCardResult {
  id: string;
  [key: string]: unknown;
}

// --- Prospect Showings (read from AppFolio) ---
// AppFolio's prospect/guest-card data is exposed via varying v2 reports
// across tenants. We probe several candidate endpoints and field names so
// the team calendar can still surface showings even when a particular
// install uses non-standard naming.
//
// If no report is reachable, callers receive an empty showings list +
// diagnostic info describing what was tried.
export interface ProspectShowing {
  guestCardId: string;
  showingId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  propertyId?: string;
  propertyName?: string;
  unitId?: string;
  unitName?: string;
  /** ISO 8601 datetime of the scheduled showing. */
  showingAt: string;
  /** AppFolio-side status: "Completed", "Scheduled", "No Show", etc. */
  status?: string;
  /** Showing type: "In-Person", "Self-Showing", etc. */
  type?: string;
  description?: string;
  assignedUser?: string;
}

export interface ProspectShowingsResult {
  showings: ProspectShowing[];
  /** Per-report probe results, useful for `?debug=1` on the API route. */
  attempts: {
    endpoint: string;
    ok: boolean;
    rowCount?: number;
    sampleFields?: string[];
    sampleRow?: Record<string, unknown>;
    showingDateField?: string;
    error?: string;
  }[];
}

// Primary report on this AppFolio install is /reports/showings.json — fields
// confirmed live: guest_card_id, guest_card_name ("Last, First"), email,
// phone_number, property_name, showing_unit, unit_id, showing_time
// (full ISO datetime), status, type. The other endpoints stay as fallbacks
// in case a different tenant exposes its data under a different name.
const CANDIDATE_REPORTS = [
  "/reports/showings.json",
  "/reports/guest_card_detail.json",
  "/reports/prospect_summary.json",
  "/reports/prospect_detail.json",
];

// Datetime fields that already encode the full showing time (ISO or similar).
// Try these first; if found we don't need a separate time field.
const SHOWING_DATETIME_FIELDS = [
  "showing_time",      // /reports/showings.json — full ISO ("2026-04-27T19:45:00Z")
  "showing_at", "showing_datetime", "appointment_at",
];
// Date-only fields requiring a paired time field.
const SHOWING_DATE_FIELDS = [
  "showing_date", "showingDate", "ShowingDate",
  "scheduled_showing_date", "next_showing_date", "appointment_date",
];
const SHOWING_TIME_ONLY_FIELDS = [
  "showingTime", "ShowingTime",
  "scheduled_showing_time", "next_showing_time", "appointment_time",
];
// Combined "Last, First" field — only used if first/last aren't separate.
const COMBINED_NAME_FIELDS = ["guest_card_name", "name", "prospect_name"];
const FIRST_NAME_FIELDS = ["first_name", "firstName", "FirstName", "applicant_first_name", "prospect_first_name"];
const LAST_NAME_FIELDS = ["last_name", "lastName", "LastName", "applicant_last_name", "prospect_last_name"];
const PROPERTY_NAME_FIELDS = ["property_name", "PropertyName", "property"];
const PROPERTY_ID_FIELDS = ["property_id", "PropertyId"];
const UNIT_NAME_FIELDS = ["showing_unit", "unit_name", "UnitName", "unit", "unit_number"];
const UNIT_ID_FIELDS = ["unit_id", "UnitId"];
const EMAIL_FIELDS = ["email", "Email", "applicant_email", "prospect_email"];
const PHONE_FIELDS = ["phone", "Phone", "phone_number", "PhoneNumber"];
const GUEST_CARD_ID_FIELDS = ["guest_card_id", "GuestCardId", "prospect_id", "id", "Id"];
const SHOWING_ID_FIELDS = ["showing_id", "ShowingId"];
const STATUS_FIELDS = ["status", "Status", "showing_status"];
const TYPE_FIELDS = ["type", "Type", "showing_type"];
const DESCRIPTION_FIELDS = ["description", "Description", "notes"];
const ASSIGNED_USER_FIELDS = ["assigned_user", "AssignedUser", "host"];

function pickStr(row: Record<string, unknown>, candidates: string[]): string | undefined {
  for (const k of candidates) {
    const v = row[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

/** Find the first key in `row` whose name matches any candidate (case-insensitive) AND has a non-empty value. */
function findFieldName(row: Record<string, unknown>, candidates: string[]): string | undefined {
  const lcCandidates = new Set(candidates.map((c) => c.toLowerCase()));
  for (const key of Object.keys(row)) {
    if (lcCandidates.has(key.toLowerCase())) {
      const v = row[key];
      if (v != null && String(v).trim() !== "") return key;
    }
  }
  return undefined;
}

/** Parse a row's showing datetime — supports either a single ISO field or
 * a date+time pair. Returns the raw string for `new Date(...)` to consume. */
function parseShowingAt(row: Record<string, unknown>): string | undefined {
  // Prefer single ISO datetime fields.
  const dt = pickStr(row, SHOWING_DATETIME_FIELDS);
  if (dt) {
    if (!Number.isNaN(new Date(dt).getTime())) return dt;
  }
  // Fallback: combine separate date + time fields.
  const dateStr = pickStr(row, SHOWING_DATE_FIELDS);
  if (!dateStr) return undefined;
  const timeStr = pickStr(row, SHOWING_TIME_ONLY_FIELDS) ?? "00:00";
  const isoDate = (() => {
    const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
    return dateStr.slice(0, 10);
  })();
  const time = /^\d{1,2}:\d{2}/.test(timeStr) ? timeStr : "00:00";
  const padded = time.length === 4 ? `0${time}` : time;
  const combined = `${isoDate}T${padded}:00`;
  return Number.isNaN(new Date(combined).getTime()) ? undefined : combined;
}

/** Parse "Last, First" or "First Last" into { firstName, lastName }. */
function splitCombinedName(name: string): { firstName?: string; lastName?: string } {
  const trimmed = name.trim();
  if (trimmed.includes(",")) {
    const [last, first] = trimmed.split(",").map((s) => s.trim());
    return { firstName: first || undefined, lastName: last || undefined };
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function getProspectShowings(): Promise<ProspectShowingsResult> {
  const attempts: ProspectShowingsResult["attempts"] = [];
  let pickedRows: any[] = [];

  for (const endpoint of CANDIDATE_REPORTS) {
    try {
      const rows = await appfolioFetchAll(endpoint);
      const sampleRow = rows[0] as Record<string, unknown> | undefined;
      const showingDateField = sampleRow
        ? findFieldName(sampleRow, [...SHOWING_DATETIME_FIELDS, ...SHOWING_DATE_FIELDS])
        : undefined;
      attempts.push({
        endpoint,
        ok: true,
        rowCount: rows.length,
        sampleFields: sampleRow ? Object.keys(sampleRow) : [],
        sampleRow,
        showingDateField,
      });
      if (pickedRows.length === 0 && rows.length > 0 && showingDateField) {
        pickedRows = rows;
      }
    } catch (err: any) {
      attempts.push({ endpoint, ok: false, error: err?.message ?? String(err) });
    }
  }

  const showings: ProspectShowing[] = [];
  for (const row of pickedRows) {
    const showingAt = parseShowingAt(row);
    if (!showingAt) continue;

    // Skip cancelled showings — completed/scheduled both belong on the calendar.
    const status = pickStr(row, STATUS_FIELDS)?.toLowerCase() ?? "";
    if (status === "cancelled" || status === "canceled") continue;

    const id = pickStr(row, GUEST_CARD_ID_FIELDS);
    if (!id) continue;

    let firstName = pickStr(row, FIRST_NAME_FIELDS);
    let lastName = pickStr(row, LAST_NAME_FIELDS);
    if (!firstName && !lastName) {
      const combined = pickStr(row, COMBINED_NAME_FIELDS);
      if (combined) ({ firstName, lastName } = splitCombinedName(combined));
    }

    showings.push({
      guestCardId: id,
      showingId: pickStr(row, SHOWING_ID_FIELDS),
      firstName,
      lastName,
      email: pickStr(row, EMAIL_FIELDS),
      phone: pickStr(row, PHONE_FIELDS),
      propertyId: pickStr(row, PROPERTY_ID_FIELDS),
      propertyName: pickStr(row, PROPERTY_NAME_FIELDS),
      unitId: pickStr(row, UNIT_ID_FIELDS),
      unitName: pickStr(row, UNIT_NAME_FIELDS),
      showingAt: new Date(showingAt).toISOString(),
      status: pickStr(row, STATUS_FIELDS),
      type: pickStr(row, TYPE_FIELDS),
      description: pickStr(row, DESCRIPTION_FIELDS),
      assignedUser: pickStr(row, ASSIGNED_USER_FIELDS),
    });
  }

  return { showings, attempts };
}

export async function createGuestCard(input: GuestCardInput): Promise<GuestCardResult> {
  const url = `${getBaseUrl()}/guest_cards`;
  const headers = getAuthHeaders();

  let showingDate: string | undefined;
  let showingTime: string | undefined;
  if (input.showingAt) {
    const d = new Date(input.showingAt);
    if (!Number.isNaN(d.getTime())) {
      const pad = (n: number) => String(n).padStart(2, "0");
      showingDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      showingTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }

  const body: Record<string, string | undefined> = {
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    property_id: input.propertyId,
    unit_id: input.unitId,
    showing_date: showingDate,
    showing_time: showingTime,
    source: input.source,
    notes: input.notes,
  };
  // Strip undefined values
  for (const k of Object.keys(body)) {
    if (body[k] === undefined) delete body[k];
  }
  const res = await fetchWithRateLimit(
    url,
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
    "guest_cards"
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio guest_card error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<GuestCardResult>;
}
