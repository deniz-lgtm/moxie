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

- "priority": one of ${PRIORITIES.map((p) => `"${p}"`).join(", ")}. Use the response-time rule:

  • "emergency" — Someone has to be dispatched RIGHT NOW. If we wait, people get hurt or property gets damaged. ONLY these scenarios qualify (and their direct equivalents):
      (1) Active flooding or major water intrusion that's spreading damage right now — burst pipe, water pouring through the ceiling, pooling water. A drip, a slow leak, a stain, or a contained leak under a sink is NOT emergency.
      (2) Active fire, visible smoke from a non-cooking source, gas leak, smell of gas, or carbon monoxide alarm currently sounding for a real CO event. CRITICAL: a smoke/fire/CO alarm that is BEEPING, CHIRPING, or has a LOW BATTERY is NOT an emergency — that's a battery swap (classify as "low"). Only treat alarms as emergency when the tenant describes an actual fire, smoke, or gas event.
      (3) Whole-unit power outage — the entire apartment has no electricity. CRITICAL: a single dead outlet, one tripped breaker, one room with no power, or "outlets in the bedroom don't work" are NOT emergency — those are "medium" unless the tenant says it affects the whole unit.
      (4) Tenant is locked out, OR the unit cannot be secured (broken exterior door / deadbolt, exterior window won't close or lock, broken lock).
      (5) Active sewage backup overflowing into the unit.
    Nothing outside this list is "emergency". When in doubt, choose lower.

  • "high" — The kind of thing right below an emergency. Can wait a day but NOT overnight without real impact on the tenant's habitability or causing property damage. Examples: no heat in cold weather, no AC in hot weather, no hot water, refrigerator not cooling (food will spoil), persistent active leak (not flooding), only-toilet-in-the-unit not flushing, security concern that doesn't yet prevent securing the unit, infestation discovered today.

  • "medium" — Affects function or comfort but the tenant can wait a few days. This is the DEFAULT for most broken-but-not-urgent stuff. Examples: toilet won't flush (when there are multiple bathrooms), washer/dryer broken, dishwasher broken, stove or oven broken, garbage disposal broken, single dead outlet, one room's outlets out, slow drain, ceiling fan broken, intermittent issues, smoke or fire alarm beeping for battery, light fixture out, minor leak that's contained, drip from a faucet, pest sighting (not infestation).

  • "low" — Cosmetic or convenience only, "when you have time" stuff. Examples: paint touch-up, scuffs, drawer alignment, minor stains, replacing dead bulbs, doorbell, anything the tenant frames as a preference or non-urgent request.

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

  // Smoke/fire/CO alarm beeping for a low battery is the most common false
  // emergency — catch it before any other rule and downgrade to low.
  const isAlarmBatteryChirp =
    /\b(smoke|fire|carbon\s+monoxide|co)\s+(alarm|detector)\b/.test(t) &&
    /\b(beep|chirp|low\s*batt|needs?\s+(a\s+)?batter|replace\s+batter)/.test(t);
  if (isAlarmBatteryChirp) return "low";

  // Emergency: only the five operator-defined scenarios. Each pattern is
  // worded so that single-room or contained problems don't trigger.
  const isFlooding =
    /\bflood(ing|ed)?\b|\bburst\s+pipe\b|water\s+(pouring|gushing|everywhere)|ceiling\s+(collapsed|caving)/.test(
      t
    );
  const isFireOrGas =
    /\bgas\s+(leak|smell)\b|\bsmell\s+of\s+gas\b|\bcarbon\s+monoxide\b|\bactive\s+fire\b|\bhouse\s+is\s+on\s+fire\b|\bvisible\s+smoke\b/.test(
      t
    );
  const isWholeUnitNoPower =
    /(no\s+power|power\s+is\s+out|no\s+electricity|whole\s+unit\s+(is\s+)?(no|out|without)\s+power|entire\s+(unit|apartment)\s+(no|out|without)\s+power)/.test(
      t
    ) &&
    !/(outlet|one\s+room|bedroom|kitchen\s+only|breaker\s+tripped|single)/.test(t);
  const isSewageBackup = /sewage\s+(backup|overflow|coming\s+up)|sewer\s+backup/.test(t);
  const isLockoutOrUnsecured =
    /\block(ed)?\s+out\b|can'?t\s+(lock|secure|close)\s+(the\s+)?(door|window)|won'?t\s+(lock|secure|close)|broken\s+(front\s+door|back\s+door|exterior\s+door|deadbolt|exterior\s+lock)/.test(
      t
    );
  if (isFlooding || isFireOrGas || isWholeUnitNoPower || isSewageBackup || isLockoutOrUnsecured) {
    return "emergency";
  }

  // High: livability / property-loss issues that can't wait overnight.
  if (
    /no\s+hot\s+water|no\s+heat\b|no\s+a\/?c\b|no\s+air\s+condition|refrigerator\s+(not|won'?t).*(cool|work)|fridge\s+(broken|not\s+cool|won'?t\s+cool)|persistent(ly)?\s+leak|continuously\s+leak|leak.*through\s+ceiling|infestation/.test(
      t
    )
  ) {
    return "high";
  }

  // Low: cosmetic / convenience.
  if (
    /paint|cosmetic|scuff|when\s+you\s+(get\s+a\s+chance|have\s+time)|whenever|small\s+request|minor\s+request/.test(
      t
    )
  ) {
    return "low";
  }

  // Default to medium for everything else (toilet, washer, single outlet,
  // dishwasher, stove, slow drain, intermittent…).
  return "medium";
}

function fallbackTitle(i: { title: string; description: string }): string {
  const source = (i.title || i.description).replace(/\s+/g, " ").trim();
  if (!source) return "Work order";
  const words = source.split(" ");
  const truncated = words.length <= 8 ? source : words.slice(0, 8).join(" ") + "…";
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
}
