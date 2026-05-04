// ============================================
// RUBS Bill Parser — AI extraction from utility PDFs
// ============================================
// Sends PDF documents to Claude AI to extract billing data.
// Follows the same API pattern as ai-analysis.ts.

import type { ParsedBill, MeterType, PropertyAlias } from "./rubs-types";
import { buildAliasMap, matchProperty } from "./rubs-property-resolver";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const BILL_PARSER_SYSTEM_PROMPT = `You are a utility bill data extractor for a property management company in Los Angeles, CA. Your job is to read utility bills (PDFs) and extract structured billing data.

Extract the following from each bill and return a JSON array. IMPORTANT: LADWP bills often contain BOTH water and electric charges — return a SEPARATE entry for each utility type found.

For each utility charge found, return:
{
  "utilityProvider": "LADWP" or "SoCal Gas" or the provider name,
  "serviceAddress": "the exact service address as printed on the bill",
  "totalAmount": 123.45,
  "billingPeriodStart": "YYYY-MM-DD",
  "billingPeriodEnd": "YYYY-MM-DD",
  "meterType": "water" or "gas" or "electric" or "sewer",
  "accountNumber": "the account or meter number"
}

Rules:
- totalAmount should be the TOTAL AMOUNT DUE for that specific utility (not a partial or line item)
- For LADWP: water and electric are often on the same bill. Extract EACH as a separate entry with its own totalAmount
- billingPeriodStart and billingPeriodEnd bound the service period (not the due date)
- meterType must be exactly one of: "water", "gas", "electric", "sewer"
  - SoCal Gas / SoCalGas / "natural gas" / "therms" / "ccf of gas" → "gas"
  - LADWP electric / "kwh" / "kilowatt" / "power" → "electric"
  - LADWP water / "hcf" / "ccf of water" → "water"
  - "sewer" / "wastewater" → "sewer"
  - If genuinely uncertain, omit the field (do NOT guess)
- If you cannot determine a field, use null
- Always return a JSON array, even for a single entry: [{ ... }]

Respond with ONLY the JSON array, no other text.`;

export async function parseBillPdf(
  pdfBase64: string,
  knownProperties: string[],
  sourceFile: string,
  aliases: PropertyAlias[] = [],
  fileHash?: string,
): Promise<ParsedBill[]> {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s for PDFs

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
        max_tokens: 2000,
        system: BILL_PARSER_SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "document",
                source: {
                  type: "base64",
                  media_type: "application/pdf",
                  data: pdfBase64,
                },
              },
              {
                type: "text",
                text: "Extract all utility billing data from this bill. Return a JSON array.",
              },
            ],
          },
        ],
      }),
    });
  } catch (err: any) {
    clearTimeout(timeout);
    if (err?.name === "AbortError") {
      throw new Error("Bill parsing timed out (60s)");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errText = await response.text();
    console.error("[Bill Parser] API error:", errText);
    throw new Error(`Bill parsing failed: ${response.status}`);
  }

  const data = await response.json();
  const text: string = data.content?.[0]?.text || "";

  // Extract JSON array from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.error("[Bill Parser] No JSON array found in response:", text);
    throw new Error("Could not extract billing data from PDF");
  }

  const rawEntries = JSON.parse(jsonMatch[0]) as Array<{
    utilityProvider?: string;
    serviceAddress?: string;
    totalAmount?: number;
    billingPeriodStart?: string;
    billingPeriodEnd?: string;
    meterType?: string;
    accountNumber?: string;
  }>;

  // Map to ParsedBill with property matching
  const aliasMap = buildAliasMap(aliases);
  return rawEntries
    .filter((e) => e.totalAmount && e.totalAmount > 0)
    .map((entry) => {
      const serviceAddr = entry.serviceAddress || "";
      const matched = matchProperty(serviceAddr, knownProperties, aliasMap);

      // Convert billing period end date to YYYY-MM
      let billingPeriod = "";
      if (entry.billingPeriodEnd) {
        const d = new Date(entry.billingPeriodEnd);
        if (!isNaN(d.getTime())) {
          billingPeriod = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        }
      }

      return {
        utilityProvider: entry.utilityProvider || "Unknown",
        serviceAddress: serviceAddr,
        matchedProperty: matched.property,
        totalAmount: entry.totalAmount || 0,
        billingPeriod,
        meterType: normalizeMeterType(entry.meterType, entry.utilityProvider, serviceAddr),
        accountNumber: entry.accountNumber || "",
        confidence: matched.confidence,
        sourceFile,
        fileHash,
        servicePeriodStart: normalizeDate(entry.billingPeriodStart),
        servicePeriodEnd: normalizeDate(entry.billingPeriodEnd),
      };
    });
}

function normalizeDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeMeterType(raw?: string, provider?: string, address?: string): MeterType {
  const haystack = `${raw || ""} ${provider || ""} ${address || ""}`.toLowerCase();
  // Order matters: check the most specific keywords first.
  if (/\b(socal\s*gas|natural\s*gas|therm|ccf\s*of\s*gas)\b/.test(haystack)) return "gas";
  if (/\b(gas)\b/.test(haystack) && !/\bgas\s*tax\b/.test(haystack)) return "gas";
  if (/\b(kwh|kilowatt|electric|power)\b/.test(haystack)) return "electric";
  if (/\b(sewer|sewage|wastewater)\b/.test(haystack)) return "sewer";
  if (/\b(water|hcf|ccf\s*of\s*water|ladwp\s*water)\b/.test(haystack)) return "water";
  return "unknown";
}
