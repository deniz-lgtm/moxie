"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  mockSeoMetrics,
  mockKeywordRankings,
  mockContentItems,
  mockCalendar,
  mockContentSuggestions,
  contentTypeConfig,
  contentStatusConfig,
} from "@/lib/marketing";
import type { ContentItem, CalendarEntry } from "@/lib/marketing";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  PenLine,
  CalendarDays,
  BarChart3,
  ArrowUpRight,
  Lightbulb,
  Sparkles,
  FileText,
  Instagram,
  MessageCircle,
  Mail,
  ListChecks,
  Plus,
  ExternalLink,
  Users,
  RefreshCw,
  ChevronDown,
} from "lucide-react";

type Tab = "seo" | "content" | "calendar" | "ideas" | "prospects";

type ProspectSourceRow = {
  source: string;
  guestCardInquiries: number;
  showings: number;
  applications: number;
  approved: number;
  converted: number;
};

type ProspectSourcesData = {
  rows: ProspectSourceRow[];
  properties: string[];
  sourceFieldFound: string | null;
  lastUpdated: string;
};

const contentTypeIcon: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  blog: FileText,
  instagram: Instagram,
  reddit: MessageCircle,
  email: Mail,
  listing: ListChecks,
};

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "up") return <TrendingUp size={14} className="text-green-500" />;
  if (trend === "down") return <TrendingDown size={14} className="text-red-500" />;
  return <Minus size={14} className="text-gray-400" />;
}

function PositionChange({ current, previous }: { current: number; previous: number }) {
  const diff = previous - current;
  if (diff > 0) return <span className="text-green-600 text-xs font-medium">+{diff}</span>;
  if (diff < 0) return <span className="text-red-600 text-xs font-medium">{diff}</span>;
  return <span className="text-gray-400 text-xs">—</span>;
}

function SeoTab() {
  return (
    <div className="space-y-6">
      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {mockSeoMetrics.map((metric) => (
          <div
            key={metric.label}
            className="bg-card rounded-2xl border border-border p-5"
            style={{ boxShadow: "var(--shadow-sm)" }}
          >
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {metric.label}
            </p>
            <div className="flex items-end gap-2 mt-2">
              <p className="text-2xl font-bold tracking-tight">{metric.value}</p>
              <div className="flex items-center gap-1 pb-1">
                <TrendIcon trend={metric.trend} />
                <span
                  className={`text-xs font-medium ${
                    metric.trend === "up"
                      ? "text-green-600"
                      : metric.trend === "down"
                      ? "text-red-600"
                      : "text-gray-400"
                  }`}
                >
                  {metric.change}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Keyword Rankings */}
      <div className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Keyword Rankings</h3>
          <span className="text-xs text-muted-foreground">Top {mockKeywordRankings.length} tracked</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Keyword</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Position</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Change</th>
                <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Volume</th>
              </tr>
            </thead>
            <tbody>
              {mockKeywordRankings.map((kw) => (
                <tr key={kw.keyword} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{kw.keyword}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                      kw.position <= 3 ? "bg-green-50 text-green-700" :
                      kw.position <= 10 ? "bg-blue-50 text-blue-700" :
                      kw.position <= 20 ? "bg-amber-50 text-amber-700" :
                      "bg-gray-100 text-gray-600"
                    }`}>
                      {kw.position}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <PositionChange current={kw.position} previous={kw.previousPosition} />
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{kw.volume.toLocaleString()}/mo</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* API Integration Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <strong>Mock data.</strong> Ready to wire to Google Analytics 4, Google Search Console, and SE Ranking APIs.
      </div>
    </div>
  );
}

function ContentCard({ item }: { item: ContentItem }) {
  const typeConf = contentTypeConfig[item.type];
  const statusConf = contentStatusConfig[item.status];
  const TypeIcon = contentTypeIcon[item.type] || FileText;

  return (
    <div
      className="bg-card rounded-2xl border border-border p-5 hover:border-border/80 transition-colors"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-lg ${typeConf.bgColor} flex items-center justify-center`}>
          <TypeIcon size={16} className={typeConf.color} />
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusConf.bgColor} ${statusConf.color}`}>
          {statusConf.label}
        </span>
      </div>
      <h4 className="text-sm font-semibold mt-3 line-clamp-2">{item.title}</h4>
      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.excerpt}</p>
      <div className="flex flex-wrap gap-1 mt-3">
        {item.tags.slice(0, 3).map((tag) => (
          <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {tag}
          </span>
        ))}
      </div>
      {item.metrics && (
        <div className="mt-3 pt-2.5 border-t border-border flex items-center gap-4">
          <span className="text-xs text-muted-foreground">{item.metrics.views.toLocaleString()} views</span>
          <span className="text-xs text-muted-foreground">{item.metrics.clicks} clicks</span>
          <span className="text-xs font-medium text-green-600">{item.metrics.conversions} leads</span>
        </div>
      )}
    </div>
  );
}

function ContentTab() {
  const published = mockContentItems.filter((c) => c.status === "published");
  const upcoming = mockContentItems.filter((c) => c.status !== "published" && c.status !== "archived");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Content Hub</h3>
        <Link
          href="/marketing/create"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Plus size={16} /> Create Content
        </Link>
      </div>

      {upcoming.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Upcoming</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcoming.map((item) => (
              <ContentCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Published</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {published.map((item) => (
            <ContentCard key={item.id} item={item} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarTab() {
  const sortedEntries = [...mockCalendar].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Content Calendar</h3>
        <Link
          href="/marketing/create"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
        >
          <Plus size={16} /> Schedule Content
        </Link>
      </div>

      <div className="bg-card rounded-2xl border border-border overflow-hidden" style={{ boxShadow: "var(--shadow-sm)" }}>
        <div className="divide-y divide-border">
          {sortedEntries.map((entry) => {
            const typeConf = contentTypeConfig[entry.type];
            const statusConf = contentStatusConfig[entry.status];
            const TypeIcon = contentTypeIcon[entry.type] || FileText;
            const date = new Date(entry.date);
            const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

            return (
              <div key={entry.id} className="flex items-center gap-4 px-5 py-4 hover:bg-muted/20 transition-colors">
                <div className="w-16 text-center">
                  <p className="text-lg font-bold">{date.getDate()}</p>
                  <p className="text-[10px] text-muted-foreground uppercase">{date.toLocaleDateString("en-US", { month: "short" })}</p>
                </div>
                <div className={`w-8 h-8 rounded-lg ${typeConf.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <TypeIcon size={14} className={typeConf.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{entry.title}</p>
                  <p className="text-xs text-muted-foreground">{dateStr}</p>
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusConf.bgColor} ${statusConf.color} flex-shrink-0`}>
                  {statusConf.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function IdeasTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">AI Content Suggestions</h3>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Sparkles size={12} className="text-amber-500" /> Powered by Claude
        </span>
      </div>

      <div className="space-y-4">
        {mockContentSuggestions.map((suggestion, i) => {
          const typeConf = contentTypeConfig[suggestion.type];
          const TypeIcon = contentTypeIcon[suggestion.type] || FileText;

          return (
            <div
              key={i}
              className="bg-card rounded-2xl border border-border p-5 hover:border-accent/30 transition-colors"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl ${typeConf.bgColor} flex items-center justify-center flex-shrink-0`}>
                  <TypeIcon size={18} className={typeConf.color} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-semibold">{suggestion.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{suggestion.reason}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {suggestion.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  href={`/marketing/create?type=${suggestion.type}&title=${encodeURIComponent(suggestion.title)}`}
                  className="flex-shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline mt-1"
                >
                  Create <ArrowUpRight size={12} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <strong>Mock suggestions.</strong> Ready to wire to Claude API for real-time content ideas based on your SEO data and leasing calendar.
      </div>
    </div>
  );
}

function ProspectsTab() {
  const [data, setData] = useState<ProspectSourcesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [propertyFilter, setPropertyFilter] = useState<string>("all");
  const [pendingProperty, setPendingProperty] = useState<string>("all");

  const load = (property: string) => {
    setLoading(true);
    setError(null);
    const qs = property !== "all" ? `?property=${encodeURIComponent(property)}` : "";
    fetch(`/api/appfolio/prospect-sources${qs}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setPropertyFilter(property);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load("all");
  }, []);

  const totalRow: ProspectSourceRow | null = data
    ? {
        source: "Total",
        guestCardInquiries: data.rows.reduce((s, r) => s + r.guestCardInquiries, 0),
        showings: data.rows.reduce((s, r) => s + r.showings, 0),
        applications: data.rows.reduce((s, r) => s + r.applications, 0),
        approved: data.rows.reduce((s, r) => s + r.approved, 0),
        converted: data.rows.reduce((s, r) => s + r.converted, 0),
      }
    : null;

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            Prospect Source Tracking
          </h3>
        </div>

        {/* Property filter */}
        <div className="relative">
          <select
            value={pendingProperty}
            onChange={(e) => setPendingProperty(e.target.value)}
            className="appearance-none bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-accent/50"
          >
            <option value="all">All Properties</option>
            {(data?.properties ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <ChevronDown
            size={14}
            className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground"
          />
        </div>

        <button
          onClick={() => load(pendingProperty)}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent/90 disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!data?.sourceFieldFound && data && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <strong>Note:</strong> No lead source field found in AppFolio applications — all rows show as "Direct / Unknown".
          Contact your AppFolio account manager to enable the lead source field on the rental_application_detail report.
        </div>
      )}

      {/* Stats summary */}
      {totalRow && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Showings", value: totalRow.showings, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Applications", value: totalRow.applications, color: "text-purple-600", bg: "bg-purple-50" },
            { label: "Approved", value: totalRow.approved, color: "text-green-600", bg: "bg-green-50" },
            { label: "Converted", value: totalRow.converted, color: "text-emerald-700", bg: "bg-emerald-50" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-card rounded-2xl border border-border p-5"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {stat.label}
              </p>
              <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div
        className="bg-card rounded-2xl border border-border overflow-hidden"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-muted-foreground" />
            <span className="text-sm font-semibold">By Source</span>
            {propertyFilter !== "all" && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
                {propertyFilter}
              </span>
            )}
          </div>
          {data && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(data.lastUpdated).toLocaleTimeString()}
            </span>
          )}
        </div>

        {loading && !data ? (
          <div className="px-5 py-12 text-center text-sm text-muted-foreground">
            Loading prospect data from AppFolio…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Source
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Showings
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Applications
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Approved
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Converted
                  </th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Conv. Rate
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).length === 0 && !loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      No application data found.
                    </td>
                  </tr>
                ) : (
                  <>
                    {(data?.rows ?? []).map((row) => {
                      const convRate =
                        row.applications > 0
                          ? Math.round((row.converted / row.applications) * 100)
                          : 0;
                      return (
                        <tr
                          key={row.source}
                          className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors"
                        >
                          <td className="px-5 py-3 font-medium">{row.source}</td>
                          <td className="px-4 py-3 text-center">
                            {row.showings > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
                                {row.showings}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center font-medium">
                            {row.applications}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.approved > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-green-50 text-green-700">
                                {row.approved}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {row.converted > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[2rem] px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
                                {row.converted}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span
                              className={`text-xs font-medium ${
                                convRate >= 50
                                  ? "text-green-600"
                                  : convRate >= 20
                                  ? "text-amber-600"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {convRate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {/* Totals row */}
                    {totalRow && data && data.rows.length > 1 && (
                      <tr className="border-t-2 border-border bg-muted/20 font-semibold">
                        <td className="px-5 py-3">Total</td>
                        <td className="px-4 py-3 text-center">{totalRow.showings || "—"}</td>
                        <td className="px-4 py-3 text-center">{totalRow.applications}</td>
                        <td className="px-4 py-3 text-center">{totalRow.approved}</td>
                        <td className="px-4 py-3 text-center">{totalRow.converted}</td>
                        <td className="px-4 py-3 text-center">
                          {totalRow.applications > 0
                            ? `${Math.round((totalRow.converted / totalRow.applications) * 100)}%`
                            : "—"}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>
          <strong>Applications / Approved / Converted</strong> — sourced from AppFolio{" "}
          <code className="bg-muted px-1 rounded">rental_application_detail</code> report and{" "}
          <code className="bg-muted px-1 rounded">rent_roll</code>.
        </p>
        <p>
          <strong>Showings</strong> — sourced from Moxie showing registrations (Supabase).
          Source tag is set when the prospect registers via a tracked link.
        </p>
        <p>
          <strong>Guest Card Inquiries</strong> — not available from AppFolio v2 reporting API (create-only endpoint).
        </p>
      </div>
    </div>
  );
}

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "seo", label: "SEO Dashboard", icon: Search },
  { id: "content", label: "Content Hub", icon: PenLine },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "ideas", label: "AI Ideas", icon: Lightbulb },
  { id: "prospects", label: "Prospects", icon: Users },
];

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("seo");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-4">
          {/* Moxie Logo */}
          <img 
            src="/logos/moxie-logo.png" 
            alt="Moxie Management" 
            className="h-12 w-auto object-contain"
          />
          <div>
            <div className="flex items-center gap-3">
              <img 
                src="/logos/key-icon.png" 
                alt="Key" 
                className="h-8 w-8 object-contain"
              />
              <h1 className="text-2xl font-bold tracking-tight">Marketing & SEO</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Track SEO performance, manage content, and generate leads
            </p>
          </div>
        </div>
        <Link
          href="/marketing/report"
          className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <BarChart3 size={16} />
          Monthly Report
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                active
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={16} />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "seo" && <SeoTab />}
      {activeTab === "content" && <ContentTab />}
      {activeTab === "calendar" && <CalendarTab />}
      {activeTab === "ideas" && <IdeasTab />}
      {activeTab === "prospects" && <ProspectsTab />}
    </div>
  );
}
