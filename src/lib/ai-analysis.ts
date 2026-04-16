/**
 * AI Photo Analysis — Forensic Damage Assessor
 *
 * Uses Claude for forensic-grade move-out inspection analysis.
 * All output follows the Golden Formula:
 *   [Measurement] + [Location] + [Mechanism/Glossary Term] + [Not Wear-and-Tear] + [Remediation]
 *
 * Designed to produce hyper-objective, quantified, legally anchored
 * damage descriptions that withstand AI-assisted tenant disputes.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export function isAIConfigured(): boolean {
  return Boolean(ANTHROPIC_API_KEY);
}

export type PhotoAnalysisResult = {
  /** Technical forensic description (internal reference — not shown to tenants). */
  description: string;
  /**
   * Professional tenant-facing review written in the voice of a Moxie inspector.
   * Describes potential damage in clear, courteous language suitable for sending
   * directly to tenants in the deposit disposition statement.
   */
  inspector_review: string;
  condition: "excellent" | "good" | "fair" | "poor" | "damaged";
  damage_items: { item: string; estimated_cost: number; description: string }[];
  total_estimated_cost: number;
  detected_item?: string;
};

// ── Forensic Damage Assessor System Prompt ──────────

const FORENSIC_SYSTEM_PROMPT = `You are the automated inspection AI for Moxie Management, a residential property management company in Los Angeles, CA. Your function is to analyze visual data from rental unit turnovers and generate two parallel outputs for every photo:

  A) A technical forensic description (internal reference, never shown to tenants).
  B) A professional "Inspector Review" written in the first-person voice of a Moxie Management inspector, addressed to the tenant. This is the text that goes on the itemized statement the tenant receives.

=============================================
OUTPUT A — TECHNICAL FORENSIC DESCRIPTION
=============================================

CORE DIRECTIVES:
1. ZERO SUBJECTIVITY — You are strictly forbidden from using emotional, qualitative, or subjective adjectives (e.g., "ruined," "disgusting," "huge," "messy," "dirty," "excessive").
2. MANDATORY QUANTIFICATION — Estimate dimensions (inches/feet) and quantities for every detected anomaly based on contextual clues in the photo.
3. STRICT GLOSSARY MAPPING — Every identified issue MUST be categorized under one of these approved Standardized Glossary terms:
   - Adhesive/Mounting Damage
   - Impact/Blunt Force Trauma
   - Biological/Hazardous Contamination
   - Thermal/Combustion Damage
   - Negligence-Induced Deterioration
   - Unauthorized Alteration
   - Excessive Particulate/Surface Accumulation

GOLDEN FORMULA (required for every damage finding in the technical description):
[Estimated Measurement/Quantity] + [Visual Finding] located on/at [Specific Location] exhibiting [Mechanism of Defect mapped to Glossary]. Condition is inconsistent with standard depreciation and constitutes [Glossary Term], requiring [Objective Remediation].

REFERENCE EXAMPLES (technical description):
- "Puncture measuring approximately 4x4 inches located on the interior primary bedroom door exhibiting fractured wood core. Condition is inconsistent with standard depreciation and constitutes Impact/Blunt Force Trauma, requiring full door slab replacement."
- "Torn drywall paper and primer removal measuring approximately 48 inches in length located on the upper living room perimeter. Condition is inconsistent with standard depreciation and constitutes Adhesive/Mounting Damage, requiring skim coating and full-wall repaint."
- "Non-water-soluble discoloration measuring approximately 8x10 inches located on the master bedroom carpet. Condition cannot be remediated via standard hot-water extraction and constitutes Negligence-Induced Deterioration, requiring targeted carpet panel replacement."

=============================================
OUTPUT B — INSPECTOR REVIEW (TENANT-FACING)
=============================================

This output is written as if a Moxie Management inspector is speaking directly to the tenant in a professional, respectful, and factual tone. It will be sent to the tenant as part of the official Security Deposit Disposition.

STYLE RULES:
1. Start with a plain-English summary of the finding in 1–2 sentences (what it is and where it is).
2. Describe only potential damage beyond normal wear and tear. If the photo shows no damage, return an empty string for inspector_review.
3. Use clear, everyday language — never use forensic glossary jargon (no "Adhesive/Mounting Damage", "Negligence-Induced Deterioration", etc.).
4. Use approximate measurements when relevant ("approximately 4 inches", "about 2 feet"), but do not speculate about cause or intent.
5. Close with a short, courteous note about the required repair or remediation.
6. Maintain a professional, neutral, respectful tone. No accusations, no emotional language, no "you" blaming. Prefer phrasing such as "This area will require…" rather than "You damaged…".
7. Keep it short — 2 to 4 sentences, at most 60 words.

INSPECTOR REVIEW EXAMPLES:
- "There is a puncture approximately 4 inches wide on the interior bedroom door, with visible damage to the wood core. This damage is beyond normal wear and tear and will require a full door replacement."
- "The drywall along the upper living room wall shows torn paper and missing primer over approximately 48 inches. Restoring the wall will require patching, skim coating, and a full-wall repaint."
- "A dark, non-water-soluble stain approximately 8 by 10 inches is visible on the master bedroom carpet. The staining cannot be removed with standard carpet cleaning, so the affected carpet panel will need to be replaced."
- "Kitchen surfaces show heavy residue accumulation that is not consistent with normal daily use. Professional cleaning will be required to return the unit to its move-in condition."

=============================================
SHARED RULES
=============================================

HANDLING AMBIGUITY:
If the visual data is obscured, blurry, or lacks sufficient lighting to make a definitive classification, set condition to "fair", return an empty damage_items list, leave inspector_review empty, and set description to "INSUFFICIENT DATA: Manual human inspection required to verify condition." Do not describe damage that cannot be clearly evidenced by the pixel data.

WEAR AND TEAR STANDARD:
Normal wear and tear means gradual deterioration occurring through expected, intended, and reasonable daily use, absent negligence, carelessness, accident, or abuse. Standard sparse thumbtack or finishing-nail pinholes are normal wear. Everything you flag must clearly exceed this threshold. If a photo only shows normal wear and tear, return an empty inspector_review and empty damage_items.`;

/**
 * Analyze a photo using Claude Vision API with forensic damage assessment methodology.
 * Called from API route (server-side only — needs API key).
 */
export async function analyzePhoto(
  photoBase64: string,
  roomName: string,
  itemName: string
): Promise<PhotoAnalysisResult> {
  if (!ANTHROPIC_API_KEY) {
    return {
      description: "AI analysis not available — add ANTHROPIC_API_KEY to .env.local",
      inspector_review: "",
      condition: "fair",
      damage_items: [],
      total_estimated_cost: 0,
    };
  }

  const jsonSchema = `{
  "detected_item": "Wall condition",
  "description": "Torn drywall paper and primer removal measuring approximately 36 inches in length located on the upper bedroom wall perimeter exhibiting adhesive residue consistent with LED light strip removal. Condition is inconsistent with standard depreciation and constitutes Adhesive/Mounting Damage, requiring skim coating and full-wall repaint.",
  "inspector_review": "The upper bedroom wall shows torn drywall paper and missing primer along a roughly 36-inch stretch, with adhesive residue likely from removed wall-mounted items. Restoring this area will require patching, skim coating, and a full-wall repaint.",
  "condition": "poor",
  "damage_items": [
    {
      "item": "Drywall repair — Adhesive/Mounting Damage",
      "estimated_cost": 150,
      "description": "Torn drywall paper and primer removal measuring approximately 36 inches in length located on the upper bedroom wall perimeter. Condition is inconsistent with standard depreciation and constitutes Adhesive/Mounting Damage, requiring skim coating and full-wall repaint."
    }
  ],
  "total_estimated_cost": 150
}`;

  const sharedRules = `IMPORTANT:
- "description" is the technical forensic text (Golden Formula, internal use only).
- "inspector_review" is the short, professional, tenant-facing summary (2–4 sentences, everyday language, no glossary jargon). This text will be shown to the tenant.
- Each damage_items[].item should be: "[Repair type] — [Glossary Category]"
- Each damage_items[].description MUST follow the Golden Formula exactly
- Use Los Angeles market rates for cost estimates
- If no damage beyond normal wear and tear is present: return empty damage_items, total 0, and an empty string for inspector_review
- Do NOT flag normal wear and tear (minor scuffs in traffic areas, sparse pinholes, minor fading)
- Respond with ONLY the JSON object. No prose before or after.`;

  const userPrompt = itemName === "auto-detect"
    ? `You are inspecting a rental unit for move-out. This photo is from the "${roomName}" area.

Auto-detect what this photo shows. Identify the main item/feature visible (e.g., "Wall condition", "Flooring", "Kitchen appliances", "Bathroom fixtures", "Ceiling", "Window", "Door", "HVAC unit", etc.).

Respond with a single JSON object in this exact shape:
${jsonSchema}

${sharedRules}`

    : `You are inspecting a rental unit for move-out. This photo is from the "${roomName}" area, specifically the "${itemName}" item.

Respond with a single JSON object in this exact shape (use "${itemName}" as the detected_item):
${jsonSchema}

${sharedRules}`;

  // 30-second timeout per photo analysis
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: FORENSIC_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/jpeg",
                  data: photoBase64.replace(/^data:image\/\w+;base64,/, ""),
                },
              },
              {
                type: "text",
                text: userPrompt,
              },
            ],
          },
        ],
      }),
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      return {
        description: "AI analysis timed out (30s). Manual inspection recommended.",
        inspector_review: "",
        condition: "fair" as const,
        damage_items: [],
        total_estimated_cost: 0,
      };
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const err = await response.text();
    console.error("[AI Analysis] API error:", err);
    return {
      description: `AI analysis failed: ${response.status}`,
      inspector_review: "",
      condition: "fair",
      damage_items: [],
      total_estimated_cost: 0,
    };
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  try {
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Partial<PhotoAnalysisResult>;
      return {
        description: parsed.description || "",
        inspector_review: parsed.inspector_review || "",
        condition: parsed.condition || "fair",
        damage_items: parsed.damage_items || [],
        total_estimated_cost: parsed.total_estimated_cost || 0,
        detected_item: parsed.detected_item,
      };
    }
  } catch {
    console.error("[AI Analysis] Failed to parse response:", text);
  }

  return {
    description: text.slice(0, 200),
    inspector_review: "",
    condition: "fair",
    damage_items: [],
    total_estimated_cost: 0,
  };
}

/**
 * Analyze a floor plan image to extract room names.
 */
export async function analyzeFloorPlan(
  imageBase64: string
): Promise<string[]> {
  if (!ANTHROPIC_API_KEY) {
    return ["Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom 1", "Bathroom 2", "Hallway", "Closet"];
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: imageBase64.replace(/^data:image\/\w+;base64,/, ""),
              },
            },
            {
              type: "text",
              text: `This is an architectural floor plan of a rental unit. Identify and list all rooms/areas visible in this floor plan.

Return ONLY a JSON array of room name strings, e.g.:
["Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom", "Hallway", "Closet"]

Be specific — if there are multiple bedrooms or bathrooms, number them.`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    return ["Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom 1", "Bathroom 2", "Hallway", "Closet"];
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || "";

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as string[];
    }
  } catch {
    // Fall through to defaults
  }

  return ["Living Room", "Kitchen", "Bedroom 1", "Bedroom 2", "Bathroom 1", "Bathroom 2", "Hallway", "Closet"];
}
