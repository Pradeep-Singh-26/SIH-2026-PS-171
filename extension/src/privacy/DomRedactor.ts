/**
 * DomRedactor
 *
 * Produces a sanitized DOM representation by replacing sensitive
 * fields with privacy tokens or redaction markers.
 *
 * Input:  SelectedContext + PolicyDecisions
 * Output: SanitizedElement[]
 *
 * Does NOT mutate the actual webpage.
 * Produces a new sanitized representation for outbound use.
 */

import type { ScoredCandidate } from "../types/index";
import type {
  PolicyAction,
  PolicyDecision,
  SanitizedElement,
} from "./types";
import type { TokenizationEngine } from "./TokenizationEngine";

/** Redaction placeholder for REDACT action. */
const REDACTION_MARKER = "[REDACTED]";

/** Blur placeholder for BLUR action. */
const BLUR_MARKER = "[BLURRED]";

export class DomRedactor {
  private tokenizer: TokenizationEngine;

  constructor(tokenizer: TokenizationEngine) {
    this.tokenizer = tokenizer;
  }

  /**
   * Produce sanitized elements from scored candidates and policy decisions.
   *
   * @param candidates - Phase 1 scored candidates.
   * @param decisions - Policy decisions from the PolicyEngine.
   * @returns Sanitized elements with sensitive values replaced.
   */
  redact(
    candidates: ScoredCandidate[],
    decisions: PolicyDecision[],
  ): SanitizedElement[] {
    // Build a lookup: elementId → decisions
    const decisionsByElement = new Map<string, PolicyDecision[]>();
    for (const d of decisions) {
      const existing = decisionsByElement.get(d.elementId);
      if (existing) {
        existing.push(d);
      } else {
        decisionsByElement.set(d.elementId, [d]);
      }
    }

    return candidates.map((candidate) => {
      const elementDecisions = decisionsByElement.get(candidate.id) ?? [];

      if (elementDecisions.length === 0) {
        // No privacy decisions → pass through unchanged
        return this.toSanitizedElement(candidate, false);
      }

      // Apply the most restrictive action
      const action = this.getMostRestrictiveAction(elementDecisions);

      return this.applyAction(candidate, elementDecisions, action);
    });
  }

  // ── Internal ───────────────────────────────────────────────────────

  private applyAction(
    candidate: ScoredCandidate,
    decisions: PolicyDecision[],
    action: PolicyAction,
  ): SanitizedElement {
    switch (action) {
      case "REDACT":
        return {
          id: candidate.id,
          tagName: candidate.tagName,
          role: candidate.role,
          label: REDACTION_MARKER,
          text: candidate.text ? REDACTION_MARKER : undefined,
          bbox: candidate.bbox,
          transformed: true,
        };

      case "TOKENIZE": {
        // Replace label/text with the privacy token
        const token = this.getTokenForDecisions(decisions);
        return {
          id: candidate.id,
          tagName: candidate.tagName,
          role: candidate.role,
          label: token ?? candidate.label,
          text: candidate.text ? (token ?? candidate.text) : undefined,
          bbox: candidate.bbox,
          transformed: true,
        };
      }

      case "BLUR":
        return {
          id: candidate.id,
          tagName: candidate.tagName,
          role: candidate.role,
          label: BLUR_MARKER,
          text: candidate.text ? BLUR_MARKER : undefined,
          bbox: candidate.bbox,
          transformed: true,
        };

      case "BLOCK":
        // BLOCK = completely remove the element's content
        return {
          id: candidate.id,
          tagName: candidate.tagName,
          role: candidate.role,
          label: REDACTION_MARKER,
          text: undefined,
          bbox: candidate.bbox,
          transformed: true,
        };

      case "ALLOW":
      default:
        return this.toSanitizedElement(candidate, false);
    }
  }

  private toSanitizedElement(
    candidate: ScoredCandidate,
    transformed: boolean,
  ): SanitizedElement {
    return {
      id: candidate.id,
      tagName: candidate.tagName,
      role: candidate.role,
      label: candidate.label,
      text: candidate.text,
      bbox: candidate.bbox,
      transformed,
    };
  }

  private getTokenForDecisions(decisions: PolicyDecision[]): string | undefined {
    for (const d of decisions) {
      if (d.action === "TOKENIZE") {
        const token = this.tokenizer.getToken(d.entityId);
        if (token) return token;
      }
    }
    return undefined;
  }

  /**
   * Return the most restrictive action from a set of decisions.
   * Order: BLOCK > REDACT > BLUR > TOKENIZE > ALLOW
   */
  private getMostRestrictiveAction(decisions: PolicyDecision[]): PolicyAction {
    const priority: PolicyAction[] = [
      "BLOCK",
      "REDACT",
      "BLUR",
      "TOKENIZE",
      "ALLOW",
    ];

    let mostRestrictive: PolicyAction = "ALLOW";
    let bestPriority = priority.length;

    for (const d of decisions) {
      const idx = priority.indexOf(d.action);
      if (idx >= 0 && idx < bestPriority) {
        bestPriority = idx;
        mostRestrictive = d.action;
      }
    }

    return mostRestrictive;
  }
}
