"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  List,
  Plus,
  Users,
  X,
} from "lucide-react";
import type { ShowingRegistration, ShowingSlot } from "@/lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDateHeading(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function capacityUsed(slot: ShowingSlot): number {
  return (slot.registrations ?? [])
    .filter((r) => r.status === "confirmed" || r.status === "attended")
    .reduce((s, r) => s + (r.partySize || 1), 0);
}

function groupByDate(slots: ShowingSlot[]): { date: string; slots: ShowingSlot[] }[] {
  const map = new Map<string, ShowingSlot[]>();
  for (const s of slots) {
    const date = s.startsAt.slice(0, 10);
    if (!map.has(date)) map.set(date, []);
    map.get(date)!.push(s);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, slots]) => ({ date, slots }));
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-green-100 text-green-800",
  attended: "bg-blue-100 text-blue-800",
  no_show: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-500",
  open: "bg-emerald-100 text-emerald-800",
  completed: "bg-slate-100 text-slate-600",
};

// ─── sub-components ─────────────────────────────────────────────────────────

function CapacityBar({ used, capacity }: { used: number; capacity: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(capacity, 1)) * 100));
  const color = pct >= 100 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`${color} h-full rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {used}/{capacity}
      </span>
    </div>
  );
}

function RegStatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ─── registration row ────────────────────────────────────────────────────────

function RegRow({
  reg,
  slotId,
  onStatus,
  onDelete,
  onGuestCard,
}: {
  reg: ShowingRegistration;
  slotId: string;
  onStatus: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onGuestCard: (id: string, guestCardId: string) => void;
}) {
  const [pushing, setPushing] = useState(false);

  const pushToAppFolio = async () => {
    setPushing(true);
    try {
      const res = await fetch("/api/showings/guest-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationId: reg.id, slotId }),
      });
      const j = await res.json();
      if (j.guestCardId) onGuestCard(reg.id, j.guestCardId);
    } finally {
      setPushing(false);
    }
  };

  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3">
        <p className="font-medium text-sm">{reg.prospectName}</p>
        {reg.prospectEmail && <p className="text-xs text-muted-foreground">{reg.prospectEmail}</p>}
        {reg.prospectPhone && <p className="text-xs text-muted-foreground">{reg.prospectPhone}</p>}
        {reg.guestCardId && (
          <p className="text-xs text-emerald-600 font-medium">AppFolio #{reg.guestCardId}</p>
        )}
      </td>
      <td className="py-2 pr-3 text-sm text-center">{reg.partySize}</td>
      <td className="py-2 pr-3">
        <RegStatusBadge status={reg.status} />
      </td>
      <td className="py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {!reg.guestCardId && (
            <button
              onClick={pushToAppFolio}
              disabled={pushing}
              title="Create guest card in AppFolio"
              className="text-xs px-2 py-0.5 rounded bg-purple-50 text-purple-700 hover:bg-purple-100 disabled:opacity-50"
            >
              {pushing ? "…" : "→AF"}
            </button>
          )}
          {reg.status === "confirmed" && (
            <>
              <button
                onClick={() => onStatus(reg.id, "attended")}
                className="text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 hover:bg-blue-100"
              >
                Attended
              </button>
              <button
                onClick={() => onStatus(reg.id, "no_show")}
                className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100"
              >
                No-show
              </button>
            </>
          )}
          <button
            onClick={() => onDelete(reg.id)}
            className="text-xs px-1.5 py-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── slot detail panel ───────────────────────────────────────────────────────

function SlotDetail({
  slot,
  onClose,
  onRefresh,
}: {
  slot: ShowingSlot;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [regs, setRegs] = useState<ShowingRegistration[]>(slot.registrations ?? []);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", email: "", phone: "", partySize: "1", notes: "", guestCardId: "" });
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${slot.publicToken}`
      : `/s/${slot.publicToken}`;

  const copyLink = () => {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/showings/registrations?id=${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setRegs((prev) => prev.map((r) => (r.id === id ? { ...r, status: status as ShowingRegistration["status"] } : r)));
    onRefresh();
  };

  const deleteReg = async (id: string) => {
    await fetch(`/api/showings/registrations?id=${id}`, { method: "DELETE" });
    setRegs((prev) => prev.filter((r) => r.id !== id));
    onRefresh();
  };

  const addManual = async () => {
    if (!addForm.name.trim()) return;
    const res = await fetch("/api/showings/registrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slotId: slot.id,
        prospectName: addForm.name,
        prospectEmail: addForm.email || undefined,
        prospectPhone: addForm.phone || undefined,
        partySize: parseInt(addForm.partySize) || 1,
        notes: addForm.notes || undefined,
        guestCardId: addForm.guestCardId || undefined,
        source: "manual",
      }),
    });
    const j = await res.json();
    if (j.registration) {
      setRegs((prev) => [...prev, j.registration]);
      setAddForm({ name: "", email: "", phone: "", partySize: "1", notes: "", guestCardId: "" });
      setAdding(false);
      onRefresh();
    }
  };

  const cancelSlot = async () => {
    if (!confirm("Cancel this showing slot? Registrants will not be automatically notified.")) return;
    setCancelling(true);
    await fetch("/api/showings/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...slot, status: "cancelled" }),
    });
    setCancelling(false);
    onRefresh();
    onClose();
  };

  const used = regs.filter((r) => r.status === "confirmed" || r.status === "attended").reduce((s, r) => s + (r.partySize || 1), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/30" onClick={onClose}>
      <div
        className="w-full max-w-lg h-full bg-background border-l border-border shadow-2xl overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div>
            {(slot.propertyName || slot.unitName) && (
              <p className="text-xs text-muted-foreground">
                {[slot.propertyName, slot.unitName].filter(Boolean).join(" – ")}
              </p>
            )}
            <h2 className="text-lg font-semibold mt-0.5">
              {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
            </h2>
            <p className="text-sm text-muted-foreground">{formatDateHeading(slot.startsAt)}</p>
            {slot.hostName && <p className="text-xs text-muted-foreground mt-1">Host: {slot.hostName}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* capacity + public link */}
        <div className="p-5 border-b border-border space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="font-medium">Capacity</span>
              <span className="text-muted-foreground">{used} / {slot.capacity} seats</span>
            </div>
            <CapacityBar used={used} capacity={slot.capacity} />
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 text-xs bg-muted rounded px-2 py-1.5 font-mono truncate text-muted-foreground">
              {publicUrl}
            </div>
            <button
              onClick={copyLink}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition"
            >
              {copied ? <Check className="w-3 h-3" /> : <ClipboardCopy className="w-3 h-3" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          {slot.publicDescription && (
            <p className="text-sm text-muted-foreground">{slot.publicDescription}</p>
          )}
        </div>

        {/* registrations */}
        <div className="flex-1 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Registrations ({regs.length})</h3>
            {slot.status === "open" && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-border hover:bg-muted"
              >
                <Plus className="w-3 h-3" /> Add manually
              </button>
            )}
          </div>

          {adding && (
            <div className="mb-4 p-3 rounded-lg border border-border bg-muted/30 space-y-2">
              <input
                className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
                placeholder="Prospect name *"
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="text-sm border border-border rounded px-2 py-1.5 bg-background"
                  placeholder="Email"
                  value={addForm.email}
                  onChange={(e) => setAddForm((f) => ({ ...f, email: e.target.value }))}
                />
                <input
                  className="text-sm border border-border rounded px-2 py-1.5 bg-background"
                  placeholder="Phone"
                  value={addForm.phone}
                  onChange={(e) => setAddForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  min="1"
                  className="text-sm border border-border rounded px-2 py-1.5 bg-background"
                  placeholder="Party size"
                  value={addForm.partySize}
                  onChange={(e) => setAddForm((f) => ({ ...f, partySize: e.target.value }))}
                />
                <input
                  className="text-sm border border-border rounded px-2 py-1.5 bg-background"
                  placeholder="Notes"
                  value={addForm.notes}
                  onChange={(e) => setAddForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <input
                className="text-sm border border-border rounded px-2 py-1.5 bg-background"
                placeholder="AppFolio Guest Card ID (optional)"
                value={addForm.guestCardId}
                onChange={(e) => setAddForm((f) => ({ ...f, guestCardId: e.target.value }))}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setAdding(false)}
                  className="text-xs px-3 py-1.5 rounded border border-border hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={addManual}
                  className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  Add
                </button>
              </div>
            </div>
          )}

          {regs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No registrations yet.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left text-xs text-muted-foreground pb-2 font-medium">Name</th>
                  <th className="text-center text-xs text-muted-foreground pb-2 font-medium">Party</th>
                  <th className="text-left text-xs text-muted-foreground pb-2 font-medium">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {regs.map((r) => (
                  <RegRow
                    key={r.id}
                    reg={r}
                    slotId={slot.id}
                    onStatus={updateStatus}
                    onDelete={deleteReg}
                    onGuestCard={(id, guestCardId) =>
                      setRegs((prev) => prev.map((x) => (x.id === id ? { ...x, guestCardId } : x)))
                    }
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* footer actions */}
        {slot.status === "open" && (
          <div className="p-5 border-t border-border">
            <button
              onClick={cancelSlot}
              disabled={cancelling}
              className="w-full text-sm py-2 rounded border border-destructive text-destructive hover:bg-destructive/10 transition disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel this slot"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── new slot form ───────────────────────────────────────────────────────────

type UnitOption = { id: string; unitName: string; propertyName: string };

const INITIAL_FORM = {
  date: "",
  startTime: "10:00",
  endTime: "12:00",
  capacity: "20",
  hostName: "",
  notes: "",
  publicDescription: "",
};

function NewSlotModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Property / unit dropdowns
  const [allUnits, setAllUnits] = useState<UnitOption[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [selectedProperty, setSelectedProperty] = useState("");
  const [selectedUnitId, setSelectedUnitId] = useState("");

  useEffect(() => {
    fetch("/api/appfolio/units")
      .then((r) => r.json())
      .then((d) =>
        setAllUnits(
          (d.units || []).map((u: any) => ({
            id: u.id,
            unitName: u.unitName,
            propertyName: u.propertyName,
          }))
        )
      )
      .catch(() => {})
      .finally(() => setLoadingUnits(false));
  }, []);

  const propertyOptions = useMemo(
    () => [...new Set(allUnits.map((u) => u.propertyName))].sort(),
    [allUnits]
  );

  const unitOptions = useMemo(
    () =>
      allUnits
        .filter((u) => u.propertyName === selectedProperty)
        .sort((a, b) => a.unitName.localeCompare(b.unitName)),
    [allUnits, selectedProperty]
  );

  const handlePropertyChange = (name: string) => {
    setSelectedProperty(name);
    setSelectedUnitId("");
  };

  const save = async () => {
    if (!form.date || !form.startTime || !form.endTime) {
      setError("Date, start time and end time are required.");
      return;
    }
    setSaving(true);
    setError("");
    const startsAt = new Date(`${form.date}T${form.startTime}:00`).toISOString();
    const endsAt = new Date(`${form.date}T${form.endTime}:00`).toISOString();
    const selectedUnit = allUnits.find((u) => u.id === selectedUnitId);
    const res = await fetch("/api/showings/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        propertyName: selectedProperty || undefined,
        unitId: selectedUnit?.id || undefined,
        unitName: selectedUnit?.unitName || undefined,
        startsAt,
        endsAt,
        capacity: parseInt(form.capacity) || 20,
        hostName: form.hostName || undefined,
        notes: form.notes || undefined,
        publicDescription: form.publicDescription || undefined,
      }),
    });
    const j = await res.json();
    setSaving(false);
    if (j.slot) {
      onCreated();
      onClose();
    } else {
      setError(j.error ?? "Failed to create slot");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md bg-background rounded-2xl border border-border shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold">New Showing Slot</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Property */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">Property</label>
            <div className="relative mt-1">
              <select
                className="w-full text-sm border border-border rounded px-3 py-2 bg-background appearance-none pr-8"
                value={selectedProperty}
                onChange={(e) => handlePropertyChange(e.target.value)}
                disabled={loadingUnits}
              >
                <option value="">{loadingUnits ? "Loading…" : "— Select property —"}</option>
                {propertyOptions.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>

          {/* Unit — only shown once a property is picked */}
          {selectedProperty && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">Unit</label>
              <div className="relative mt-1">
                <select
                  className="w-full text-sm border border-border rounded px-3 py-2 bg-background appearance-none pr-8"
                  value={selectedUnitId}
                  onChange={(e) => setSelectedUnitId(e.target.value)}
                >
                  <option value="">— All units / entire property —</option>
                  {unitOptions.map((u) => (
                    <option key={u.id} value={u.id}>{u.unitName}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground">Date *</label>
            <input
              type="date"
              className="mt-1 w-full text-sm border border-border rounded px-3 py-2 bg-background"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Start time *</label>
              <input
                type="time"
                className="mt-1 w-full text-sm border border-border rounded px-3 py-2 bg-background"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">End time *</label>
              <input
                type="time"
                className="mt-1 w-full text-sm border border-border rounded px-3 py-2 bg-background"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Capacity (seats)</label>
              <input
                type="number"
                min="1"
                className="mt-1 w-full text-sm border border-border rounded px-3 py-2 bg-background"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Host name</label>
              <input
                className="mt-1 w-full text-sm border border-border rounded px-3 py-2 bg-background"
                placeholder="e.g. Deniz"
                value={form.hostName}
                onChange={(e) => setForm((f) => ({ ...f, hostName: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Public description</label>
            <textarea
              rows={2}
              className="mt-1 w-full text-sm border border-border rounded px-3 py-2 bg-background resize-none"
              placeholder="What prospects will see on the sign-up page"
              value={form.publicDescription}
              onChange={(e) => setForm((f) => ({ ...f, publicDescription: e.target.value }))}
            />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground">Internal notes</label>
            <input
              className="mt-1 w-full text-sm border border-border rounded px-3 py-2 bg-background"
              placeholder="For the team only"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="text-sm px-4 py-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create slot"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── slot card ───────────────────────────────────────────────────────────────

function SlotCard({ slot, onClick }: { slot: ShowingSlot; onClick: () => void }) {
  const used = capacityUsed(slot);
  const regCount = (slot.registrations ?? []).length;
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-4 bg-card border border-border rounded-xl hover:shadow-md hover:border-primary/40 transition group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">
              {formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[slot.status] ?? "bg-muted text-muted-foreground"}`}
            >
              {slot.status}
            </span>
          </div>
          {(slot.propertyName || slot.unitName) && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {[slot.propertyName, slot.unitName].filter(Boolean).join(" – ")}
            </p>
          )}
          {slot.hostName && (
            <p className="text-xs text-muted-foreground">Host: {slot.hostName}</p>
          )}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground group-hover:text-foreground">
          <Users className="w-3.5 h-3.5" />
          <span className="text-xs">{regCount}</span>
          <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      </div>
      <div className="mt-3">
        <CapacityBar used={used} capacity={slot.capacity} />
      </div>
    </button>
  );
}

// ─── week view ───────────────────────────────────────────────────────────────

const WEEK_START_HOUR = 7;  // 7am
const WEEK_END_HOUR = 21;   // 9pm
const HOUR_PX = 64;

function weekStartDate(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - dow);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function WeekView({ slots, onOpenSlot, weekOf, onWeekChange }: {
  slots: ShowingSlot[];
  onOpenSlot: (s: ShowingSlot) => void;
  weekOf: Date;
  onWeekChange: (d: Date) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekOf, i));
  const hours = Array.from({ length: WEEK_END_HOUR - WEEK_START_HOUR }, (_, i) => WEEK_START_HOUR + i);
  const todayStr = new Date().toISOString().slice(0, 10);

  function slotStyle(slot: ShowingSlot): React.CSSProperties {
    const start = new Date(slot.startsAt);
    const end = new Date(slot.endsAt);
    const startMins = (start.getHours() - WEEK_START_HOUR) * 60 + start.getMinutes();
    const durationMins = (end.getTime() - start.getTime()) / 60000;
    return {
      top: `${(startMins / 60) * HOUR_PX}px`,
      height: `${Math.max((durationMins / 60) * HOUR_PX, 24)}px`,
    };
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* week nav */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={() => onWeekChange(addDays(weekOf, -7))} className="p-1 rounded hover:bg-muted">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-medium flex-1 text-center">
          {days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} –{" "}
          {days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </span>
        <button onClick={() => onWeekChange(weekStartDate(new Date()))} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Today</button>
        <button onClick={() => onWeekChange(addDays(weekOf, 7))} className="p-1 rounded hover:bg-muted">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* day headers */}
      <div className="flex border-b border-border">
        <div className="w-14 shrink-0" />
        {days.map((day) => {
          const iso = day.toISOString().slice(0, 10);
          const isToday = iso === todayStr;
          return (
            <div key={iso} className={`flex-1 text-center py-2 text-xs font-medium ${isToday ? "text-primary" : "text-muted-foreground"}`}>
              <div>{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
              <div className={`mt-0.5 w-6 h-6 mx-auto rounded-full flex items-center justify-center text-xs font-semibold ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* time grid */}
      <div className="flex overflow-y-auto" style={{ maxHeight: `${HOUR_PX * 12}px` }}>
        {/* hour labels */}
        <div className="w-14 shrink-0 border-r border-border">
          {hours.map((h) => (
            <div key={h} className="text-right pr-2 text-[10px] text-muted-foreground" style={{ height: `${HOUR_PX}px`, paddingTop: "2px" }}>
              {h % 12 === 0 ? 12 : h % 12}{h < 12 ? "am" : "pm"}
            </div>
          ))}
        </div>

        {/* day columns */}
        {days.map((day) => {
          const iso = day.toISOString().slice(0, 10);
          const daySlots = slots.filter((s) => s.startsAt.slice(0, 10) === iso && s.status !== "cancelled");
          return (
            <div key={iso} className="flex-1 relative border-r border-border last:border-r-0">
              {/* hour lines */}
              {hours.map((h) => (
                <div key={h} className="border-b border-border/50" style={{ height: `${HOUR_PX}px` }} />
              ))}
              {/* slot blocks */}
              {daySlots.map((slot) => {
                const used = capacityUsed(slot);
                return (
                  <button
                    key={slot.id}
                    onClick={() => onOpenSlot(slot)}
                    style={{ ...slotStyle(slot), position: "absolute", left: "2px", right: "2px" }}
                    className="bg-purple-100 border border-purple-300 rounded text-left px-1 py-0.5 hover:bg-purple-200 transition overflow-hidden"
                  >
                    <p className="text-[10px] font-semibold text-purple-900 leading-tight truncate">
                      {[slot.propertyName, slot.unitName].filter(Boolean).join(" – ") || "Open house"}
                    </p>
                    <p className="text-[9px] text-purple-700">
                      {formatTime(slot.startsAt)} · {used}/{slot.capacity}
                    </p>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── month view ───────────────────────────────────────────────────────────────

function MonthView({ slots, onOpenSlot, monthOf, onMonthChange }: {
  slots: ShowingSlot[];
  onOpenSlot: (s: ShowingSlot) => void;
  monthOf: Date;
  onMonthChange: (d: Date) => void;
}) {
  const year = monthOf.getFullYear();
  const month = monthOf.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  const cells: { date: string; current: boolean }[] = [];
  const prevTotal = new Date(year, month, 0).getDate();
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ date: new Date(year, month - 1, prevTotal - i).toISOString().slice(0, 10), current: false });
  }
  for (let i = 1; i <= totalDays; i++) {
    cells.push({ date: new Date(year, month, i).toISOString().slice(0, 10), current: true });
  }
  while (cells.length < 42) {
    cells.push({ date: new Date(year, month + 1, cells.length - firstDow - totalDays + 1).toISOString().slice(0, 10), current: false });
  }

  const byDate = new Map<string, ShowingSlot[]>();
  for (const s of slots) {
    if (s.status === "cancelled") continue;
    const d = s.startsAt.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(s);
  }

  const prevMonth = () => { const d = new Date(year, month - 1, 1); onMonthChange(d); };
  const nextMonth = () => { const d = new Date(year, month + 1, 1); onMonthChange(d); };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button onClick={prevMonth} className="p-1 rounded hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
        <span className="flex-1 text-center text-sm font-medium">
          {monthOf.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => onMonthChange(new Date(new Date().setDate(1)))} className="text-xs px-2 py-1 rounded border border-border hover:bg-muted">Today</button>
        <button onClick={nextMonth} className="p-1 rounded hover:bg-muted"><ChevronRight className="w-4 h-4" /></button>
      </div>

      <div className="grid grid-cols-7 border-b border-border">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell, i) => {
          const daySlots = byDate.get(cell.date) ?? [];
          const isToday = cell.date === todayStr;
          return (
            <div key={i} className={`min-h-[80px] p-1 border-b border-r border-border ${!cell.current ? "opacity-40" : ""}`}>
              <span className={`text-xs font-medium inline-flex items-center justify-center w-5 h-5 rounded-full mb-1 ${isToday ? "bg-primary text-primary-foreground" : ""}`}>
                {new Date(cell.date + "T12:00:00").getDate()}
              </span>
              {daySlots.slice(0, 3).map((s) => (
                <button
                  key={s.id}
                  onClick={() => onOpenSlot(s)}
                  className="w-full text-left text-[10px] px-1 py-0.5 mb-0.5 rounded bg-purple-100 text-purple-800 hover:bg-purple-200 truncate font-medium"
                >
                  {formatTime(s.startsAt)} {[s.propertyName, s.unitName].filter(Boolean).join(" – ") || "Showing"}
                </button>
              ))}
              {daySlots.length > 3 && (
                <span className="text-[10px] text-muted-foreground px-1">+{daySlots.length - 3} more</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

type ViewMode = "week" | "month" | "list";

export default function ShowingsPage() {
  const [slots, setSlots] = useState<ShowingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPast, setShowPast] = useState(false);
  const [newSlotOpen, setNewSlotOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<ShowingSlot | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [weekOf, setWeekOf] = useState(() => weekStartDate(new Date()));
  const [monthOf, setMonthOf] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/showings/slots?include_regs=1");
      const j = await res.json();
      setSlots(Array.isArray(j.slots) ? j.slots : []);
    } catch {
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date().toISOString();
  const upcomingSlots = slots.filter((s) => s.endsAt >= now || s.status === "open");
  const pastSlots = slots.filter((s) => s.endsAt < now && s.status !== "open");
  const visibleSlots = showPast ? slots : upcomingSlots;
  const groups = groupByDate(visibleSlots);

  const openSlot = async (slot: ShowingSlot) => {
    const res = await fetch(`/api/showings/slots?id=${slot.id}`);
    const j = await res.json();
    setSelectedSlot(j.slot ?? slot);
  };

  return (
    <div className="space-y-6">
      {/* header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Showings</h1>
          <p className="text-muted-foreground mt-1">
            Schedule open-house blocks and share sign-up links with prospects.
          </p>
          <a
            href="/api/showings/calendar"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-1"
          >
            <CalendarDays className="w-3 h-3" />
            Subscribe to calendar (.ics)
          </a>
        </div>
        <div className="flex items-center gap-2">
          {/* view toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden text-sm">
            {(["week", "month", "list"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 capitalize ${viewMode === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                {v === "list" ? <List className="w-4 h-4" /> : v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setNewSlotOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            New slot
          </button>
        </div>
      </div>

      {/* stats bar */}
      {!loading && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Upcoming slots</p>
            <p className="text-3xl font-bold mt-1">{upcomingSlots.filter((s) => s.status === "open").length}</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Total sign-ups</p>
            <p className="text-3xl font-bold mt-1">
              {upcomingSlots.flatMap((s) => s.registrations ?? []).filter((r) => r.status === "confirmed" || r.status === "attended").length}
            </p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground">Past showings</p>
            <p className="text-3xl font-bold mt-1">{pastSlots.length}</p>
          </div>
        </div>
      )}

      {/* views */}
      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <CalendarDays className="w-6 h-6 mr-2 animate-pulse" />
          Loading…
        </div>
      ) : viewMode === "week" ? (
        <WeekView slots={slots} onOpenSlot={openSlot} weekOf={weekOf} onWeekChange={setWeekOf} />
      ) : viewMode === "month" ? (
        <MonthView slots={slots} onOpenSlot={openSlot} monthOf={monthOf} onMonthChange={setMonthOf} />
      ) : groups.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <CalendarDays className="w-8 h-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No upcoming showing slots.</p>
          <button onClick={() => setNewSlotOpen(true)} className="mt-3 text-sm text-primary hover:underline">
            Create your first slot →
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ date, slots: daySlots }) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                {formatDateHeading(date + "T12:00:00")}
              </h2>
              <div className="space-y-2">
                {daySlots.map((slot) => (
                  <SlotCard key={slot.id} slot={slot} onClick={() => openSlot(slot)} />
                ))}
              </div>
            </div>
          ))}
          {pastSlots.length > 0 && (
            <button
              onClick={() => setShowPast((v) => !v)}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${showPast ? "rotate-180" : ""}`} />
              {showPast ? "Hide" : "Show"} {pastSlots.length} past slot{pastSlots.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      )}

      {/* modals */}
      {newSlotOpen && (
        <NewSlotModal onClose={() => setNewSlotOpen(false)} onCreated={load} />
      )}
      {selectedSlot && (
        <SlotDetail
          slot={selectedSlot}
          onClose={() => setSelectedSlot(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
