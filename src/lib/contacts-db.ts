// ============================================
// Contacts DB — internal Moxie team directory
// ============================================

import { getSupabase, type DbContact } from "./supabase";
import type { Contact, ContactRole } from "./types";

function dbToContact(row: DbContact): Contact {
  return {
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
  };
}

function contactToDb(c: Contact): Omit<DbContact, "created_at" | "updated_at"> {
  return {
    id: c.id,
    name: c.name,
    role: c.role ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
    department: c.department ?? null,
    notes: c.notes ?? null,
    is_active: c.isActive,
    user_id: c.userId ?? null,
  };
}

export async function listContacts(): Promise<Contact[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb.from("contacts").select("*").order("name");
  if (error) {
    if (!isMissingTableError(error)) console.warn("[contacts-db] list:", error.message);
    return [];
  }
  return (data ?? []).map(dbToContact);
}

export async function upsertContact(c: Contact): Promise<Contact> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { data, error } = await sb
    .from("contacts")
    .upsert(contactToDb(c), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw new Error(`[contacts-db] upsert: ${error.message}`);
  return dbToContact(data);
}

export async function deleteContact(id: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase not configured");
  const { error } = await sb.from("contacts").delete().eq("id", id);
  if (error) throw new Error(`[contacts-db] delete: ${error.message}`);
}

function isMissingTableError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  if (error.code === "PGRST205") return true;
  const msg = error.message || "";
  return /does not exist|not found in schema|relation .* does not exist/i.test(msg);
}
