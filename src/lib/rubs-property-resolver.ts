// ============================================
// Property Name Resolver
// ============================================
// A single source of truth for matching property names across the system.
// Handles three kinds of spelling/naming differences:
//
//   1. Whitespace, punctuation, casing  ("1116 30th St." vs "1116 30th St")
//   2. Common address suffix variations ("St" / "Street" / "Pl" / "Place")
//   3. Unicode encoding artifacts       ("1118 ¾" rendered as "1118 Â¾")
//   4. Completely different names       (LLC name like "Dorr Holdings -1 LLC"
//      vs street address "1006 W. 23rd St") — resolved via PropertyAlias
//
// Everywhere the system compares two property name strings, use
// resolvePropertyName() instead of string equality so aliases are respected.

import type { PropertyAlias } from "./rubs-types";

/**
 * Normalize a property name for case/whitespace/suffix-insensitive comparison.
 * Does NOT consult aliases — use resolvePropertyName() for that.
 */
export function normalizePropertyName(name: string): string {
  return name
    .toLowerCase()
    // Strip unicode artifacts from Excel/UTF-8 mis-decoding
    .replace(/[\u00c2\u00e2\u00bd\u00be\u00bc\u2013\u2014\u201c\u201d]/g, "")
    // Collapse punctuation to spaces
    .replace(/[.,#()\-/\\]/g, " ")
    // Strip common address suffixes
    .replace(/\b(street|st|place|pl|boulevard|blvd|avenue|ave|drive|dr|road|rd|court|ct|lane|ln|way)\b\.?/g, "")
    // Strip LLC / Inc / Corp boilerplate
    .replace(/\b(llc|inc|corp|co|holdings?|management|properties?|apartments?|apt)\b\.?/g, "")
    // Strip city/state/zip
    .replace(/\b(los angeles|la|california|ca|\d{5})\b/g, "")
    // Collapse whitespace
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Two property names are equivalent if their normalized forms are equal.
 */
export function namesMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizePropertyName(a) === normalizePropertyName(b);
}

/**
 * Build a lookup from any alias (normalized) → canonical name.
 * The canonical name itself is included as its own alias.
 */
export function buildAliasMap(aliases: PropertyAlias[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const a of aliases) {
    const canonical = a.canonicalName;
    // Add the canonical itself
    map.set(normalizePropertyName(canonical), canonical);
    for (const alt of a.aliases) {
      if (alt) map.set(normalizePropertyName(alt), canonical);
    }
  }
  return map;
}

/**
 * Resolve a raw property name to its canonical form.
 * - If the name matches an alias, return the canonical name.
 * - Otherwise return the input as-is (unchanged).
 *
 * This is the primary function callers should use.
 */
export function resolvePropertyName(raw: string, aliasMap: Map<string, string>): string {
  if (!raw) return raw;
  const normalized = normalizePropertyName(raw);
  return aliasMap.get(normalized) || raw;
}

/**
 * Fuzzy-match a free-form name (e.g. service address from a utility bill)
 * against a set of known property names. Uses both the alias map AND
 * fuzzy matching on street number + street name when no alias applies.
 *
 * Returns { property, confidence } where property is the canonical name
 * (or null if no reasonable match) and confidence is 0–1.
 */
export function matchProperty(
  input: string,
  knownProperties: string[],
  aliasMap: Map<string, string>
): { property: string | null; confidence: number } {
  if (!input) return { property: null, confidence: 0 };

  // 1. Direct alias hit (highest confidence)
  const normalized = normalizePropertyName(input);
  const aliased = aliasMap.get(normalized);
  if (aliased) return { property: aliased, confidence: 1 };

  // 2. Exact normalized match against known properties
  for (const prop of knownProperties) {
    if (normalizePropertyName(prop) === normalized) {
      return { property: prop, confidence: 1 };
    }
  }

  // 3. Fuzzy match by street number + street name containment
  const inputNum = normalized.match(/^(\d+)/)?.[1];
  if (!inputNum) return { property: null, confidence: 0 };

  let bestMatch: string | null = null;
  let bestScore = 0;

  for (const prop of knownProperties) {
    const propNorm = normalizePropertyName(prop);
    const propNum = propNorm.match(/^(\d+)/)?.[1];
    if (!propNum || propNum !== inputNum) continue;

    // How much of the property name appears in the input (or vice versa)?
    const propWords = propNorm.split(" ").filter((w) => w.length > 0);
    const matchedWords = propWords.filter((w) => normalized.includes(w));
    const score = propWords.length > 0 ? matchedWords.length / propWords.length : 0;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = prop;
    }
  }

  return {
    property: bestScore >= 0.4 ? bestMatch : null,
    confidence: bestScore,
  };
}

/**
 * Auto-detect candidate aliases by finding property names that normalize
 * to the same form. Useful for the "Suggested aliases" feature in the UI
 * so the user can one-click group duplicates after an import.
 *
 * Returns groups of 2+ names that share a normalized form.
 */
export function findDuplicateNameGroups(names: string[]): string[][] {
  const groups = new Map<string, string[]>();
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const norm = normalizePropertyName(name);
    if (!norm) continue;
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm)!.push(name);
  }
  return Array.from(groups.values()).filter((g) => g.length > 1);
}
