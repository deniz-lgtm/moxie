"use client";

import Link from "next/link";
import { mockMonthlyReport } from "@/lib/marketing";
import {
  ArrowLeft,
  Download,
  Globe,
  Search,
  MousePointerClick,
  Users,
  FileText,
  TrendingUp,
  DollarSign,
  BarChart3,
} from "lucide-react";

function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div
      className="bg-card rounded-2xl border border-border p-5"
      style={{ boxShadow: "var(--shadow-sm)" }}
    >
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <Icon size={16} className="text-muted-foreground/50" />
      </div>
      <p className="text-2xl font-bold mt-2 tracking-tight">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}

export default function MonthlyReportPage() {
  const report = mockMonthlyReport;

  const organicPct = report.websiteVisits > 0
    ? Math.round((report.organicTraffic / report.websiteVisits) * 100)
    : 0;

  return (
    <div className="space-y-8 max-w-5xl">
      {/* Header */}
      <div>
        <Link
          href="/marketing"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={16} /> Back to Marketing
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Monthly Marketing Report</h1>
            <p className="text-sm text-muted-foreground mt-1">{report.month}</p>
          </div>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium hover:bg-muted/50 transition-colors">
            <Download size={16} /> Download PDF
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Website Visits"
          value={report.websiteVisits}
          subtext={`${organicPct}% organic`}
          icon={Globe}
        />
        <StatCard
          label="Organic Traffic"
          value={report.organicTraffic}
          subtext="from search engines"
          icon={Search}
        />
        <StatCard
          label="Leads Generated"
          value={report.leadsGenerated}
          subtext={`$${report.costPerLead.toFixed(2)} per lead`}
          icon={Users}
        />
        <StatCard
          label="Applications"
          value={report.applicationsFromWeb}
          subtext={`${report.conversionRate}% conversion`}
          icon={FileText}
        />
      </div>

      {/* Top Pages */}
      <div
        className="bg-card rounded-2xl border border-border overflow-hidden"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <MousePointerClick size={16} className="text-muted-foreground" />
            Top Pages
          </h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Page</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Views</th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">Bounce Rate</th>
            </tr>
          </thead>
          <tbody>
            {report.topPages.map((page) => (
              <tr key={page.page} className="border-b border-border last:border-0 hover:bg-muted/20">
                <td className="px-5 py-3 font-medium font-mono text-xs">{page.page}</td>
                <td className="px-5 py-3 text-right">{page.views.toLocaleString()}</td>
                <td className="px-5 py-3 text-right">
                  <span className={page.bounceRate > 50 ? "text-amber-600" : "text-green-600"}>
                    {page.bounceRate}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Keyword Rankings */}
      <div
        className="bg-card rounded-2xl border border-border overflow-hidden"
        style={{ boxShadow: "var(--shadow-sm)" }}
      >
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp size={16} className="text-muted-foreground" />
            Top Keywords
          </h3>
        </div>
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
            {report.topKeywords.map((kw) => {
              const diff = kw.previousPosition - kw.position;
              return (
                <tr key={kw.keyword} className="border-b border-border last:border-0 hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium">{kw.keyword}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-sm font-bold ${
                      kw.position <= 3 ? "bg-green-50 text-green-700" :
                      kw.position <= 10 ? "bg-blue-50 text-blue-700" :
                      "bg-amber-50 text-amber-700"
                    }`}>
                      {kw.position}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {diff > 0 ? (
                      <span className="text-green-600 text-xs font-medium">+{diff}</span>
                    ) : diff < 0 ? (
                      <span className="text-red-600 text-xs font-medium">{diff}</span>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-muted-foreground">{kw.volume.toLocaleString()}/mo</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Social Metrics */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Social Channels</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {report.socialMetrics.map((social) => (
            <div
              key={social.platform}
              className="bg-card rounded-2xl border border-border p-5"
              style={{ boxShadow: "var(--shadow-sm)" }}
            >
              <h4 className="text-sm font-semibold">{social.platform}</h4>
              <div className="mt-3 space-y-2">
                {social.followers > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Followers</span>
                    <span className="font-medium">{social.followers.toLocaleString()}</span>
                  </div>
                )}
                {social.engagement > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Engagement</span>
                    <span className="font-medium">{social.engagement}%</span>
                  </div>
                )}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Posts</span>
                  <span className="font-medium">{social.posts}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Cost Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div
          className="bg-card rounded-2xl border border-border p-5"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cost Per Lead</p>
            <DollarSign size={16} className="text-muted-foreground/50" />
          </div>
          <p className="text-3xl font-bold mt-2 tracking-tight text-green-600">
            ${report.costPerLead.toFixed(2)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Based on {report.leadsGenerated} leads this month
          </p>
        </div>
        <div
          className="bg-card rounded-2xl border border-border p-5"
          style={{ boxShadow: "var(--shadow-sm)" }}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Conversion Rate</p>
            <BarChart3 size={16} className="text-muted-foreground/50" />
          </div>
          <p className="text-3xl font-bold mt-2 tracking-tight text-blue-600">
            {report.conversionRate}%
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {report.applicationsFromWeb} applications from {report.websiteVisits.toLocaleString()} visits
          </p>
        </div>
      </div>

      {/* API Note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
        <strong>Mock data.</strong> Ready to wire to GA4, Google Search Console, Meta Insights, and SE Ranking APIs. PDF download needs a report generation backend.
      </div>
    </div>
  );
}
