"use client";

import { useState } from "react";
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
} from "lucide-react";

type Tab = "seo" | "content" | "calendar" | "ideas";

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

const tabs: { id: Tab; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: "seo", label: "SEO Dashboard", icon: Search },
  { id: "content", label: "Content Hub", icon: PenLine },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "ideas", label: "AI Ideas", icon: Lightbulb },
];

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState<Tab>("seo");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marketing & SEO</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track SEO performance, manage content, and generate leads
          </p>
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
    </div>
  );
}
