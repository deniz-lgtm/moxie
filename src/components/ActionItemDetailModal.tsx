"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  MessageSquare,
  Paperclip,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  ActionItemStatus,
  DbActionItemComment,
  DbMeetingActionItem,
} from "@/lib/supabase";
import type { MaintenanceRequest, Unit } from "@/lib/types";

type Props = {
  item: DbMeetingActionItem;
  units: Unit[];
  workOrders: MaintenanceRequest[];
  attendees: string[];
  onClose: () => void;
  onChange: (item: DbMeetingActionItem) => void;
  onDelete: () => void;
};

function fmtDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtBytes(n?: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function ActionItemDetailModal({
  item: initial,
  units,
  workOrders,
  attendees,
  onClose,
  onChange,
  onDelete,
}: Props) {
  const datalistId = `attendees-${initial.id}`;
  const [item, setItem] = useState<DbMeetingActionItem>(initial);
  const [titleDraft, setTitleDraft] = useState(initial.title);
  const [descDraft, setDescDraft] = useState(initial.description || "");
  const [commentDraft, setCommentDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setItem(initial);
    setTitleDraft(initial.title);
    setDescDraft(initial.description || "");
  }, [initial]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      const r = await fetch(
        `/api/meetings/action-items?id=${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const j = await r.json();
      if (j.item) {
        setItem(j.item);
        onChange(j.item);
      }
      return j.item as DbMeetingActionItem | undefined;
    },
    [item.id, onChange]
  );

  const toggleDone = async () => {
    const next: ActionItemStatus = item.status === "completed" ? "open" : "completed";
    // optimistic
    setItem((prev) => ({ ...prev, status: next }));
    await patch({ status: next });
  };

  const saveTitle = async () => {
    if (titleDraft === item.title) return;
    setSavingTitle(true);
    try {
      await patch({ title: titleDraft });
    } finally {
      setSavingTitle(false);
    }
  };

  const saveDesc = async () => {
    if (descDraft === (item.description || "")) return;
    setSavingDesc(true);
    try {
      await patch({ description: descDraft });
    } finally {
      setSavingDesc(false);
    }
  };

  const addComment = async () => {
    const text = commentDraft.trim();
    if (!text) return;
    setCommentDraft("");
    await patch({ appendComment: { text } });
  };

  const removeComment = async (commentId: string) => {
    if (!confirm("Delete this comment?")) return;
    await patch({ deleteCommentId: commentId });
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const r = await fetch("/api/meetings/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.id,
          name: file.name,
          content_type: file.type || "application/octet-stream",
          size: file.size,
          data_url: dataUrl,
        }),
      });
      const j = await r.json();
      if (j.item) {
        setItem(j.item);
        onChange(j.item);
      } else if (j.error) {
        alert(`Upload failed: ${j.error}`);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = async (attachmentId: string) => {
    if (!confirm("Remove this attachment?")) return;
    const r = await fetch(
      `/api/meetings/attachments?item_id=${encodeURIComponent(
        item.id
      )}&attachment_id=${encodeURIComponent(attachmentId)}`,
      { method: "DELETE" }
    );
    const j = await r.json();
    if (j.item) {
      setItem(j.item);
      onChange(j.item);
    }
  };

  const linkedWorkOrder = workOrders.find((w) => w.id === item.linked_work_order_id) || null;
  const linkedUnit = units.find((u) => u.id === item.linked_unit_id) || null;

  const openWorkOrders = workOrders.filter(
    (w) =>
      w.status !== "completed" &&
      w.status !== "closed" || w.id === item.linked_work_order_id
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card rounded-xl border border-border w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-border flex items-start gap-3">
          <button
            onClick={toggleDone}
            className="mt-1 shrink-0"
            aria-label="Toggle complete"
          >
            {item.status === "completed" ? (
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            ) : (
              <Circle className="w-6 h-6 text-muted-foreground" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <textarea
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              rows={1}
              className={`w-full resize-none bg-transparent text-lg font-semibold border-none focus:outline-none focus:ring-0 px-0 ${
                item.status === "completed" ? "line-through text-muted-foreground" : ""
              }`}
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
              <StatusBadge value={item.status} />
              {item.source === "transcript" && (
                <span className="text-[10px] uppercase tracking-wide text-indigo-700 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5">
                  AI-extracted
                </span>
              )}
              {item.priority && <span className="capitalize">Priority: {item.priority}</span>}
              {savingTitle && <span>Saving…</span>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Fields grid */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Status">
              <select
                value={item.status}
                onChange={(e) => patch({ status: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </Field>
            <Field label="Priority">
              <select
                value={item.priority || ""}
                onChange={(e) => patch({ priority: e.target.value || null })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">—</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </Field>
            <Field label="Assigned to">
              <input
                type="text"
                list={attendees.length > 0 ? datalistId : undefined}
                value={item.assigned_to || ""}
                onChange={(e) => setItem({ ...item, assigned_to: e.target.value })}
                onBlur={(e) =>
                  e.target.value !== (initial.assigned_to || "") &&
                  patch({ assigned_to: e.target.value || null })
                }
                placeholder={
                  attendees.length > 0
                    ? "Pick an attendee or type a name"
                    : "Person or team"
                }
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
              {attendees.length > 0 && (
                <datalist id={datalistId}>
                  {attendees.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              )}
            </Field>
            <Field label="Due date">
              <input
                type="date"
                value={item.due_date || ""}
                onChange={(e) => patch({ due_date: e.target.value || null })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </Field>
          </div>

          {/* Description */}
          <div>
            <Label>Description</Label>
            <textarea
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={saveDesc}
              placeholder="Add context, acceptance criteria, next steps…"
              rows={4}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            {savingDesc && <p className="text-xs text-muted-foreground mt-1">Saving…</p>}
          </div>

          {/* Links */}
          <div className="space-y-3">
            <Label>Links</Label>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Work order</label>
                <select
                  value={item.linked_work_order_id || ""}
                  onChange={(e) => patch({ linked_work_order_id: e.target.value || null })}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                >
                  <option value="">None</option>
                  {openWorkOrders.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.appfolioWorkOrderId ? `#${w.appfolioWorkOrderId} · ` : ""}
                      {w.title || w.description?.slice(0, 60) || "Work order"}
                      {w.unitNumber ? ` (${w.unitNumber})` : ""}
                    </option>
                  ))}
                </select>
                {linkedWorkOrder && (
                  <div className="mt-2 text-xs bg-muted rounded-lg p-2 flex items-start gap-2">
                    <Wrench className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{linkedWorkOrder.title}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <StatusBadge value={linkedWorkOrder.status} />
                        {linkedWorkOrder.priority && (
                          <StatusBadge value={linkedWorkOrder.priority} />
                        )}
                        {linkedWorkOrder.vendor && <span>· {linkedWorkOrder.vendor}</span>}
                      </div>
                    </div>
                    <a
                      href="/maintenance"
                      className="shrink-0 text-accent hover:underline inline-flex items-center gap-0.5"
                    >
                      Open <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Unit</label>
                <select
                  value={item.linked_unit_id || ""}
                  onChange={(e) => patch({ linked_unit_id: e.target.value || null })}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                >
                  <option value="">None</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unitName || u.number} {u.status === "vacant" ? "· vacant" : ""}
                    </option>
                  ))}
                </select>
                {linkedUnit && (
                  <div className="mt-2 text-xs bg-muted rounded-lg p-2">
                    <p className="font-medium">Unit {linkedUnit.unitName || linkedUnit.number}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap text-muted-foreground">
                      <StatusBadge
                        value={linkedUnit.status === "current" ? "occupied" : linkedUnit.status}
                      />
                      {linkedUnit.tenant && <span>· {linkedUnit.tenant}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>
                <Paperclip className="w-4 h-4 inline mr-1" />
                Attachments ({(item.attachments || []).length})
              </Label>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="text-sm text-accent hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
                    </>
                  ) : (
                    <>+ Upload file</>
                  )}
                </button>
              </div>
            </div>
            {(item.attachments || []).length === 0 ? (
              <p className="text-xs text-muted-foreground">No attachments yet.</p>
            ) : (
              <ul className="space-y-1">
                {item.attachments.map((att) => (
                  <li
                    key={att.id}
                    className="flex items-center justify-between gap-3 text-sm border border-border rounded-lg px-3 py-2 bg-background/50"
                  >
                    <a
                      href={att.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-accent hover:underline truncate flex-1 min-w-0"
                    >
                      {att.name}
                    </a>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {fmtBytes(att.size)}
                    </span>
                    <button
                      onClick={() => removeAttachment(att.id)}
                      className="text-muted-foreground hover:text-red-600 shrink-0"
                      aria-label="Delete attachment"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Comments */}
          <div className="space-y-2">
            <Label>
              <MessageSquare className="w-4 h-4 inline mr-1" />
              Activity ({(item.comments || []).length})
            </Label>
            <div className="space-y-2">
              {(item.comments || []).length === 0 ? (
                <p className="text-xs text-muted-foreground">No comments yet.</p>
              ) : (
                <ul className="space-y-2">
                  {[...item.comments]
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((c) => (
                      <CommentRow key={c.id} comment={c} onDelete={() => removeComment(c.id)} />
                    ))}
                </ul>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={commentDraft}
                onChange={(e) => setCommentDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    addComment();
                  }
                }}
                placeholder="Add a comment…"
                className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
              <button
                onClick={addComment}
                disabled={!commentDraft.trim()}
                className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent/90 disabled:opacity-50"
              >
                Post
              </button>
            </div>
          </div>

          {/* Metadata */}
          <div className="text-xs text-muted-foreground pt-2 border-t border-border">
            Created {fmtDateTime(item.created_at)}
            {item.completed_at && <span> · Completed {fmtDateTime(item.completed_at)}</span>}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border flex items-center justify-between">
          <button
            onClick={onDelete}
            className="text-sm text-red-600 hover:text-red-700 inline-flex items-center gap-1"
          >
            <Trash2 className="w-4 h-4" /> Delete task
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-border hover:bg-muted"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-sm font-semibold block mb-1">{children}</label>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}

function CommentRow({
  comment,
  onDelete,
}: {
  comment: DbActionItemComment;
  onDelete: () => void;
}) {
  return (
    <li className="text-sm border border-border rounded-lg px-3 py-2 bg-background/50">
      <div className="flex items-start justify-between gap-3">
        <p className="whitespace-pre-wrap flex-1">{comment.text}</p>
        <button
          onClick={onDelete}
          className="text-muted-foreground hover:text-red-600 shrink-0"
          aria-label="Delete comment"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
        {comment.author && <span>{comment.author}</span>}
        <span>{fmtDateTime(comment.created_at)}</span>
      </div>
    </li>
  );
}
