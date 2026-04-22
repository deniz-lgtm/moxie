"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, UserCog, Users as UsersIcon } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { ContactRole } from "@/lib/types";

type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: ContactRole | null;
  createdAt: string;
  lastSignInAt: string | null;
  contactId: string | null;
  isActive: boolean;
};

const ROLE_OPTIONS: { value: ContactRole; label: string }[] = [
  { value: "property_manager", label: "Property Manager" },
  { value: "maintenance", label: "Maintenance" },
  { value: "leasing", label: "Leasing" },
  { value: "asset_manager", label: "Asset Manager" },
  { value: "owner_rep", label: "Owner Rep" },
  { value: "other", label: "Other" },
];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export default function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [configError, setConfigError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setConfigError(null);
    try {
      const r = await fetch("/api/users");
      const j = await r.json();
      if (j.error) {
        setConfigError(j.error);
        setUsers([]);
      } else {
        setUsers(Array.isArray(j.users) ? j.users : []);
      }
    } catch (e: any) {
      setConfigError(e?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchUser = async (id: string, patch: Partial<AppUser>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));
    await fetch(`/api/users?id=${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const removeUser = async (id: string, email: string | null) => {
    if (!confirm(`Remove ${email || "this user"}? They will no longer be able to log in; their contact history is kept.`)) return;
    setUsers((prev) => prev.filter((u) => u.id !== id));
    await fetch(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersIcon className="w-6 h-6" /> Users
          </h1>
          <p className="text-muted-foreground mt-1">
            Team members with access to Moxie. Creating a user here provisions
            their Supabase login and auto-creates a matching contact entry.
          </p>
        </div>
        {!configError && (
          <button
            onClick={() => setShowAdd(true)}
            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent/90 inline-flex items-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        )}
      </div>

      {configError && (
        <div className="bg-card rounded-xl border border-orange-200 bg-orange-50 p-5">
          <p className="text-sm font-semibold text-orange-900">User admin not configured</p>
          <p className="text-sm text-orange-900 mt-1">{configError}</p>
          <p className="text-xs text-orange-800 mt-3">
            The anon key used for the rest of the app can&rsquo;t create or delete auth users.
            Set <code className="bg-white px-1 py-0.5 rounded">SUPABASE_SERVICE_ROLE_KEY</code> in
            your server environment (Supabase → Project Settings → API → service_role key) and
            restart the server.
          </p>
        </div>
      )}

      {!configError && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Loading users…</div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No users yet. Click <span className="font-medium">Add User</span> to provision one.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted">
                    <th className="text-left px-4 py-3 font-medium">Name</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Role</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Last sign-in</th>
                    <th className="text-left px-4 py-3 font-medium">Created</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <input
                          defaultValue={u.name ?? ""}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (v && v !== (u.name ?? "")) patchUser(u.id, { name: v });
                          }}
                          className="w-full bg-transparent border-b border-transparent focus:border-border focus:outline-none px-0 py-0.5 text-sm"
                          placeholder="Name"
                        />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{u.email || "—"}</td>
                      <td className="px-4 py-3">
                        <select
                          value={u.role ?? ""}
                          onChange={(e) =>
                            patchUser(u.id, {
                              role: (e.target.value || null) as ContactRole | null,
                            })
                          }
                          className="text-sm border border-border rounded px-2 py-1 bg-card"
                        >
                          <option value="">—</option>
                          {ROLE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge value={u.isActive ? "active" : "inactive"} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.lastSignInAt)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(u.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => removeUser(u.id, u.email)}
                          className="text-muted-foreground hover:text-red-600 inline-flex items-center gap-1 text-xs"
                          title="Remove user"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={(u) => {
            setUsers((prev) => [...prev, u].sort((a, b) => (a.email ?? "").localeCompare(b.email ?? "")));
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function AddUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (u: AppUser) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ContactRole | "">("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const submit = async () => {
    if (!email.trim() || !name.trim()) {
      setError("Name and email are required");
      return;
    }
    if (!sendInvite && password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          role: role || undefined,
          phone: phone.trim() || undefined,
          password: sendInvite ? undefined : password,
          sendInvite,
        }),
      });
      const j = await r.json();
      if (j.error) {
        setError(j.error);
        return;
      }
      if (j.warning) alert(j.warning);
      onCreated(j.user);
    } catch (e: any) {
      setError(e?.message || "Failed to create user");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-border flex items-center gap-2">
          <UserCog className="w-5 h-5 text-muted-foreground" />
          <h2 className="font-semibold">Add User</h2>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="First Last"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@example.com"
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Role">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ContactRole | "")}
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              >
                <option value="">—</option>
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phone (optional)">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 000 0000"
                className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
              />
            </Field>
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sendInvite}
                onChange={(e) => setSendInvite(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-sm">
                <span className="font-medium">Send invite email</span>
                <span className="text-muted-foreground block text-xs">
                  They&rsquo;ll receive a magic link to set their own password.
                </span>
              </span>
            </label>
            {!sendInvite && (
              <Field label="Initial password">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-card"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  They can change it after signing in.
                </p>
              </Field>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium bg-accent text-white rounded-lg hover:bg-accent/90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : sendInvite ? "Send Invite" : "Create User"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}
