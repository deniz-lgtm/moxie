import { NextResponse } from "next/server";
import { getSummary, lastNDays } from "@/lib/ga4";
import type { SeoMetric } from "@/lib/marketing";

export const revalidate = 900; // 15 min

function pct(n: number) {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export async function GET() {
  const current = await getSummary(lastNDays(30));
  if (!current) {
    return NextResponse.json(
      { error: "GA4 not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON and GA4_PROPERTY_ID." },
      { status: 503 },
    );
  }
  const previous = await getSummary({ startDate: "60daysAgo", endDate: "31daysAgo" });

  const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : 0);

  const metrics: SeoMetric[] = [
    {
      label: "Sessions (30d)",
      value: current.sessions.toLocaleString(),
      change: previous ? pct(delta(current.sessions, previous.sessions)) : "—",
      trend: previous && current.sessions >= previous.sessions ? "up" : "down",
    },
    {
      label: "Organic Sessions",
      value: current.organicSessions.toLocaleString(),
      change: previous ? pct(delta(current.organicSessions, previous.organicSessions)) : "—",
      trend: previous && current.organicSessions >= previous.organicSessions ? "up" : "down",
    },
    {
      label: "Paid Sessions",
      value: current.paidSessions.toLocaleString(),
      change: previous ? pct(delta(current.paidSessions, previous.paidSessions)) : "—",
      trend: previous && current.paidSessions >= previous.paidSessions ? "up" : "down",
    },
    {
      label: "Conversions",
      value: Math.round(current.conversions).toLocaleString(),
      change: previous ? pct(delta(current.conversions, previous.conversions)) : "—",
      trend: previous && current.conversions >= previous.conversions ? "up" : "down",
    },
    {
      label: "Engagement Rate",
      value: `${(current.engagementRate * 100).toFixed(1)}%`,
      change: previous
        ? pct((current.engagementRate - previous.engagementRate) * 100)
        : "—",
      trend:
        previous && current.engagementRate >= previous.engagementRate ? "up" : "down",
    },
  ];

  return NextResponse.json({ metrics, source: "ga4", range: "last 30 days" });
}
