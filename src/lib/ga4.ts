import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { getServiceAccount } from "./google-auth";

let client: BetaAnalyticsDataClient | null | undefined;

function getClient(): BetaAnalyticsDataClient | null {
  if (client !== undefined) return client;
  const creds = getServiceAccount();
  if (!creds) {
    client = null;
    return null;
  }
  client = new BetaAnalyticsDataClient({
    credentials: { client_email: creds.client_email, private_key: creds.private_key },
  });
  return client;
}

function property(): string | null {
  const id = process.env.GA4_PROPERTY_ID;
  return id ? `properties/${id}` : null;
}

export type Ga4Range = { startDate: string; endDate: string };

export const lastNDays = (n: number): Ga4Range => ({
  startDate: `${n}daysAgo`,
  endDate: "today",
});

export type Ga4Summary = {
  sessions: number;
  organicSessions: number;
  paidSessions: number;
  conversions: number;
  engagementRate: number;
};

export async function getSummary(range: Ga4Range): Promise<Ga4Summary | null> {
  const c = getClient();
  const p = property();
  if (!c || !p) return null;

  const [resp] = await c.runReport({
    property: p,
    dateRanges: [range],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [
      { name: "sessions" },
      { name: "conversions" },
      { name: "engagementRate" },
    ],
  });

  let sessions = 0;
  let organicSessions = 0;
  let paidSessions = 0;
  let conversions = 0;
  let engagedWeighted = 0;

  for (const row of resp.rows ?? []) {
    const channel = row.dimensionValues?.[0]?.value ?? "";
    const s = Number(row.metricValues?.[0]?.value ?? 0);
    const conv = Number(row.metricValues?.[1]?.value ?? 0);
    const eng = Number(row.metricValues?.[2]?.value ?? 0);
    sessions += s;
    conversions += conv;
    engagedWeighted += eng * s;
    if (/Organic/i.test(channel)) organicSessions += s;
    if (/Paid/i.test(channel)) paidSessions += s;
  }

  return {
    sessions,
    organicSessions,
    paidSessions,
    conversions,
    engagementRate: sessions > 0 ? engagedWeighted / sessions : 0,
  };
}

export type TopPage = { page: string; views: number; bounceRate: number };

export async function getTopPages(range: Ga4Range, limit = 10): Promise<TopPage[] | null> {
  const c = getClient();
  const p = property();
  if (!c || !p) return null;

  const [resp] = await c.runReport({
    property: p,
    dateRanges: [range],
    dimensions: [{ name: "pagePath" }],
    metrics: [{ name: "screenPageViews" }, { name: "bounceRate" }],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
    limit,
  });

  return (resp.rows ?? []).map((row) => ({
    page: row.dimensionValues?.[0]?.value ?? "",
    views: Number(row.metricValues?.[0]?.value ?? 0),
    bounceRate: Math.round(Number(row.metricValues?.[1]?.value ?? 0) * 100),
  }));
}

export type ChannelBreakdown = { channel: string; sessions: number };

export async function getChannelBreakdown(range: Ga4Range): Promise<ChannelBreakdown[] | null> {
  const c = getClient();
  const p = property();
  if (!c || !p) return null;

  const [resp] = await c.runReport({
    property: p,
    dateRanges: [range],
    dimensions: [{ name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  return (resp.rows ?? []).map((row) => ({
    channel: row.dimensionValues?.[0]?.value ?? "Unknown",
    sessions: Number(row.metricValues?.[0]?.value ?? 0),
  }));
}
