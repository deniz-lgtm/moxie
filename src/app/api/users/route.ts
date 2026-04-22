import { NextResponse } from "next/server";
import { getSupabaseAdmin, isAdminConfigured } from "@/lib/supabase-admin";
import { upsertContact } from "@/lib/contacts-db";
import { getSupabase } from "@/lib/supabase";
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

function toAppUser(authUser: any, contact: Contact | undefined): AppUser {
  const meta = authUser.user_metadata || {};
  return {
    id: authUser.id,
    email: authUser.email ?? null,
    name: contact?.name ?? (typeof meta.name === "string" ? meta.name : null),
    role:
      contact?.role ??
      (normalizeRole(meta.role) || null),
    createdAt: authUser.created_at,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    contactId: contact?.id ?? null,
    isActive: contact?.isActive ?? true,
  };
}

/** GET /api/users — list all Supabase auth users with their linked contact. */
export async function GET() {
  if (!isAdminConfigured()) return notConfiguredError();
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();
    const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (error) throw error;
    const authUsers = data?.users ?? [];
    const contactByUserId = await hydrateContacts(authUsers.map((u) => u.id));
    const users: AppUser[] = authUsers
      .map((u) => toAppUser(u, contactByUserId.get(u.id)))
      .sort((a, b) => (a.email ?? "").localeCompare(b.email ?? ""));
    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to list users" }, { status: 500 });
  }
}

/**
 * POST /api/users
 *
 * Body: { email, password?, name, role?, phone?, sendInvite? }
 *
 * Creates a Supabase auth user and an aligned contact row in one go. If
 * `sendInvite` is true (or `password` is absent), sends a magic-link
 * invitation email so the user sets their own password. Otherwise
 * creates with the provided password and marks the email confirmed so
 * they can sign in immediately.
 */
export async function POST(request: Request) {
  if (!isAdminConfigured()) return notConfiguredError();
  try {
    const body = await request.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    if (!email || !name) {
      return NextResponse.json({ error: "Missing email or name" }, { status: 400 });
    }
    const role = normalizeRole(body?.role);
    const phone = typeof body?.phone === "string" && body.phone.trim() ? body.phone.trim() : null;
    const password = typeof body?.password === "string" ? body.password : "";
    const sendInvite = body?.sendInvite === true || !password;

    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();

    let userId: string;
    if (sendInvite) {
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { name, ...(role ? { role } : {}) },
      });
      if (error) throw error;
      userId = data.user.id;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, ...(role ? { role } : {}) },
      });
      if (error) throw error;
      userId = data.user.id;
    }

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
    } catch (e: any) {
      // The user is created either way; surface the contact error but
      // don't 500 — the admin can retry linking from the UI.
      return NextResponse.json({
        user: toAppUser({ id: userId, email, user_metadata: { name, role } }, contact),
        warning: `User created, but contact insert failed: ${e.message}`,
      });
    }

    return NextResponse.json({
      user: toAppUser({ id: userId, email, user_metadata: { name, role } }, contact),
      invited: sendInvite,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 });
  }
}

/**
 * PATCH /api/users?id=<auth_user_id>
 * Body: partial { name?, role?, phone? }
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

    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();

    // Update auth user_metadata
    const nextMeta: Record<string, unknown> = {};
    if (name !== undefined) nextMeta.name = name;
    if (role !== undefined) nextMeta.role = role;
    if (Object.keys(nextMeta).length > 0) {
      await admin.auth.admin.updateUserById(id, {
        user_metadata: nextMeta,
      });
    }

    // Update linked contact
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
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to update user" }, { status: 500 });
  }
}

/**
 * DELETE /api/users?id=<auth_user_id>
 * Removes the user from Supabase Auth and marks their linked contact
 * is_active=false (soft delete — keeps history).
 */
export async function DELETE(request: Request) {
  if (!isAdminConfigured()) return notConfiguredError();
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const admin = getSupabaseAdmin();
    if (!admin) return notConfiguredError();

    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw error;

    const sb = getSupabase();
    if (sb) {
      await sb
        .from("contacts")
        .update({ is_active: false, user_id: null })
        .eq("user_id", id);
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete user" }, { status: 500 });
  }
}
