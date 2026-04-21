"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Circle,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  Mic,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Wrench,
  Home as HomeIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import { useMeetingRecorder } from "@/hooks/useMeetingRecorder";
import type {
  ActionItemStatus,
  DbAgendaCarryOver,
  DbAgendaVacancy,
  DbAgendaWorkOrder,
  DbMeetingActionItem,
  DbPropertyMeeting,
} from "@/lib/supabase";

type Props = {
  meeting: DbPropertyMeeting;
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

function fmtDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function MeetingDetailView({ meeting: initial, onBack, onMeetingChange }: Props) {
  const [meeting, setMeetingState] = useState<DbPropertyMeeting>(initial);
  const [items, setItems] = useState<DbMeetingActionItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [suggestions, setSuggestions] = useState<ExtractedItem[]>([]);
  const [suggestionNotice, setSuggestionNotice] = useState<string | null>(null);
  const [transcriptDraft, setTranscriptDraft] = useState<string>(meeting.transcript || "");
  const [notesDraft, setNotesDraft] = useState<string>(meeting.notes || "");

  const recorder = useMeetingRecorder();

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
  }, [initial]);

  useEffect(() => {
    if (recorder.transcript) {
      const base = meeting.transcript || "";
      const sep = base.trim() ? "\n\n" : "";
      setTranscriptDraft(base + sep + recorder.transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.transcript]);

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

  const handleStartRecording = async () => {
    await recorder.start();
    if (meeting.status !== "in_progress") {
      persistMeeting({ status: "in_progress", recorded_at: new Date().toISOString() });
    }
  };

  const handleStopRecording = async () => {
    await recorder.stop();
    // Persist transcript + duration
    const finalTranscript = transcriptDraft;
    const duration = recorder.durationSeconds || meeting.recording_duration_seconds || 0;
    persistMeeting({
      transcript: finalTranscript,
      recording_duration_seconds: duration,
    });
  };

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
  const workOrders: DbAgendaWorkOrder[] = Array.isArray(agenda.workOrders) ? agenda.workOrders : [];
  const vacancies: DbAgendaVacancy[] = Array.isArray(agenda.vacancies) ? agenda.vacancies : [];
  const carryOver: DbAgendaCarryOver[] = Array.isArray(agenda.carryOverActions) ? agenda.carryOverActions : [];

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
          <h2 className="text-2xl font-bold">
            {meeting.title || "Monday Morning Meeting"}
          </h2>
          <p className="text-muted-foreground mt-1">
            {meeting.property_name} · {new Date(meeting.meeting_date + "T00:00:00").toLocaleDateString(undefined, {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
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

      {/* Recorder */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Mic className="w-4 h-4" /> Recording
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {recorder.supportsLiveTranscription
                ? "Live transcription runs in your browser while you record."
                : "Live transcription isn't supported in this browser — audio still records, and you can paste a transcript after."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {recorder.state === "recording" && (
              <span className="flex items-center gap-2 text-sm">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
                </span>
                <span className="font-mono">{fmtDuration(recorder.durationSeconds)}</span>
              </span>
            )}
            {recorder.state !== "recording" ? (
              <button
                onClick={handleStartRecording}
                className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 inline-flex items-center gap-2 text-sm font-medium"
              >
                <Mic className="w-4 h-4" /> Start Recording
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 inline-flex items-center gap-2 text-sm font-medium"
              >
                <Square className="w-4 h-4" /> Stop
              </button>
            )}
          </div>
        </div>

        {recorder.error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {recorder.error}
          </div>
        )}

        <div>
          <label className="text-xs text-muted-foreground block mb-1">Transcript</label>
          <textarea
            value={transcriptDraft + (recorder.interimTranscript ? ` ${recorder.interimTranscript}` : "")}
            onChange={(e) => setTranscriptDraft(e.target.value)}
            onBlur={() => {
              if (transcriptDraft !== (meeting.transcript || "")) {
                persistMeeting({ transcript: transcriptDraft });
              }
            }}
            placeholder="Transcript will appear here as you speak. You can also paste or type it in manually."
            rows={6}
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

      {/* Agenda panels */}
      <div className="grid lg:grid-cols-3 gap-4">
        <AgendaCard
          title="Open Work Orders"
          icon={<Wrench className="w-4 h-4" />}
          count={workOrders.length}
          empty="No open work orders at meeting time."
        >
          {workOrders.map((wo) => (
            <div key={wo.id} className="text-sm border-b border-border last:border-0 pb-2 last:pb-0">
              <div className="flex items-center gap-2">
                {wo.workOrderNumber && (
                  <span className="text-xs font-mono text-muted-foreground">#{wo.workOrderNumber}</span>
                )}
                {wo.priority && <StatusBadge value={wo.priority} />}
              </div>
              <p className="mt-1">{wo.title}</p>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                {wo.unitName && <span>Unit {wo.unitName}</span>}
                {wo.status && <StatusBadge value={wo.status} />}
                {wo.vendor && <span>· {wo.vendor}</span>}
              </div>
            </div>
          ))}
        </AgendaCard>

        <AgendaCard
          title="Vacancies"
          icon={<HomeIcon className="w-4 h-4" />}
          count={vacancies.length}
          empty="No vacant units."
        >
          {vacancies.map((v) => (
            <div key={v.unitId} className="text-sm border-b border-border last:border-0 pb-2 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="font-medium">Unit {v.unitName}</span>
                <StatusBadge value="vacant" />
              </div>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                {v.bedrooms != null && <span>{v.bedrooms}bd / {v.bathrooms ?? "—"}ba</span>}
                {v.rent && <span>${Number(v.rent).toLocaleString()}/mo</span>}
                {v.daysVacant != null && <span>{v.daysVacant}d vacant</span>}
              </div>
            </div>
          ))}
        </AgendaCard>

        <AgendaCard
          title="Carry-over from last meeting"
          icon={<ClipboardList className="w-4 h-4" />}
          count={carryOver.length}
          empty="No prior open action items."
        >
          {carryOver.map((c) => (
            <div key={c.id} className="text-sm border-b border-border last:border-0 pb-2 last:pb-0">
              <p className="font-medium">{c.title}</p>
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                <StatusBadge value={c.status} />
                {c.assignedTo && <span>Owner: {c.assignedTo}</span>}
                {c.dueDate && <span>Due: {c.dueDate}</span>}
              </div>
            </div>
          ))}
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
                      onPatch={(patch) => patchItem(it.id, patch)}
                      onDelete={() => removeItem(it.id)}
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
                      onPatch={(patch) => patchItem(it.id, patch)}
                      onDelete={() => removeItem(it.id)}
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
    </div>
  );
}

function AgendaCard({
  title,
  icon,
  count,
  empty,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {icon} {title}
        </h3>
        <span className="text-xs font-mono px-2 py-0.5 bg-muted rounded-full">{count}</span>
      </div>
      {count === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

function ActionItemRow({
  item,
  onPatch,
  onDelete,
}: {
  item: DbMeetingActionItem;
  onPatch: (patch: Partial<DbMeetingActionItem>) => void;
  onDelete: () => void;
}) {
  const toggleDone = () => {
    onPatch({ status: item.status === "completed" ? "open" : "completed" });
  };
  return (
    <div className="border border-border rounded-lg p-3 bg-background/50">
      <div className="flex items-start gap-3">
        <button onClick={toggleDone} className="mt-0.5" aria-label="Toggle complete">
          {item.status === "completed" ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : (
            <Circle className="w-5 h-5 text-muted-foreground" />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <input
            value={item.title}
            onChange={(e) => onPatch({ title: e.target.value })}
            className={`w-full text-sm font-medium bg-transparent border-none focus:outline-none focus:ring-0 px-0 ${
              item.status === "completed" ? "line-through text-muted-foreground" : ""
            }`}
          />
          {item.description && (
            <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <select
              value={item.status}
              onChange={(e) => onPatch({ status: e.target.value as ActionItemStatus })}
              className="text-xs border border-border rounded px-2 py-1 bg-card"
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <input
              type="text"
              value={item.assigned_to || ""}
              onChange={(e) => onPatch({ assigned_to: e.target.value || null })}
              placeholder="Assign to…"
              className="text-xs border border-border rounded px-2 py-1 bg-card w-32"
            />
            <input
              type="date"
              value={item.due_date || ""}
              onChange={(e) => onPatch({ due_date: e.target.value || null })}
              className="text-xs border border-border rounded px-2 py-1 bg-card"
            />
            <select
              value={item.priority || ""}
              onChange={(e) => onPatch({ priority: e.target.value || null })}
              className="text-xs border border-border rounded px-2 py-1 bg-card"
            >
              <option value="">Priority…</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            {item.source === "transcript" && (
              <span className="text-[10px] uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                AI
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-red-600"
          aria-label="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
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
