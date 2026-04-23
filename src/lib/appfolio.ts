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

async function appfolioFetch(endpoint: string, body?: Record<string, string>) {
  const url = `${getBaseUrl()}${endpoint}`;

  // v2 uses POST with JSON body; paginate_results is always included
  const requestBody = { paginate_results: true, ...body };

  const response = await fetch(url, {
    method: "POST",
    headers: getAuthHeaders(),
    body: JSON.stringify(requestBody),
    next: { revalidate: 300 }, // cache for 5 minutes
  });

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
    const response = await fetch(result.next_page_url, {
      headers: getAuthHeaders(),
    });
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
  const res = await fetch(url.toString(), { headers, next: { revalidate: 300 } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AppFolio API error ${res.status}: ${text.slice(0, 300)}`);
  }
  let data = await res.json();
  let rows: any[] = data.results || [];
  while (data.next_page_url) {
    const np = await fetch(data.next_page_url, { headers });
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

// --- Rental Applications (v2 rental_application_detail) ---
// One row per applicant, with a rental_application_id / group reference
// that's stable across syncs — which `tenant_directory?status=applicant`
// doesn't give us. Caller should treat a 404/empty response as "fall
// back to tenant_directory".
export async function getRentalApplications(propertyId?: string) {
  const body: Record<string, string> = {};
  if (propertyId) body.property_id = propertyId;
  return appfolioFetchAll("/reports/rental_application_detail.json", body);
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
