import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

/**
 * POST /api/meetings/extract-actions
 *
 * Body: { transcript: string, attendees?: string[], context?: string }
 *
 * Uses Claude to extract a list of action items from a meeting transcript.
 * Returns { items: [{ title, description, assignedTo?, dueDate?, priority? }] }.
 * If ANTHROPIC_API_KEY is missing, returns an empty array with a notice so
 * the UI can fall back to manual entry.
 */
export async function POST(req: NextRequest) {
  try {
    const { transcript, attendees, context } = await req.json();
    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 10) {
      return NextResponse.json({ items: [], notice: "Transcript too short" });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({
        items: [],
        notice: "ANTHROPIC_API_KEY missing — add it to extract action items automatically.",
      });
    }

    const today = new Date().toISOString().slice(0, 10);
    const attendeeList = Array.isArray(attendees) && attendees.length > 0
      ? attendees.join(", ")
      : "unknown";

    const systemPrompt = `You are an executive assistant for Moxie Management, a residential property management company. Your job is to listen to the transcript of a weekly property meeting and extract concrete action items that need to be tracked on a task board.

Rules:
1. Return a JSON array of action items. No prose before or after.
2. Each item is: { "title": string, "description": string, "assignedTo": string|null, "dueDate": "YYYY-MM-DD"|null, "priority": "low"|"medium"|"high"|null }
3. "title" is short (6-10 words), imperative voice. "description" adds context from the transcript in 1-2 sentences.
4. Only include concrete commitments (someone will do X by Y). Ignore general discussion, status updates without a next step, and pleasantries.
5. Prefer attendee names from this list when assigning: ${attendeeList}. If the speaker doesn't name an owner, set assignedTo to null.
6. Convert relative dates ("by Friday", "next week", "end of month") into absolute YYYY-MM-DD based on today (${today}). If no date is mentioned, set dueDate to null.
7. Use priority "high" for safety, legal, or tenant-impacting issues; "medium" for most operational follow-ups; "low" for nice-to-haves; null if unclear.
8. If no action items can be extracted, return an empty array [].`;

    const userPrompt = `Meeting transcript:
---
${transcript.slice(0, 20000)}
---

${context ? `Meeting context:\n${context}\n\n` : ""}Return the JSON array of action items.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[extract-actions] API error:", err);
      return NextResponse.json({ items: [], notice: `Claude error ${response.status}` });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return NextResponse.json({ items: [] });

    try {
      const items = JSON.parse(match[0]);
      if (!Array.isArray(items)) return NextResponse.json({ items: [] });
      return NextResponse.json({
        items: items.map((i: any) => ({
          title: String(i.title || "").slice(0, 200),
          description: i.description ? String(i.description) : "",
          assignedTo: i.assignedTo || null,
          dueDate: i.dueDate || null,
          priority: i.priority || null,
        })),
      });
    } catch {
      return NextResponse.json({ items: [] });
    }
  } catch (error: any) {
    console.error("[extract-actions] error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to extract action items" },
      { status: 500 }
    );
  }
}
