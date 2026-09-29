/**
 * Privacy Browser Agent — Content Script
 *
 * Entry point injected into every page (document_idle).
 *
 * Phase 1: Runs the local DOM perception pipeline.
 * Phase 2: Pipes output through the Privacy Engine.
 *
 * Logs ONLY safe development information:
 *   - Candidate/detection counts
 *   - Gate decision
 *   - Sanitized context (tokens only, never raw values)
 *
 * NEVER logs raw sensitive values (emails, passwords, etc.).
 * No network requests. No LLM. No form values collected.
 */

import { TaskOrchestrator } from "./orchestrator/TaskOrchestrator";

// ── Temporary test task (will come from popup/sidepanel later) ──────────

const testTask = "fill the form with the available information";

// ── Run pipeline ───────────────────────────────────────────────────────

(async () => {
  console.log("Privacy Browser Agent content script loaded");

  const orchestrator = new TaskOrchestrator();

  // Phase 1: DOM perception + relevance scoring
  const context = await orchestrator.getRelevantContext(testTask);
  const rawCount = orchestrator.getPerception().extract().length;

  console.log(`DOM candidates: ${rawCount}`);
  console.log(`Relevant candidates: ${context.candidates.length}`);

  // Phase 2: Privacy Engine processing
  const privacyResult = await orchestrator.getPrivacyProcessedContext(testTask);
  const receipt = privacyResult.receipt;

  // Log ONLY safe summary information (counts, gate decision)
  // NEVER log raw sensitive values
  console.log(`Privacy detections: ${Object.values(receipt.detected).reduce((a, b) => a + (b ?? 0), 0)}`);
  console.log(`Transformations: ${Object.values(receipt.transformations).reduce((a, b) => a + (b ?? 0), 0)}`);
  console.log(`Residual leakage: ${receipt.verification.residualLeakage}`);
  console.log(`Privacy gate: ${receipt.gate}`);

  // Log the safe privacy receipt (no raw values)
  console.log("Privacy receipt:", JSON.stringify(receipt, null, 2));

  // Log sanitized context (tokens only, never raw values)
  if (privacyResult.gateResult.decision === "ALLOW" && privacyResult.gateResult.context) {
    console.log("Sanitized context:", JSON.stringify(privacyResult.gateResult.context, null, 2));
  } else {
    console.log(`Privacy gate BLOCKED: ${privacyResult.gateResult.reason}`);
  }
})();