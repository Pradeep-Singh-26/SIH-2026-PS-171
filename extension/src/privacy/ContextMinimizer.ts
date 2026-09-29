/**
 * ContextMinimizer
 *
 * Minimizes the information sent to the remote model.
 *
 * Only retains elements that are necessary to understand or
 * execute the user's task. Irrelevant PII-bearing elements
 * are stripped entirely.
 *
 * Uses the existing Phase 1 relevanceScore from ScoredCandidate
 * to determine task-relevance.
 *
 * IMPORTANT:
 *   Do not treat relevance as privacy authorization.
 *   Both must happen:
 *     ContextSelector → relevance
 *     Privacy Engine → privacy authorization
 */

import type { ScoredCandidate } from "../types/index";
import type { PolicyDecision, SanitizedElement } from "./types";

/**
 * Minimum relevance score for an element to be retained
 * in the minimized context. Elements below this threshold
 * are stripped entirely unless they are the direct task target.
 */
const MINIMIZATION_RELEVANCE_THRESHOLD = 0.15;

/**
 * Maximum number of elements to include in minimized context.
 */
const MAX_MINIMIZED_ELEMENTS = 8;

export class ContextMinimizer {
  private relevanceThreshold: number;
  private maxElements: number;

  constructor(
    relevanceThreshold = MINIMIZATION_RELEVANCE_THRESHOLD,
    maxElements = MAX_MINIMIZED_ELEMENTS,
  ) {
    this.relevanceThreshold = relevanceThreshold;
    this.maxElements = maxElements;
  }

  /**
   * Minimize the sanitized elements to only those relevant to the task.
   *
   * @param sanitizedElements - Sanitized elements from DomRedactor.
   * @param candidates - Original scored candidates (for relevance scores).
   * @param decisions - Policy decisions (to know which elements have PII).
   * @returns Minimized array of sanitized elements.
   */
  minimize(
    sanitizedElements: SanitizedElement[],
    candidates: ScoredCandidate[],
    decisions: PolicyDecision[],
  ): SanitizedElement[] {
    // Build relevance score lookup
    const relevanceMap = new Map<string, number>();
    for (const c of candidates) {
      relevanceMap.set(c.id, c.relevanceScore);
    }

    // Build PII element set (elements that have privacy decisions)
    const piiElements = new Set<string>();
    for (const d of decisions) {
      if (d.action !== "ALLOW") {
        piiElements.add(d.elementId);
      }
    }

    // Filter: keep elements that are task-relevant
    const relevant = sanitizedElements.filter((el) => {
      const score = relevanceMap.get(el.id) ?? 0;

      // Always keep elements above the relevance threshold
      if (score >= this.relevanceThreshold) return true;

      // Strip irrelevant elements, especially if they contained PII
      // Even if they've been tokenized, if they're not relevant to the task,
      // there's no reason to include them
      return false;
    });

    // Sort by relevance (highest first) and take top N
    relevant.sort((a, b) => {
      const scoreA = relevanceMap.get(a.id) ?? 0;
      const scoreB = relevanceMap.get(b.id) ?? 0;
      return scoreB - scoreA;
    });

    return relevant.slice(0, this.maxElements);
  }
}
