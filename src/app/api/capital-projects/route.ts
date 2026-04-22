import { NextResponse } from "next/server";
import {
  deleteCapitalProject,
  listCapitalProjects,
  upsertCapitalProject,
} from "@/lib/capital-projects-db";
import type { CapitalProject } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * GET /api/capital-projects
 *   (no params) → all projects
 *   ?property_id=X → projects for one property
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const propertyId = url.searchParams.get("property_id") || undefined;
    const projects = await listCapitalProjects({ propertyId });
    return NextResponse.json({ projects });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/**
 * POST /api/capital-projects — upsert (create or replace).
 * Body: full CapitalProject shape.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CapitalProject;
    if (!body?.id || !body?.propertyId || !body?.name) {
      return NextResponse.json({ error: "Missing id / propertyId / name" }, { status: 400 });
    }
    const saved = await upsertCapitalProject(body);
    return NextResponse.json({ project: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

/** DELETE /api/capital-projects?id=<id> */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteCapitalProject(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}
