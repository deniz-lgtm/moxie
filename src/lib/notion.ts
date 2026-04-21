// ============================================
// Notion Integration for Moxie Management
// ============================================
// To set up:
// 1. Create an integration at https://www.notion.so/my-integrations
// 2. Share your Notion databases with the integration
// 3. Add these to .env.local:
//    NOTION_API_KEY=secret_xxx
//    NOTION_ROADMAP_DB_ID=xxx
//    NOTION_INSPECTIONS_DB_ID=xxx
//    NOTION_MAINTENANCE_DB_ID=xxx
//    NOTION_PROPERTIES_DB_ID=xxx

const NOTION_API = "https://api.notion.com/v1";

async function notionFetch(endpoint: string, options: RequestInit = {}) {
  const apiKey = process.env.NOTION_API_KEY;
  if (!apiKey) {
    throw new Error("NOTION_API_KEY not configured. Add it to .env.local");
  }

  const response = await fetch(`${NOTION_API}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Notion API error ${response.status}: ${text}`);
  }

  return response.json();
}

// --- Query a Notion database (paginated, returns all results) ---
export async function queryDatabase(databaseId: string, filter?: object) {
  const allResults: any[] = [];
  let start_cursor: string | undefined;
  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (filter) body.filter = filter;
    if (start_cursor) body.start_cursor = start_cursor;
    const response = await notionFetch(`/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    allResults.push(...(response.results || []));
    start_cursor = response.has_more ? response.next_cursor : undefined;
  } while (start_cursor);
  return allResults;
}

// --- Get a database's schema (property definitions) ---
export async function getDatabase(databaseId: string) {
  return notionFetch(`/databases/${databaseId}`, { method: "GET" });
}

// --- Get roadmap items ---
export async function getRoadmapItems() {
  const dbId = process.env.NOTION_ROADMAP_DB_ID;
  if (!dbId) throw new Error("NOTION_ROADMAP_DB_ID not configured");
  return queryDatabase(dbId);
}

// --- Create a page in a database ---
export async function createDatabasePage(
  databaseId: string,
  properties: Record<string, unknown>
) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties,
    }),
  });
}

// --- Update a page ---
export async function updatePage(
  pageId: string,
  properties: Record<string, unknown>
) {
  return notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

// --- Sync an inspection to Notion ---
export async function syncInspectionToNotion(inspection: {
  unitNumber: string;
  propertyName: string;
  type: string;
  status: string;
  scheduledDate: string;
  inspector: string;
  overallNotes: string;
}) {
  const dbId = process.env.NOTION_INSPECTIONS_DB_ID;
  if (!dbId) return null;

  return createDatabasePage(dbId, {
    "Unit": { title: [{ text: { content: `${inspection.propertyName} #${inspection.unitNumber}` } }] },
    "Type": { select: { name: inspection.type } },
    "Status": { select: { name: inspection.status } },
    "Date": { date: { start: inspection.scheduledDate } },
    "Inspector": { rich_text: [{ text: { content: inspection.inspector } }] },
    "Notes": { rich_text: [{ text: { content: inspection.overallNotes } }] },
  });
}

// ============================================
// Vendor ↔ Notion mapping
// ============================================
// Auto-discovers the Notion DB schema (via getDatabase) and maps
// known-name columns to our Vendor fields. Columns not recognised are
// left untouched on both sides — we only read/write what we can map.

type NotionProps = Record<string, any>;

/** Case-insensitive property lookup with aliases. */
function findPropKey(props: NotionProps, candidates: string[]): string | null {
  const lower = Object.keys(props).reduce<Record<string, string>>((acc, k) => {
    acc[k.toLowerCase()] = k;
    return acc;
  }, {});
  for (const candidate of candidates) {
    const hit = lower[candidate.toLowerCase()];
    if (hit) return hit;
  }
  return null;
}

/** Extract a plain value from any Notion property. */
function readProp(prop: any): string | number | boolean | null {
  if (!prop) return null;
  switch (prop.type) {
    case "title":
      return (prop.title?.[0]?.plain_text ?? "").trim() || null;
    case "rich_text":
      return (prop.rich_text ?? []).map((x: any) => x.plain_text).join("").trim() || null;
    case "select":
      return prop.select?.name ?? null;
    case "multi_select":
      return (prop.multi_select?.[0]?.name ?? null) as string | null;
    case "date":
      return prop.date?.start ?? null;
    case "phone_number":
      return prop.phone_number ?? null;
    case "email":
      return prop.email ?? null;
    case "url":
      return prop.url ?? null;
    case "checkbox":
      return !!prop.checkbox;
    case "number":
      return prop.number ?? null;
    case "status":
      return prop.status?.name ?? null;
    default:
      return null;
  }
}

const VENDOR_FIELD_ALIASES: Record<string, string[]> = {
  category: ["Category", "Type", "Trade", "Vendor Type", "Service"],
  phone: ["Phone", "Phone Number", "Contact Phone"],
  email: ["Email", "Contact Email"],
  website: ["Website", "URL", "Site"],
  address: ["Address"],
  contact_name: ["Contact", "Contact Name", "Point of Contact", "POC"],
  license_number: ["License", "License Number", "License #"],
  insurance_expiry: ["Insurance Expiry", "Insurance Expiration", "Insurance", "COI Expiry"],
  status: ["Status"],
  rating: ["Rating", "Score"],
  notes: ["Notes", "Description", "Details"],
  is_internal: ["Internal", "Is Internal", "In-House"],
};

export type NotionVendorFields = {
  name: string;
  notion_page_id: string;
  notion_last_edited: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  contact_name: string | null;
  license_number: string | null;
  insurance_expiry: string | null;
  status: string | null;
  rating: number | null;
  notes: string | null;
  is_internal: boolean;
  raw: NotionProps;
};

/** Convert a Notion page (from the Vendor DB) into a flat vendor record. */
export function notionPageToVendor(page: any): NotionVendorFields | null {
  const props = page.properties as NotionProps;
  // Title property is mandatory — it's the vendor name.
  const titleEntry = Object.entries(props).find(([, p]: [string, any]) => p?.type === "title");
  if (!titleEntry) return null;
  const name = String(readProp(titleEntry[1]) ?? "").trim();
  if (!name) return null;

  const get = (field: keyof typeof VENDOR_FIELD_ALIASES) => {
    const key = findPropKey(props, VENDOR_FIELD_ALIASES[field]);
    if (!key) return null;
    return readProp(props[key]);
  };

  return {
    name,
    notion_page_id: page.id,
    notion_last_edited: page.last_edited_time,
    category: (get("category") as string | null) ?? null,
    phone: (get("phone") as string | null) ?? null,
    email: (get("email") as string | null) ?? null,
    website: (get("website") as string | null) ?? null,
    address: (get("address") as string | null) ?? null,
    contact_name: (get("contact_name") as string | null) ?? null,
    license_number: (get("license_number") as string | null) ?? null,
    insurance_expiry: (get("insurance_expiry") as string | null) ?? null,
    status: (get("status") as string | null) ?? null,
    rating: (() => {
      const v = get("rating");
      if (typeof v === "number") return v;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    })(),
    notes: (get("notes") as string | null) ?? null,
    is_internal: get("is_internal") === true,
    raw: props,
  };
}

/**
 * Build a Notion `properties` object from a vendor, honouring the DB's
 * actual schema (so we don't try to push a `select` where the column is
 * a `multi_select`, etc.).
 */
export function vendorToNotionProps(
  vendor: {
    name: string;
    category?: string | null;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    address?: string | null;
    contact_name?: string | null;
    license_number?: string | null;
    insurance_expiry?: string | null;
    status?: string | null;
    rating?: number | null;
    notes?: string | null;
    is_internal?: boolean;
  },
  schema: { properties: Record<string, { type: string; name: string }> }
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const byLower: Record<string, { type: string; name: string }> = {};
  for (const [key, def] of Object.entries(schema.properties)) {
    byLower[key.toLowerCase()] = { ...def, name: key };
  }
  const resolve = (aliases: string[]): { key: string; type: string } | null => {
    for (const alias of aliases) {
      const hit = byLower[alias.toLowerCase()];
      if (hit) return { key: hit.name, type: hit.type };
    }
    return null;
  };

  // Title (always required)
  const titleEntry = Object.values(byLower).find((p) => p.type === "title");
  if (titleEntry) {
    out[titleEntry.name] = { title: [{ text: { content: vendor.name } }] };
  }

  const setString = (aliases: string[], value: string | null | undefined) => {
    if (value == null) return;
    const resolved = resolve(aliases);
    if (!resolved) return;
    if (resolved.type === "rich_text") {
      out[resolved.key] = { rich_text: [{ text: { content: String(value) } }] };
    } else if (resolved.type === "select") {
      out[resolved.key] = value ? { select: { name: String(value) } } : { select: null };
    } else if (resolved.type === "multi_select") {
      out[resolved.key] = value ? { multi_select: [{ name: String(value) }] } : { multi_select: [] };
    } else if (resolved.type === "status") {
      out[resolved.key] = value ? { status: { name: String(value) } } : { status: null };
    } else if (resolved.type === "url") {
      out[resolved.key] = { url: value || null };
    } else if (resolved.type === "email") {
      out[resolved.key] = { email: value || null };
    } else if (resolved.type === "phone_number") {
      out[resolved.key] = { phone_number: value || null };
    }
  };

  setString(VENDOR_FIELD_ALIASES.category, vendor.category ?? null);
  setString(VENDOR_FIELD_ALIASES.phone, vendor.phone ?? null);
  setString(VENDOR_FIELD_ALIASES.email, vendor.email ?? null);
  setString(VENDOR_FIELD_ALIASES.website, vendor.website ?? null);
  setString(VENDOR_FIELD_ALIASES.address, vendor.address ?? null);
  setString(VENDOR_FIELD_ALIASES.contact_name, vendor.contact_name ?? null);
  setString(VENDOR_FIELD_ALIASES.license_number, vendor.license_number ?? null);
  setString(VENDOR_FIELD_ALIASES.status, vendor.status ?? null);
  setString(VENDOR_FIELD_ALIASES.notes, vendor.notes ?? null);

  // Insurance expiry → date property
  const insurance = resolve(VENDOR_FIELD_ALIASES.insurance_expiry);
  if (insurance && insurance.type === "date") {
    out[insurance.key] = vendor.insurance_expiry
      ? { date: { start: vendor.insurance_expiry } }
      : { date: null };
  }

  // Rating → number
  const rating = resolve(VENDOR_FIELD_ALIASES.rating);
  if (rating && rating.type === "number" && vendor.rating != null) {
    out[rating.key] = { number: vendor.rating };
  }

  // Is internal → checkbox
  const internal = resolve(VENDOR_FIELD_ALIASES.is_internal);
  if (internal && internal.type === "checkbox") {
    out[internal.key] = { checkbox: !!vendor.is_internal };
  }

  return out;
}

// --- Sync a maintenance request to Notion ---
export async function syncMaintenanceToNotion(request: {
  title: string;
  unitNumber: string;
  propertyName: string;
  category: string;
  priority: string;
  status: string;
  description: string;
  tenantName: string;
}) {
  const dbId = process.env.NOTION_MAINTENANCE_DB_ID;
  if (!dbId) return null;

  return createDatabasePage(dbId, {
    "Title": { title: [{ text: { content: request.title } }] },
    "Unit": { rich_text: [{ text: { content: `${request.propertyName} #${request.unitNumber}` } }] },
    "Category": { select: { name: request.category } },
    "Priority": { select: { name: request.priority } },
    "Status": { select: { name: request.status } },
    "Tenant": { rich_text: [{ text: { content: request.tenantName } }] },
    "Description": { rich_text: [{ text: { content: request.description } }] },
  });
}
