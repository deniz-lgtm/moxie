"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { Property, Unit } from "@/lib/types";

type NoticeType = "violation" | "rent_reminder" | "building_announcement" | "lease_renewal" | "maintenance_notice";
type NoticeStatus = "draft" | "sent" | "delivered" | "acknowledged";
type DeliveryMethod = "email" | "sms" | "portal" | "mail";

type Notice = {
  id: string;
  type: NoticeType;
  status: NoticeStatus;
  subject: string;
  body: string;
  recipientType: "individual" | "property" | "all";
  propertyId: string;
  propertyName: string;
  unitNumber: string;
  tenantName: string;
  deliveryMethod: DeliveryMethod;
  createdAt: string;
  sentAt: string;
};

const NOTICE_TYPES: { value: NoticeType; label: string }[] = [
  { value: "violation", label: "Lease Violation" },
  { value: "rent_reminder", label: "Rent Reminder" },
  { value: "building_announcement", label: "Building Announcement" },
  { value: "lease_renewal", label: "Lease Renewal" },
  { value: "maintenance_notice", label: "Maintenance Notice" },
];

export default function NoticesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selected, setSelected] = useState<Notice | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  const [newNotice, setNewNotice] = useState({
    type: "building_announcement" as NoticeType,
    subject: "",
    body: "",
    propertyId: "",
    unitNumber: "",
    deliveryMethod: "email" as DeliveryMethod,
  });

  useEffect(() => {
    Promise.all([
      fetch("/api/appfolio/properties").then((r) => r.json()),
      fetch("/api/appfolio/units").then((r) => r.json()),
    ])
      .then(([propData, unitData]) => {
        setProperties(propData.properties || []);
        setUnits(unitData.units || []);
        if (propData.properties?.length > 0) {
          setNewNotice((n) => ({ ...n, propertyId: propData.properties[0].id }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = notices.filter((n) => {
    if (filterType !== "all" && n.type !== filterType) return false;
    return true;
  });

  const propertyUnits = units.filter((u) => u.propertyId === newNotice.propertyId && u.status === "current");

  function createNotice() {
    if (!newNotice.subject.trim()) return;
    const property = properties.find((p) => p.id === newNotice.propertyId);
    const unit = propertyUnits.find((u) => u.number === newNotice.unitNumber);

    const notice: Notice = {
      id: `notice-${Date.now()}`,
      type: newNotice.type,
      status: "draft",
      subject: newNotice.subject,
      body: newNotice.body,
      recipientType: newNotice.unitNumber ? "individual" : "property",
      propertyId: newNotice.propertyId,
      propertyName: property?.name || "",
      unitNumber: newNotice.unitNumber,
      tenantName: unit?.tenant || "",
      deliveryMethod: newNotice.deliveryMethod,
      createdAt: new Date().toISOString(),
      sentAt: "",
    };
    setNotices((prev) => [notice, ...prev]);
    setShowCreateForm(false);
    setNewNotice({ type: "building_announcement", subject: "", body: "", propertyId: properties[0]?.id || "", unitNumber: "", deliveryMethod: "email" });
  }

  function sendNotice(id: string) {
    setNotices((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, status: "sent" as NoticeStatus, sentAt: new Date().toISOString() } : n
      )
    );
    if (selected?.id === id) {
      setSelected({ ...selected, status: "sent", sentAt: new Date().toISOString() });
    }
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Notices
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selected.subject}</h1>
            <p className="text-muted-foreground mt-1 capitalize">
              {NOTICE_TYPES.find((t) => t.value === selected.type)?.label} &middot; {selected.propertyName}
              {selected.unitNumber && ` #${selected.unitNumber}`}
            </p>
          </div>
          <StatusBadge value={selected.status} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-3">Details</h2>
            <div className="space-y-2 text-sm">
              <p><span className="text-muted-foreground">Recipient:</span> {selected.tenantName || `All tenants at ${selected.propertyName}`}</p>
              <p><span className="text-muted-foreground">Delivery:</span> <span className="capitalize">{selected.deliveryMethod}</span></p>
              <p><span className="text-muted-foreground">Created:</span> {new Date(selected.createdAt).toLocaleString()}</p>
              {selected.sentAt && <p><span className="text-muted-foreground">Sent:</span> {new Date(selected.sentAt).toLocaleString()}</p>}
            </div>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="font-semibold mb-3">Message</h2>
          <p className="text-sm whitespace-pre-wrap">{selected.body || "No message body."}</p>
        </div>

        {selected.status === "draft" && (
          <button
            onClick={() => sendNotice(selected.id)}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Send Notice
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tenant Notices</h1>
          <p className="text-muted-foreground mt-1">
            Draft and send violations, reminders, and announcements
          </p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ New Notice"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Create Notice</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Notice Type</label>
              <select
                value={newNotice.type}
                onChange={(e) => setNewNotice({ ...newNotice, type: e.target.value as NoticeType })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {NOTICE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Property</label>
              <select
                value={newNotice.propertyId}
                onChange={(e) => setNewNotice({ ...newNotice, propertyId: e.target.value, unitNumber: "" })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Unit (optional — leave blank for all)</label>
              <select
                value={newNotice.unitNumber}
                onChange={(e) => setNewNotice({ ...newNotice, unitNumber: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">All Units</option>
                {propertyUnits.map((u) => (
                  <option key={u.id} value={u.number}>#{u.number} — {u.tenant || "Vacant"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Delivery</label>
              <select
                value={newNotice.deliveryMethod}
                onChange={(e) => setNewNotice({ ...newNotice, deliveryMethod: e.target.value as DeliveryMethod })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="email">Email</option>
                <option value="sms">SMS</option>
                <option value="portal">Portal</option>
                <option value="mail">Physical Mail</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Subject *</label>
            <input
              type="text"
              value={newNotice.subject}
              onChange={(e) => setNewNotice({ ...newNotice, subject: e.target.value })}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Message</label>
            <textarea
              value={newNotice.body}
              onChange={(e) => setNewNotice({ ...newNotice, body: e.target.value })}
              rows={4}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={createNotice}
              className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
            >
              Save as Draft
            </button>
            <button
              onClick={() => {
                createNotice();
                // Send immediately after creating
                setTimeout(() => {
                  setNotices((prev) => {
                    if (prev.length > 0 && prev[0].status === "draft") {
                      return [{ ...prev[0], status: "sent" as NoticeStatus, sentAt: new Date().toISOString() }, ...prev.slice(1)];
                    }
                    return prev;
                  });
                }, 100);
              }}
              className="px-4 py-2 bg-card border border-border text-sm rounded-lg hover:bg-muted transition-colors"
            >
              Save & Send
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Types</option>
          {NOTICE_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {filtered.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelected(n)}
                className="w-full text-left p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium">{n.subject}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {NOTICE_TYPES.find((t) => t.value === n.type)?.label} · {n.propertyName}
                      {n.unitNumber && ` #${n.unitNumber}`}
                      {n.tenantName && ` · ${n.tenantName}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleDateString()}
                    </span>
                    <StatusBadge value={n.status} />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          No notices yet. Click &quot;+ New Notice&quot; to draft a tenant communication.
        </div>
      )}
    </div>
  );
}
