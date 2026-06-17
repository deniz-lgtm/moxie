import { NextResponse } from "next/server";
import { getSummary, getTopPages, lastNDays } from "@/lib/ga4";

export const revalidate = 900;

export async function GET() {
  const range = lastNDays(30);
  const [summary, topPages] = await Promise.all([getSummary(range), getTopPages(range, 5)]);

  if (!summary || !topPages) {
    return NextResponse.json(
      { error: "GA4 not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GA4_PROPERTY_ID." },
      { status: 503 },
    );
  }

  const now = new Date();
  const month = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  return NextResponse.json({
    month,
    websiteVisits: summary.sessions,
    organicTraffic: summary.organicSessions,
    paidTraffic: summary.paidSessions,
    leadsGenerated: Math.round(summary.conversions),
    applicationsFromWeb: 0, // TODO: wire to AppFolio applications attributed to web
    topPages,
    topKeywords: [], // populated once Search Console is wired
    socialMetrics: [], // populated once Meta/Reddit are wired
    costPerLead: 0,
    conversionRate: summary.sessions > 0 ? (summary.conversions / summary.sessions) * 100 : 0,
  });
}
