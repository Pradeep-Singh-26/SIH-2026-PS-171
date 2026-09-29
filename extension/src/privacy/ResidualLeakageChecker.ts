/**
 * ResidualLeakageChecker
 *
 * MANDATORY final-pass scan before any context leaves the browser.
 *
 * Checks the serialized output for:
 *   - Email patterns
 *   - Phone patterns
 *   - Credit card patterns
 *   - Obvious authentication tokens
 *   - Raw sensitive values from the local token mapping
 *   - Prohibited tainted content
 *
 * FAILS CLOSED — any detection causes BLOCK.
 */

import type { LeakageResult, SanitizedContext, SanitizedElement } from "./types";
import type { TokenizationEngine } from "./TokenizationEngine";

// ── Leakage detection patterns ─────────────────────────────────────────

const LEAKAGE_EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const LEAKAGE_PHONE_RE =
  /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,5}[\s\-.]?\d{3,5}/g;

const LEAKAGE_CREDIT_CARD_RE =
  /\b(?:\d[ \-]?){12,18}\d\b/g;

const LEAKAGE_AUTH_TOKEN_RE =
  /\b(?:eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}|Bearer\s+[A-Za-z0-9_\-]{20,}|sk[\-_][a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36,})\b/g;

/** Known safe patterns that should NOT trigger leakage detection. */
const SAFE_TOKEN_RE = /^<[A-Z_]+_\d+>$/;

export class ResidualLeakageChecker {
  private tokenizer: TokenizationEngine;

  constructor(tokenizer: TokenizationEngine) {
    this.tokenizer = tokenizer;
  }

  /**
   * Scan the final sanitized context for residual leakage.
   *
   * @param context - The sanitized context to check.
   * @returns LeakageResult indicating pass/fail and specific violations.
   */
  check(context: SanitizedContext): LeakageResult {
    const violations: string[] = [];
    let rawHighRiskValuesOutbound = 0;
    let residualLeakage = 0;

    // Serialize context to a scannable string
    const serialized = this.serializeContext(context);

    // ── Check for email leakage ──────────────────────────────────────
    const emailMatches = serialized.match(LEAKAGE_EMAIL_RE) ?? [];
    for (const match of emailMatches) {
      if (!SAFE_TOKEN_RE.test(match)) {
        violations.push(`Residual email pattern found: [REDACTED_FOR_LOG]`);
        residualLeakage++;
        rawHighRiskValuesOutbound++;
      }
    }

    // ── Check for phone leakage ──────────────────────────────────────
    const phoneMatches = serialized.match(LEAKAGE_PHONE_RE) ?? [];
    for (const match of phoneMatches) {
      const cleaned = match.replace(/[\s\-().]/g, "");
      const digits = cleaned.replace(/\D/g, "");
      // Only flag if it looks like a real phone number (7+ digits)
      if (digits.length >= 7 && !SAFE_TOKEN_RE.test(match)) {
        violations.push(`Residual phone pattern found: [REDACTED_FOR_LOG]`);
        residualLeakage++;
        rawHighRiskValuesOutbound++;
      }
    }

    // ── Check for credit card leakage ────────────────────────────────
    const cardMatches = serialized.match(LEAKAGE_CREDIT_CARD_RE) ?? [];
    for (const match of cardMatches) {
      if (!SAFE_TOKEN_RE.test(match)) {
        violations.push(`Residual credit card pattern found: [REDACTED_FOR_LOG]`);
        residualLeakage++;
        rawHighRiskValuesOutbound++;
      }
    }

    // ── Check for auth token leakage ─────────────────────────────────
    const tokenMatches = serialized.match(LEAKAGE_AUTH_TOKEN_RE) ?? [];
    for (const match of tokenMatches) {
      violations.push(`Residual auth token pattern found: [REDACTED_FOR_LOG]`);
      residualLeakage++;
      rawHighRiskValuesOutbound++;
    }

    // ── Check for raw values from local token mapping ────────────────
    const rawValues = this.tokenizer.getRawValues();
    for (const rawValue of rawValues) {
      if (rawValue && rawValue.length > 3 && serialized.includes(rawValue)) {
        violations.push(
          `Raw sensitive value found in outbound context: [REDACTED_FOR_LOG]`,
        );
        residualLeakage++;
        rawHighRiskValuesOutbound++;
      }
    }

    return {
      passed: violations.length === 0,
      rawHighRiskValuesOutbound,
      residualLeakage,
      violations,
    };
  }

  // ── Internal ───────────────────────────────────────────────────────

  /**
   * Serialize the sanitized context to a string for scanning.
   */
  private serializeContext(context: SanitizedContext): string {
    const parts: string[] = [context.task];

    for (const el of context.elements) {
      if (el.label) parts.push(el.label);
      if (el.text) parts.push(el.text);
    }

    return parts.join(" ");
  }
}
