// ============================================
// AppFolio Property Manager API Integration
// ============================================
// AppFolio uses a report-based API at:
//   https://{database}.appfolio.com/api/v1/reports/{report_name}.json
//
// Auth: HTTP Basic Auth with Client ID + Client Secret
// Credentials: AppFolio PM → General Settings → Manage API Settings → Reports API Credentials
//
// Required env vars:
//   APPFOLIO_CLIENT_ID
//   APPFOLIO_CLIENT_SECRET
//   APPFOLIO_DATABASE_NAME    (your AppFolio subdomain, e.g. "mbtenants")

const getBaseUrl = () =>
  `https://${process.env.APPFOLIO_DATABASE_NAME}.appfolio.com/api/v1`;

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
    Accept: "application/json",
  };
}

async function appfolioFetch(endpoint: string, params?: Record<string, string>) {
  const url = new URL(`${getBaseUrl()}${endpoint}`);
  url.searchParams.set("paginate_results", "true");
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value) url.searchParams.set(key, value);
    }
  }

  const response = await fetch(url.toString(), {
    headers: getAuthHeaders(),
    next: { revalidate: 300 }, // cache for 5 minutes
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AppFolio API error ${response.status}: ${text.slice(0, 300)}`);
  }

  return response.json();
}

// Helper to follow paginated results
async function appfolioFetchAll(endpoint: string, params?: Record<string, string>) {
  let result = await appfolioFetch(endpoint, params);
  let allResults = result.results || [];

  while (result.next_page_url) {
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
  const params: Record<string, string> = {};
  if (propertyId) params.property_id = propertyId;
  return appfolioFetchAll("/reports/unit_directory.json", params);
}

// --- Tenant Directory ---
export async function getTenants(params?: { property_id?: string; status?: string }) {
  const queryParams: Record<string, string> = {};
  if (params?.property_id) queryParams.property_id = params.property_id;
  if (params?.status) queryParams.tenant_status = params.status;
  return appfolioFetchAll("/reports/tenant_directory.json", queryParams);
}

// --- Work Orders ---
// work_order_detail requires from_date and to_date
export async function getWorkOrders(params?: {
  property_id?: string;
  status?: string;
  created_after?: string;
}) {
  const queryParams: Record<string, string> = {};
  if (params?.property_id) queryParams.property_id = params.property_id;
  if (params?.status) queryParams.status = params.status;
  // Default to last 12 months
  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);
  queryParams.from_date = params?.created_after || formatDate(fromDate);
  queryParams.to_date = formatDate(toDate);
  return appfolioFetchAll("/reports/work_order_detail.json", queryParams);
}

function formatDate(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

// --- Unit Vacancy ---
export async function getVacancyReport() {
  return appfolioFetchAll("/reports/unit_vacancy_detail.json");
}

// --- Rent Roll ---
export async function getRentRoll(propertyId?: string) {
  const params: Record<string, string> = {};
  if (propertyId) params.property_id = propertyId;
  return appfolioFetchAll("/reports/rent_roll.json", params);
}
