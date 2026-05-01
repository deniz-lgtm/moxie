import { NextResponse } from "next/server";
import { listSigningRequests } from "@/lib/signing-db";
import type { SigningRequestStatus } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/signing/requests?source_type=&source_id=&status=&recipient_email=&limit=
 *
 * Lists signing requests with optional filters. Used by:
 *   - the move-out wizard's status chip (filtered to source_id=<inspection.id>)
 *   - the future /documents page (no filter, full list)
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const sourceType = url.searchParams.get("source_type") ?? undefined;
    const sourceId = url.searchParams.get("source_id") ?? undefined;
    const status = (url.searchParams.get("status") ?? undefined) as SigningRequestStatus | undefined;
    const recipientEmail = url.searchParams.get("recipient_email") ?? undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Math.min(500, Math.max(1, Number(limitRaw))) : undefined;

    const requests = await listSigningRequests({
      sourceType,
      sourceId,
      status,
      recipientEmail,
      limit,
    });
    return NextResponse.json({ requests });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
