/**
 * ElementCanonicalizer
 *
 * Normalises raw ElementCandidate arrays so that downstream scoring
 * works against clean, deterministic representations.
 *
 * Operations:
 *  • Collapse whitespace in text, label, ariaLabel, placeholder.
 *  • Lowercase tag names and roles.
 *  • Trim and clamp string lengths.
 */

import type { ElementCandidate } from "../types/index";

const MAX_TEXT_LEN = 200;

/** Collapse whitespace, trim, and clamp. */
function norm(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT_LEN);
  return cleaned || undefined;
}

export class ElementCanonicalizer {
  /**
   * Returns a new array of canonicalized candidates.
   * The input array is not mutated.
   */
  canonicalize(candidates: ElementCandidate[]): ElementCandidate[] {
    return candidates.map((c) => ({
      ...c,
      tagName: c.tagName.toLowerCase(),
      role: c.role?.toLowerCase(),
      label: norm(c.label),
      text: norm(c.text),
      ariaLabel: norm(c.ariaLabel),
      placeholder: norm(c.placeholder),
    }));
  }
}
