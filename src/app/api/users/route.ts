import { NextResponse } from "next/server";
import { getSupabaseAdmin, isAdminConfigured } from "@/lib/supabase-admin";
import { upsertContact } from "@/lib/contacts-db";
import { getSupabase } from "@/lib/supabase";
import { hashPassword } from "@/lib/auth";
import type { Contact, ContactRole } from "@/lib/types";

export const dynamic = "force-dynamic";

type AppUser = {
  id: string;
  email: string | null;
  name: string | null;
  role: ContactRole | null;
  createdAt: string;
  lastSignInAt: string | null;
  contactId: string | null;
  isActive: boolean;
  totpEnrolled: boolean;
};

function notConfiguredError() {
  return NextResponse.json(
    {
      error:
        "User admin requires SUPABASE_SERVICE_ROLE_KEY. Set it in the server environment (Supabase → Project Settings → API → service_role key).",
    },
    { status: 501 }
  );
}

function normalizeRole(raw: unknown): ContactRole | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  const allowed: ContactRole[] = [
    "property_manager",
    "maintenance",
    "leasing",
    "asset_manager",
    "owner_rep",
    "other",
  ];
  return allowed.includes(v as ContactRole) ? (v as ContactRole) : null;
}

async function hydrateContacts(userIds: string[]): Promise<Map<string, Contact>> {
  const map = new Map<string, Contact>();
  if (userIds.length === 0) return map;
  const sb = getSupabase();
  if (!sb) return map;
  const { data, error } = await sb.from("contacts").select("*").in("user_id", userIds);
  if (error || !data) return map;
  for (const row of data) {
    if (row.user_id) {
      map.set(row.user_id, {
        id: row.id,
        name: row.name,
        role: (row.role ?? undefined) as ContactRole | undefined,
        email: row.email ?? undefined,
        phone: row.phone ?? undefined,
        department: row.department ?? undefined,
        notes: row.notes ?? undefined,
        isActive: row.is_active,
        userId: row.user_id ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      });
    }
  }
  return map;
}

type AppUserRow = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  is_active: boolean;
  last_sign_in_at: string | null;
  totp_enrolled_at: string | null;
  totp_secret: string | null;
  created_at: string;
};

function toAppUser(row: AppUserRow, contact: Contact | undefined): AppUser {
  return {
    id: row.id,
    email: row.email ?? null,
    name: contact?.name ?? row.name,
    role: contact?.role ?? (normalizeRole(row.role) || null),
    createdAt: row.created_at,
    lastSignInAt: row.last_sign_in_at ?? null,
    contactId: contact?.id ?? null,
    isActive: contact?.isActive ?? row.is_active,
    totpEnrolled: Boolean(row.totp_enrolled_at && row.totp_secret),
  };
}

/** GET /api/users — list all app users with their linked contact. */
export async function GET() {
  if (!isAdminConfigured()) return notConfiguredError();
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();
    const { data, error } = await admin
      .from("app_users")
      .select("id,email,name,role,is_active,last_sign_in_at,totp_enrolled_at,totp_secret,created_at")
      .order("email", { ascending: true })
      .limit(500);
    if (error) throw error;
    const rows = (data ?? []) as AppUserRow[];
    const contactByUserId = await hydrateContacts(rows.map((u) => u.id));
    const users: AppUser[] = rows.map((u) => toAppUser(u, contactByUserId.get(u.id)));
    return NextResponse.json({ users });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to list users" }, { status: 500 });
  }
}

/**
 * POST /api/users
 * Body: { email, password, name, role?, phone? }
 * Creates an app_users row + linked contact. The user enrolls TOTP on
 * their first sign-in. `password` is required (min 8 chars).
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return notConfiguredError();
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !name) {
      return NextResponse.json({ error: "Missing email or name" }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    const role = normalizeRole(body?.role);
    const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;

    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();

    // Reject duplicates explicitly so we can return a friendly message.
    const { data: existing } = await admin
      .from("app_users")
      .select("id")
      .ilike("email", email)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "A user with that email already exists." }, { status: 409 });
    }

    const password_hash = await hashPassword(password);
    const { data: inserted, error: insertError } = await admin
      .from("app_users")
      .insert({ email, name, role: role ?? null, password_hash })
      .select("id,email,name,role,is_active,last_sign_in_at,totp_enrolled_at,totp_secret,created_at")
      .single();
    if (insertError || !inserted) throw insertError ?? new Error("Insert failed");

    const userId = (inserted as AppUserRow).id;
    const contact: Contact = {
      id: `user_${userId}`,
      name,
      role: role ?? undefined,
      email,
      phone: phone ?? undefined,
      isActive: true,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await upsertContact(contact);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      return NextResponse.json({
        user: toAppUser(inserted as AppUserRow, contact),
        warning: `User created, but contact insert failed: ${msg}`,
      });
    }

    return NextResponse.json({ user: toAppUser(inserted as AppUserRow, contact) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create user" }, { status: 500 });
  }
}

/**
 * PATCH /api/users?id=<id>
 * Body: partial { name?, role?, phone?, password?, resetTotp? }
 *  - resetTotp clears the TOTP secret so the user re-enrolls on next login.
 */
export async function PATCH(request: Request) {
  if (!isAdminConfigured()) return notConfiguredError();
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    const body = await request.json();
    const name = typeof body?.name === "string" ? body.name.trim() : undefined;
    const role = "role" in body ? normalizeRole(body.role) : undefined;
    const phone = typeof body?.phone === "string" ? body.phone.trim() : undefined;
    const password = typeof body?.password === "string" ? body.password : undefined;
    const resetTotp = body?.resetTotp === true;

    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (name !== undefined) update.name = name;
    if (role !== undefined) update.role = role;
    if (password !== undefined) {
      if (password.length < 8) {
        return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
      }
      update.password_hash = await hashPassword(password);
    }
    if (resetTotp) {
      update.totp_secret = null;
      update.totp_enrolled_at = null;
      // Invalidate any active sessions for this user — force re-login.
      await admin.from("user_sessions").delete().eq("user_id", id);
    }

    if (Object.keys(update).length > 1) {
      const { error } = await admin.from("app_users").update(update).eq("id", id);
      if (error) throw error;
    }

    const sb = getSupabase();
    if (sb) {
      const { data: existing } = await sb
        .from("contacts")
        .select("*")
        .eq("user_id", id)
        .maybeSingle();
      const contactId = existing?.id ?? `user_${id}`;
      await upsertContact({
        id: contactId,
        name: name ?? existing?.name ?? "",
        role: (role ?? existing?.role) as ContactRole | undefined,
        email: existing?.email ?? undefined,
        phone: phone ?? existing?.phone ?? undefined,
        department: existing?.department ?? undefined,
        notes: existing?.notes ?? undefined,
        isActive: existing?.is_active ?? true,
        userId: id,
        createdAt: existing?.created_at ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update user" }, { status: 500 });
  }
}

/**
 * DELETE /api/users?id=<id>
 * Hard-deletes the app_users row (cascades sessions) and marks the linked
 * contact is_active=false (soft delete — keeps history).
 */
export async function DELETE(request: Request) {
  if (!isAdminConfigured()) return notConfiguredError();
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();

    const { error } = await admin.from("app_users").delete().eq("id", id);
    if (error) throw error;

    const sb = getSupabase();
    if (sb) {
      await sb
        .from("contacts")
        .update({ is_active: false, user_id: null })
        .eq("user_id", id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete user" }, { status: 500 });
  }
}
