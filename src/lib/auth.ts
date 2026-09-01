// ============================================
// Custom auth helpers (server-only)
// ============================================
// Password hashing (bcrypt), opaque session tokens stored in user_sessions,
// and TOTP (RFC 6238) for 2FA via authenticator apps. The Supabase service-
// role client is the storage backend.

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { TOTP, Secret } from "otpauth";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const SESSION_COOKIE = "moxie_session";
export const SESSION_TTL_DAYS = 14;
export const CHALLENGE_TTL_MINUTES = 5;
export const TOTP_ISSUER = "Moxie Management";

export type AppUserRow = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  password_hash: string;
  totp_secret: string | null;
  totp_enrolled_at: string | null;
  is_active: boolean;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string | null;
  totpEnrolled: boolean;
};

function admin() {
  const a = getSupabaseAdmin();
  if (!a) throw new Error("Supabase admin not configured");
  return a;
}

// ─── Password ───────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── TOTP ───────────────────────────────────────────────────────

export function generateTotpSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function buildTotpUri(secret: string, accountEmail: string): string {
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: accountEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  return totp.toString();
}

export function verifyTotp(secret: string, code: string): boolean {
  const trimmed = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(trimmed)) return false;
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
  // window: ±1 step (30s) for clock drift
  const delta = totp.validate({ token: trimmed, window: 1 });
  return delta !== null;
}

// ─── User lookup ────────────────────────────────────────────────

export async function getUserByEmail(email: string): Promise<AppUserRow | null> {
  const { data } = await admin()
    .from("app_users")
    .select("*")
    .ilike("email", email.trim())
    .maybeSingle();
  return (data as AppUserRow) || null;
}

export async function getUserById(id: string): Promise<AppUserRow | null> {
  const { data } = await admin()
    .from("app_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return (data as AppUserRow) || null;
}

export function toSessionUser(row: AppUserRow): SessionUser {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    totpEnrolled: Boolean(row.totp_enrolled_at && row.totp_secret),
  };
}

// ─── Sessions ───────────────────────────────────────────────────

function newToken(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export async function createSession(userId: string, meta?: { userAgent?: string; ip?: string }) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
  await admin().from("user_sessions").insert({
    token,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
    user_agent: meta?.userAgent ?? null,
    ip: meta?.ip ?? null,
  });
  await admin()
    .from("app_users")
    .update({ last_sign_in_at: new Date().toISOString() })
    .eq("id", userId);
  return { token, expiresAt };
}

export async function destroySession(token: string) {
  await admin().from("user_sessions").delete().eq("token", token);
}

export async function getSessionUser(token: string | null | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const { data: session } = await admin()
    .from("user_sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  const user = await getUserById(session.user_id);
  if (!user || !user.is_active) return null;
  return toSessionUser(user);
}

export async function setSessionCookie(token: string, expiresAt: Date) {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const c = await cookies();
  const token = c.get(SESSION_COOKIE)?.value;
  return getSessionUser(token);
}

// ─── 2FA challenge (between password step and code step) ───────

export async function createChallenge(userId: string): Promise<string> {
  const id = newToken(24);
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);
  await admin().from("user_2fa_challenges").insert({
    id,
    user_id: userId,
    expires_at: expiresAt.toISOString(),
  });
  return id;
}

export async function consumeChallenge(id: string): Promise<string | null> {
  const { data } = await admin()
    .from("user_2fa_challenges")
    .select("user_id, expires_at")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  await admin().from("user_2fa_challenges").delete().eq("id", id);
  if (new Date(data.expires_at).getTime() < Date.now()) return null;
  return data.user_id as string;
}
