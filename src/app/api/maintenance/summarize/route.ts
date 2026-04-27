import { NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

type Item = { id: string; text: string };

/**
 * POST /api/maintenance/summarize
 * Body: { items: [{ id, text }] }
 * Returns: { summaries: [{ id, summary }] }
 *
 * Tenant-written work order descriptions are often long, rambling, and
 * full of typos. This endpoint asks Claude Haiku to compress each one
 * to a short, scannable phrase suitable for a meeting agenda row.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? (body.items as Item[]) : [];
    const valid = items
      .filter((i) => i && typeof i.id === "string" && typeof i.text === "string" && i.text.trim().length > 0)
      .slice(0, 30);
    if (valid.length === 0) {
      return NextResponse.json({ summaries: [] });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({
        summaries: valid.map((i) => ({ id: i.id, summary: fallbackTrim(i.text) })),
      });
    }

    const numbered = valid
      .map((i, idx) => `${idx + 1}. ${i.text.slice(0, 800)}`)
      .join("\n");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 600,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Each line below is a tenant-written maintenance request. For each, write a SHORT (max 8 words) plain-English summary that captures what's broken and where. Drop greetings, apologies, repetition, and politeness. Title-case only the first word.

Return a JSON array of strings in the SAME order as the inputs, with the same length. No keys, no commentary, just the array.

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
        summaries: valid.map((i) => ({ id: i.id, summary: fallbackTrim(i.text) })),
      });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || "";
    let parsed: string[] = [];
    try {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {
      parsed = [];
    }

    const summaries = valid.map((i, idx) => ({
      id: i.id,
      summary: (parsed[idx] || fallbackTrim(i.text)).trim(),
    }));
    return NextResponse.json({ summaries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

function fallbackTrim(s: string): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length <= 60 ? cleaned : cleaned.slice(0, 57) + "…";
}
