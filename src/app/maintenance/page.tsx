"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles, Languages, X } from "lucide-react";
import { usePortfolio } from "@/contexts/PortfolioContext";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  MaintenanceRequest,
  MaintenanceStatus,
  MaintenancePriority,
  MaintenanceCategory,
  Unit,
} from "@/lib/types";

type Classification = {
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  title: string;
};

const PRIORITY_RANK: Record<MaintenancePriority, number> = {
  emergency: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const OPEN_STATUSES = new Set<MaintenanceStatus>([
  "submitted",
  "assigned",
  "in_progress",
  "awaiting_parts",
]);

const DAY_MS = 24 * 60 * 60 * 1000;

function formatRelative(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return "just now";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

const CATEGORY_COLORS: Record<MaintenanceCategory, string> = {
  plumbing: "bg-blue-500",
  electrical: "bg-yellow-500",
  hvac: "bg-cyan-500",
  appliance: "bg-purple-500",
  structural: "bg-stone-500",
  pest: "bg-orange-500",
  locksmith: "bg-gray-500",
  general: "bg-slate-400",
};

type Metrics = {
  openCount: number;
  openEmergencies: number;
  /** Open work orders the AI bumped up to "emergency" when the tenant didn't. */
  openEmergenciesAiElevated: number;
  avgResolutionDays: number | null;
  resolvedSample: number;
  aging: { bucket: string; count: number; color: string }[];
  oldest31Plus: number;
  recurring: { key: string; category: string; propertyName: string; unitNumber: string; count: number }[];
  problemTenants: {
    name: string;
    property: string;
    unit: string;
    total90d: number;
    emergencies30d: number;
  }[];
  categoryBreakdown: { category: MaintenanceCategory; count: number }[];
  upcomingFollowUps: {
    overdueCount: number;
    thisWeekCount: number;
    laterCount: number;
    top: { id: string; title: string; property: string; unit: string; date: string; daysFromToday: number }[];
  };
};

function computeMetrics(requests: MaintenanceRequest[]): Metrics {
  const cat = (r: MaintenanceRequest): MaintenanceCategory => r.aiCategory ?? r.category;
  const pri = (r: MaintenanceRequest): MaintenancePriority => r.aiPriority ?? r.priority;
  const aiElevatedToEmergency = (r: MaintenanceRequest): boolean =>
    pri(r) === "emergency" && r.priority !== "emergency";
  const now = Date.now();
  const d30 = now - 30 * DAY_MS;
  const d90 = now - 90 * DAY_MS;

  const open = requests.filter((r) => OPEN_STATUSES.has(r.status));
  const closed = requests.filter(
    (r) => (r.status === "completed" || r.status === "closed") && r.completedDate && r.createdAt
  );

  // Avg resolution time over last 90 days of completions
  const resolvedRecently = closed.filter((r) => {
    const done = Date.parse(r.completedDate!);
    return !Number.isNaN(done) && done >= d90;
  });
  const avgResolutionDays = resolvedRecently.length
    ? resolvedRecently.reduce((sum, r) => {
        const days = (Date.parse(r.completedDate!) - Date.parse(r.createdAt)) / DAY_MS;
        return sum + Math.max(0, days);
      }, 0) / resolvedRecently.length
    : null;

  // Aging buckets (open only)
  let b07 = 0, b830 = 0, b31 = 0;
  for (const r of open) {
    const created = Date.parse(r.createdAt);
    if (Number.isNaN(created)) continue;
    const days = (now - created) / DAY_MS;
    if (days <= 7) b07++;
    else if (days <= 30) b830++;
    else b31++;
  }

  // Recurring: same unit + category, >=2 in last 30 days
  const recentByKey = new Map<string, MaintenanceRequest[]>();
  for (const r of requests) {
    const created = Date.parse(r.createdAt);
    if (Number.isNaN(created) || created < d30) continue;
    const unitKey = r.unitId || r.unitNumber || "";
    if (!unitKey) continue;
    const key = `${unitKey}|${cat(r)}`;
    const arr = recentByKey.get(key) ?? [];
    arr.push(r);
    recentByKey.set(key, arr);
  }
  const recurring = Array.from(recentByKey.entries())
    .filter(([, arr]) => arr.length >= 2)
    .map(([key, arr]) => ({
      key,
      category: cat(arr[0]),
      propertyName: arr[0].propertyName,
      unitNumber: arr[0].unitNumber,
      count: arr.length,
    }))
    .sort((a, b) => b.count - a.count);

  // Problem tenants: >=3 work orders in 90d OR >=2 emergencies in 30d
  const byTenant = new Map<string, MaintenanceRequest[]>();
  for (const r of requests) {
    const name = r.tenantName?.trim();
    if (!name || name === "—" || name.toLowerCase() === "vacant") continue;
    const created = Date.parse(r.createdAt);
    if (Number.isNaN(created) || created < d90) continue;
    const key = `${name}|${r.unitId || r.unitNumber}`;
    const arr = byTenant.get(key) ?? [];
    arr.push(r);
    byTenant.set(key, arr);
  }
  const problemTenants = Array.from(byTenant.values())
    .map((reqs) => {
      const emergencies30d = reqs.filter(
        (r) => pri(r) === "emergency" && Date.parse(r.createdAt) >= d30
      ).length;
      return {
        name: reqs[0].tenantName,
        property: reqs[0].propertyName,
        unit: reqs[0].unitNumber,
        total90d: reqs.length,
        emergencies30d,
      };
    })
    .filter((t) => t.total90d >= 3 || t.emergencies30d >= 2)
    .sort((a, b) => b.total90d - a.total90d || b.emergencies30d - a.emergencies30d);

  // Category breakdown across all work orders
  const byCategory = new Map<MaintenanceCategory, number>();
  for (const r of requests) {
    const c = cat(r);
    byCategory.set(c, (byCategory.get(c) ?? 0) + 1);
  }
  const categoryBreakdown = Array.from(byCategory.entries())
    .map(([category, count]) => ({ category, count }))
    .filter((c) => c.count > 0)
    .sort((a, b) => b.count - a.count);

  // Upcoming follow-ups — overdue + this week, sorted by date (overdue first)
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const weekFromNow = todayMs + 7 * DAY_MS;

  const withFollowUp = requests
    .filter((r) => r.followUpOn)
    .map((r) => ({ req: r, dateMs: Date.parse(r.followUpOn!) }))
    .filter((x) => !Number.isNaN(x.dateMs))
    .sort((a, b) => a.dateMs - b.dateMs);

  const overdueCount = withFollowUp.filter((x) => x.dateMs < todayMs).length;
  const thisWeekCount = withFollowUp.filter((x) => x.dateMs >= todayMs && x.dateMs <= weekFromNow).length;
  const laterCount = withFollowUp.filter((x) => x.dateMs > weekFromNow).length;

  const followUpTop = withFollowUp
    .filter((x) => x.dateMs <= weekFromNow)
    .slice(0, 5)
    .map(({ req, dateMs }) => ({
      id: req.id,
      title: req.title,
      property: req.propertyName,
      unit: req.unitNumber,
      date: req.followUpOn!,
      daysFromToday: Math.round((dateMs - todayMs) / DAY_MS),
    }));

  return {
    openCount: open.length,
    openEmergencies: open.filter((r) => pri(r) === "emergency").length,
    openEmergenciesAiElevated: open.filter((r) => aiElevatedToEmergency(r)).length,
    avgResolutionDays,
    resolvedSample: resolvedRecently.length,
    aging: [
      { bucket: "0–7 days", count: b07, color: "bg-green-500" },
      { bucket: "8–30 days", count: b830, color: "bg-yellow-500" },
      { bucket: "31+ days", count: b31, color: "bg-red-500" },
    ],
    oldest31Plus: b31,
    recurring,
    problemTenants,
    categoryBreakdown,
    upcomingFollowUps: {
      overdueCount,
      thisWeekCount,
      laterCount,
      top: followUpTop,
    },
  };
}

const STATUS_OPTIONS: MaintenanceStatus[] = [
  "submitted",
  "assigned",
  "in_progress",
  "awaiting_parts",
  "completed",
  "closed",
];

const CATEGORY_OPTIONS: { value: MaintenanceCategory; label: string }[] = [
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "hvac", label: "HVAC" },
  { value: "appliance", label: "Appliance" },
  { value: "structural", label: "Structural" },
  { value: "pest", label: "Pest Control" },
  { value: "locksmith", label: "Locksmith" },
  { value: "general", label: "General" },
];

export default function MaintenancePage() {
  const [allRequests, setAllRequests] = useState<MaintenanceRequest[]>([]);
  const [selected, setSelected] = useState<MaintenanceRequest | null>(null);
  const searchParams = useSearchParams();
  const [filterStatus, setFilterStatus] = useState<string>(() => searchParams.get("status") ?? "all");
  const [filterPriority, setFilterPriority] = useState<string>(() => searchParams.get("priority") ?? "all");
  const [filterCategory, setFilterCategory] = useState<string>(() => searchParams.get("category") ?? "all");
  const [filterAging, setFilterAging] = useState<string>(() => searchParams.get("aging") ?? "all");
  const [filterQuery, setFilterQuery] = useState<string>(() => searchParams.get("q") ?? "");
  const listRef = useRef<HTMLDivElement | null>(null);
  const recurringRef = useRef<HTMLDivElement | null>(null);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [units, setUnits] = useState<Unit[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [unitSearch, setUnitSearch] = useState("");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const { portfolioId } = usePortfolio();
  const [newRequest, setNewRequest] = useState({
    unitId: "",
    title: "",
    description: "",
    category: "general" as MaintenanceCategory,
    priority: "medium" as MaintenancePriority,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [translateOpen, setTranslateOpen] = useState(false);
  const [translateIds, setTranslateIds] = useState<string[]>([]);
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [reclassifying, setReclassifying] = useState(false);

  async function loadRequests() {
    // Portfolio 25: no Supabase cache, go live to AppFolio
    if (portfolioId === "25") {
      const res = await fetch(`/api/appfolio/work-orders?portfolio_id=25`);
      if (!res.ok) return { workOrders: [] as MaintenanceRequest[], syncedAt: null };
      const json = await res.json();
      return { workOrders: (json.workOrders || []) as MaintenanceRequest[], syncedAt: null };
    }
    const res = await fetch(`/api/maintenance/requests?portfolio_id=${encodeURIComponent(portfolioId)}`);
    if (!res.ok) return { workOrders: [] as MaintenanceRequest[], syncedAt: null };
    const json = await res.json();
    return {
      workOrders: (json.workOrders || []) as MaintenanceRequest[],
      syncedAt: (json.syncedAt || null) as string | null,
    };
  }

  async function syncFromAppFolio() {
    setSyncing(true);
    setSyncError(null);
    try {
      if (portfolioId === "25") {
        // No cache to sync — just reload live data
        const { workOrders } = await loadRequests();
        setAllRequests(workOrders);
        return;
      }
      const res = await fetch("/api/maintenance/sync", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Sync failed");
      const { workOrders, syncedAt: ts } = await loadRequests();
      setAllRequests(workOrders);
      setSyncedAt(ts ?? json.syncedAt ?? null);
    } catch (e: any) {
      setSyncError(e.message || "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        const [wo, unitRes] = await Promise.all([
          loadRequests(),
          fetch(`/api/appfolio/units?portfolio_id=${portfolioId}`),
        ]);
        const unitJson = unitRes.ok ? await unitRes.json() : { units: [] };
        setAllRequests(wo.workOrders);
        setSyncedAt(wo.syncedAt);
        setUnits(unitJson.units || []);
        if (portfolioId === "25") {
          setLoading(false);
          return;
        }
        // First-time UX: no snapshot yet → pull once automatically
        if (wo.workOrders.length === 0 && !wo.syncedAt) {
          setLoading(false);
          await syncFromAppFolio();
          return;
        }
        // Stale UX: older than 6h → background sync (doesn't block render)
        const STALE_MS = 6 * 60 * 60 * 1000;
        const age = wo.syncedAt ? Date.now() - Date.parse(wo.syncedAt) : Infinity;
        if (age > STALE_MS) {
          setLoading(false);
          void syncFromAppFolio();
          return;
        }
      } catch {
        setSyncError("Couldn't load work orders");
      } finally {
        setLoading(false);
      }
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  // Apply a fresh batch of classifications onto the in-memory work orders.
  // Server already wrote them to work_order_annotations, so the next reload
  // will see them too.
  const mergeClassifications = useCallback(
    (incoming: Array<{ id: string } & Classification>) => {
      if (incoming.length === 0) return;
      const byId = new Map(incoming.map((c) => [c.id, c]));
      const now = new Date().toISOString();
      setAllRequests((prev) =>
        prev.map((r) => {
          const c = byId.get(r.id);
          if (!c) return r;
          return {
            ...r,
            aiCategory: c.category,
            aiPriority: c.priority,
            aiTitle: c.title,
            aiClassifiedAt: now,
          };
        })
      );
      setSelected((prev) => {
        if (!prev) return prev;
        const c = byId.get(prev.id);
        if (!c) return prev;
        return {
          ...prev,
          aiCategory: c.category,
          aiPriority: c.priority,
          aiTitle: c.title,
          aiClassifiedAt: now,
        };
      });
    },
    []
  );

  // Background-classify any work order the server doesn't already have an
  // AI classification for. Server-side cache lives in
  // work_order_annotations so it survives across browsers and sessions.
  useEffect(() => {
    if (allRequests.length === 0) return;
    const missing = allRequests
      .filter((r) => !r.aiPriority)
      .filter((r) => (r.description || r.title || "").trim().length > 0)
      .slice(0, 30)
      .map((r) => ({ id: r.id, title: r.title, description: r.description }));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/maintenance/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: missing }),
        });
        if (!res.ok) return;
        const j = await res.json();
        const incoming: Array<{ id: string } & Classification> = j.classifications || [];
        if (cancelled) return;
        mergeClassifications(incoming);
      } catch {
        /* leave entries unclassified — UI falls back to AppFolio values */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allRequests, mergeClassifications]);

  const reclassifyOne = useCallback(
    async (req: MaintenanceRequest) => {
      setReclassifying(true);
      try {
        const res = await fetch("/api/maintenance/classify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: [{ id: req.id, title: req.title, description: req.description }],
          }),
        });
        if (!res.ok) return;
        const j = await res.json();
        const incoming: Array<{ id: string } & Classification> = j.classifications || [];
        mergeClassifications(incoming);
      } finally {
        setReclassifying(false);
      }
    },
    [mergeClassifications]
  );

  // Re-run AI classification across every work order in the portfolio. The
  // classify endpoint caps each request at 30 items, so we chunk and walk.
  // Useful when the operator-defined priority rules change and existing
  // rows in work_order_annotations are stale.
  const reclassifyAll = useCallback(async () => {
    const items = allRequests
      .map((r) => ({ id: r.id, title: r.title, description: r.description }))
      .filter((x) => (x.description || x.title || "").trim().length > 0);
    if (items.length === 0) return;
    if (
      !window.confirm(
        `Re-classify ${items.length} work orders? This re-runs the AI rating for every record and overwrites the cached values.`
      )
    ) {
      return;
    }
    setReclassifying(true);
    try {
      const CHUNK = 30;
      for (let i = 0; i < items.length; i += CHUNK) {
        const batch = items.slice(i, i + CHUNK);
        try {
          const res = await fetch("/api/maintenance/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: batch }),
          });
          if (!res.ok) continue;
          const j = await res.json();
          const incoming: Array<{ id: string } & Classification> = j.classifications || [];
          mergeClassifications(incoming);
        } catch {
          /* skip a failed chunk and keep going */
        }
      }
    } finally {
      setReclassifying(false);
    }
  }, [allRequests, mergeClassifications]);

  // Tenant submission counts across the visible portfolio. Excludes blanks
  // and "Vacant" placeholders so we don't badge those.
  const tenantOrderCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of allRequests) {
      const name = (r.tenantName || "").trim();
      if (!name || name === "—" || name.toLowerCase() === "vacant") continue;
      map.set(name, (map.get(name) ?? 0) + 1);
    }
    return map;
  }, [allRequests]);

  const filteredUnits = unitSearch
    ? units.filter((u) => u.unitName.toLowerCase().includes(unitSearch.toLowerCase()))
    : units;

  function createRequest() {
    if (!newRequest.title.trim() || !newRequest.unitId) return;
    const unit = units.find((u) => u.id === newRequest.unitId);
    if (!unit) return;

    const now = new Date().toISOString();
    const request: MaintenanceRequest = {
      id: `wo-${Date.now()}`,
      unitId: unit.id,
      propertyId: unit.propertyId,
      unitNumber: unit.unitName,
      propertyName: unit.propertyName,
      tenantName: unit.tenant || "Vacant",
      category: newRequest.category,
      priority: newRequest.priority,
      status: "submitted",
      title: newRequest.title,
      description: newRequest.description,
      photos: [],
      notes: [],
      createdAt: now,
      updatedAt: now,
    };
    setAllRequests((prev) => [request, ...prev]);
    setShowCreateForm(false);
    setSelected(request);
    setNewRequest({ unitId: "", title: "", description: "", category: "general", priority: "medium" });
  }

  const trimmedQuery = filterQuery.trim().toLowerCase();
  const nowForAging = Date.now();
  // AI classification overrides the AppFolio-derived category/priority for
  // sorting and filtering when present. The original tenant-submitted value
  // is still rendered alongside so the difference is visible.
  const effectiveCategory = (r: MaintenanceRequest): MaintenanceCategory =>
    r.aiCategory ?? r.category;
  const effectivePriority = (r: MaintenanceRequest): MaintenancePriority =>
    r.aiPriority ?? r.priority;

  const filtered = allRequests
    .filter((r) => {
      if (filterStatus === "open") {
        if (!OPEN_STATUSES.has(r.status)) return false;
      } else if (filterStatus !== "all" && r.status !== filterStatus) {
        return false;
      }
      if (filterPriority !== "all" && effectivePriority(r) !== filterPriority) return false;
      if (filterCategory !== "all" && effectiveCategory(r) !== filterCategory) return false;
      if (filterAging !== "all") {
        const created = Date.parse(r.createdAt);
        if (Number.isNaN(created)) return false;
        const days = (nowForAging - created) / DAY_MS;
        if (filterAging === "0-7" && days > 7) return false;
        if (filterAging === "8-30" && (days <= 7 || days > 30)) return false;
        if (filterAging === "31+" && days <= 30) return false;
        // Aging filter only makes sense for open work orders.
        if (!OPEN_STATUSES.has(r.status)) return false;
      }
      if (trimmedQuery) {
        const haystack = [
          r.title,
          r.description,
          r.unitNumber,
          r.propertyName,
          r.tenantName,
          r.vendor,
          r.assignedTo,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(trimmedQuery)) return false;
      }
      return true;
    })
    .sort((a, b) => PRIORITY_RANK[effectivePriority(a)] - PRIORITY_RANK[effectivePriority(b)]);

  const metrics = useMemo(() => computeMetrics(allRequests), [allRequests]);
  const maxAging = Math.max(1, ...metrics.aging.map((a) => a.count));
  const maxCategory = Math.max(1, ...metrics.categoryBreakdown.map((c) => c.count));

  function scrollToList() {
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function scrollToRecurring() {
    recurringRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function resetFiltersExcept(keep: Partial<{ status: string; priority: string; category: string; aging: string; query: string }>) {
    setFilterStatus(keep.status ?? "all");
    setFilterPriority(keep.priority ?? "all");
    setFilterCategory(keep.category ?? "all");
    setFilterAging(keep.aging ?? "all");
    setFilterQuery(keep.query ?? "");
  }
  function clearAllFilters() {
    resetFiltersExcept({});
  }

  const STATUS_LABELS: Record<string, string> = {
    open: "Open (any)",
    submitted: "Submitted",
    assigned: "Assigned",
    in_progress: "In Progress",
    awaiting_parts: "Awaiting Parts",
    completed: "Completed",
    closed: "Closed",
  };
  const CATEGORY_LABEL_MAP = Object.fromEntries(
    CATEGORY_OPTIONS.map((c) => [c.value, c.label])
  ) as Record<string, string>;
  const AGING_LABELS: Record<string, string> = {
    "0-7": "0–7 days",
    "8-30": "8–30 days",
    "31+": "31+ days",
  };
  const activeFilterChips: Array<{
    key: string;
    field: string;
    value: string;
    onClear: () => void;
  }> = [];
  if (filterQuery) {
    activeFilterChips.push({
      key: "query",
      field: "Search",
      value: `"${filterQuery}"`,
      onClear: () => setFilterQuery(""),
    });
  }
  if (filterStatus !== "all") {
    activeFilterChips.push({
      key: "status",
      field: "Status",
      value: STATUS_LABELS[filterStatus] ?? filterStatus,
      onClear: () => setFilterStatus("all"),
    });
  }
  if (filterPriority !== "all") {
    activeFilterChips.push({
      key: "priority",
      field: "Priority",
      value: filterPriority.charAt(0).toUpperCase() + filterPriority.slice(1),
      onClear: () => setFilterPriority("all"),
    });
  }
  if (filterCategory !== "all") {
    activeFilterChips.push({
      key: "category",
      field: "Category",
      value: CATEGORY_LABEL_MAP[filterCategory] ?? filterCategory,
      onClear: () => setFilterCategory("all"),
    });
  }
  if (filterAging !== "all") {
    activeFilterChips.push({
      key: "aging",
      field: "Aging",
      value: AGING_LABELS[filterAging] ?? filterAging,
      onClear: () => setFilterAging("all"),
    });
  }

  async function saveAnnotation(body: Record<string, unknown>) {
    if (!selected) return;
    try {
      const res = await fetch("/api/maintenance/annotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selected.id, ...body }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Save failed");
      }
    } catch (e: any) {
      setSyncError(e.message || "Save failed");
    }
  }

  function updateStatus(status: MaintenanceStatus) {
    if (!selected) return;
    const updated: MaintenanceRequest = {
      ...selected,
      status,
      completedDate:
        status === "completed" || status === "closed"
          ? new Date().toISOString().split("T")[0]
          : selected.completedDate,
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    void saveAnnotation({ internal_status: status });
  }

  function addNote() {
    if (!selected || !newNote.trim()) return;
    const text = newNote.trim();
    const updated: MaintenanceRequest = {
      ...selected,
      notes: [...selected.notes, text],
      updatedAt: new Date().toISOString(),
    };
    setSelected(updated);
    setAllRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setNewNote("");
    void saveAnnotation({ appendNote: { text } });
  }

  function updateField(field: keyof MaintenanceRequest, value: string) {
    if (!selected) return;
    const updated = { ...selected, [field]: value, updatedAt: new Date().toISOString() };
    setSelected(updated as MaintenanceRequest);
    setAllRequests((prev) =>
      prev.map((r) => (r.id === updated.id ? (updated as MaintenanceRequest) : r))
    );
  }

  // Persist text-field edits on blur so we don't hit the API on every keystroke.
  function persistField(
    field: "assignedTo" | "vendor" | "scheduledDate" | "followUpOn",
    value: string
  ) {
    const key = {
      assignedTo: "assigned_to_override",
      vendor: "vendor_override",
      scheduledDate: "scheduled_date_override",
      followUpOn: "follow_up_on",
    }[field];
    void saveAnnotation({ [key]: value || null });
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const openTranslateModal = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      setTranslateIds(ids);
      setTranslateOpen(true);
      setCopiedAll(false);
      const items = ids
        .map((id) => allRequests.find((r) => r.id === id))
        .filter((r): r is MaintenanceRequest => Boolean(r))
        .map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          propertyName: r.propertyName,
          unitNumber: r.unitNumber,
        }));
      if (items.length === 0) return;
      setTranslating(true);
      try {
        const res = await fetch("/api/maintenance/translate-spanish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items }),
        });
        if (!res.ok) {
          setTranslating(false);
          return;
        }
        const j = await res.json();
        const incoming: { id: string; text: string }[] = j.translations || [];
        setTranslations((prev) => {
          const next = { ...prev };
          for (const t of incoming) next[t.id] = t.text;
          return next;
        });
      } finally {
        setTranslating(false);
      }
    },
    [allRequests]
  );

  function closeTranslateModal() {
    setTranslateOpen(false);
    setCopiedAll(false);
  }

  function copyAllTranslations(ids: string[]) {
    const blocks = ids
      .map((id) => translations[id])
      .filter((t): t is string => Boolean(t))
      .join("\n\n");
    if (!blocks) return;
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(blocks);
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1800);
    }
  }

  function copyOne(text: string) {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(text);
    }
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => setSelected(null)}
          className="text-sm text-accent hover:underline"
        >
          &larr; Back to Maintenance
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold break-words">
                {selected.aiTitle || selected.title}
              </h1>
              {selected.aiTitle && selected.aiTitle !== selected.title && (
                <span
                  title={`AI summary. Tenant title: ${selected.title}`}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5"
                >
                  <Sparkles className="w-3 h-3" /> AI
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 break-words">
              {selected.propertyName} #{selected.unitNumber} &middot; {selected.tenantName}
              {tenantOrderCounts.get(selected.tenantName) &&
                tenantOrderCounts.get(selected.tenantName)! > 1 && (
                  <span
                    className="ml-2 inline-flex items-center text-xs font-medium text-foreground bg-muted rounded-full px-2 py-0.5"
                    title="Total work orders submitted by this tenant"
                  >
                    {tenantOrderCounts.get(selected.tenantName)} total
                  </span>
                )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {selected.aiPriority && selected.aiPriority !== selected.priority && (
              <span
                title={`AI priority — tenant submitted "${selected.priority}"`}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-2 py-0.5"
              >
                <Sparkles className="w-3 h-3" />
              </span>
            )}
            <StatusBadge value={selected.aiPriority ?? selected.priority} />
            <StatusBadge value={selected.status} />
            <button
              onClick={() => reclassifyOne(selected)}
              disabled={reclassifying}
              title="Re-run AI classification"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {reclassifying ? "Re-classifying…" : "Re-classify"}
            </button>
          </div>
        </div>

        {/* Details */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Request Details</h2>
            <div>
              <p className="text-sm text-muted-foreground">Description</p>
              <p className="text-sm mt-1">{selected.description}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Category</p>
                <p className="text-sm mt-1 capitalize flex items-center gap-1.5">
                  {selected.aiCategory ?? selected.category}
                  {selected.aiCategory && selected.aiCategory !== selected.category && (
                    <span
                      title={`AI-classified — original: ${selected.category}`}
                      className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-700"
                    >
                      <Sparkles className="w-3 h-3" />
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="text-sm mt-1">
                  {new Date(selected.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Tenant Phone</p>
                <p className="text-sm mt-1">{selected.tenantPhone || "—"}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tenant Email</p>
                <p className="text-sm mt-1">{selected.tenantEmail || "—"}</p>
              </div>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h2 className="font-semibold">Assignment & Status</h2>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Status</label>
              <select
                value={selected.status}
                onChange={(e) => updateStatus(e.target.value as MaintenanceStatus)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Assigned To</label>
              <input
                type="text"
                value={selected.assignedTo || ""}
                onChange={(e) => updateField("assignedTo", e.target.value)}
                onBlur={(e) => persistField("assignedTo", e.target.value)}
                placeholder="Staff member..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Vendor</label>
              <input
                type="text"
                value={selected.vendor || ""}
                onChange={(e) => updateField("vendor", e.target.value)}
                onBlur={(e) => persistField("vendor", e.target.value)}
                placeholder="Vendor name..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Scheduled Date</label>
              <input
                type="date"
                value={selected.scheduledDate || ""}
                onChange={(e) => {
                  updateField("scheduledDate", e.target.value);
                  persistField("scheduledDate", e.target.value);
                }}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground block mb-1">Follow-up Date</label>
              <input
                type="date"
                value={selected.followUpOn || ""}
                onChange={(e) => {
                  updateField("followUpOn", e.target.value);
                  persistField("followUpOn", e.target.value);
                }}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Revisit date — shows up in the dashboard&apos;s Follow-ups widget.
              </p>
            </div>
          </div>
        </div>

        {/* Notes / Activity */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-4">Notes & Activity</h2>
          {selected.notes.length > 0 ? (
            <div className="space-y-2 mb-4">
              {selected.notes.map((note, i) => (
                <div key={i} className="bg-muted rounded-lg px-4 py-2.5 text-sm">
                  {note}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-4">No notes yet.</p>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
              placeholder="Add a note..."
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <button
              onClick={addNote}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
            >
              Add
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Maintenance Requests</h1>
          <p className="text-muted-foreground mt-1">
            Track and manage work orders across all properties
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {portfolioId === "24" && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {syncedAt
                ? `Last synced ${formatRelative(syncedAt)}`
                : "Never synced"}
            </span>
          )}
          <button
            onClick={syncFromAppFolio}
            disabled={syncing}
            className="px-3 py-2 bg-card border border-border text-sm rounded-lg hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {syncing ? "Loading…" : portfolioId === "25" ? "Refresh" : "Sync now"}
          </button>
          <button
            onClick={reclassifyAll}
            disabled={reclassifying || allRequests.length === 0}
            title="Re-run AI category + priority on every work order"
            className="px-3 py-2 bg-card border border-border text-sm rounded-lg hover:bg-muted transition-colors whitespace-nowrap disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {reclassifying ? "Re-classifying…" : "Re-classify all"}
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors whitespace-nowrap"
          >
            {showCreateForm ? "Cancel" : "+ New Request"}
          </button>
        </div>
      </div>

      {syncError && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {syncError}
        </div>
      )}

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Create Work Order</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Unit *</label>
              <input
                type="text"
                value={unitSearch}
                onChange={(e) => setUnitSearch(e.target.value)}
                placeholder="Search units..."
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card mb-1"
              />
              <select
                value={newRequest.unitId}
                onChange={(e) => setNewRequest({ ...newRequest, unitId: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                size={5}
              >
                <option value="">Select unit...</option>
                {filteredUnits.map((u) => (
                  <option key={u.id} value={u.id}>{u.unitName}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Title *</label>
              <input
                type="text"
                value={newRequest.title}
                onChange={(e) => setNewRequest({ ...newRequest, title: e.target.value })}
                placeholder="Brief description of the issue"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <select
                value={newRequest.category}
                onChange={(e) => setNewRequest({ ...newRequest, category: e.target.value as MaintenanceCategory })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Priority</label>
              <select
                value={newRequest.priority}
                onChange={(e) => setNewRequest({ ...newRequest, priority: e.target.value as MaintenancePriority })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <textarea
              value={newRequest.description}
              onChange={(e) => setNewRequest({ ...newRequest, description: e.target.value })}
              placeholder="Detailed description..."
              rows={3}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
            />
          </div>
          <button
            onClick={createRequest}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Create Work Order
          </button>
        </div>
      )}

      {/* Dashboard */}
      {!loading && allRequests.length > 0 && (
        <section className="space-y-3">
          {/* Top-line stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() => {
                resetFiltersExcept({ status: "open" });
                scrollToList();
              }}
              className="bg-card rounded-xl border border-border p-4 text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs text-muted-foreground">Open work orders</p>
              <p className="text-2xl font-bold mt-1">{metrics.openCount}</p>
              {metrics.openEmergencies > 0 && (
                <p className="text-xs text-red-600 mt-1">
                  {metrics.openEmergencies} emergency
                  {metrics.openEmergenciesAiElevated > 0 && (
                    <span
                      title="Tenant didn't mark these as emergency — AI did"
                      className="ml-1 inline-flex items-center gap-0.5 text-indigo-700"
                    >
                      <Sparkles className="w-3 h-3" />
                      {metrics.openEmergenciesAiElevated} AI-elevated
                    </span>
                  )}
                </p>
              )}
            </button>
            <button
              onClick={() => {
                resetFiltersExcept({ status: "completed" });
                scrollToList();
              }}
              className="bg-card rounded-xl border border-border p-4 text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs text-muted-foreground">Avg resolution</p>
              <p className="text-2xl font-bold mt-1">
                {metrics.avgResolutionDays != null
                  ? `${metrics.avgResolutionDays.toFixed(1)}d`
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {metrics.resolvedSample} resolved (90d)
              </p>
            </button>
            <button
              onClick={() => {
                resetFiltersExcept({ aging: "31+" });
                scrollToList();
              }}
              className="bg-card rounded-xl border border-border p-4 text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs text-muted-foreground">Aging 31+ days</p>
              <p className={`text-2xl font-bold mt-1 ${metrics.oldest31Plus > 0 ? "text-red-600" : ""}`}>
                {metrics.oldest31Plus}
              </p>
              <p className="text-xs text-muted-foreground mt-1">still open</p>
            </button>
            <button
              onClick={scrollToRecurring}
              className="bg-card rounded-xl border border-border p-4 text-left hover:shadow-md transition-shadow cursor-pointer"
            >
              <p className="text-xs text-muted-foreground">Recurring issues</p>
              <p className="text-2xl font-bold mt-1">{metrics.recurring.length}</p>
              <p className="text-xs text-muted-foreground mt-1">unit+category, 30d</p>
            </button>
          </div>

          {/* Aging + Category breakdown */}
          <div className="grid md:grid-cols-2 gap-3">
            <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
              <h3 className="font-semibold text-sm mb-3">Open work order aging</h3>
              <div className="space-y-2">
                {metrics.aging.map((bucket) => {
                  const key = bucket.bucket.startsWith("0")
                    ? "0-7"
                    : bucket.bucket.startsWith("8")
                    ? "8-30"
                    : "31+";
                  return (
                    <button
                      key={bucket.bucket}
                      onClick={() => {
                        resetFiltersExcept({ aging: key });
                        scrollToList();
                      }}
                      className="w-full flex items-center gap-3 text-sm text-left hover:bg-muted rounded-md px-1 py-0.5 transition-colors"
                    >
                      <span className="w-20 shrink-0 text-muted-foreground">{bucket.bucket}</span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${bucket.color} transition-all`}
                          style={{ width: `${(bucket.count / maxAging) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-medium">{bucket.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-sm">By category</h3>
                <span className="text-xs text-muted-foreground">all work orders</span>
              </div>
              {metrics.categoryBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              ) : (
                <div className="space-y-2">
                  {metrics.categoryBreakdown.map((c) => (
                    <button
                      key={c.category}
                      onClick={() => {
                        resetFiltersExcept({ category: c.category });
                        scrollToList();
                      }}
                      className="w-full flex items-center gap-3 text-sm text-left hover:bg-muted rounded-md px-1 py-0.5 transition-colors"
                    >
                      <span className="w-20 shrink-0 text-muted-foreground capitalize">
                        {c.category}
                      </span>
                      <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full ${CATEGORY_COLORS[c.category]} transition-all`}
                          style={{ width: `${(c.count / maxCategory) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-medium">{c.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Problem tenants + Recurring issues + Follow-ups */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-sm">Problem tenants</h3>
                <span className="text-xs text-muted-foreground">≥3 in 90d · ≥2 emergency in 30d</span>
              </div>
              {metrics.problemTenants.length === 0 ? (
                <p className="text-sm text-muted-foreground">None flagged.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.problemTenants.slice(0, 5).map((t) => (
                    <li key={`${t.name}-${t.unit}`}>
                      <button
                        onClick={() => {
                          resetFiltersExcept({ query: t.name });
                          scrollToList();
                        }}
                        className="w-full flex items-center justify-between gap-3 text-sm text-left hover:bg-muted rounded-md px-1 py-0.5 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate">{t.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {t.property} #{t.unit}
                          </p>
                        </div>
                        <div className="text-right text-xs shrink-0">
                          <p className="font-medium">{t.total90d} in 90d</p>
                          {t.emergencies30d > 0 && (
                            <p className="text-red-600">{t.emergencies30d} emergency</p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div ref={recurringRef} className="bg-card rounded-xl border border-border p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-sm">Recurring issues</h3>
                <span className="text-xs text-muted-foreground">same unit + category, 30d</span>
              </div>
              {metrics.recurring.length === 0 ? (
                <p className="text-sm text-muted-foreground">None detected.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.recurring.slice(0, 5).map((r) => (
                    <li key={r.key}>
                      <button
                        onClick={() => {
                          resetFiltersExcept({ category: r.category, query: r.unitNumber });
                          scrollToList();
                        }}
                        className="w-full flex items-center justify-between gap-3 text-sm text-left hover:bg-muted rounded-md px-1 py-0.5 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="font-medium capitalize truncate">{r.category}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {r.propertyName} #{r.unitNumber}
                          </p>
                        </div>
                        <span className="text-xs font-medium shrink-0">{r.count}x</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-card rounded-xl border border-border p-4 sm:p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="font-semibold text-sm">Follow-ups</h3>
                <span className="text-xs text-muted-foreground">
                  {metrics.upcomingFollowUps.overdueCount > 0 && (
                    <span className="text-red-600 font-medium">
                      {metrics.upcomingFollowUps.overdueCount} overdue
                    </span>
                  )}
                  {metrics.upcomingFollowUps.overdueCount > 0 && " · "}
                  {metrics.upcomingFollowUps.thisWeekCount} this week
                </span>
              </div>
              {metrics.upcomingFollowUps.top.length === 0 ? (
                <p className="text-sm text-muted-foreground">No follow-ups due soon.</p>
              ) : (
                <ul className="space-y-2">
                  {metrics.upcomingFollowUps.top.map((f) => {
                    const label =
                      f.daysFromToday < 0
                        ? `${Math.abs(f.daysFromToday)}d overdue`
                        : f.daysFromToday === 0
                        ? "today"
                        : f.daysFromToday === 1
                        ? "tomorrow"
                        : `in ${f.daysFromToday}d`;
                    return (
                      <li key={f.id}>
                        <button
                          onClick={() => {
                            const match = allRequests.find((r) => r.id === f.id);
                            if (match) setSelected(match);
                          }}
                          className="w-full flex items-center justify-between gap-3 text-sm text-left hover:bg-muted rounded-md px-1 py-0.5 transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="font-medium truncate">{f.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {f.property} #{f.unit}
                            </p>
                          </div>
                          <div className="text-right text-xs shrink-0">
                            <p className={f.daysFromToday < 0 ? "text-red-600 font-medium" : "font-medium"}>
                              {f.date}
                            </p>
                            <p className="text-muted-foreground">{label}</p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Search + Filters */}
      <div className="relative">
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="Search title, description, unit, tenant, vendor…"
          className={`w-full text-sm border rounded-lg pl-3 pr-9 py-2 bg-card transition-colors ${
            filterQuery ? "border-accent" : "border-border"
          }`}
        />
        {filterQuery && (
          <button
            onClick={() => setFilterQuery("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-lg leading-none px-1"
          >
            ×
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={`w-full text-sm border rounded-lg px-3 py-2 transition-colors ${
            filterStatus !== "all"
              ? "border-accent bg-accent/10 font-medium"
              : "border-border bg-card"
          }`}
        >
          <option value="all">All Statuses</option>
          <option value="open">Open (any)</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}
            </option>
          ))}
        </select>
        <select
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
          className={`w-full text-sm border rounded-lg px-3 py-2 transition-colors ${
            filterPriority !== "all"
              ? "border-accent bg-accent/10 font-medium"
              : "border-border bg-card"
          }`}
        >
          <option value="all">All Priorities</option>
          <option value="emergency">Emergency</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className={`w-full text-sm border rounded-lg px-3 py-2 col-span-2 sm:col-span-1 transition-colors ${
            filterCategory !== "all"
              ? "border-accent bg-accent/10 font-medium"
              : "border-border bg-card"
          }`}
        >
          <option value="all">All Categories</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          Loading work orders...
        </div>
      )}

      {/* Active filters bar — single, unmissable summary of which filters
          are on. Each chip clears its own filter; "Clear all" wipes them. */}
      {!loading && activeFilterChips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap rounded-lg border border-accent/30 bg-accent/5 px-3 py-2">
          <span className="text-xs font-medium text-muted-foreground shrink-0">
            Showing {filtered.length} of {allRequests.length}
            {" · "}Filters:
          </span>
          {activeFilterChips.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-full bg-accent text-white"
            >
              <span className="text-white/80">{chip.field}:</span>
              <span>{chip.value}</span>
              <button
                onClick={chip.onClear}
                aria-label={`Clear ${chip.field} filter`}
                className="ml-0.5 leading-none hover:bg-white/20 rounded-full w-4 h-4 inline-flex items-center justify-center"
              >
                ×
              </button>
            </span>
          ))}
          <button
            onClick={clearAllFilters}
            className="ml-auto text-xs font-medium text-accent hover:underline shrink-0"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk action toolbar — appears once any request card is selected. */}
      {!loading && selectedIds.size > 0 && (
        <div className="sticky top-2 z-10 flex items-center justify-between gap-3 bg-card border border-border rounded-lg px-3 py-2 shadow-sm">
          <span className="text-sm">
            <span className="font-medium">{selectedIds.size}</span> selected
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openTranslateModal(Array.from(selectedIds))}
              className="px-3 py-1.5 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors inline-flex items-center gap-1.5"
            >
              <Languages className="w-4 h-4" />
              Translate to Spanish
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Request Cards */}
      {!loading && (
        <div ref={listRef} className="space-y-3">
          {filtered.map((req) => {
            const cat = req.aiCategory ?? req.category;
            const pri = req.aiPriority ?? req.priority;
            const titleText = req.aiTitle || req.title;
            const aiTitle = Boolean(req.aiTitle && req.aiTitle !== req.title);
            const aiCategory = Boolean(req.aiCategory && req.aiCategory !== req.category);
            const aiPriority = Boolean(req.aiPriority && req.aiPriority !== req.priority);
            const tenantCount = tenantOrderCounts.get(req.tenantName) ?? 0;
            const isSelected = selectedIds.has(req.id);
            return (
              <div
                key={req.id}
                className={`relative bg-card rounded-xl border p-4 sm:p-5 hover:shadow-md transition-shadow ${
                  isSelected ? "border-accent ring-1 ring-accent/40" : "border-border"
                }`}
              >
                <label
                  className="absolute top-3 left-3 inline-flex items-center cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelected(req.id)}
                    className="h-4 w-4 accent-accent"
                    aria-label="Select for bulk actions"
                  />
                </label>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openTranslateModal([req.id]);
                  }}
                  title="Translate to Spanish"
                  aria-label="Translate to Spanish"
                  className="absolute top-3 right-3 z-10 inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Languages className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setSelected(req)}
                  className="block w-full text-left pl-7 pr-7"
                >
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="inline-flex items-center gap-1">
                      {aiPriority && (
                        <span
                          title={`AI priority — tenant submitted "${req.priority}"`}
                          className="inline-flex items-center text-[10px] text-indigo-700"
                        >
                          <Sparkles className="w-3 h-3" />
                        </span>
                      )}
                      <StatusBadge value={pri} />
                    </span>
                    <StatusBadge value={req.status} />
                    <span className="text-xs capitalize ml-auto flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[cat]}`}
                        aria-hidden="true"
                      />
                      <span className="text-muted-foreground">{cat}</span>
                      {aiCategory && (
                        <span
                          title={`AI-classified — original: ${req.category}`}
                          className="inline-flex items-center text-[10px] text-indigo-700"
                        >
                          <Sparkles className="w-3 h-3" />
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <h3 className="font-semibold break-words">{titleText}</h3>
                    {aiTitle && (
                      <span
                        title={`AI summary — tenant wrote: "${req.title}"`}
                        className="inline-flex items-center gap-0.5 text-[10px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-full px-1.5 py-0.5 mt-0.5"
                      >
                        <Sparkles className="w-3 h-3" /> AI
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 break-words">
                    {req.propertyName} #{req.unitNumber} &middot; {req.tenantName}
                    {tenantCount > 1 && (
                      <span
                        className="ml-1.5 inline-flex items-center text-[11px] font-medium text-foreground bg-muted rounded-full px-1.5 py-0.5"
                        title={`This tenant has ${tenantCount} work orders on file`}
                      >
                        {tenantCount}
                      </span>
                    )}
                  </p>
                  {req.description && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {req.description}
                    </p>
                  )}
                  {(req.assignedTo || req.scheduledDate) && (
                    <div className="mt-3 pt-3 border-t border-border flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {req.assignedTo && <span>Assigned: {req.assignedTo}</span>}
                      {req.scheduledDate && <span>Scheduled: {req.scheduledDate}</span>}
                    </div>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          No maintenance requests match the current filters.
        </div>
      )}

      {translateOpen && (
        <TranslateModal
          ids={translateIds}
          requests={allRequests}
          translations={translations}
          loading={translating}
          copiedAll={copiedAll}
          onCopyAll={() => copyAllTranslations(translateIds)}
          onCopyOne={copyOne}
          onClose={closeTranslateModal}
        />
      )}
    </div>
  );
}

function TranslateModal({
  ids,
  requests,
  translations,
  loading,
  copiedAll,
  onCopyAll,
  onCopyOne,
  onClose,
}: {
  ids: string[];
  requests: MaintenanceRequest[];
  translations: Record<string, string>;
  loading: boolean;
  copiedAll: boolean;
  onCopyAll: () => void;
  onCopyOne: (text: string) => void;
  onClose: () => void;
}) {
  const blocks = ids
    .map((id) => {
      const req = requests.find((r) => r.id === id);
      return req ? { req, text: translations[id] as string | undefined } : null;
    })
    .filter((b): b is { req: MaintenanceRequest; text: string | undefined } => b !== null);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-background rounded-2xl border border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Languages className="w-5 h-5" />
            Spanish translations
            <span className="text-xs font-mono px-2 py-0.5 bg-muted rounded-full">
              {blocks.length}
            </span>
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading && Object.keys(translations).length === 0 ? (
            <p className="text-sm text-muted-foreground">Translating…</p>
          ) : (
            blocks.map(({ req, text }) => (
              <div
                key={req.id}
                className="border border-border rounded-lg p-3 bg-card"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <p className="text-xs text-muted-foreground">
                    {req.propertyName} #{req.unitNumber} &middot; {req.tenantName}
                  </p>
                  {text && (
                    <button
                      onClick={() => onCopyOne(text)}
                      className="text-xs font-medium text-accent hover:underline shrink-0"
                    >
                      Copy
                    </button>
                  )}
                </div>
                {text ? (
                  <pre className="whitespace-pre-wrap text-sm font-sans">{text}</pre>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    {loading ? "Translating…" : "No translation"}
                  </p>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between p-5 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Paste into WhatsApp — one block per work order.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-border hover:bg-muted"
            >
              Close
            </button>
            <button
              onClick={onCopyAll}
              disabled={loading || blocks.every((b) => !b.text)}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {copiedAll ? "Copied!" : "Copy all"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
