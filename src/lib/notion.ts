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

// --- Query a Notion database ---
export async function queryDatabase(databaseId: string, filter?: object) {
  const body: Record<string, unknown> = {};
  if (filter) body.filter = filter;

  const response = await notionFetch(`/databases/${databaseId}/query`, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.results;
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
