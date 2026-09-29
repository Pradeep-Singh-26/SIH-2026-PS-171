/**
 * Leakage Checker Tests
 *
 * Test 7: Clean sanitized context → PASS (ALLOW)
 * Test 8: Deliberate leak → BLOCK
 */

import { describe, it, expect } from "bun:test";
import { ResidualLeakageChecker } from "../ResidualLeakageChecker";
import { TokenizationEngine } from "../TokenizationEngine";
import type { SanitizedContext } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────

function makeContext(elements: { label?: string; text?: string }[]): SanitizedContext {
  return {
    task: "click the Download Invoice button",
    elements: elements.map((el, i) => ({
      id: `el_${i + 1}`,
      tagName: "button",
      role: "button",
      label: el.label,
      text: el.text,
      transformed: false,
    })),
    timestamp: Date.now(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("ResidualLeakageChecker", () => {
  // ── Test 7: Clean context → PASS ───────────────────────────────────

  describe("Test 7 — Clean sanitized context", () => {
    it("should PASS when context only contains tokens", () => {
      const tokenizer = new TokenizationEngine();
      tokenizer.tokenize("PERSON_1", "PERSON", "Rahul Sharma");
      tokenizer.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");

      const checker = new ResidualLeakageChecker(tokenizer);
      const context = makeContext([
        { label: "Customer: <PERSON_1>" },
        { label: "Email: <EMAIL_1>" },
      ]);

      const result = checker.check(context);
      expect(result.passed).toBe(true);
      expect(result.rawHighRiskValuesOutbound).toBe(0);
      expect(result.residualLeakage).toBe(0);
      expect(result.violations.length).toBe(0);
    });

    it("should PASS when context has no sensitive data at all", () => {
      const tokenizer = new TokenizationEngine();
      const checker = new ResidualLeakageChecker(tokenizer);
      const context = makeContext([
        { label: "Download Invoice" },
      ]);

      const result = checker.check(context);
      expect(result.passed).toBe(true);
    });
  });

  // ── Test 8: Deliberate leak → BLOCK ────────────────────────────────

  describe("Test 8 — Deliberate leak detection", () => {
    it("should BLOCK when email pattern remains in output", () => {
      const tokenizer = new TokenizationEngine();
      const checker = new ResidualLeakageChecker(tokenizer);
      const context = makeContext([
        { label: "Download Invoice" },
        { label: "debug: rahul@example.com" },
      ]);

      const result = checker.check(context);
      expect(result.passed).toBe(false);
      expect(result.rawHighRiskValuesOutbound).toBeGreaterThan(0);
      expect(result.violations.length).toBeGreaterThan(0);
    });

    it("should BLOCK when raw tokenized value appears in output", () => {
      const tokenizer = new TokenizationEngine();
      tokenizer.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
      const checker = new ResidualLeakageChecker(tokenizer);

      // Simulate a bug where raw value leaks alongside the token
      const context = makeContext([
        { label: "<EMAIL_1>" },
        { text: "rahul@example.com" }, // Raw value leaked!
      ]);

      const result = checker.check(context);
      expect(result.passed).toBe(false);
    });

    it("should BLOCK when credit card pattern remains", () => {
      const tokenizer = new TokenizationEngine();
      const checker = new ResidualLeakageChecker(tokenizer);
      const context = makeContext([
        { label: "Card: 4111 1111 1111 1111" },
      ]);

      const result = checker.check(context);
      expect(result.passed).toBe(false);
    });

    it("should BLOCK when phone number remains", () => {
      const tokenizer = new TokenizationEngine();
      const checker = new ResidualLeakageChecker(tokenizer);
      const context = makeContext([
        { text: "Phone: +91 98765 43210" },
      ]);

      const result = checker.check(context);
      expect(result.passed).toBe(false);
    });

    it("should BLOCK when auth token pattern remains", () => {
      const tokenizer = new TokenizationEngine();
      const checker = new ResidualLeakageChecker(tokenizer);
      const context = makeContext([
        { text: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIn0" },
      ]);

      const result = checker.check(context);
      expect(result.passed).toBe(false);
    });
  });
});
