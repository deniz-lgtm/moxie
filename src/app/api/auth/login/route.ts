import { NextResponse } from "next/server";
import {
  buildTotpUri,
  createChallenge,
  generateTotpSecret,
  getUserByEmail,
  verifyPassword,
} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Step 1 of login. Verifies password.
 *  - If user has TOTP enrolled → returns { challengeId } so client prompts for code.
 *  - If not enrolled → generates a TOTP secret + QR code and returns { challengeId, enroll: { secret, otpauthUrl, qrDataUrl } }.
 */
export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (typeof email !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
    }
    const user = await getUserByEmail(email);
    // Generic error to avoid user enumeration.
    const invalid = NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    if (!user || !user.is_active) return invalid;
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return invalid;

    const challengeId = await createChallenge(user.id);

    // Already enrolled — just prompt for code.
    if (user.totp_secret && user.totp_enrolled_at) {
      return NextResponse.json({ challengeId, requires2fa: true, enroll: null });
    }

    // First-time login — generate a secret, store it but leave totp_enrolled_at null until verified.
    const secret = user.totp_secret || generateTotpSecret();
    if (!user.totp_secret) {
      const admin = getSupabaseAdmin();
      if (admin) {
        await admin.from("app_users").update({ totp_secret: secret }).eq("id", user.id);
      }
    }
    const otpauthUrl = buildTotpUri(secret, user.email);
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    return NextResponse.json({
      challengeId,
      requires2fa: true,
      enroll: { secret, otpauthUrl, qrDataUrl },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Login failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
