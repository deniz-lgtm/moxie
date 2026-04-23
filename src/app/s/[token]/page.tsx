"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Check, Users } from "lucide-react";
import type { ShowingSlot } from "@/lib/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function seatsUsed(slot: ShowingSlot): number {
  return (slot.registrations ?? [])
    .filter((r) => r.status === "confirmed" || r.status === "attended")
    .reduce((s, r) => s + (r.partySize || 1), 0);
}

// ─── page ────────────────────────────────────────────────────────────────────

interface PageProps {
  params: { token: string };
}

type PageState = "loading" | "form" | "full" | "closed" | "done" | "error";

export default function PublicSignUpPage({ params }: PageProps) {
  const { token } = params;

  const [slot, setSlot] = useState<ShowingSlot | null>(null);
  const [state, setState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    partySize: "1",
    notes: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!token) return;
    loadSlot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function loadSlot() {
    try {
      const res = await fetch(`/api/showings/slots?public_token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        setState("error");
        setErrorMsg("This sign-up link is not valid.");
        return;
      }
      const j = await res.json();
      const s: ShowingSlot = j.slot;
      if (!s) {
        setState("error");
        setErrorMsg("This sign-up link is not valid.");
        return;
      }
      setSlot(s);
      if (s.status !== "open") { setState("closed"); return; }
      if (seatsUsed(s) >= s.capacity) { setState("full"); return; }
      setState("form");
    } catch {
      setState("error");
      setErrorMsg("Failed to load the sign-up page. Please try again.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError("Your name is required."); return; }
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/showings/registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicToken: token,
          prospectName: form.name.trim(),
          prospectEmail: form.email.trim() || undefined,
          prospectPhone: form.phone.trim() || undefined,
          partySize: parseInt(form.partySize) || 1,
          notes: form.notes.trim() || undefined,
          source: "public",
        }),
      });
      const j = await res.json();
      if (j.registration) {
        setState("done");
      } else if (res.status === 409) {
        setState(j.error?.toLowerCase().includes("full") ? "full" : "closed");
      } else {
        setFormError(j.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
      }
    } catch {
      setFormError("Network error. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  // ── loading ──────────────────────────────────────────────────────────────
  if (state === "loading") {
    return (
      <PublicShell>
        <div className="flex items-center justify-center py-20 text-gray-400">
          <CalendarDays className="w-6 h-6 mr-2 animate-pulse" />
          Loading…
        </div>
      </PublicShell>
    );
  }

  // ── error ────────────────────────────────────────────────────────────────
  if (state === "error") {
    return (
      <PublicShell>
        <div className="text-center py-16">
          <p className="text-2xl mb-2">🔗</p>
          <h2 className="text-lg font-semibold text-gray-800">Invalid link</h2>
          <p className="text-sm text-gray-500 mt-2">{errorMsg}</p>
        </div>
      </PublicShell>
    );
  }

  // ── closed ───────────────────────────────────────────────────────────────
  if (state === "closed") {
    return (
      <PublicShell slot={slot}>
        <div className="text-center py-10">
          <p className="text-3xl mb-3">🚫</p>
          <h2 className="text-lg font-semibold text-gray-800">Sign-ups are closed</h2>
          <p className="text-sm text-gray-500 mt-2">
            This showing is no longer accepting registrations.
          </p>
        </div>
      </PublicShell>
    );
  }

  // ── full ─────────────────────────────────────────────────────────────────
  if (state === "full") {
    return (
      <PublicShell slot={slot}>
        <div className="text-center py-10">
          <p className="text-3xl mb-3">😔</p>
          <h2 className="text-lg font-semibold text-gray-800">This showing is full</h2>
          <p className="text-sm text-gray-500 mt-2">
            All spots have been taken. Please reach out to the leasing team directly.
          </p>
        </div>
      </PublicShell>
    );
  }

  // ── success ──────────────────────────────────────────────────────────────
  if (state === "done") {
    return (
      <PublicShell slot={slot}>
        <div className="text-center py-10">
          <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800">You&apos;re registered!</h2>
          {slot && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl text-sm text-gray-700 space-y-1">
              {slot.propertyName && <p className="font-medium">{slot.propertyName}</p>}
              <p>{formatDate(slot.startsAt)}</p>
              <p>{formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}</p>
              {slot.hostName && <p className="text-gray-500">Host: {slot.hostName}</p>}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            We look forward to seeing you! Please save this page as confirmation.
          </p>
        </div>
      </PublicShell>
    );
  }

  // ── form ─────────────────────────────────────────────────────────────────
  const used = slot ? seatsUsed(slot) : 0;
  const remaining = slot ? Math.max(0, slot.capacity - used) : 0;

  return (
    <PublicShell slot={slot}>
      {slot?.publicDescription && (
        <p className="text-sm text-gray-600 mb-5 leading-relaxed">{slot.publicDescription}</p>
      )}

      {remaining <= 5 && remaining > 0 && (
        <div className="mb-4 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          Only {remaining} spot{remaining === 1 ? "" : "s"} left!
        </div>
      )}

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Your name <span className="text-red-500">*</span>
          </label>
          <input
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="First and last name"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input
            type="tel"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="(213) 555-0100"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Party size
            <span className="text-gray-400 font-normal ml-1">(how many people are coming?)</span>
          </label>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={form.partySize}
            onChange={(e) => setForm((f) => ({ ...f, partySize: e.target.value }))}
          >
            {Array.from({ length: Math.min(remaining, 8) }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? "person" : "people"}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes <span className="text-gray-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            placeholder="Questions, accessibility needs, etc."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </div>

        {formError && <p className="text-sm text-red-600">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-60"
        >
          {submitting ? "Signing up…" : "Sign me up"}
        </button>
      </form>

      <p className="text-xs text-gray-400 text-center mt-4">
        Your information is only shared with the leasing team.
      </p>
    </PublicShell>
  );
}

// ─── shell layout (no app chrome — used by public-facing sign-up) ─────────────

function PublicShell({ slot, children }: { slot?: ShowingSlot | null; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-start py-10 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center mb-6 gap-2">
          <CalendarDays className="w-5 h-5 text-blue-600" />
          <span className="text-sm font-semibold text-gray-600">Moxie Leasing</span>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          {slot && (
            <div className="mb-5 pb-5 border-b border-gray-100">
              <h1 className="text-xl font-bold text-gray-900">
                {slot.propertyName ? `Showing at ${slot.propertyName}` : "Open House Sign-Up"}
              </h1>
              <div className="mt-2 space-y-0.5 text-sm text-gray-600">
                <p>{formatDate(slot.startsAt)}</p>
                <p>{formatTime(slot.startsAt)} – {formatTime(slot.endsAt)}</p>
                {slot.hostName && (
                  <p className="flex items-center gap-1 text-gray-500">
                    <Users className="w-3.5 h-3.5" />
                    Hosted by {slot.hostName}
                  </p>
                )}
              </div>
            </div>
          )}

          {!slot && (
            <h1 className="text-xl font-bold text-gray-900 mb-5">Open House Sign-Up</h1>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
