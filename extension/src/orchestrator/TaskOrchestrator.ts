/**
 * TaskOrchestrator
 *
 * Entry-point for the local DOM-perception pipeline.
 *
 * Flow (Phase 1):
 *   task → DomPerceptionAdapter.extract()
 *        → ElementCanonicalizer.canonicalize()
 *        → ContextSelector.select(task, candidates)
 *        → SelectedContext
 *
 * Flow (Phase 2 — with Privacy Engine):
 *   task → Phase 1 pipeline
 *        → PrivacyEngine.process()
 *        → PrivacyGate → ALLOW / BLOCK
 *        → PrivacyResult
 *
 * Everything runs locally in the content script.
 * No backend calls, no LLM, no network.
 */

import type { SelectedContext } from "../types/index";
import { DomPerceptionAdapter } from "../perception/DomPerceptionAdapter";
import { ElementCanonicalizer } from "../perception/ElementCanonicalizer";
import { ContextSelector } from "../context/ContextSelector";
import { PrivacyEngine } from "../privacy/PrivacyEngine";
import type { PrivacyResult } from "../privacy/types";

export class TaskOrchestrator {
  private perception: DomPerceptionAdapter;
  private canonicalizer: ElementCanonicalizer;
  private selector: ContextSelector;
  private privacyEngine: PrivacyEngine;

  constructor(topK?: number) {
    this.perception = new DomPerceptionAdapter();
    this.canonicalizer = new ElementCanonicalizer();
    this.selector = new ContextSelector(topK);
    this.privacyEngine = new PrivacyEngine();
  }

  /**
   * Run the full local perception pipeline for a given user task.
   *
   * @param task - TRUSTED user task string (never from webpage content).
   * @returns SelectedContext with scored, ranked DOM candidates.
   */
  async getRelevantContext(task: string): Promise<SelectedContext> {
    // 1. Extract raw candidates from the live DOM
    const rawCandidates = this.perception.extract();

    // 2. Canonicalize (normalize whitespace, lowercase, clamp)
    const canonical = this.canonicalizer.canonicalize(rawCandidates);

    // 3. Score & rank against the task, return Top-K
    const context = this.selector.select(task, canonical);

    return context;
  }

  /**
   * Run the full pipeline including privacy processing.
   *
   * Phase 1 (perception) → Phase 2 (privacy engine) → PrivacyResult
   *
   * @param task - TRUSTED user task string (never from webpage content).
   * @returns PrivacyResult with gate decision and sanitized context.
   */
  async getPrivacyProcessedContext(task: string): Promise<PrivacyResult> {
    // 1. Run Phase 1 pipeline
    const selectedContext = await this.getRelevantContext(task);

    // 2. Run Privacy Engine
    const privacyResult = await this.privacyEngine.process({
      selectedContext,
      task,
    });

    return privacyResult;
  }

  /** Expose the perception adapter for later action execution phases. */
  getPerception(): DomPerceptionAdapter {
    return this.perception;
  }
}
