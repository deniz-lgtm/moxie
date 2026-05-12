import { NextResponse } from "next/server";
import { getActionItem, updateActionItem } from "@/lib/meetings-db";
import { getSupabase } from "@/lib/supabase";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

/**
 * POST /api/tasks/suggest-next-step?id=<action_item_id>
 *
 * Uses Claude Haiku to suggest the single most useful next step for a task,
 * based on its title, description, status, owner, and most recent comments.
 * Caches the suggestion on meeting_action_items.ai_next_step so repeat opens
 * don't re-call the model.
 *
 * Returns { suggestion: string, generatedAt: string } or { error }.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: "ANTHROPIC_API_KEY missing — cannot suggest a next step." },
        { status: 500 },
      );
    }

    const item = await getActionItem(id);
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const recentComments = (item.comments || [])
      .slice(-3)
      .map((c) => `- ${c.text}`)
      .join("\n");

    const today = new Date().toISOString().slice(0, 10);
    const prompt = `You are a property-management ops coach. Suggest the single most useful next step for this task, in one short sentence (max 18 words). Be specific and actionable. No preamble.

Task: ${item.title}
${item.description ? `Description: ${item.description}\n` : ""}Status: ${item.status}${item.priority ? ` · priority: ${item.priority}` : ""}
${item.assigned_to ? `Owner: ${item.assigned_to}` : "Owner: unassigned"}
${item.due_date ? `Due: ${item.due_date} (today is ${today})` : `Today is ${today}`}
${recentComments ? `\nRecent comments:\n${recentComments}` : ""}

Next step:`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 120,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Model call failed: ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    const suggestion = (data?.content?.[0]?.text || "").trim();
    if (!suggestion) {
      return NextResponse.json({ error: "Empty suggestion" }, { status: 502 });
    }

    // Cache on the row. Update goes through Supabase directly so we can write
    // the two AI columns without expanding the typed UpdateActionItemInput.
    const sb = getSupabase();
    if (sb) {
      const generatedAt = new Date().toISOString();
      await sb
        .from("meeting_action_items")
        .update({ ai_next_step: suggestion, ai_next_step_at: generatedAt })
        .eq("id", id);
      return NextResponse.json({ suggestion, generatedAt });
    }
    // Fallback shouldn't really happen — Supabase is required to read the item
    // in the first place. Returning unsaved suggestion still helps the UI.
    return NextResponse.json({ suggestion, generatedAt: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed" }, { status: 500 });
  }
}

// Silence unused-import lint: updateActionItem is reserved for a future
// "regenerate via typed update" code path.
void updateActionItem;
