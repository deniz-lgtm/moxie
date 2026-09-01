import { NextResponse } from "next/server";
import {
  consumeChallenge,
  createSession,
  getUserById,
  setSessionCookie,
  toSessionUser,
  verifyTotp,
} from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/verify-2fa
 * Body: { challengeId, code }
 * Step 2 of login. Validates the 6-digit TOTP code; on success creates a
 * session, sets the cookie, and (if this is first verify) marks the user
 * enrolled.
 */
export async function POST(request: Request) {
  try {
    const { challengeId, code } = await request.json();
    if (typeof challengeId !== "string" || typeof code !== "string") {
      return NextResponse.json({ error: "Missing challenge or code" }, { status: 400 });
    }
    const userId = await consumeChallenge(challengeId);
    if (!userId) {
      return NextResponse.json(
        { error: "Challenge expired. Please sign in again." },
        { status: 401 }
      );
    }
    const user = await getUserById(userId);
    if (!user || !user.is_active || !user.totp_secret) {
      return NextResponse.json({ error: "Invalid session." }, { status: 401 });
    }
    if (!verifyTotp(user.totp_secret, code)) {
      return NextResponse.json({ error: "Invalid code." }, { status: 401 });
    }

    // First successful verify — mark enrolled.
    if (!user.totp_enrolled_at) {
      const admin = getSupabaseAdmin();
      if (admin) {
        await admin
          .from("app_users")
          .update({ totp_enrolled_at: new Date().toISOString() })
          .eq("id", user.id);
      }
    }

    const ua = request.headers.get("user-agent");
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const { token, expiresAt } = await createSession(user.id, {
      userAgent: ua ?? undefined,
      ip: ip ?? undefined,
    });
    await setSessionCookie(token, expiresAt);
    return NextResponse.json({ user: toSessionUser(user) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verify failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
