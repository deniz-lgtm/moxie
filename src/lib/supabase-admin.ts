// ============================================
// Supabase Admin client (server-only)
// ============================================
// Uses the SERVICE ROLE KEY, which bypasses RLS and has full access
// including auth.admin.* endpoints needed to create/delete users. NEVER
// import this from client components — it must only be reachable from
// API route handlers. The runtime guard below throws if somebody tries.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (typeof window !== "undefined") {
    throw new Error("supabase-admin must not be imported from client code");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return null;

  if (!_admin) {
    _admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _admin;
}

export function isAdminConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}
