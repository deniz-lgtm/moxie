import { NextResponse } from "next/server";
import { saveAnnotation } from "@/lib/work-orders-db";
import { getSupabase } from "@/lib/supabase";
import type { MaintenanceCategory, MaintenancePriority } from "@/lib/types";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

type Item = {
  id: string;
  title?: string;
  description?: string;
};

type Classification = {
  id: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  title: string;
};

const CATEGORIES: MaintenanceCategory[] = [
  "plumbing",
  "electrical",
  "hvac",
  "appliance",
  "structural",
  "pest",
  "locksmith",
  "general",
];

const PRIORITIES: MaintenancePriority[] = ["emergency", "high", "medium", "low"];

/**
 * POST /api/maintenance/classify
 * Body: { items: [{ id, title?, description? }] }
 * Returns: { classifications: [{ id, category, priority, title }] }
 *
 * Asks Claude to assign a category, an urgency, and a clean short title to
 * each work order based on the tenant-written description. Falls back to
 * deterministic keyword rules when no API key is configured or the model
 * call fails. Bulk-call so a meeting/dashboard load only does one request.
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
      }))
      .filter((i) => i.title.length > 0 || i.description.length > 0)
      .slice(0, 30);

    if (valid.length === 0) {
      return NextResponse.json({ classifications: [] });
    }

    if (!ANTHROPIC_API_KEY) {
      const classifications = valid.map((i) => fallbackClassify(i));
      await persistClassifications(classifications);
      return NextResponse.json({ classifications });
    }

    const numbered = valid
      .map(
        (i, idx) =>
          `${idx + 1}. TITLE: ${i.title.slice(0, 200) || "(none)"}\n   DESCRIPTION: ${
            i.description.slice(0, 1200) || "(none)"
          }`
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
                text: `You are triaging tenant-written maintenance requests for a property manager.

For each numbered request below, output ONE JSON object with:
- "category": one of ${CATEGORIES.map((c) => `"${c}"`).join(", ")}.
  Pick the most specific category. Only use "general" when nothing else fits.
- "priority": one of ${PRIORITIES.map((p) => `"${p}"`).join(", ")}. Use:
  • "emergency" — RESERVED for the four operator-defined emergency scenarios (and their direct equivalents):
      (1) Flooding / active major water intrusion (burst pipe, ceiling collapse from water, pooling water).
          A dripping or slow leak is NOT an emergency — that's "high".
      (2) Fire, smoke, gas leak, or carbon monoxide alarm — anything life-safety from fire/gas.
      (3) No power to the entire unit (whole-unit outage). A single dead outlet or one tripped breaker is NOT emergency — that's "high".
      (4) Locked out, OR the unit cannot be secured (broken exterior door / deadbolt / window that won't close).
    Nothing else is "emergency". When in doubt, choose "high".
  • "high" — urgent but not in the four emergency scenarios above. Examples: dripping or persistent leak, no hot water, no heat, broken AC, broken refrigerator/stove/oven, pest infestation, sewage backup, single dead outlet/circuit, security concern that doesn't prevent securing the unit.
  • "medium" — slow drain, intermittent issue, cosmetic damage causing inconvenience, minor leak, things that need attention this week.
  • "low" — cosmetic, paint, scuffs, minor request, preference, "when you have time".
- "title": a SHORT plain-English summary, max 8 words, captures what's broken and where (e.g. "Kitchen sink leaking under cabinet"). Title-case first word only. Drop greetings and politeness.

Return a JSON array of objects in the SAME order and length as the inputs. No keys outside the array, no commentary.

Inputs:
${numbered}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const classifications = valid.map((i) => fallbackClassify(i));
      await persistClassifications(classifications);
      return NextResponse.json({ classifications });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text || "";
    let parsed: Array<Partial<Classification>> = [];
    try {
      const m = text.match(/\[[\s\S]*\]/);
      if (m) parsed = JSON.parse(m[0]);
    } catch {
      parsed = [];
    }

    const classifications: Classification[] = valid.map((i, idx) => {
      const raw = parsed[idx] || {};
      const category = CATEGORIES.includes(raw.category as MaintenanceCategory)
        ? (raw.category as MaintenanceCategory)
        : fallbackCategory(i);
      const priority = PRIORITIES.includes(raw.priority as MaintenancePriority)
        ? (raw.priority as MaintenancePriority)
        : fallbackPriority(i);
      const title = (raw.title || "").toString().trim().slice(0, 80) || fallbackTitle(i);
      return { id: i.id, category, priority, title };
    });

    await persistClassifications(classifications);
    return NextResponse.json({ classifications });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Classify failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Best-effort persistence — on first install / portfolio 25 we won't have
// a Supabase work_order_annotations row to write to. We don't want a
// missing table to fail the user-facing classify call.
async function persistClassifications(classifications: Classification[]): Promise<void> {
  if (classifications.length === 0) return;
  if (!getSupabase()) return;
  const now = new Date().toISOString();
  await Promise.all(
    classifications.map(async (c) => {
      try {
        await saveAnnotation(c.id, {
          ai_category: c.category,
          ai_priority: c.priority,
          ai_title: c.title,
          ai_classified_at: now,
        });
      } catch {
        /* ignore individual failures so one bad row doesn't kill the batch */
      }
    })
  );
}

function fallbackClassify(i: { id: string; title: string; description: string }): Classification {
  return {
    id: i.id,
    category: fallbackCategory(i),
    priority: fallbackPriority(i),
    title: fallbackTitle(i),
  };
}

function fallbackCategory(i: { title: string; description: string }): MaintenanceCategory {
  const t = `${i.title} ${i.description}`.toLowerCase();
  if (/plumb|leak|drain|toilet|faucet|sink|shower|tub|water.?heater|hot.?water|sewer/.test(t)) return "plumbing";
  if (/electric|wiring|outlet|breaker|fuse|light(?!.?ing)|lightbulb|lighting|power/.test(t)) return "electrical";
  if (/hvac|a\/?c\b|air.?cond|heating|heat(?!er)|thermostat|furnace|ventilat/.test(t)) return "hvac";
  if (/appliance|refrigerator|fridge|washer|dryer|oven|dishwasher|stove|range|microwave|disposal/.test(t)) return "appliance";
  if (/roof|wall|floor|window|door|ceiling|drywall|paint|fence|gate|balcony|railing|stairs|concrete/.test(t)) return "structural";
  if (/pest|rodent|roach|mice|rat|ant|insect|bug|termite|bedbug/.test(t)) return "pest";
  if (/lock|key(?!pad)|deadbolt|keypad/.test(t)) return "locksmith";
  return "general";
}

function fallbackPriority(i: { title: string; description: string }): MaintenancePriority {
  const t = `${i.title} ${i.description}`.toLowerCase();
  // Emergency: flooding, fire, no power (whole unit), locked out — plus
  // direct equivalents (gas leak, CO, smoke, burst pipe, can't secure unit).
  if (
    /flood|burst pipe|water (pouring|gushing|everywhere)|ceiling (collapsed|caving)|fire\b|smoke|gas (leak|smell)|carbon monoxide|no power|power.?(out|outage)|locked out|can'?t lock|won'?t lock|door (won'?t|can'?t) (close|lock|secure)/.test(t)
  ) {
    return "emergency";
  }
  // High: urgent but not one of the four emergency scenarios. Note dripping
  // and persistent leaks live here, not emergency.
  if (
    /no hot water|no heat|broken|won'?t (work|turn|start)|not working|infest|leak|drip|sewage|burst|electrical hazard|sparking|fridge|refrigerator|stove|oven/.test(t)
  ) {
    return "high";
  }
  if (/slow|intermittent|sometimes|stain|clog/.test(t)) return "medium";
  if (/paint|cosmetic|scuff|when you (get a chance|have time)|whenever|small|minor/.test(t)) return "low";
  return "medium";
}

function fallbackTitle(i: { title: string; description: string }): string {
  const source = (i.title || i.description).replace(/\s+/g, " ").trim();
  if (!source) return "Work order";
  const words = source.split(" ");
  const truncated = words.length <= 8 ? source : words.slice(0, 8).join(" ") + "…";
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
}
