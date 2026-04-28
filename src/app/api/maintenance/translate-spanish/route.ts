import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

type Item = {
  id: string;
  title?: string;
  description?: string;
  propertyName?: string;
  unitNumber?: string;
};

type Translation = {
  id: string;
  text: string;
};

/**
 * POST /api/maintenance/translate-spanish
 * Body: { items: [{ id, title, description, propertyName, unitNumber }] }
 * Returns: { translations: [{ id, text }] }
 *
 * Produces a WhatsApp-ready, copy-pasteable block per work order:
 *   <Property> #<Unit>
 *   <short Spanish description, 1–2 lines>
 *
 * Used by the admin to forward concise tasks to the maintenance tech in
 * Spanish without manually rewriting each one.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? (body.items as Item[]) : [];
    const valid = items
      .filter((i) => i && typeof i.id === "string")
      .map((i) => ({
        id: i.id,
        title: String(i.title ?? "").trim(),
        description: String(i.description ?? "").trim(),
        propertyName: String(i.propertyName ?? "").trim(),
        unitNumber: String(i.unitNumber ?? "").trim(),
      }))
      .slice(0, 30);

    if (valid.length === 0) {
      return NextResponse.json({ translations: [] });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({
        translations: valid.map((i) => ({
          id: i.id,
          text: fallbackText(i),
        })),
      });
    }

    const numbered = valid
      .map(
        (i, idx) =>
          `${idx + 1}. PROPERTY: ${i.propertyName || "(unknown)"}\n   UNIT: ${
            i.unitNumber || "(unknown)"
          }\n   ENGLISH: ${(i.description || i.title || "").slice(0, 1200)}`
      )
      .join("\n\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `For each numbered tenant maintenance request below, write a short WhatsApp message in Spanish for our maintenance technician. Format each one EXACTLY like this, with a blank line nowhere inside the message:

<Property> #<Unit>
<1–2 line Spanish description of the issue>

Rules:
- The first line is the property name and unit number, taken verbatim from the input. If unit is unknown, leave just the property name.
- The Spanish description must be concise and direct (max ~25 words), drop greetings, apologies, and tenant emotion. Use plain Mexican Spanish a tradesperson would understand.
- Do NOT add greetings, signatures, emojis, or extra commentary.
- Return a JSON array of objects: [{ "text": "<the formatted block>" }, ...] in the SAME order as the inputs. No keys outside the array.

Inputs:
${numbered}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      return NextResponse.json({
        translations: valid.map((i) => ({ id: i.id, text: fallbackText(i) })),
      });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || "";
    let parsed: Array<{ text?: string }> = [];
    try {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {
      parsed = [];
    }

    const translations: Translation[] = valid.map((i, idx) => {
      const raw = parsed[idx]?.text || "";
      const cleaned = String(raw).trim();
      return {
        id: i.id,
        text: cleaned || fallbackText(i),
      };
    });

    return NextResponse.json({ translations });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Translate failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function fallbackText(i: {
  title: string;
  description: string;
  propertyName: string;
  unitNumber: string;
}): string {
  const header = i.unitNumber ? `${i.propertyName} #${i.unitNumber}` : i.propertyName;
  const body = (i.description || i.title || "").replace(/\s+/g, " ").trim().slice(0, 200);
  return `${header}\n${body}`.trim();
}
