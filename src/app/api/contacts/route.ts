import { NextRequest, NextResponse } from "next/server";
import { listContacts, upsertContact, deleteContact } from "@/lib/contacts-db";
import type { Contact, ContactRole } from "@/lib/types";

export async function GET() {
  try {
    const contacts = await listContacts();
    return NextResponse.json({ contacts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to fetch" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const contact = body.contact as Partial<Contact> | undefined;
    if (!contact?.name || !contact?.id) {
      return NextResponse.json({ error: "Missing id or name" }, { status: 400 });
    }
    const saved = await upsertContact({
      id: contact.id,
      name: contact.name,
      role: contact.role as ContactRole | undefined,
      email: contact.email,
      phone: contact.phone,
      department: contact.department,
      notes: contact.notes,
      isActive: contact.isActive ?? true,
      createdAt: contact.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, contact: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to save" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    await deleteContact(id);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete" }, { status: 500 });
  }
}
