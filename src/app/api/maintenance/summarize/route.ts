import { NextResponse } from "next/server";
import { getMeetingSummaries, saveMeetingSummary } from "@/lib/work-orders-db";

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
 *
 * Summaries are cached on `work_order_annotations.meeting_summary` so
 * the AI call only ever happens once per work order — every subsequent
 * request short-circuits to the cached value, regardless of which
 * browser or teammate triggered the original.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? (body.items as Item[]) : [];
    const valid = items
      .filter(
        (i) =>
          i &&
          typeof i.id === "string" &&
          typeof i.text === "string" &&
          i.text.trim().length > 0
      )
      .slice(0, 30);
    if (valid.length === 0) {
      return NextResponse.json({ summaries: [] });
    }

    // Server-side cache lookup. Anything already summarized is returned
    // verbatim; only items still missing flow into the AI request.
    const cached = await getMeetingSummaries(valid.map((i) => i.id));
    const toGenerate = valid.filter((i) => !cached.has(i.id));

    const summaries: { id: string; summary: string }[] = [];
    for (const i of valid) {
      const cachedSummary = cached.get(i.id);
      if (cachedSummary) summaries.push({ id: i.id, summary: cachedSummary });
    }

    if (toGenerate.length === 0) {
      return NextResponse.json({ summaries });
    }

    if (!ANTHROPIC_API_KEY) {
      // No API key — synthesize a fallback so callers always get
      // something. Don't persist these (they aren't AI-generated, and
      // we want a real summary the next time the key is configured).
      for (const i of toGenerate) {
        summaries.push({ id: i.id, summary: fallbackTrim(i.text) });
      }
      return NextResponse.json({ summaries });
    }

    const numbered = toGenerate
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
      for (const i of toGenerate) {
        summaries.push({ id: i.id, summary: fallbackTrim(i.text) });
      }
      return NextResponse.json({ summaries });
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

    // Persist new summaries in parallel — don't block the response on
    // it, but await them so callers see the cache populated immediately.
    await Promise.all(
      toGenerate.map(async (i, idx) => {
        const summary = (parsed[idx] || fallbackTrim(i.text)).trim();
        summaries.push({ id: i.id, summary });
        try {
          await saveMeetingSummary(i.id, summary);
        } catch {
          // Swallow persistence errors — the client still gets the
          // summary back, we just may regenerate it next time.
        }
      })
    );

    return NextResponse.json({ summaries });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function fallbackTrim(s: string): string {
  const cleaned = s.replace(/\s+/g, " ").trim();
  return cleaned.length <= 60 ? cleaned : cleaned.slice(0, 57) + "…";
}
