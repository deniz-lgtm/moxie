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
  description: string;
  condition: "excellent" | "good" | "fair" | "poor" | "damaged";
  damage_items: { item: string; estimated_cost: number; description: string }[];
  total_estimated_cost: number;
  detected_item?: string;
};

// ── Forensic Damage Assessor System Prompt ──────────

const FORENSIC_SYSTEM_PROMPT = `You are the automated forensic inspection AI for Moxie Management, a residential property management company in Los Angeles, CA. Your function is to analyze visual data from rental unit turnovers and generate strictly objective, legally defensible damage assessments compliant with California Civil Code Section 1950.5.

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

GOLDEN FORMULA (required for every damage finding):
[Estimated Measurement/Quantity] + [Visual Finding] located on/at [Specific Location] exhibiting [Mechanism of Defect mapped to Glossary]. Condition is inconsistent with standard depreciation and constitutes [Glossary Term], requiring [Objective Remediation].

REFERENCE EXAMPLES:
- "Puncture measuring approximately 4x4 inches located on the interior primary bedroom door exhibiting fractured wood core. Condition is inconsistent with standard depreciation and constitutes Impact/Blunt Force Trauma, requiring full door slab replacement."
- "Torn drywall paper and primer removal measuring approximately 48 inches in length located on the upper living room perimeter. Condition is inconsistent with standard depreciation and constitutes Adhesive/Mounting Damage, requiring skim coating and full-wall repaint."
- "Accumulation of surface particulate and biological residue covering approximately 60% of kitchen surfaces. Condition is inconsistent with standard depreciation and constitutes Excessive Particulate/Surface Accumulation, requiring professional remediation to restore to documented move-in baseline."
- "Non-water-soluble discoloration measuring approximately 8x10 inches located on the master bedroom carpet. Condition cannot be remediated via standard hot-water extraction and constitutes Negligence-Induced Deterioration, requiring targeted carpet panel replacement."
- "Uric acid saturation detected across approximately 12 square feet of subflooring in the hallway adjacent to the rear entry. Condition is inconsistent with standard depreciation and constitutes Biological/Hazardous Contamination, requiring enzyme treatment and targeted sealing."

HANDLING AMBIGUITY:
If the visual data is obscured, blurry, or lacks sufficient lighting to make a definitive classification, indicate: "INSUFFICIENT DATA: Manual human inspection required to verify condition." Do not describe damage that cannot be clearly evidenced by the pixel data.

WEAR AND TEAR STANDARD:
Normal wear and tear means gradual deterioration occurring through expected, intended, and reasonable daily use, absent negligence, carelessness, accident, or abuse. Standard sparse thumbtack or finishing-nail pinholes are normal wear. Everything you flag must clearly exceed this threshold.`;

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
      condition: "fair",
      damage_items: [],
      total_estimated_cost: 0,
    };
  }

  const userPrompt = itemName === "auto-detect"
    ? `You are inspecting a rental unit for move-out. This photo is from the "${roomName}" area.

Auto-detect what this photo shows. Identify the main item/feature visible (e.g., "Wall condition", "Flooring", "Kitchen appliances", "Bathroom fixtures", "Ceiling", "Window", "Door", "HVAC unit", etc.).

Analyze using the Forensic Damage Assessor methodology and respond in this exact JSON format:
{
  "detected_item": "Wall condition",
  "description": "Brief factual description using only objective, measurable language",
  "condition": "good",
  "damage_items": [
    {
      "item": "Drywall repair — Adhesive/Mounting Damage",
      "estimated_cost": 150,
      "description": "Torn drywall paper and primer removal measuring approximately 36 inches in length located on the upper bedroom wall perimeter exhibiting adhesive residue consistent with LED light strip removal. Condition is inconsistent with standard depreciation and constitutes Adhesive/Mounting Damage, requiring skim coating and full-wall repaint."
    }
  ],
  "total_estimated_cost": 150
}

IMPORTANT:
- Each damage_items[].item should be: "[Repair type] — [Glossary Category]"
- Each damage_items[].description MUST follow the Golden Formula exactly
- Use Los Angeles market rates for cost estimates
- If no damage beyond normal wear and tear is present, return empty damage_items and 0 total
- Do NOT flag normal wear and tear (minor scuffs in traffic areas, sparse pinholes, minor fading)`

    : `You are inspecting a rental unit for move-out. This photo is from the "${roomName}" area, specifically the "${itemName}" item.

Analyze using the Forensic Damage Assessor methodology and respond in this exact JSON format:
{
  "detected_item": "${itemName}",
  "description": "Brief factual description using only objective, measurable language",
  "condition": "good",
  "damage_items": [
    {
      "item": "Drywall repair — Adhesive/Mounting Damage",
      "estimated_cost": 150,
      "description": "Torn drywall paper and primer removal measuring approximately 36 inches in length located on the upper bedroom wall perimeter exhibiting adhesive residue consistent with LED light strip removal. Condition is inconsistent with standard depreciation and constitutes Adhesive/Mounting Damage, requiring skim coating and full-wall repaint."
    }
  ],
  "total_estimated_cost": 150
}

IMPORTANT:
- Each damage_items[].item should be: "[Repair type] — [Glossary Category]"
- Each damage_items[].description MUST follow the Golden Formula exactly
- Use Los Angeles market rates for cost estimates
- If no damage beyond normal wear and tear is present, return empty damage_items and 0 total
- Do NOT flag normal wear and tear (minor scuffs in traffic areas, sparse pinholes, minor fading)`;

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

  if (!response.ok) {
    const err = await response.text();
    console.error("[AI Analysis] API error:", err);
    return {
      description: `AI analysis failed: ${response.status}`,
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
      return JSON.parse(jsonMatch[0]) as PhotoAnalysisResult;
    }
  } catch {
    console.error("[AI Analysis] Failed to parse response:", text);
  }

  return {
    description: text.slice(0, 200),
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
