import { NextResponse } from "next/server";
import { getSigningRequest } from "@/lib/signing-db";

export const dynamic = "force-dynamic";

/** GET /api/signing/requests/[id] — single request lookup. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const r = await getSigningRequest(params.id);
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ request: r });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
