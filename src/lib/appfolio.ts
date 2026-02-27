// ============================================
// AppFolio Property Manager API Integration
// ============================================
// To set up:
// 1. Request API access from AppFolio (https://www.appfolio.com/developers)
// 2. Add these to .env.local:
//    APPFOLIO_CLIENT_ID=xxx
//    APPFOLIO_CLIENT_SECRET=xxx
//    APPFOLIO_DATABASE_NAME=xxx        (your AppFolio subdomain/database)
//
// AppFolio API docs: https://help.appfolio.com/s/article/API-Overview

const BASE_URL = `https://${process.env.APPFOLIO_DATABASE_NAME}.appfolio.com/api/v2`;

async function appfolioFetch(endpoint: string, options: RequestInit = {}) {
  const clientId = process.env.APPFOLIO_CLIENT_ID;
  const clientSecret = process.env.APPFOLIO_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("AppFolio API credentials not configured. Set APPFOLIO_CLIENT_ID and APPFOLIO_CLIENT_SECRET in .env.local");
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AppFolio API error ${response.status}: ${text}`);
  }

  return response.json();
}

// --- Properties ---
export async function getProperties() {
  return appfolioFetch("/properties.json");
}

export async function getProperty(propertyId: string) {
  return appfolioFetch(`/properties/${propertyId}.json`);
}

// --- Units ---
export async function getUnits(propertyId?: string) {
  const params = propertyId ? `?property_id=${propertyId}` : "";
  return appfolioFetch(`/units.json${params}`);
}

// --- Tenants / Leases ---
export async function getTenants(params?: { property_id?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.property_id) searchParams.set("property_id", params.property_id);
  if (params?.status) searchParams.set("status", params.status);
  const qs = searchParams.toString();
  return appfolioFetch(`/tenants.json${qs ? `?${qs}` : ""}`);
}

// --- Work Orders (Maintenance) ---
export async function getWorkOrders(params?: {
  property_id?: string;
  status?: string;
  created_after?: string;
}) {
  const searchParams = new URLSearchParams();
  if (params?.property_id) searchParams.set("property_id", params.property_id);
  if (params?.status) searchParams.set("status", params.status);
  if (params?.created_after) searchParams.set("created_after", params.created_after);
  const qs = searchParams.toString();
  return appfolioFetch(`/work_orders.json${qs ? `?${qs}` : ""}`);
}

export async function createWorkOrder(data: {
  property_id: string;
  unit_id?: string;
  description: string;
  priority: string;
  category?: string;
  assigned_to?: string;
}) {
  return appfolioFetch("/work_orders.json", {
    method: "POST",
    body: JSON.stringify({ work_order: data }),
  });
}

export async function updateWorkOrder(
  workOrderId: string,
  data: { status?: string; notes?: string; assigned_to?: string }
) {
  return appfolioFetch(`/work_orders/${workOrderId}.json`, {
    method: "PATCH",
    body: JSON.stringify({ work_order: data }),
  });
}

// --- Bills / Invoices ---
export async function getBills(params?: { property_id?: string; status?: string }) {
  const searchParams = new URLSearchParams();
  if (params?.property_id) searchParams.set("property_id", params.property_id);
  if (params?.status) searchParams.set("status", params.status);
  const qs = searchParams.toString();
  return appfolioFetch(`/bills.json${qs ? `?${qs}` : ""}`);
}

// --- Vacancy Report ---
export async function getVacancyReport() {
  return appfolioFetch("/reports/vacancy.json");
}

// --- Rent Roll ---
export async function getRentRoll(propertyId?: string) {
  const params = propertyId ? `?property_id=${propertyId}` : "";
  return appfolioFetch(`/reports/rent_roll.json${params}`);
}
