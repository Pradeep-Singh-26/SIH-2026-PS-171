/**
 * DOM Redaction Tests
 *
 * Tests that the DomRedactor produces correct sanitized representations:
 * - REDACT replaces with [REDACTED]
 * - TOKENIZE replaces with privacy tokens
 * - Non-sensitive elements pass through unchanged
 */

import { describe, it, expect } from "bun:test";
import { DomRedactor } from "../DomRedactor";
import { TokenizationEngine } from "../TokenizationEngine";
import type { ScoredCandidate } from "../../types/index";
import type { PolicyDecision } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────

function makeCandidate(overrides: Partial<ScoredCandidate> & { id: string }): ScoredCandidate {
  return {
    tagName: "input",
    role: "textbox",
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

describe("DomRedactor", () => {
  it("should pass through elements with no decisions", () => {
    const tokenizer = new TokenizationEngine();
    const redactor = new DomRedactor(tokenizer);

    const candidates = [
      makeCandidate({ id: "el_1", tagName: "button", label: "Download Invoice", text: "Download Invoice" }),
    ];

    const result = redactor.redact(candidates, []);
    expect(result[0]!.label).toBe("Download Invoice");
    expect(result[0]!.transformed).toBe(false);
  });

  it("should REDACT password fields", () => {
    const tokenizer = new TokenizationEngine();
    const redactor = new DomRedactor(tokenizer);

    const candidates = [
      makeCandidate({ id: "el_1", tagName: "input", type: "password", label: "Password" }),
    ];
    const decisions: PolicyDecision[] = [{
      entityType: "PASSWORD",
      sensitivity: "S4",
      action: "REDACT",
      elementId: "el_1",
      entityId: "PASSWORD_1",
    }];

    const result = redactor.redact(candidates, decisions);
    expect(result[0]!.label).toBe("[REDACTED]");
    expect(result[0]!.transformed).toBe(true);
  });

  it("should TOKENIZE email fields with privacy tokens", () => {
    const tokenizer = new TokenizationEngine();
    tokenizer.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
    const redactor = new DomRedactor(tokenizer);

    const candidates = [
      makeCandidate({ id: "el_1", tagName: "input", type: "email", label: "Email" }),
    ];
    const decisions: PolicyDecision[] = [{
      entityType: "EMAIL",
      sensitivity: "S2",
      action: "TOKENIZE",
      elementId: "el_1",
      entityId: "EMAIL_1",
    }];

    const result = redactor.redact(candidates, decisions);
    expect(result[0]!.label).toBe("<EMAIL_1>");
    expect(result[0]!.transformed).toBe(true);
  });

  it("should apply the most restrictive action when multiple decisions apply", () => {
    const tokenizer = new TokenizationEngine();
    const redactor = new DomRedactor(tokenizer);

    const candidates = [
      makeCandidate({ id: "el_1", label: "Sensitive field", text: "Some text" }),
    ];
    const decisions: PolicyDecision[] = [
      { entityType: "EMAIL", sensitivity: "S2", action: "TOKENIZE", elementId: "el_1", entityId: "EMAIL_1" },
      { entityType: "PASSWORD", sensitivity: "S4", action: "REDACT", elementId: "el_1", entityId: "PASSWORD_1" },
    ];

    const result = redactor.redact(candidates, decisions);
    // REDACT is more restrictive than TOKENIZE
    expect(result[0]!.label).toBe("[REDACTED]");
    expect(result[0]!.transformed).toBe(true);
  });

  it("should BLUR face elements", () => {
    const tokenizer = new TokenizationEngine();
    const redactor = new DomRedactor(tokenizer);

    const candidates = [
      makeCandidate({ id: "el_1", tagName: "img", label: "Profile photo" }),
    ];
    const decisions: PolicyDecision[] = [{
      entityType: "FACE",
      sensitivity: "S3",
      action: "BLUR",
      elementId: "el_1",
      entityId: "FACE_1",
    }];

    const result = redactor.redact(candidates, decisions);
    expect(result[0]!.label).toBe("[BLURRED]");
    expect(result[0]!.transformed).toBe(true);
  });
});
