/**
 * AI Photo Analysis — Uses Claude Haiku for cost estimation
 *
 * Analyzes move-out inspection photos to identify damage and estimate repair costs.
 * Falls back to manual entry if API key not configured.
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
};

/**
 * Analyze a photo using Claude Haiku Vision API.
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

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
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
              text: `You are inspecting a rental unit for move-out. This photo is from the "${roomName}" area, specifically the "${itemName}" item.

Analyze this photo and provide:
1. A brief description of what you see
2. The condition rating: excellent, good, fair, poor, or damaged
3. Any damage items that would be deducted from the tenant's security deposit, with estimated repair/replacement costs in USD (use Los Angeles market rates)

Respond in this exact JSON format:
{
  "description": "Brief description",
  "condition": "good",
  "damage_items": [
    {"item": "Wall hole repair", "estimated_cost": 75, "description": "Small hole in drywall near door"}
  ],
  "total_estimated_cost": 75
}

If no damage, return empty damage_items array and 0 total. Be fair and accurate — only flag genuine damage beyond normal wear and tear per California Civil Code 1950.5.`,
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
    // Return common room defaults when AI not available
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
