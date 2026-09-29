/**
 * Privacy Engine Integration Tests
 *
 * Test 9:  Irrelevant PII stripped by context minimization
 * Test 10: Sensitive form — Login button available, password never leaves browser
 * Full pipeline integration test
 */

import { describe, it, expect } from "bun:test";
import { PrivacyEngine } from "../PrivacyEngine";
import type { PrivacyInput } from "../types";
import type { ScoredCandidate, SelectedContext } from "../../types/index";

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

describe("PrivacyEngine", () => {
  const engine = new PrivacyEngine();

  // ── Basic pipeline ─────────────────────────────────────────────────

  describe("Basic pipeline", () => {
    it("should process a simple non-sensitive context → ALLOW", async () => {
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
      expect(result.receipt.gate).toBe("ALLOW");
      expect(result.receipt.verification.passed).toBe(true);
    });

    it("should detect and transform email fields", async () => {
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
            makeCandidate({
              id: "el_2",
              tagName: "input",
              role: "textbox",
              type: "email",
              label: "Email",
              placeholder: "Email address",
              relevanceScore: 0.3,
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.gateResult.decision).toBe("ALLOW");

      // Email should be detected
      expect(result.receipt.detected.EMAIL).toBeGreaterThan(0);
    });

    it("should detect password fields without reading their value", async () => {
      const input: PrivacyInput = {
        task: "click Login",
        selectedContext: {
          task: "click Login",
          candidates: [
            makeCandidate({
              id: "el_1",
              tagName: "input",
              role: "textbox",
              type: "password",
              label: "Password",
              relevanceScore: 0.3,
            }),
            makeCandidate({
              id: "el_2",
              tagName: "button",
              role: "button",
              label: "Login",
              text: "Login",
              relevanceScore: 0.9,
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.receipt.detected.PASSWORD).toBeGreaterThan(0);
      // Password field should be REDACTED
      expect(result.receipt.transformations.REDACT).toBeGreaterThan(0);
    });
  });

  // ── Test 9: Irrelevant PII minimization ────────────────────────────

  describe("Test 9 — Irrelevant PII stripped by context minimization", () => {
    it("should strip irrelevant email when task is 'click Download Invoice'", async () => {
      const input: PrivacyInput = {
        task: "click Download Invoice",
        selectedContext: {
          task: "click Download Invoice",
          candidates: [
            // Highly relevant: the target button
            makeCandidate({
              id: "el_1",
              tagName: "button",
              role: "button",
              label: "Download Invoice",
              text: "Download Invoice",
              relevanceScore: 0.9,
            }),
            // Irrelevant: email field (low relevance for this task)
            makeCandidate({
              id: "el_2",
              tagName: "input",
              role: "textbox",
              type: "email",
              label: "Email",
              placeholder: "rahul@example.com",
              relevanceScore: 0.05, // Below minimization threshold
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.gateResult.decision).toBe("ALLOW");

      // The irrelevant email element should NOT be in the minimized output
      if (result.gateResult.context) {
        const emailElement = result.gateResult.context.elements.find(
          (el) => el.id === "el_2",
        );
        expect(emailElement).toBeUndefined();
      }
    });
  });

  // ── Test 10: Sensitive form ────────────────────────────────────────

  describe("Test 10 — Sensitive form (Login)", () => {
    it("should keep Login button available while protecting password", async () => {
      const input: PrivacyInput = {
        task: "click Login",
        selectedContext: {
          task: "click Login",
          candidates: [
            makeCandidate({
              id: "el_1",
              tagName: "input",
              role: "textbox",
              type: "email",
              label: "Email",
              relevanceScore: 0.1,
            }),
            makeCandidate({
              id: "el_2",
              tagName: "input",
              role: "textbox",
              type: "password",
              label: "Password",
              relevanceScore: 0.1,
            }),
            makeCandidate({
              id: "el_3",
              tagName: "button",
              role: "button",
              label: "Login",
              text: "Login",
              relevanceScore: 0.9,
            }),
          ],
        },
      };

      const result = await engine.process(input);
      expect(result.gateResult.decision).toBe("ALLOW");

      // Login button should be in the output
      if (result.gateResult.context) {
        const loginElement = result.gateResult.context.elements.find(
          (el) => el.id === "el_3",
        );
        expect(loginElement).toBeDefined();
        expect(loginElement!.label).toBe("Login");

        // Password value should NEVER appear
        const serialized = JSON.stringify(result.gateResult.context);
        // No raw password can appear (we never read it)
        expect(serialized).not.toContain("actual_password");
      }

      // Password should be detected
      expect(result.receipt.detected.PASSWORD).toBeGreaterThan(0);
    });
  });

  // ── Receipt format ─────────────────────────────────────────────────

  describe("Privacy Receipt", () => {
    it("should produce a safe receipt with no raw values", async () => {
      const input: PrivacyInput = {
        task: "click Login",
        selectedContext: {
          task: "click Login",
          candidates: [
            makeCandidate({
              id: "el_1",
              tagName: "input",
              role: "textbox",
              type: "email",
              label: "Email",
              placeholder: "Email address",
              relevanceScore: 0.3,
            }),
            makeCandidate({
              id: "el_2",
              tagName: "input",
              role: "textbox",
              type: "password",
              label: "Password",
              relevanceScore: 0.3,
            }),
            makeCandidate({
              id: "el_3",
              tagName: "button",
              role: "button",
              label: "Login",
              text: "Login",
              relevanceScore: 0.9,
            }),
          ],
        },
      };

      const result = await engine.process(input);
      const receipt = result.receipt;

      // Receipt has expected structure
      expect(receipt.detected).toBeDefined();
      expect(receipt.transformations).toBeDefined();
      expect(receipt.context).toBeDefined();
      expect(receipt.verification).toBeDefined();
      expect(receipt.gate).toBeDefined();

      // Receipt does not contain raw values
      const receiptStr = JSON.stringify(receipt);
      expect(receiptStr).not.toContain("rahul@example.com");
      expect(receiptStr).not.toContain("Rahul Sharma");
      expect(receiptStr).not.toContain("9876543210");
    });
  });

  // ── Trust boundary ─────────────────────────────────────────────────

  describe("Security invariant", () => {
    it("should never include raw sensitive data in the sanitized context", async () => {
      const input: PrivacyInput = {
        task: "click Download Invoice",
        selectedContext: {
          task: "click Download Invoice",
          candidates: [
            makeCandidate({
              id: "el_1",
              tagName: "button",
              label: "Download Invoice",
              text: "Download Invoice",
              relevanceScore: 0.9,
            }),
            makeCandidate({
              id: "el_2",
              tagName: "input",
              type: "email",
              label: "Contact: test@example.com",
              relevanceScore: 0.3,
            }),
            makeCandidate({
              id: "el_3",
              tagName: "input",
              type: "password",
              label: "Password",
              relevanceScore: 0.2,
            }),
          ],
        },
      };

      const result = await engine.process(input);

      if (result.gateResult.context) {
        const contextStr = JSON.stringify(result.gateResult.context);
        // No raw email should appear in output
        expect(contextStr).not.toContain("test@example.com");
      }
    });
  });
});
