"use client";

import { useState, useEffect } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import type { TourSlot, TourRegistrationStatus, Unit } from "@/lib/types";

export default function ToursPage() {
  const [allTours, setAllTours] = useState<TourSlot[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selected, setSelected] = useState<TourSlot | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTour, setNewTour] = useState({
    propertyName: "",
    date: "",
    startTime: "10:00",
    endTime: "12:00",
    host: "",
    capacity: 10,
    notes: "",
  });

  useEffect(() => {
    fetch("/api/appfolio/units")
      .then((res) => res.json())
      .then((data) => {
        setUnits(data.units || []);
      })
      .catch(() => {});
  }, []);

  // Get unique property names from units for location options
  const propertyNames = [...new Set(units.map((u) => u.propertyName).filter(Boolean))];

  function createTour() {
    if (!newTour.propertyName || !newTour.date) return;

    const tour: TourSlot = {
      id: `tour-${Date.now()}`,
      propertyId: "",
      propertyName: newTour.propertyName,
      date: newTour.date,
      startTime: newTour.startTime,
      endTime: newTour.endTime,
      host: newTour.host || "TBD",
      capacity: newTour.capacity,
      registrations: [],
      preReminderStatus: "not_set",
      postFollowUpStatus: "not_set",
      notes: newTour.notes,
      createdAt: new Date().toISOString(),
    };
    setAllTours((prev) => [tour, ...prev]);
    setShowCreateForm(false);
    setNewTour({ propertyName: "", date: "", startTime: "10:00", endTime: "12:00", host: "", capacity: 10, notes: "" });
  }

  const today = new Date().toISOString().split("T")[0];
  const upcoming = allTours.filter((t) => t.date >= today);
  const past = allTours.filter((t) => t.date < today);

  function updateRegistrationStatus(regId: string, status: TourRegistrationStatus) {
    if (!selected) return;
    const updated: TourSlot = {
      ...selected,
      registrations: selected.registrations.map((r) =>
        r.id === regId ? { ...r, status } : r
      ),
    };
    setSelected(updated);
    setAllTours((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  function toggleFollowUp(regId: string) {
    if (!selected) return;
    const updated: TourSlot = {
      ...selected,
      registrations: selected.registrations.map((r) =>
        r.id === regId ? { ...r, followUpSent: !r.followUpSent } : r
      ),
    };
    setSelected(updated);
    setAllTours((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  }

  if (selected) {
    const confirmed = selected.registrations.filter((r) => r.status === "confirmed").length;
    const pending = selected.registrations.filter((r) => r.status === "pending").length;
    const attended = selected.registrations.filter((r) => r.status === "attended").length;
    const noShow = selected.registrations.filter((r) => r.status === "no_show").length;
    const spotsLeft = selected.capacity - selected.registrations.filter(
      (r) => r.status !== "cancelled" && r.status !== "rescheduled"
    ).length;
    const isPast = selected.date < today;

    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Tours
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{selected.propertyName} — Open House</h1>
            <p className="text-muted-foreground mt-1">
              {selected.date} · {selected.startTime} – {selected.endTime} · Host: {selected.host}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isPast ? (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Past</span>
            ) : (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">Upcoming</span>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Registered</p>
            <p className="text-2xl font-bold mt-1">{selected.registrations.length}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Confirmed</p>
            <p className="text-2xl font-bold mt-1 text-green-600">{confirmed}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold mt-1 text-yellow-600">{pending}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">{isPast ? "Attended" : "Spots Left"}</p>
            <p className="text-2xl font-bold mt-1">{isPast ? attended : spotsLeft}</p>
          </div>
          <div className="bg-card rounded-xl border border-border p-4">
            <p className="text-sm text-muted-foreground">{isPast ? "No-Shows" : "Capacity"}</p>
            <p className={`text-2xl font-bold mt-1 ${isPast && noShow > 0 ? "text-red-600" : ""}`}>
              {isPast ? noShow : selected.capacity}
            </p>
          </div>
        </div>

        {/* Automation Status */}
        <div className="bg-card rounded-xl border border-border p-5 grid md:grid-cols-2 gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Pre-Tour Reminder</p>
              <p className="text-xs text-muted-foreground">Sent day before tour via email & SMS</p>
            </div>
            <StatusBadge value={selected.preReminderStatus === "not_set" ? "pending" : selected.preReminderStatus} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Post-Tour Follow-Up</p>
              <p className="text-xs text-muted-foreground">Application link sent to attendees</p>
            </div>
            <StatusBadge value={selected.postFollowUpStatus === "not_set" ? "pending" : selected.postFollowUpStatus} />
          </div>
        </div>

        {/* Registrations */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold">Registrations ({selected.registrations.length})</h2>
          </div>
          {selected.registrations.length > 0 ? (
            <div className="divide-y divide-border">
              {selected.registrations.map((reg) => (
                <div key={reg.id} className="p-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{reg.prospectName}</p>
                    <p className="text-xs text-muted-foreground">
                      {reg.prospectEmail}
                      {reg.prospectPhone && ` · ${reg.prospectPhone}`}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Source: {reg.source || "Unknown"} · Registered: {new Date(reg.registeredAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      value={reg.status}
                      onChange={(e) => updateRegistrationStatus(reg.id, e.target.value as TourRegistrationStatus)}
                      className="text-xs border border-border rounded-md px-2 py-1.5 bg-card"
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="attended">Attended</option>
                      <option value="no_show">No Show</option>
                      <option value="rescheduled">Rescheduled</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                    <button
                      onClick={() => toggleFollowUp(reg.id)}
                      className={`text-xs px-2 py-1.5 rounded-md border transition-colors ${
                        reg.followUpSent
                          ? "bg-green-50 border-green-200 text-green-700"
                          : "border-border hover:bg-accent-light text-muted-foreground"
                      }`}
                    >
                      {reg.followUpSent ? "Follow-up Sent" : "Send Follow-up"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 text-sm text-muted-foreground">No registrations yet.</div>
          )}
        </div>

        {selected.notes && (
          <div className="bg-card rounded-xl border border-border p-5">
            <h2 className="font-semibold mb-2">Notes</h2>
            <p className="text-sm text-muted-foreground">{selected.notes}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tour Scheduling</h1>
          <p className="text-muted-foreground mt-1">Open house tours — multiple prospects per showing</p>
        </div>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
        >
          {showCreateForm ? "Cancel" : "+ Schedule Tour"}
        </button>
      </div>

      {showCreateForm && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">Schedule Open House</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Location *</label>
              <select
                value={newTour.propertyName}
                onChange={(e) => setNewTour({ ...newTour, propertyName: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">Select location...</option>
                {propertyNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Date *</label>
              <input
                type="date"
                value={newTour.date}
                onChange={(e) => setNewTour({ ...newTour, date: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Start Time</label>
              <input
                type="time"
                value={newTour.startTime}
                onChange={(e) => setNewTour({ ...newTour, startTime: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">End Time</label>
              <input
                type="time"
                value={newTour.endTime}
                onChange={(e) => setNewTour({ ...newTour, endTime: e.target.value })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Host</label>
              <input
                type="text"
                value={newTour.host}
                onChange={(e) => setNewTour({ ...newTour, host: e.target.value })}
                placeholder="Host name"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Capacity</label>
              <input
                type="number"
                value={newTour.capacity}
                onChange={(e) => setNewTour({ ...newTour, capacity: parseInt(e.target.value) || 10 })}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </div>
          </div>
          <textarea
            placeholder="Notes (optional)"
            value={newTour.notes}
            onChange={(e) => setNewTour({ ...newTour, notes: e.target.value })}
            rows={2}
            className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
          />
          <button
            onClick={createTour}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Schedule Tour
          </button>
        </div>
      )}

      {/* Upcoming */}
      {upcoming.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Upcoming Tours</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {upcoming.map((tour) => {
              const registered = tour.registrations.filter(
                (r) => r.status !== "cancelled" && r.status !== "rescheduled"
              ).length;
              return (
                <button
                  key={tour.id}
                  onClick={() => setSelected(tour)}
                  className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{tour.propertyName}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tour.date} · {tour.startTime} – {tour.endTime}
                      </p>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-green-100 text-green-800 font-medium">
                      Upcoming
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{registered}/{tour.capacity} spots filled</span>
                    <span className="text-muted-foreground">Host: {tour.host}</span>
                  </div>
                  <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${(registered / tour.capacity) * 100}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Past Tours</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {past.map((tour) => {
              const attendedCount = tour.registrations.filter((r) => r.status === "attended").length;
              const total = tour.registrations.length;
              return (
                <button
                  key={tour.id}
                  onClick={() => setSelected(tour)}
                  className="text-left bg-card rounded-xl border border-border p-5 hover:shadow-md transition-shadow cursor-pointer opacity-80"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold">{tour.propertyName}</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {tour.date} · {tour.startTime} – {tour.endTime}
                      </p>
                    </div>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">Past</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                    <span>{attendedCount}/{total} attended</span>
                    <span>Host: {tour.host}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {allTours.length === 0 && !showCreateForm && (
        <div className="text-center py-12 text-muted-foreground">
          No tours scheduled. Click &quot;+ Schedule Tour&quot; to create an open house.
        </div>
      )}
    </div>
  );
}
