"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Link2,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Search,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import ActionItemDetailModal from "@/components/ActionItemDetailModal";
import { StatusBadge } from "@/components/StatusBadge";
import { usePortfolio } from "@/contexts/PortfolioContext";
import type {
  ActionItemStatus,
  DbMeetingActionItem,
  DbPropertyMeeting,
} from "@/lib/supabase";
import type { Contact, MaintenanceRequest, Unit } from "@/lib/types";

type StatusFilter = "active" | "all" | ActionItemStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active (open + in progress)" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "all", label: "All" },
];

function todayIso(): string {
  return new Date().toDateString();
}

function isOverdue(item: DbMeetingActionItem): boolean {
  if (!item.due_date) return false;
  if (item.status === "completed" || item.status === "cancelled") return false;
  return new Date(item.due_date + "T00:00:00") < new Date(todayIso());
}

export default function TasksPage() {
  const { portfolioId } = usePortfolio();

  const [items, setItems] = useState<DbMeetingActionItem[]>([]);
  const [meetings, setMeetings] = useState<DbPropertyMeeting[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [workOrders, setWorkOrders] = useState<MaintenanceRequest[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [ownerFilter, setOwnerFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskAssignee, setNewTaskAssignee] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");
  const [newTaskSaving, setNewTaskSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<Set<string>>(new Set());

  async function handleCreateTask() {
    const title = newTaskTitle.trim();
    if (!title || newTaskSaving) return;
    setNewTaskSaving(true);
    try {
      const r = await fetch(`/api/meetings/action-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          title,
          assigned_to: newTaskAssignee || null,
          due_date: newTaskDue || null,
          status: "open",
          source: "manual",
        }),
      });
      const j = await r.json();
      if (j.item) {
        setItems((prev) => [j.item, ...prev]);
        setNewTaskTitle("");
        setNewTaskAssignee("");
        setNewTaskDue("");
        setShowNewTask(false);
      } else if (j.error) {
        alert(`Create failed: ${j.error}`);
      }
    } finally {
      setNewTaskSaving(false);
    }
  }

  async function handleSuggestNextStep(id: string) {
    setAiBusy((prev) => new Set(prev).add(id));
    try {
      const r = await fetch(`/api/tasks/suggest-next-step?id=${encodeURIComponent(id)}`, {
        method: "POST",
      });
      const j = await r.json();
      if (j.suggestion) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id
              ? { ...i, ai_next_step: j.suggestion, ai_next_step_at: j.generatedAt }
              : i,
          ),
        );
      } else if (j.error) {
        alert(`AI suggestion failed: ${j.error}`);
      }
    } finally {
      setAiBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    try {
      const [itemsR, meetingsR, unitsR, woR, contactsR] = await Promise.all([
        fetch(`/api/meetings/action-items`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/meetings/crud`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/appfolio/units?portfolio_id=${portfolioId}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/maintenance/requests?portfolio_id=${encodeURIComponent(portfolioId)}`).then((r) => r.json()).catch(() => ({})),
        fetch(`/api/contacts`).then((r) => r.json()).catch(() => ({})),
      ]);
      setItems(Array.isArray(itemsR.items) ? itemsR.items : []);
      setMeetings(Array.isArray(meetingsR.meetings) ? meetingsR.meetings : []);
      setUnits(Array.isArray(unitsR.units) ? unitsR.units : []);
      setWorkOrders(Array.isArray(woR.workOrders) ? woR.workOrders : []);
      setContacts(Array.isArray(contactsR.contacts) ? contactsR.contacts : []);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [portfolioId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Quick lookup from meeting_id → meeting metadata for the "from meeting" tag.
  const meetingsById = useMemo(() => {
    const map: Record<string, DbPropertyMeeting> = {};
    for (const m of meetings) map[m.id] = m;
    return map;
  }, [meetings]);

  // Owner picker draws from both attendees on file and any names already
  // assigned to action items, so legacy assignees still appear even if the
  // person has left the contacts list.
  const owners = useMemo(() => {
    const set = new Set<string>();
    for (const i of items) {
      if (i.assigned_to) set.add(i.assigned_to);
    }
    for (const c of contacts) {
      if (c.isActive !== false && c.name) set.add(c.name);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items, contacts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter === "active") {
        if (i.status !== "open" && i.status !== "in_progress") return false;
      } else if (statusFilter !== "all") {
        if (i.status !== statusFilter) return false;
      }
      if (ownerFilter !== "all") {
        if (ownerFilter === "__unassigned__") {
          if (i.assigned_to) return false;
        } else if (i.assigned_to !== ownerFilter) {
          return false;
        }
      }
      if (q) {
        const hay = [
          i.title,
          i.description || "",
          i.assigned_to || "",
          (i.meeting_id ? meetingsById[i.meeting_id]?.title : "") || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, statusFilter, ownerFilter, query, meetingsById]);

  // Sort: overdue first, then by due date, then by created_at. Completed
  // items go to the bottom regardless.
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const aDone = a.status === "completed" || a.status === "cancelled";
      const bDone = b.status === "completed" || b.status === "cancelled";
      if (aDone !== bDone) return aDone ? 1 : -1;
      const aOver = isOverdue(a);
      const bOver = isOverdue(b);
      if (aOver !== bOver) return aOver ? -1 : 1;
      const aDue = a.due_date || "";
      const bDue = b.due_date || "";
      if (aDue && bDue) return aDue.localeCompare(bDue);
      if (aDue) return -1;
      if (bDue) return 1;
      return a.created_at.localeCompare(b.created_at);
    });
  }, [filtered]);

  const counts = useMemo(() => {
    const c = { open: 0, in_progress: 0, completed: 0, cancelled: 0, overdue: 0 };
    for (const i of items) {
      c[i.status as keyof typeof c] += 1;
      if (isOverdue(i)) c.overdue += 1;
    }
    return c;
  }, [items]);

  const toggleDone = useCallback(
    async (item: DbMeetingActionItem) => {
      const next: ActionItemStatus = item.status === "completed" ? "open" : "completed";
      // Optimistic
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
      try {
        const r = await fetch(
          `/api/meetings/action-items?id=${encodeURIComponent(item.id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: next }),
          }
        );
        const j = await r.json();
        if (j.item) {
          setItems((prev) => prev.map((i) => (i.id === j.item.id ? j.item : i)));
        }
      } catch {
        // Revert on failure
        setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)));
      }
    },
    []
  );

  const handleItemChange = useCallback((updated: DbMeetingActionItem) => {
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }, []);

  const handleItemDelete = useCallback(async () => {
    if (!openItemId) return;
    const id = openItemId;
    if (!confirm("Delete this task? This cannot be undone.")) return;
    try {
      await fetch(`/api/meetings/action-items?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      setItems((prev) => prev.filter((i) => i.id !== id));
      setOpenItemId(null);
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  }, [openItemId]);

  const openItem = useMemo(
    () => items.find((i) => i.id === openItemId) ?? null,
    [items, openItemId]
  );

  // The modal's attendee picker uses the source meeting's attendees plus
  // active contacts so anyone realistic can be assigned.
  const modalAttendees = useMemo(() => {
    if (!openItem) return [] as string[];
    const m = openItem.meeting_id ? meetingsById[openItem.meeting_id] : undefined;
    const set = new Set<string>(m?.attendees ?? []);
    for (const c of contacts) if (c.isActive !== false && c.name) set.add(c.name);
    return [...set];
  }, [openItem, meetingsById, contacts]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6" /> Tasks
          </h1>
          <p className="text-muted-foreground mt-1 max-w-3xl">
            Every action item from every meeting in one place. Tasks roll over
            from week to week until someone closes them out — open the row to
            comment, assign, link a work order, or attach a file.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewTask((v) => !v)}
            className="px-3 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 inline-flex items-center gap-2 text-sm font-medium"
          >
            {showNewTask ? "Cancel" : "+ New task"}
          </button>
          <button
            onClick={loadAll}
            disabled={refreshing}
            className="px-3 py-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50 inline-flex items-center gap-2 text-sm font-medium"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {showNewTask && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <input
            autoFocus
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleCreateTask(); }}
            placeholder="Task title (required)"
            className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={newTaskAssignee}
              onChange={(e) => setNewTaskAssignee(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
            >
              <option value="">Unassigned</option>
              {owners.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
            <input
              type="date"
              value={newTaskDue}
              onChange={(e) => setNewTaskDue(e.target.value)}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
            />
            <button
              onClick={handleCreateTask}
              disabled={!newTaskTitle.trim() || newTaskSaving}
              className="ml-auto px-3 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 disabled:opacity-50"
            >
              {newTaskSaving ? "Creating…" : "Create task"}
            </button>
          </div>
        </div>
      )}

      {/* Stat strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Open" value={counts.open} tone="blue" />
        <StatCard label="In progress" value={counts.in_progress} tone="yellow" />
        <StatCard label="Overdue" value={counts.overdue} tone="red" />
        <StatCard label="Completed" value={counts.completed} tone="green" />
        <StatCard label="Cancelled" value={counts.cancelled} tone="slate" />
      </div>

      {/* Filter bar */}
      <div className="bg-card border border-border rounded-xl p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, description, owner, meeting…"
            className="w-full pl-9 pr-3 py-2 border border-border rounded-lg text-sm bg-background"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-background"
        >
          <option value="all">All owners</option>
          <option value="__unassigned__">Unassigned</option>
          {owners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          Showing {sorted.length} of {items.length}
        </span>
      </div>

      {/* List */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading tasks…</div>
        ) : sorted.length === 0 ? (
          <div className="p-10 text-center">
            <ClipboardCheck className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">No tasks match these filters</p>
            <p className="text-xs text-muted-foreground mt-1">
              Try widening the status filter, or generate a meeting to start
              capturing action items.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {sorted.map((item) => (
              <TaskRow
                key={item.id}
                item={item}
                meeting={item.meeting_id ? meetingsById[item.meeting_id] : undefined}
                onToggleDone={() => toggleDone(item)}
                onOpen={() => setOpenItemId(item.id)}
                onSuggestNextStep={() => handleSuggestNextStep(item.id)}
                aiBusy={aiBusy.has(item.id)}
              />
            ))}
          </ul>
        )}
      </div>

      {openItem && (
        <ActionItemDetailModal
          item={openItem}
          units={units}
          workOrders={workOrders}
          attendees={modalAttendees}
          allActionItems={items}
          onClose={() => setOpenItemId(null)}
          onChange={handleItemChange}
          onDelete={handleItemDelete}
        />
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "yellow" | "red" | "green" | "slate";
}) {
  const toneClass = {
    blue: "text-blue-700",
    yellow: "text-yellow-700",
    red: "text-red-700",
    green: "text-green-700",
    slate: "text-slate-600",
  }[tone];
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-semibold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

function TaskRow({
  item,
  meeting,
  onToggleDone,
  onOpen,
  onSuggestNextStep,
  aiBusy,
}: {
  item: DbMeetingActionItem;
  meeting: DbPropertyMeeting | undefined;
  onToggleDone: () => void;
  onOpen: () => void;
  onSuggestNextStep: () => void;
  aiBusy: boolean;
}) {
  const overdue = isOverdue(item);
  const commentCount = item.comments?.length ?? 0;
  const attachmentCount = item.attachments?.length ?? 0;
  const linkedCount = item.linked_action_item_ids?.length ?? 0;
  const isDone = item.status === "completed";
  const latestComment = commentCount > 0 ? item.comments[commentCount - 1] : undefined;
  const nextStep = item.ai_next_step;

  return (
    <li>
      <div className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
        <span
          role="checkbox"
          aria-checked={isDone}
          tabIndex={0}
          onClick={onToggleDone}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              onToggleDone();
            }
          }}
          className="mt-1 shrink-0 cursor-pointer"
        >
          {isDone ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 text-left min-w-0"
        >
          <p
            className={`text-sm font-medium ${
              isDone ? "line-through text-muted-foreground" : ""
            }`}
          >
            {item.title}
          </p>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {item.description}
            </p>
          )}
          {latestComment && (
            <p
              className="text-xs text-muted-foreground mt-1 line-clamp-1 italic"
              title={latestComment.text}
            >
              <MessageSquare className="w-3 h-3 inline mr-1" />
              {latestComment.author ? `${latestComment.author}: ` : ""}
              {latestComment.text}
            </p>
          )}
          {nextStep && (
            <p className="text-xs mt-1 text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-2 py-1 inline-block">
              <span className="font-semibold mr-1">Next:</span>{nextStep}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
            <StatusBadge value={item.status} />
            {item.priority && <StatusBadge value={item.priority} />}
            {item.assigned_to ? (
              <span>{item.assigned_to}</span>
            ) : (
              <span className="italic">Unassigned</span>
            )}
            {item.due_date && (
              <span className={overdue ? "text-red-600 font-medium" : ""}>
                Due {item.due_date}
                {overdue && " (overdue)"}
              </span>
            )}
            {item.linked_work_order_id && (
              <span className="inline-flex items-center gap-1">
                <Wrench className="w-3 h-3" /> linked WO
              </span>
            )}
            {commentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> {commentCount}
              </span>
            )}
            {attachmentCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Paperclip className="w-3 h-3" /> {attachmentCount}
              </span>
            )}
            {linkedCount > 0 && (
              <span className="inline-flex items-center gap-1">
                <Link2 className="w-3 h-3" /> {linkedCount}
              </span>
            )}
            {item.source === "transcript" && (
              <span className="text-[10px] uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                AI
              </span>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSuggestNextStep(); }}
          disabled={aiBusy}
          className="shrink-0 text-xs text-indigo-700 hover:underline disabled:opacity-50 mr-3"
          title="Use AI to suggest the next step for this task"
        >
          {aiBusy ? "Thinking…" : nextStep ? "Refresh AI" : "AI: next step"}
        </button>
        <div className="shrink-0 text-right">
          {meeting ? (
            <Link
              href={`/meetings`}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              title={meeting.title || "Meeting"}
            >
              <Calendar className="w-3 h-3" />
              {meeting.meeting_date}
            </Link>
          ) : (
            <span className="text-xs text-muted-foreground">No meeting</span>
          )}
        </div>
      </div>
    </li>
  );
}
