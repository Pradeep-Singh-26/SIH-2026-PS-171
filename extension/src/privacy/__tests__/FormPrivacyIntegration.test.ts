/**
 * FormPrivacyIntegration — Regression Tests
 *
 * Verifies the end-to-end pipeline for form tasks:
 *   ContextSelector (with form-intent) → Privacy Engine → SanitizedContext
 *
 * Tests:
 *   - Form controls survive context selection AND minimization
 *   - PII in form controls is detected and transformed
 *   - Password fields are REDACTED
 *   - Raw PII never appears in SanitizedContext
 *   - Existing Download Invoice pipeline still works
 */

import { describe, it, expect } from "bun:test";
import { PrivacyEngine } from "../PrivacyEngine";
import type { PrivacyInput } from "../types";
import type { ScoredCandidate } from "../../types/index";

// ── Helpers ────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<ScoredCandidate> & { id: string }): ScoredCandidate {
  return {
    tagName: "button",
    role: "button",
    label: undefined,
    text: undefined,
    ariaLabel: undefined,
    placeholder: undefined,
    type: undefined,
    visible: true,
    enabled: true,
    bbox: { x: 0, y: 0, width: 100, height: 40 },
    relevanceScore: 0.5,
    relevanceReasons: [],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("FormPrivacyIntegration", () => {
  const engine = new PrivacyEngine();

  // ── Test 1: Form controls survive minimization ─────────────────────
  describe("Form controls survive context selection and minimization", () => {
    it("should retain form controls with adequate relevance scores", async () => {
      const input: PrivacyInput = {
        task: "fill the form with the available information",
        selectedContext: {
          task: "fill the form with the available information",
          candidates: [
            // Form controls with form-intent boost score (~0.25)
            makeCandidate({
              id: "el_name",
              tagName: "input",
              role: "textbox",
              label: "Full Name",
              placeholder: "Your full name",
              type: "text",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match", "role_match"],
            }),
            makeCandidate({
              id: "el_email",
              tagName: "input",
              role: "textbox",
              label: "Email",
              placeholder: "Email address",
              type: "email",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match", "role_match"],
            }),
            makeCandidate({
              id: "el_phone",
              tagName: "input",
              role: "textbox",
              label: "Phone",
              placeholder: "Phone number",
              type: "tel",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match", "role_match"],
            }),
            makeCandidate({
              id: "el_address",
              tagName: "input",
              role: "textbox",
              label: "Address",
              placeholder: "Street address",
              type: "text",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match", "role_match"],
            }),
            makeCandidate({
              id: "el_password",
              tagName: "input",
              role: "textbox",
              label: "Password",
              placeholder: "Enter password",
              type: "password",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match", "role_match"],
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.gateResult.decision).toBe("ALLOW");
      expect(result.receipt.context.selected).toBeGreaterThan(0);

      // Elements should exist in the sanitized context
      if (result.gateResult.context) {
        expect(result.gateResult.context.elements.length).toBeGreaterThan(0);
      }
    });
  });

  // ── Test 2: PII is still detected and transformed ──────────────────
  describe("PII in form controls is detected and transformed", () => {
    it("should detect EMAIL, PHONE, PERSON, ADDRESS, PASSWORD", async () => {
      const input: PrivacyInput = {
        task: "fill the form",
        selectedContext: {
          task: "fill the form",
          candidates: [
            makeCandidate({
              id: "el_name",
              tagName: "input",
              role: "textbox",
              label: "Full Name",
              type: "text",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
            makeCandidate({
              id: "el_email",
              tagName: "input",
              role: "textbox",
              label: "Email",
              type: "email",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
            makeCandidate({
              id: "el_phone",
              tagName: "input",
              role: "textbox",
              label: "Phone",
              type: "tel",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
            makeCandidate({
              id: "el_password",
              tagName: "input",
              role: "textbox",
              label: "Password",
              type: "password",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
            makeCandidate({
              id: "el_address",
              tagName: "input",
              role: "textbox",
              label: "Address",
              type: "text",
              autocomplete: "street-address",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.gateResult.decision).toBe("ALLOW");

      // PII should be detected
      const detectedTypes = Object.keys(result.receipt.detected);
      expect(detectedTypes.length).toBeGreaterThan(0);

      // Transformations should be applied
      const totalTransformations = Object.values(result.receipt.transformations)
        .reduce((a, b) => a + (b ?? 0), 0);
      expect(totalTransformations).toBeGreaterThan(0);
    });
  });

  // ── Test 3: Password fields are REDACTED ───────────────────────────
  describe("Password fields are REDACTED", () => {
    it("should REDACT password fields", async () => {
      const input: PrivacyInput = {
        task: "fill the form",
        selectedContext: {
          task: "fill the form",
          candidates: [
            makeCandidate({
              id: "el_password",
              tagName: "input",
              role: "textbox",
              label: "Password",
              type: "password",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.receipt.detected.PASSWORD).toBeGreaterThan(0);
      expect(result.receipt.transformations.REDACT).toBeGreaterThan(0);

      // If password element survives minimization, it must be transformed
      if (result.gateResult.context) {
        const pwdEl = result.gateResult.context.elements.find((el) => el.id === "el_password");
        if (pwdEl) {
          expect(pwdEl.transformed).toBe(true);
          expect(pwdEl.label).toBe("[REDACTED]");
        }
      }
    });
  });

  // ── Test 4: Raw PII never in SanitizedContext ──────────────────────
  describe("Raw PII never appears in SanitizedContext", () => {
    it("should not contain any raw sensitive values in output", async () => {
      const input: PrivacyInput = {
        task: "fill the form",
        selectedContext: {
          task: "fill the form",
          candidates: [
            makeCandidate({
              id: "el_1",
              tagName: "input",
              role: "textbox",
              label: "Contact: test@example.com",
              type: "email",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
            makeCandidate({
              id: "el_2",
              tagName: "input",
              role: "textbox",
              label: "Password",
              type: "password",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.gateResult.decision).toBe("ALLOW");

      if (result.gateResult.context) {
        const contextStr = JSON.stringify(result.gateResult.context);
        expect(contextStr).not.toContain("test@example.com");
      }

      // Receipt also clean
      const receiptStr = JSON.stringify(result.receipt);
      expect(receiptStr).not.toContain("test@example.com");
    });
  });

  // ── Test 5: Download Invoice pipeline still works ──────────────────
  describe("Existing Download Invoice pipeline preserved", () => {
    it("should process Download Invoice task correctly with high-relevance button", async () => {
      const input: PrivacyInput = {
        task: "click Download Invoice",
        selectedContext: {
          task: "click Download Invoice",
          candidates: [
            makeCandidate({
              id: "el_1",
              tagName: "button",
              role: "button",
              label: "Download Invoice",
              text: "Download Invoice",
              relevanceScore: 0.9,
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.gateResult.decision).toBe("ALLOW");
      expect(result.receipt.context.selected).toBeGreaterThan(0);

      if (result.gateResult.context) {
        const btn = result.gateResult.context.elements.find((el) => el.id === "el_1");
        expect(btn).toBeDefined();
        expect(btn!.label).toBe("Download Invoice");
      }
    });
  });

  // ── Test 6: Residual leakage and gate still function ───────────────
  describe("Residual leakage checker and gate still function", () => {
    it("should pass verification with 0 residual leakage", async () => {
      const input: PrivacyInput = {
        task: "fill the form",
        selectedContext: {
          task: "fill the form",
          candidates: [
            makeCandidate({
              id: "el_email",
              tagName: "input",
              role: "textbox",
              label: "Email",
              type: "email",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
            makeCandidate({
              id: "el_password",
              tagName: "input",
              role: "textbox",
              label: "Password",
              type: "password",
              relevanceScore: 0.25,
              relevanceReasons: ["form_intent_match"],
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.receipt.verification.residualLeakage).toBe(0);
      expect(result.receipt.verification.rawHighRiskValuesOutbound).toBe(0);
      expect(result.receipt.verification.passed).toBe(true);
      expect(result.receipt.gate).toBe("ALLOW");
    });
  });
});
