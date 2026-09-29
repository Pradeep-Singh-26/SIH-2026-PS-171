/**
 * PrivacyGate
 *
 * FINAL SECURITY BOUNDARY.
 *
 * The gate verifies:
 *   ✓ Sanitized context exists
 *   ✓ Artifact is structurally valid
 *   ✓ Policy checks passed
 *   ✓ Transformations completed
 *   ✓ Leakage check passed
 *   ✓ No raw high-risk values remain
 *   ✓ No prohibited taint remains
 *   ✓ Context is fresh
 *
 * Rules:
 *   verification failure → BLOCK
 *   unknown state        → BLOCK
 *   malformed context    → BLOCK
 *   residual leakage     → BLOCK
 *   policy violation     → BLOCK
 *
 * The gate MUST fail closed.
 * Only ALLOW can produce an outbound SanitizedContext.
 */

import type {
  LeakageResult,
  PolicyDecision,
  PrivacyGateResult,
  SanitizedContext,
} from "./types";
import type { PrivacyGraph } from "./PrivacyGraph";

/** Maximum age in ms for a context to be considered "fresh". */
const MAX_CONTEXT_AGE_MS = 30_000; // 30 seconds

export class PrivacyGate {
  /**
   * Evaluate the final security gate.
   *
   * @param context - The sanitized context to evaluate.
   * @param leakageResult - Result from ResidualLeakageChecker.
   * @param decisions - All policy decisions that were applied.
   * @param graph - The privacy graph (for taint checking).
   * @returns PrivacyGateResult with ALLOW or BLOCK.
   */
  evaluate(
    context: SanitizedContext | null,
    leakageResult: LeakageResult,
    decisions: PolicyDecision[],
    graph: PrivacyGraph,
  ): PrivacyGateResult {
    // ── 1. Sanitized context must exist ──────────────────────────────
    if (!context) {
      return this.block("Sanitized context is null or undefined", leakageResult);
    }

    // ── 2. Structural validity ──────────────────────────────────────
    if (!context.task || typeof context.task !== "string") {
      return this.block("Sanitized context has invalid or missing task", leakageResult);
    }

    if (!Array.isArray(context.elements)) {
      return this.block("Sanitized context has invalid elements array", leakageResult);
    }

    if (!context.timestamp || typeof context.timestamp !== "number") {
      return this.block("Sanitized context has invalid timestamp", leakageResult);
    }

    // ── 3. Context freshness ────────────────────────────────────────
    const age = Date.now() - context.timestamp;
    if (age > MAX_CONTEXT_AGE_MS) {
      return this.block(
        `Context is stale (age: ${age}ms, max: ${MAX_CONTEXT_AGE_MS}ms)`,
        leakageResult,
      );
    }

    // ── 4. Leakage check must pass ──────────────────────────────────
    if (!leakageResult.passed) {
      return this.block(
        `Residual leakage detected: ${leakageResult.violations.join("; ")}`,
        leakageResult,
      );
    }

    if (leakageResult.rawHighRiskValuesOutbound > 0) {
      return this.block(
        `${leakageResult.rawHighRiskValuesOutbound} raw high-risk values found in outbound context`,
        leakageResult,
      );
    }

    // ── 5. All required transformations must be complete ─────────────
    for (const d of decisions) {
      if (d.action === "BLOCK") {
        return this.block(
          `Policy BLOCK decision for ${d.entityType} on element ${d.elementId}`,
          leakageResult,
        );
      }
    }

    // ── 6. No prohibited taint remains ──────────────────────────────
    const taintedElements = graph.getTaintedElements();
    for (const elementId of taintedElements) {
      // Check if this tainted element is still in the outbound context
      const inContext = context.elements.some((el) => el.id === elementId);
      if (inContext) {
        // Element is tainted AND in the context — check if it was transformed
        const element = context.elements.find((el) => el.id === elementId);
        if (element && !element.transformed) {
          return this.block(
            `Tainted element ${elementId} is in outbound context without transformation`,
            leakageResult,
          );
        }
      }
    }

    // ── All checks passed → ALLOW ───────────────────────────────────
    return {
      decision: "ALLOW",
      reason: "All privacy checks passed",
      context,
      verification: leakageResult,
    };
  }

  // ── Internal ───────────────────────────────────────────────────────

  private block(reason: string, verification: LeakageResult): PrivacyGateResult {
    return {
      decision: "BLOCK",
      reason,
      context: undefined,
      verification,
    };
  }
}
