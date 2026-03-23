// ============================================
// Moxie Management — Marketing & SEO
// ============================================
// All data is mock/placeholder. Each section has a stubbed API path
// ready to wire to GA4, Google Search Console, SE Ranking, Meta, Reddit, Claude.

// --- Types ---

export type ContentType = "blog" | "instagram" | "reddit" | "email" | "listing";
export type ContentStatus = "idea" | "draft" | "scheduled" | "published" | "archived";
export type MetricTrend = "up" | "down" | "flat";

export interface SeoMetric {
  label: string;
  value: string;
  change: string;
  trend: MetricTrend;
}

export interface KeywordRanking {
  keyword: string;
  position: number;
  previousPosition: number;
  url: string;
  volume: number;
}

export interface ContentItem {
  id: string;
  title: string;
  type: ContentType;
  status: ContentStatus;
  scheduledDate: string | null;
  publishedDate: string | null;
  author: string;
  excerpt: string;
  tags: string[];
  metrics?: {
    views: number;
    clicks: number;
    conversions: number;
  };
}

export interface CalendarEntry {
  id: string;
  contentId?: string;
  title: string;
  type: ContentType;
  date: string;
  status: ContentStatus;
}

export interface MonthlyReportData {
  month: string;
  websiteVisits: number;
  organicTraffic: number;
  paidTraffic: number;
  leadsGenerated: number;
  applicationsFromWeb: number;
  topPages: { page: string; views: number; bounceRate: number }[];
  topKeywords: KeywordRanking[];
  socialMetrics: {
    platform: string;
    followers: number;
    engagement: number;
    posts: number;
  }[];
  costPerLead: number;
  conversionRate: number;
}

export interface ContentSuggestion {
  title: string;
  type: ContentType;
  reason: string;
  keywords: string[];
}

// --- Mock Data ---
// API stubs: GET /api/marketing/seo, /api/marketing/content, /api/marketing/report

export const mockSeoMetrics: SeoMetric[] = [
  { label: "Organic Sessions", value: "2,847", change: "+12.3%", trend: "up" },
  { label: "Avg Position", value: "14.2", change: "-2.1", trend: "up" },
  { label: "Click-Through Rate", value: "3.8%", change: "+0.4%", trend: "up" },
  { label: "Indexed Pages", value: "47", change: "+5", trend: "up" },
  { label: "Domain Authority", value: "24", change: "+2", trend: "up" },
  { label: "Backlinks", value: "186", change: "+14", trend: "up" },
];

export const mockKeywordRankings: KeywordRanking[] = [
  { keyword: "USC student housing", position: 8, previousPosition: 12, url: "/listings", volume: 2400 },
  { keyword: "apartments near USC", position: 14, previousPosition: 18, url: "/listings", volume: 3100 },
  { keyword: "off campus housing USC", position: 6, previousPosition: 9, url: "/blog/off-campus-guide", volume: 1800 },
  { keyword: "student apartments Los Angeles", position: 22, previousPosition: 25, url: "/listings", volume: 4200 },
  { keyword: "USC housing 2026", position: 3, previousPosition: 7, url: "/blog/housing-2026", volume: 880 },
  { keyword: "furnished apartments near USC", position: 11, previousPosition: 15, url: "/listings/furnished", volume: 720 },
  { keyword: "moxie management reviews", position: 1, previousPosition: 1, url: "/", volume: 320 },
  { keyword: "best property management USC", position: 16, previousPosition: 19, url: "/about", volume: 590 },
];

export const mockContentItems: ContentItem[] = [
  {
    id: "c1",
    title: "2026 USC Housing Guide: Everything You Need to Know",
    type: "blog",
    status: "published",
    scheduledDate: null,
    publishedDate: "2026-02-15",
    author: "Marketing Team",
    excerpt: "Complete guide to off-campus housing options near USC for the 2026-2027 academic year.",
    tags: ["USC", "housing guide", "2026"],
    metrics: { views: 3420, clicks: 287, conversions: 14 },
  },
  {
    id: "c2",
    title: "5 Things to Look for in Your USC Apartment",
    type: "blog",
    status: "published",
    scheduledDate: null,
    publishedDate: "2026-01-28",
    author: "Marketing Team",
    excerpt: "Key features that make off-campus living comfortable for USC students.",
    tags: ["tips", "apartment search", "USC"],
    metrics: { views: 1850, clicks: 142, conversions: 8 },
  },
  {
    id: "c3",
    title: "Spring Move-In Special — Limited Units Available",
    type: "instagram",
    status: "published",
    scheduledDate: null,
    publishedDate: "2026-03-10",
    author: "Marketing Team",
    excerpt: "Carousel post showcasing available units with spring move-in incentives.",
    tags: ["promo", "spring", "availability"],
    metrics: { views: 4200, clicks: 89, conversions: 3 },
  },
  {
    id: "c4",
    title: "r/USC — 'Best Off-Campus Housing?' Thread Response",
    type: "reddit",
    status: "published",
    scheduledDate: null,
    publishedDate: "2026-03-05",
    author: "Marketing Team",
    excerpt: "Helpful community response about housing options near campus.",
    tags: ["reddit", "community", "organic"],
    metrics: { views: 890, clicks: 67, conversions: 2 },
  },
  {
    id: "c5",
    title: "Summer Subletting Guide for USC Students",
    type: "blog",
    status: "draft",
    scheduledDate: "2026-04-01",
    publishedDate: null,
    author: "Marketing Team",
    excerpt: "Everything students need to know about summer subletting options.",
    tags: ["summer", "subletting", "guide"],
  },
  {
    id: "c6",
    title: "Virtual Tour Walkthrough — New Renovations",
    type: "instagram",
    status: "scheduled",
    scheduledDate: "2026-03-28",
    publishedDate: null,
    author: "Marketing Team",
    excerpt: "Reel showcasing recently renovated units with new finishes.",
    tags: ["renovation", "tour", "reel"],
  },
  {
    id: "c7",
    title: "Leasing Season Email Blast — Early Bird Pricing",
    type: "email",
    status: "scheduled",
    scheduledDate: "2026-04-05",
    publishedDate: null,
    author: "Marketing Team",
    excerpt: "Email campaign targeting current residents and waitlist with early bird pricing.",
    tags: ["email", "leasing", "promo"],
  },
];

export const mockCalendar: CalendarEntry[] = [
  { id: "cal1", contentId: "c6", title: "Virtual Tour Reel", type: "instagram", date: "2026-03-28", status: "scheduled" },
  { id: "cal2", contentId: "c5", title: "Summer Subletting Guide", type: "blog", date: "2026-04-01", status: "draft" },
  { id: "cal3", contentId: "c7", title: "Early Bird Email Blast", type: "email", date: "2026-04-05", status: "scheduled" },
  { id: "cal4", title: "Instagram — Resident Spotlight", type: "instagram", date: "2026-04-10", status: "idea" },
  { id: "cal5", title: "Blog — Neighborhood Safety Tips", type: "blog", date: "2026-04-15", status: "idea" },
  { id: "cal6", title: "Reddit — r/USC Move-In Megathread", type: "reddit", date: "2026-04-20", status: "idea" },
  { id: "cal7", title: "Listing Update — Summer Availability", type: "listing", date: "2026-04-25", status: "idea" },
];

export const mockMonthlyReport: MonthlyReportData = {
  month: "March 2026",
  websiteVisits: 8420,
  organicTraffic: 2847,
  paidTraffic: 1230,
  leadsGenerated: 94,
  applicationsFromWeb: 23,
  topPages: [
    { page: "/listings", views: 3200, bounceRate: 32 },
    { page: "/blog/housing-2026", views: 1850, bounceRate: 45 },
    { page: "/apply", views: 980, bounceRate: 28 },
    { page: "/blog/off-campus-guide", views: 720, bounceRate: 51 },
    { page: "/contact", views: 540, bounceRate: 38 },
  ],
  topKeywords: mockKeywordRankings.slice(0, 5),
  socialMetrics: [
    { platform: "Instagram", followers: 2840, engagement: 4.2, posts: 12 },
    { platform: "Reddit", followers: 0, engagement: 0, posts: 4 },
    { platform: "Google Business", followers: 0, engagement: 0, posts: 6 },
  ],
  costPerLead: 18.50,
  conversionRate: 1.12,
};

export const mockContentSuggestions: ContentSuggestion[] = [
  {
    title: "USC Move-In Day 2026: Complete Checklist",
    type: "blog",
    reason: "High search volume for 'USC move in day' — 1,400/mo in spring",
    keywords: ["USC move in day", "move in checklist", "USC fall 2026"],
  },
  {
    title: "Apartment Tour — Before & After Renovation",
    type: "instagram",
    reason: "Renovation content gets 3x engagement vs standard posts",
    keywords: ["apartment tour", "renovation", "before after"],
  },
  {
    title: "r/USC Housing Thread — Authentic Recommendations",
    type: "reddit",
    reason: "3 active threads this week asking about off-campus housing",
    keywords: ["USC housing", "off campus", "recommendations"],
  },
  {
    title: "Why Students Choose Moxie Over Big Complexes",
    type: "blog",
    reason: "Competitor comparison keywords trending up 18% MoM",
    keywords: ["USC apartments comparison", "small vs big complex", "student housing review"],
  },
  {
    title: "Leasing Deadline Reminder — Email Series",
    type: "email",
    reason: "Peak leasing window starts April — 3-email drip recommended",
    keywords: ["USC leasing deadline", "housing deadline 2026"],
  },
];

// --- Content type helpers ---

export const contentTypeConfig: Record<ContentType, { label: string; color: string; bgColor: string }> = {
  blog: { label: "Blog", color: "text-blue-600", bgColor: "bg-blue-50" },
  instagram: { label: "Instagram", color: "text-pink-600", bgColor: "bg-pink-50" },
  reddit: { label: "Reddit", color: "text-orange-600", bgColor: "bg-orange-50" },
  email: { label: "Email", color: "text-emerald-600", bgColor: "bg-emerald-50" },
  listing: { label: "Listing", color: "text-purple-600", bgColor: "bg-purple-50" },
};

export const contentStatusConfig: Record<ContentStatus, { label: string; color: string; bgColor: string }> = {
  idea: { label: "Idea", color: "text-gray-600", bgColor: "bg-gray-100" },
  draft: { label: "Draft", color: "text-amber-600", bgColor: "bg-amber-50" },
  scheduled: { label: "Scheduled", color: "text-blue-600", bgColor: "bg-blue-50" },
  published: { label: "Published", color: "text-green-600", bgColor: "bg-green-50" },
  archived: { label: "Archived", color: "text-gray-400", bgColor: "bg-gray-50" },
};
