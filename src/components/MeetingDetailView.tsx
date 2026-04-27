"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Circle,
  CheckCircle2,
  ChevronLeft,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Link2,
  MessageSquare,
  Paperclip,
  Plus,
  Sparkles,
  Truck,
  Wrench,
  Home as HomeIcon,
} from "lucide-react";
import ActionItemDetailModal from "@/components/ActionItemDetailModal";
import InfoPopup, { type InfoRow } from "@/components/InfoPopup";
import { StatusBadge } from "@/components/StatusBadge";
import { TeamCalendar } from "@/components/TeamCalendar";
import type {
  ActionItemCategory,
  ActionItemStatus,
  DbAgendaApplication,
  DbAgendaCarryOver,
  DbAgendaInspection,
  DbAgendaMove,
  DbAgendaVacancy,
  DbAgendaWorkOrder,
  DbMeetingActionItem,
  DbPropertyMeeting,
} from "@/lib/supabase";
import type { Contact, MaintenanceRequest, Unit } from "@/lib/types";

type Props = {
  meeting: DbPropertyMeeting;
  units: Unit[];
  workOrders: MaintenanceRequest[];
  onBack: () => void;
  onMeetingChange?: (m: DbPropertyMeeting) => void;
};

type ExtractedItem = {
  title: string;
  description: string;
  assignedTo: string | null;
  dueDate: string | null;
  priority: string | null;
};

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function MeetingDetailView({
  meeting: initial,
  units,
  workOrders,
  onBack,
  onMeetingChange,
}: Props) {
  const [meeting, setMeetingState] = useState<DbPropertyMeeting>(initial);
  const [items, setItems] = useState<DbMeetingActionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<ExtractedItem[]>([]);
  const [suggestionNotice, setSuggestionNotice] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState<string>(meeting.transcript || "");
  const [notesDraft, setNotesDraft] = useState<string>(meeting.notes || "");
  const [openItemId, setOpenItemId] = useState<string | null>(null);
  const [openWorkOrderId, setOpenWorkOrderId] = useState<string | null>(null);
  const [openVacancyUnitId, setOpenVacancyUnitId] = useState<string | null>(null);
  const [openApplicationId, setOpenApplicationId] = useState<string | null>(null);
  const [openMove, setOpenMove] = useState<{
    unitId: string;
    direction: "move_in" | "move_out";
    date: string;
  } | null>(null);
  const [openInspectionId, setOpenInspectionId] = useState<string | null>(null);
  const [openCarryOverItem, setOpenCarryOverItem] = useState<DbMeetingActionItem | null>(null);
  const [dateDraft, setDateDraft] = useState<string>(meeting.meeting_date);
  const [meetingUrlDraft, setMeetingUrlDraft] = useState<string>(meeting.meeting_url || "");
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Load active team contacts so the attendee picker can pull from them.
  useEffect(() => {
    fetch("/api/contacts")
      .then((r) => r.json())
      .then((j) => setContacts(Array.isArray(j.contacts) ? j.contacts : []))
      .catch(() => setContacts([]));
  }, []);

  const setMeeting = useCallback(
    (m: DbPropertyMeeting) => {
      setMeetingState(m);
      onMeetingChange?.(m);
    },
    [onMeetingChange]
  );

  useEffect(() => {
    setMeetingState(initial);
    setTranscriptDraft(initial.transcript || "");
    setNotesDraft(initial.notes || "");
    setDateDraft(initial.meeting_date);
    setMeetingUrlDraft(initial.meeting_url || "");
  }, [initial]);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const r = await fetch(`/api/meetings/action-items?meeting_id=${encodeURIComponent(meeting.id)}`);
      const j = await r.json();
      setItems(Array.isArray(j.items) ? j.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoadingItems(false);
    }
  }, [meeting.id]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const persistMeeting = useCallback(
    async (patch: Partial<DbPropertyMeeting>) => {
      setSaving(true);
      try {
        const r = await fetch(`/api/meetings/crud?id=${encodeURIComponent(meeting.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const j = await r.json();
        if (j.meeting) setMeeting(j.meeting);
      } finally {
        setSaving(false);
      }
    },
    [meeting.id, setMeeting]
  );

  const handleExtract = async () => {
    setExtracting(true);
    setSuggestionNotice(null);
    try {
      const r = await fetch("/api/meetings/extract-actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcriptDraft,
          attendees: meeting.attendees,
          context: agendaToContext(meeting.agenda_snapshot),
        }),
      });
      const j = await r.json();
      setSuggestions(Array.isArray(j.items) ? j.items : []);
      if (j.notice) setSuggestionNotice(j.notice);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to extract action items";
      setSuggestionNotice(msg);
    } finally {
      setExtracting(false);
    }
  };

  const acceptSuggestion = async (s: ExtractedItem) => {
    const row = {
      id: makeId("ai"),
      meeting_id: meeting.id,
      property_id: meeting.property_id,
      title: s.title,
      description: s.description || null,
      assigned_to: s.assignedTo,
      due_date: s.dueDate,
      priority: s.priority,
      status: "open" as ActionItemStatus,
      source: "transcript" as const,
    };
    const r = await fetch("/api/meetings/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    const j = await r.json();
    if (j.item) {
      setItems((prev) => [...prev, j.item]);
      setSuggestions((prev) => prev.filter((x) => x !== s));
    }
  };

  const acceptAllSuggestions = async () => {
    if (suggestions.length === 0) return;
    const rows = suggestions.map((s) => ({
      id: makeId("ai"),
      meeting_id: meeting.id,
      property_id: meeting.property_id,
      title: s.title,
      description: s.description || null,
      assigned_to: s.assignedTo,
      due_date: s.dueDate,
      priority: s.priority,
      status: "open" as ActionItemStatus,
      source: "transcript" as const,
    }));
    const r = await fetch("/api/meetings/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: rows }),
    });
    const j = await r.json();
    if (Array.isArray(j.items)) {
      setItems((prev) => [...prev, ...j.items]);
      setSuggestions([]);
    }
  };

  const addManualItem = async () => {
    const title = prompt("New action item:");
    if (!title?.trim()) return;
    const row = {
      id: makeId("m"),
      meeting_id: meeting.id,
      property_id: meeting.property_id,
      title: title.trim(),
      status: "open" as ActionItemStatus,
      source: "manual" as const,
    };
    const r = await fetch("/api/meetings/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    const j = await r.json();
    if (j.item) setItems((prev) => [...prev, j.item]);
  };

  const addCategoryItem = async (category: ActionItemCategory, label: string) => {
    const title = prompt(`New ${label} item:`);
    if (!title?.trim()) return;
    const row = {
      id: makeId("c"),
      meeting_id: meeting.id,
      property_id: meeting.property_id,
      title: title.trim(),
      status: "open" as ActionItemStatus,
      source: "manual" as const,
      category,
    };
    const r = await fetch("/api/meetings/action-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row),
    });
    const j = await r.json();
    if (j.item) setItems((prev) => [...prev, j.item]);
  };

  const patchItem = async (id: string, patch: Partial<DbMeetingActionItem>) => {
    // optimistic
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const r = await fetch(`/api/meetings/action-items?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = await r.json();
    if (j.item) {
      setItems((prev) => prev.map((it) => (it.id === id ? j.item : it)));
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm("Delete this action item?")) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
    await fetch(`/api/meetings/action-items?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  const completeMeeting = async () => {
    await persistMeeting({
      status: "completed",
      transcript: transcriptDraft,
      notes: notesDraft,
    });
  };

  const openItems = useMemo(
    () => items.filter((i) => i.status === "open" || i.status === "in_progress"),
    [items]
  );
  const doneItems = useMemo(() => items.filter((i) => i.status === "completed"), [items]);

  const agenda = meeting.agenda_snapshot || {};
  const carryOver: DbAgendaCarryOver[] = Array.isArray(agenda.carryOverActions) ? agenda.carryOverActions : [];

  // Items the user added directly into an agenda card during this meeting.
  // Rendered alongside the AppFolio-pulled rows, and propagate to the next
  // meeting's Review card automatically when left open.
  const itemsByCategory = useMemo(() => {
    const buckets: Record<ActionItemCategory, DbMeetingActionItem[]> = {
      review: [],
      leasing: [],
      maintenance: [],
      property_management: [],
    };
    for (const it of items) {
      if (it.category && it.category in buckets) {
        buckets[it.category as ActionItemCategory].push(it);
      }
    }
    return buckets;
  }, [items]);

  // Three-category view with legacy fallback. Old meetings only have
  // `workOrders` / `vacancies` at the top level; new meetings have the
  // structured `leasing` / `maintenance` / `propertyManagement` blocks.
  const leasingVacancies: DbAgendaVacancy[] =
    agenda.leasing?.vacancies ?? (Array.isArray(agenda.vacancies) ? agenda.vacancies : []);
  const leasingApplications: DbAgendaApplication[] = agenda.leasing?.applications ?? [];
  const leasingMoves: DbAgendaMove[] = agenda.leasing?.upcomingMoves ?? [];
  const leasingTotal =
    leasingVacancies.length +
    leasingApplications.length +
    leasingMoves.length +
    itemsByCategory.leasing.length;

  const maintenanceOpen: DbAgendaWorkOrder[] =
    agenda.maintenance?.openWorkOrders ?? (Array.isArray(agenda.workOrders) ? agenda.workOrders : []);

  const pmInspections: DbAgendaInspection[] = agenda.propertyManagement?.upcomingInspections ?? [];

  return (
    <div className="space-y-6">
      <button
        onClick={onBack}
        className="text-sm text-accent hover:underline inline-flex items-center gap-1"
      >
        <ChevronLeft className="w-4 h-4" /> Back to Meetings
      </button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {meeting.title || "Monday Morning Meeting"}
          </h2>
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              onBlur={() => {
                if (dateDraft && dateDraft !== meeting.meeting_date) {
                  persistMeeting({ meeting_date: dateDraft });
                }
              }}
              className="text-sm text-muted-foreground bg-transparent border border-transparent hover:border-border focus:border-border rounded px-2 py-1 -mx-2"
            />
            {meeting.property_name && (
              <span className="text-sm text-muted-foreground">· {meeting.property_name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge value={meeting.status} />
          {saving && <span className="text-xs text-muted-foreground">Saving…</span>}
          {meeting.status !== "completed" && (
            <button
              onClick={completeMeeting}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted"
            >
              Mark Complete
            </button>
          )}
        </div>
      </div>

      {/* Attendees — pulled from the active team contacts. */}
      <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 space-y-3 shadow-sm">
        <label className="text-base font-semibold block tracking-tight">Attendees</label>
        {(() => {
          const teamContacts = contacts.filter((c) => c.isActive);
          const selected = new Set(meeting.attendees || []);
          if (teamContacts.length === 0) {
            return (
              <p className="text-sm text-muted-foreground">
                No team contacts yet. Add team members on the Contacts page to pick attendees here.
              </p>
            );
          }
          return (
            <div className="flex flex-wrap gap-2">
              {teamContacts.map((c) => {
                const isOn = selected.has(c.name);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      const next = new Set(selected);
                      if (isOn) next.delete(c.name);
                      else next.add(c.name);
                      persistMeeting({ attendees: [...next] });
                    }}
                    className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                      isOn
                        ? "bg-accent text-white border-accent"
                        : "bg-card text-foreground border-border hover:bg-muted"
                    }`}
                  >
                    {c.name}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {/* Weekly at-a-glance — same Month/Week calendar as the dashboard,
          anchored to the meeting date and opened in week view so the team
          discusses the upcoming 7 days together. */}
      <TeamCalendar anchorDate={meeting.meeting_date} defaultView="week" />

      {/* Review: carry-over action items from prior meetings */}
      <AgendaCard
        title="Review — open action items from prior meetings"
        icon={<ClipboardList className="w-4 h-4" />}
        count={carryOver.length + itemsByCategory.review.length}
        empty="No open action items from prior meetings. Starting fresh."
        onAdd={() => addCategoryItem("review", "review")}
      >
        {carryOver.map((c) => (
          <button
            type="button"
            key={c.id}
            onClick={async () => {
              // Optimistic open: build a stub from the snapshot so the modal
              // is responsive even if the carry-over id is stale or the
              // fetch fails. Fresh data replaces the stub if available.
              const stub: DbMeetingActionItem = {
                id: c.id,
                meeting_id: meeting.id,
                property_id: meeting.property_id ?? null,
                title: c.title,
                description: c.description ?? null,
                assigned_to: c.assignedTo ?? null,
                due_date: c.dueDate ?? null,
                status: c.status,
                priority: null,
                source: "manual",
                category: "review",
                completed_at: null,
                completed_by: null,
                linked_work_order_id: null,
                linked_unit_id: null,
                comments: [],
                attachments: [],
                created_at: c.fromMeetingDate ?? new Date().toISOString(),
                updated_at: new Date().toISOString(),
              };
              setOpenCarryOverItem(stub);
              try {
                const r = await fetch(`/api/meetings/action-items?id=${encodeURIComponent(c.id)}`);
                if (!r.ok) return;
                const j = await r.json();
                if (j.item) setOpenCarryOverItem(j.item);
              } catch {
                // Keep the stub if fetch fails.
              }
            }}
            className="w-full text-left text-sm border-b border-border last:border-0 pb-2 last:pb-0 hover:bg-muted/50 rounded px-1 -mx-1 transition-colors"
          >
            <p className="font-medium">{c.title}</p>
            <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
              <StatusBadge value={c.status} />
              {c.assignedTo && <span>Owner: {c.assignedTo}</span>}
              {c.dueDate && <span>Due: {c.dueDate}</span>}
            </div>
          </button>
        ))}
        {itemsByCategory.review.map((it) => (
          <AgendaRow
            key={it.id}
            onClick={() => setOpenItemId(it.id)}
            title={it.title}
            right={<StatusBadge value={it.status} />}
            meta={[
              it.assigned_to ? `Owner: ${it.assigned_to}` : null,
              it.due_date ? `Due: ${it.due_date}` : null,
              "Added this meeting",
            ]}
          />
        ))}
      </AgendaCard>

      {/* Three category cards */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* ─── Leasing ─────────────────────────────────────── */}
        <AgendaCard
          title="Leasing"
          icon={<FileText className="w-4 h-4" />}
          count={leasingTotal}
          empty="Nothing on the leasing side this week."
          onAdd={() => addCategoryItem("leasing", "leasing")}
        >
          {leasingVacancies.length > 0 && (
            <AgendaSubsection label={`Unleased (${leasingVacancies.length})`}>
              {leasingVacancies.map((v) => (
                <AgendaRow
                  key={v.unitId}
                  onClick={() => setOpenVacancyUnitId(v.unitId)}
                  title={`Unit ${v.unitName}`}
                  right={<StatusBadge value="vacant" />}
                  meta={[
                    v.propertyName,
                    v.bedrooms != null ? `${v.bedrooms}bd / ${v.bathrooms ?? "—"}ba` : null,
                    v.rent ? `$${Number(v.rent).toLocaleString()}/mo` : null,
                  ]}
                />
              ))}
            </AgendaSubsection>
          )}
          {leasingApplications.length > 0 && (
            <AgendaSubsection label={`Applications (${leasingApplications.length})`}>
              {leasingApplications.map((a) => (
                <AgendaRow
                  key={a.id}
                  onClick={() => setOpenApplicationId(a.id)}
                  title={a.primaryApplicant || "Application"}
                  right={<StatusBadge value={a.status} />}
                  meta={[
                    a.propertyName,
                    a.unitNumber ? `Unit ${a.unitNumber}` : null,
                    a.applicantCount > 1 ? `${a.applicantCount} applicants` : null,
                  ]}
                />
              ))}
            </AgendaSubsection>
          )}
          {leasingMoves.length > 0 && (
            <AgendaSubsection label={`Upcoming moves (${leasingMoves.length})`}>
              {leasingMoves.map((m) => (
                <AgendaRow
                  key={`${m.unitId}-${m.direction}-${m.date}`}
                  onClick={() =>
                    setOpenMove({ unitId: m.unitId, direction: m.direction, date: m.date })
                  }
                  title={`${m.direction === "move_in" ? "Move-in" : "Move-out"}: Unit ${m.unitName}`}
                  right={
                    <span className="text-xs font-medium text-muted-foreground">
                      {m.daysUntil != null
                        ? m.daysUntil === 0
                          ? "today"
                          : `${m.daysUntil}d`
                        : ""}
                    </span>
                  }
                  meta={[m.propertyName, m.tenant, m.date]}
                />
              ))}
            </AgendaSubsection>
          )}
          {itemsByCategory.leasing.length > 0 && (
            <AgendaSubsection label={`Added (${itemsByCategory.leasing.length})`}>
              {itemsByCategory.leasing.map((it) => (
                <AgendaRow
                  key={it.id}
                  onClick={() => setOpenItemId(it.id)}
                  title={it.title}
                  right={<StatusBadge value={it.status} />}
                  meta={[
                    it.assigned_to ? `Owner: ${it.assigned_to}` : null,
                    it.due_date ? `Due: ${it.due_date}` : null,
                  ]}
                />
              ))}
            </AgendaSubsection>
          )}
        </AgendaCard>

        {/* ─── Maintenance ─────────────────────────────────── */}
        <AgendaCard
          title="Maintenance"
          icon={<Wrench className="w-4 h-4" />}
          count={maintenanceOpen.length + itemsByCategory.maintenance.length}
          empty="No open work orders at meeting time."
          onAdd={() => addCategoryItem("maintenance", "maintenance")}
        >
          {maintenanceOpen.map((wo) => (
            <AgendaRow
              key={wo.id}
              onClick={() => setOpenWorkOrderId(wo.id)}
              title={wo.title}
              right={wo.priority ? <StatusBadge value={wo.priority} /> : null}
              meta={[
                wo.workOrderNumber ? `#${wo.workOrderNumber}` : null,
                wo.propertyName,
                wo.unitName ? `Unit ${wo.unitName}` : null,
                wo.status,
                wo.vendor,
              ]}
            />
          ))}
          {itemsByCategory.maintenance.length > 0 && (
            <AgendaSubsection label={`Added (${itemsByCategory.maintenance.length})`}>
              {itemsByCategory.maintenance.map((it) => (
                <AgendaRow
                  key={it.id}
                  onClick={() => setOpenItemId(it.id)}
                  title={it.title}
                  right={<StatusBadge value={it.status} />}
                  meta={[
                    it.assigned_to ? `Owner: ${it.assigned_to}` : null,
                    it.due_date ? `Due: ${it.due_date}` : null,
                  ]}
                />
              ))}
            </AgendaSubsection>
          )}
        </AgendaCard>

        {/* ─── Property Management ─────────────────────────── */}
        <AgendaCard
          title="Property Management"
          icon={<HomeIcon className="w-4 h-4" />}
          count={pmInspections.length + itemsByCategory.property_management.length}
          empty="No inspections on the calendar."
          onAdd={() => addCategoryItem("property_management", "property management")}
        >
          {pmInspections.length > 0 && (
            <AgendaSubsection label={`Inspections (${pmInspections.length})`}>
              {pmInspections.map((i) => (
                <AgendaRow
                  key={i.id}
                  onClick={() => setOpenInspectionId(i.id)}
                  title={`${formatInspectionType(i.type)}${
                    i.unitNumber ? ` — Unit ${i.unitNumber}` : ""
                  }`}
                  right={<StatusBadge value={i.status} />}
                  meta={[i.propertyName, i.scheduledDate, i.inspector]}
                />
              ))}
            </AgendaSubsection>
          )}
          {itemsByCategory.property_management.length > 0 && (
            <AgendaSubsection label={`Added (${itemsByCategory.property_management.length})`}>
              {itemsByCategory.property_management.map((it) => (
                <AgendaRow
                  key={it.id}
                  onClick={() => setOpenItemId(it.id)}
                  title={it.title}
                  right={<StatusBadge value={it.status} />}
                  meta={[
                    it.assigned_to ? `Owner: ${it.assigned_to}` : null,
                    it.due_date ? `Due: ${it.due_date}` : null,
                  ]}
                />
              ))}
            </AgendaSubsection>
          )}
        </AgendaCard>
      </div>

      {/* Action items board */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Action Items ({items.length})
          </h3>
          <button
            onClick={addManualItem}
            className="text-sm font-medium text-accent hover:underline inline-flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> Add item
          </button>
        </div>

        {loadingItems ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No action items yet. Record the meeting and click &ldquo;Extract Action Items&rdquo;, or add one manually.
          </p>
        ) : (
          <div className="space-y-6">
            {openItems.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Open</p>
                <div className="space-y-2">
                  {openItems.map((it) => (
                    <ActionItemRow
                      key={it.id}
                      item={it}
                      onOpen={() => setOpenItemId(it.id)}
                      onToggleDone={() =>
                        patchItem(it.id, {
                          status: it.status === "completed" ? "open" : "completed",
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
            {doneItems.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Completed</p>
                <div className="space-y-2 opacity-70">
                  {doneItems.map((it) => (
                    <ActionItemRow
                      key={it.id}
                      item={it}
                      onOpen={() => setOpenItemId(it.id)}
                      onToggleDone={() =>
                        patchItem(it.id, {
                          status: it.status === "completed" ? "open" : "completed",
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-2">
        <h3 className="font-semibold">Notes</h3>
        <textarea
          value={notesDraft}
          onChange={(e) => setNotesDraft(e.target.value)}
          onBlur={() => {
            if (notesDraft !== (meeting.notes || "")) {
              persistMeeting({ notes: notesDraft });
            }
          }}
          rows={4}
          placeholder="Any additional context from the meeting — decisions, blockers, follow-ups…"
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
        />
      </div>

      {/* Meeting link + transcript */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div>
          <label className="text-sm font-semibold flex items-center gap-2 mb-1">
            <Link2 className="w-4 h-4" /> Google Meet link
          </label>
          <div className="flex gap-2">
            <input
              type="url"
              value={meetingUrlDraft}
              onChange={(e) => setMeetingUrlDraft(e.target.value)}
              onBlur={() => {
                if (meetingUrlDraft !== (meeting.meeting_url || "")) {
                  persistMeeting({ meeting_url: meetingUrlDraft.trim() || null });
                }
              }}
              placeholder="https://meet.google.com/…"
              className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            {meeting.meeting_url && (
              <a
                href={meeting.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted inline-flex items-center gap-1"
              >
                Join
              </a>
            )}
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold block mb-1">Transcript</label>
          <textarea
            value={transcriptDraft}
            onChange={(e) => setTranscriptDraft(e.target.value)}
            onBlur={() => {
              if (transcriptDraft !== (meeting.transcript || "")) {
                persistMeeting({ transcript: transcriptDraft });
              }
            }}
            placeholder="Paste the Google Meet transcript here once the call ends."
            rows={8}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card font-mono"
          />
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={handleExtract}
            disabled={extracting || transcriptDraft.trim().length < 10}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 text-sm font-medium"
          >
            <Sparkles className="w-4 h-4" />
            {extracting ? "Extracting…" : "Extract Action Items"}
          </button>
          {suggestionNotice && <span className="text-xs text-muted-foreground">{suggestionNotice}</span>}
        </div>

        {suggestions.length > 0 && (
          <div className="border border-indigo-200 bg-indigo-50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm text-indigo-900">
                {suggestions.length} suggested action item{suggestions.length === 1 ? "" : "s"}
              </h4>
              <button
                onClick={acceptAllSuggestions}
                className="text-xs font-medium text-indigo-700 hover:underline"
              >
                Accept all
              </button>
            </div>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="bg-white rounded-lg border border-indigo-200 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-medium">{s.title}</p>
                      {s.description && (
                        <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                      )}
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                        {s.assignedTo && <span>Owner: {s.assignedTo}</span>}
                        {s.dueDate && <span>Due: {s.dueDate}</span>}
                        {s.priority && <span className="capitalize">Priority: {s.priority}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => acceptSuggestion(s)}
                        className="px-2 py-1 text-xs font-medium bg-indigo-600 text-white rounded hover:bg-indigo-700"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => setSuggestions((prev) => prev.filter((x) => x !== s))}
                        className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Skip
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {openItemId && (() => {
        const openItem = items.find((i) => i.id === openItemId);
        if (!openItem) return null;
        return (
          <ActionItemDetailModal
            item={openItem}
            units={units}
            workOrders={workOrders}
            attendees={meeting.attendees || []}
            onClose={() => setOpenItemId(null)}
            onChange={(updated) =>
              setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
            }
            onDelete={async () => {
              await removeItem(openItem.id);
              setOpenItemId(null);
            }}
          />
        );
      })()}

      {openWorkOrderId && (() => {
        const snap = maintenanceOpen.find((w) => w.id === openWorkOrderId);
        const live = workOrders.find((w) => w.id === openWorkOrderId);
        if (!snap && !live) return null;
        const title = live?.title || snap?.title || "Work order";
        const number = live?.appfolioWorkOrderId || snap?.workOrderNumber;
        const rows: InfoRow[] = [];
        if (live?.priority || snap?.priority) {
          rows.push({ label: "Priority", status: (live?.priority || snap?.priority) as string });
        }
        if (live?.status || snap?.status) {
          rows.push({ label: "Status", status: (live?.status || snap?.status) as string });
        }
        if (live?.category) rows.push({ label: "Category", value: live.category });
        if (live?.propertyName || snap?.propertyName) {
          rows.push({ label: "Property", value: live?.propertyName || snap?.propertyName });
        }
        if (live?.unitNumber || snap?.unitName) {
          rows.push({ label: "Unit", value: live?.unitNumber || snap?.unitName });
        }
        if (live?.tenantName) rows.push({ label: "Tenant", value: live.tenantName });
        if (live?.vendor || snap?.vendor) {
          rows.push({ label: "Vendor", value: live?.vendor || snap?.vendor });
        }
        if (live?.assignedTo) rows.push({ label: "Assigned to", value: live.assignedTo });
        if (live?.scheduledDate) rows.push({ label: "Scheduled", value: live.scheduledDate });
        if (live?.description) rows.push({ label: "Description", value: live.description });
        return (
          <InfoPopup
            title={number ? `#${number} — ${title}` : title}
            subtitle="Work order"
            icon={<Wrench className="w-5 h-5 text-muted-foreground" />}
            rows={rows}
            action={{ label: "Open in Maintenance →", href: "/maintenance" }}
            onClose={() => setOpenWorkOrderId(null)}
          />
        );
      })()}

      {openVacancyUnitId && (() => {
        const snap = leasingVacancies.find((v) => v.unitId === openVacancyUnitId);
        const live = units.find((u) => u.id === openVacancyUnitId);
        if (!snap && !live) return null;
        const rows: InfoRow[] = [];
        rows.push({ label: "Status", status: live?.status || "vacant" });
        if (live?.propertyName || snap?.propertyName) {
          rows.push({ label: "Property", value: live?.propertyName || snap?.propertyName });
        }
        if ((live?.bedrooms ?? snap?.bedrooms) != null) {
          rows.push({
            label: "Layout",
            value: `${live?.bedrooms ?? snap?.bedrooms}bd / ${
              live?.bathrooms ?? snap?.bathrooms ?? "—"
            }ba${live?.sqft ? ` · ${live.sqft} sqft` : ""}`,
          });
        }
        if (live?.rent || snap?.rent) {
          rows.push({
            label: "Rent",
            value: `$${Number(live?.rent ?? snap?.rent).toLocaleString()}/mo`,
          });
        }
        if (live?.tenant) rows.push({ label: "Last tenant", value: live.tenant });
        if (live?.moveOut || snap?.leaseEnded) {
          rows.push({ label: "Move-out", value: live?.moveOut || snap?.leaseEnded });
        }
        if (live?.leaseTo) rows.push({ label: "Lease end", value: live.leaseTo });
        if (live?.deposit) rows.push({ label: "Deposit", value: `$${live.deposit.toLocaleString()}` });
        return (
          <InfoPopup
            title={`Unit ${live?.unitName || snap?.unitName}`}
            subtitle={live?.propertyName || snap?.propertyName || "Vacant unit"}
            icon={<HomeIcon className="w-5 h-5 text-muted-foreground" />}
            rows={rows}
            action={{ label: "Open in Leasing →", href: "/leasing" }}
            onClose={() => setOpenVacancyUnitId(null)}
          />
        );
      })()}

      {openCarryOverItem && (
        <ActionItemDetailModal
          item={openCarryOverItem}
          units={units}
          workOrders={workOrders}
          attendees={meeting.attendees || []}
          onClose={() => setOpenCarryOverItem(null)}
          onChange={(updated) => setOpenCarryOverItem(updated)}
          onDelete={async () => {
            await fetch(
              `/api/meetings/action-items?id=${encodeURIComponent(openCarryOverItem.id)}`,
              { method: "DELETE" }
            );
            setOpenCarryOverItem(null);
          }}
        />
      )}

      {openApplicationId && (() => {
        const a = leasingApplications.find((x) => x.id === openApplicationId);
        if (!a) return null;
        const rows: InfoRow[] = [
          { label: "Status", status: a.status },
          { label: "Property", value: a.propertyName },
        ];
        if (a.unitNumber) rows.push({ label: "Unit", value: a.unitNumber });
        if (a.primaryApplicant) rows.push({ label: "Primary applicant", value: a.primaryApplicant });
        if (a.applicantCount) rows.push({ label: "Applicants", value: `${a.applicantCount}` });
        return (
          <InfoPopup
            title={a.primaryApplicant || "Application"}
            subtitle="Application"
            icon={<FileText className="w-5 h-5 text-muted-foreground" />}
            rows={rows}
            action={{ label: "Open in Leasing →", href: "/leasing/applications" }}
            onClose={() => setOpenApplicationId(null)}
          />
        );
      })()}

      {openMove && (() => {
        const m = leasingMoves.find(
          (x) =>
            x.unitId === openMove.unitId &&
            x.direction === openMove.direction &&
            x.date === openMove.date
        );
        if (!m) return null;
        const liveUnit = units.find((u) => u.id === m.unitId);
        const rows: InfoRow[] = [
          {
            label: "Direction",
            value: m.direction === "move_in" ? "Move-in" : "Move-out",
          },
          { label: "Date", value: m.date },
        ];
        if (m.daysUntil != null) rows.push({ label: "Days until", value: `${m.daysUntil}` });
        if (m.propertyName) rows.push({ label: "Property", value: m.propertyName });
        rows.push({ label: "Unit", value: m.unitName });
        if (m.tenant) rows.push({ label: "Tenant", value: m.tenant });
        if (liveUnit?.rent)
          rows.push({ label: "Rent", value: `$${Number(liveUnit.rent).toLocaleString()}/mo` });
        if (liveUnit?.leaseFrom || liveUnit?.leaseTo)
          rows.push({
            label: "Lease",
            value: `${liveUnit?.leaseFrom || "—"} → ${liveUnit?.leaseTo || "—"}`,
          });
        return (
          <InfoPopup
            title={`${m.direction === "move_in" ? "Move-in" : "Move-out"}: Unit ${m.unitName}`}
            subtitle={m.propertyName || undefined}
            icon={<Truck className="w-5 h-5 text-muted-foreground" />}
            rows={rows}
            onClose={() => setOpenMove(null)}
          />
        );
      })()}

      {openInspectionId && (() => {
        const i = pmInspections.find((x) => x.id === openInspectionId);
        if (!i) return null;
        const rows: InfoRow[] = [
          { label: "Type", value: formatInspectionType(i.type) },
          { label: "Status", status: i.status },
        ];
        if (i.propertyName) rows.push({ label: "Property", value: i.propertyName });
        if (i.unitNumber) rows.push({ label: "Unit", value: i.unitNumber });
        if (i.scheduledDate) rows.push({ label: "Scheduled", value: i.scheduledDate });
        if (i.inspector) rows.push({ label: "Inspector", value: i.inspector });
        return (
          <InfoPopup
            title={`${formatInspectionType(i.type)} inspection`}
            subtitle={i.unitNumber ? `Unit ${i.unitNumber}` : undefined}
            icon={<ClipboardCheck className="w-5 h-5 text-muted-foreground" />}
            rows={rows}
            action={{ label: "Open in Inspections →", href: `/inspections/${i.type.replace("_", "-")}` }}
            onClose={() => setOpenInspectionId(null)}
          />
        );
      })()}
    </div>
  );
}

function formatInspectionType(t: string): string {
  switch (t) {
    case "move_in":
      return "Move-in";
    case "move_out":
      return "Move-out";
    case "onboarding":
      return "Onboarding";
    case "quarterly":
      return "Quarterly";
    case "punch_list":
      return "Punch list";
    default:
      return t;
  }
}

function AgendaSubsection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AgendaRow({
  title,
  right,
  meta,
  onClick,
}: {
  title: string;
  right?: React.ReactNode;
  meta?: (string | null | undefined)[];
  onClick?: () => void;
}) {
  const metas = (meta || []).filter((x): x is string => Boolean(x));
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left text-sm hover:bg-muted/50 rounded px-1 -mx-1 py-1 transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium truncate">{title}</span>
        {right && <span className="shrink-0">{right}</span>}
      </div>
      {metas.length > 0 && (
        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
          {metas.map((m, i) => (
            <span key={i}>
              {i > 0 && <span className="opacity-50 mr-2">·</span>}
              {m}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function AgendaCard({
  title,
  icon,
  count,
  empty,
  children,
  onAdd,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  children: React.ReactNode;
  onAdd?: () => void;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 sm:p-6 space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-base flex items-center gap-2 tracking-tight">
          {icon} {title}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono px-2 py-0.5 bg-muted rounded-full">{count}</span>
          {onAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="text-xs font-medium text-accent hover:underline inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>
      </div>
      {count === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

function ActionItemRow({
  item,
  onOpen,
  onToggleDone,
}: {
  item: DbMeetingActionItem;
  onOpen: () => void;
  onToggleDone: () => void;
}) {
  const commentCount = item.comments?.length ?? 0;
  const attachmentCount = item.attachments?.length ?? 0;
  const overdue =
    item.due_date &&
    item.status !== "completed" &&
    item.status !== "cancelled" &&
    new Date(item.due_date + "T00:00:00") < new Date(new Date().toDateString());

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left border border-border rounded-lg p-3 bg-background/50 hover:bg-muted/50 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span
          role="checkbox"
          aria-checked={item.status === "completed"}
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onToggleDone();
          }}
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              onToggleDone();
            }
          }}
          className="mt-0.5 shrink-0 cursor-pointer"
        >
          {item.status === "completed" ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium ${
              item.status === "completed" ? "line-through text-muted-foreground" : ""
            }`}
          >
            {item.title}
          </p>
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
            {item.status !== "open" && <StatusBadge value={item.status} />}
            {item.priority && <StatusBadge value={item.priority} />}
            {item.assigned_to && <span>{item.assigned_to}</span>}
            {item.due_date && (
              <span className={overdue ? "text-red-600 font-medium" : ""}>
                Due {item.due_date}
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
            {item.source === "transcript" && (
              <span className="text-[10px] uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                AI
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function agendaToContext(agenda: DbPropertyMeeting["agenda_snapshot"]): string {
  const parts: string[] = [];
  const wo = agenda?.workOrders ?? [];
  const vac = agenda?.vacancies ?? [];
  const co = agenda?.carryOverActions ?? [];
  if (wo.length) {
    parts.push(`Open work orders: ${wo.map((w) => w.title).slice(0, 15).join("; ")}`);
  }
  if (vac.length) {
    parts.push(`Vacant units: ${vac.map((v) => v.unitName).slice(0, 15).join(", ")}`);
  }
  if (co.length) {
    parts.push(`Prior open action items: ${co.map((c) => c.title).slice(0, 15).join("; ")}`);
  }
  return parts.join("\n");
}
