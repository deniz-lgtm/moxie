"use client";

import { useState, useEffect } from "react";
import type { Contact, ContactRole } from "@/lib/types";

const ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: "property_manager", label: "Property Manager" },
  { value: "maintenance", label: "Maintenance" },
  { value: "leasing", label: "Leasing" },
  { value: "asset_manager", label: "Asset Manager" },
  { value: "owner_rep", label: "Owner Rep" },
  { value: "other", label: "Other" },
];

function roleLabel(role?: ContactRole): string {
  if (!role) return "—";
  return ROLE_OPTIONS.find((r) => r.value === role)?.label ?? role;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [draft, setDraft] = useState({
    name: "",
    role: "property_manager" as ContactRole,
    email: "",
    phone: "",
    department: "",
  });

  async function load() {
    try {
      const res = await fetch("/api/contacts");
      if (!res.ok) throw new Error("Load failed");
      const j = await res.json();
      setContacts(j.contacts || []);
    } catch (e: any) {
      setError(e.message || "Load failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = contacts.filter((c) => {
    if (roleFilter !== "all" && c.role !== roleFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      const hay = [c.name, c.email, c.phone, c.department, roleLabel(c.role)].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  async function addContact() {
    if (!draft.name.trim()) return;
    const now = new Date().toISOString();
    const contact: Contact = {
      id: `c-${Date.now()}`,
      name: draft.name.trim(),
      role: draft.role,
      email: draft.email || undefined,
      phone: draft.phone || undefined,
      department: draft.department || undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact }),
    });
    if (!res.ok) {
      setError("Couldn't save contact");
      return;
    }
    const j = await res.json();
    setContacts((prev) => [...prev, j.contact]);
    setDraft({ name: "", role: "property_manager", email: "", phone: "", department: "" });
    setShowAdd(false);
  }

  async function saveContact(c: Contact) {
    const res = await fetch("/api/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact: c }),
    });
    if (!res.ok) {
      setError("Couldn't save contact");
      return;
    }
    const j = await res.json();
    setContacts((prev) => prev.map((x) => (x.id === j.contact.id ? j.contact : x)));
    if (selected?.id === j.contact.id) setSelected(j.contact);
  }

  function updateContact<K extends keyof Contact>(id: string, field: K, value: Contact[K]) {
    const existing = contacts.find((c) => c.id === id);
    if (!existing) return;
    const updated: Contact = { ...existing, [field]: value, updatedAt: new Date().toISOString() };
    setContacts((prev) => prev.map((c) => (c.id === id ? updated : c)));
    if (selected?.id === id) setSelected(updated);
    void saveContact(updated);
  }

  async function removeContact(id: string) {
    const res = await fetch(`/api/contacts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!res.ok) {
      setError("Couldn't delete contact");
      return;
    }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  if (selected) {
    return (
      <div className="space-y-6">
        <button onClick={() => setSelected(null)} className="text-sm text-accent hover:underline">
          &larr; Back to Contacts
        </button>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold break-words">{selected.name}</h1>
            <p className="text-muted-foreground mt-1">{roleLabel(selected.role)}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.isActive}
                onChange={(e) => updateContact(selected.id, "isActive", e.target.checked)}
              />
              Active
            </label>
            <button onClick={() => removeContact(selected.id)} className="text-xs text-red-600 hover:text-red-700 px-2 py-1.5">
              Delete
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-card rounded-xl border border-border p-5 space-y-3">
            <h2 className="font-semibold">Contact Info</h2>
            <Editable label="Email" value={selected.email || ""} type="email" onSave={(v) => updateContact(selected.id, "email", v || undefined)} />
            <Editable label="Phone" value={selected.phone || ""} onSave={(v) => updateContact(selected.id, "phone", v || undefined)} />
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Role</label>
              <select
                value={selected.role || "other"}
                onChange={(e) => updateContact(selected.id, "role", e.target.value as ContactRole)}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <Editable label="Department" value={selected.department || ""} onSave={(v) => updateContact(selected.id, "department", v || undefined)} />
          </div>
          <div className="bg-card rounded-xl border border-border p-5 space-y-2">
            <h2 className="font-semibold">Notes</h2>
            <textarea
              value={selected.notes || ""}
              onChange={(e) => {
                const next = { ...selected, notes: e.target.value };
                setSelected(next);
                setContacts((prev) => prev.map((c) => (c.id === next.id ? next : c)));
              }}
              onBlur={(e) => updateContact(selected.id, "notes", e.target.value || undefined)}
              rows={6}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card resize-none"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-muted-foreground mt-1">Internal Moxie team directory</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors whitespace-nowrap"
        >
          {showAdd ? "Cancel" : "+ Add Contact"}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {showAdd && (
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold">New Contact</h2>
          <div className="grid md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Name *"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <select
              value={draft.role}
              onChange={(e) => setDraft({ ...draft, role: e.target.value as ContactRole })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <input
              type="email"
              placeholder="Email"
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="text"
              placeholder="Phone"
              value={draft.phone}
              onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
            <input
              type="text"
              placeholder="Department"
              value={draft.department}
              onChange={(e) => setDraft({ ...draft, department: e.target.value })}
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card md:col-span-2"
            />
          </div>
          <button
            onClick={addContact}
            className="px-4 py-2 bg-accent text-white text-sm rounded-lg hover:bg-accent/90 transition-colors"
          >
            Add Contact
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="text"
          placeholder="Search name, email, phone, department…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
        >
          <option value="all">All Roles</option>
          {ROLE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading contacts…</div>
      ) : filtered.length > 0 ? (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Phone</th>
                  <th className="text-left px-4 py-3 font-medium">Department</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                  >
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{roleLabel(c.role)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.email || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.phone || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{c.department || "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${c.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                        {c.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          {contacts.length === 0
            ? "No contacts yet. Click \"+ Add Contact\" to build your team directory."
            : "No contacts match the current filter."}
        </div>
      )}
    </div>
  );
}

function Editable({
  label,
  value,
  type = "text",
  onSave,
}: {
  label: string;
  value: string;
  type?: string;
  onSave: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input
        type={type}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onSave(local);
        }}
        className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
      />
    </div>
  );
}
