/**
 * Policy Engine Tests
 *
 * Tests:
 * - PASSWORD → REDACT
 * - EMAIL → TOKENIZE
 * - Sensitivity classification correctness
 * - Policy is deterministic and configuration-driven
 */

import { describe, it, expect } from "bun:test";
import { SensitivityClassifier } from "../SensitivityClassifier";
import { PolicyEngine } from "../PolicyEngine";
import type { FusedEvidence } from "../EvidenceFusionEngine";

// ── Helpers ────────────────────────────────────────────────────────────

function makeFused(overrides: Partial<FusedEvidence>): FusedEvidence {
  return {
    entityId: "EMAIL_1",
    entityType: "EMAIL",
    fusedConfidence: 0.9,
    sources: ["REGEX"],
    detectionCount: 1,
    elementIds: ["el_1"],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("SensitivityClassifier", () => {
  const classifier = new SensitivityClassifier();

  it("should classify PASSWORD as S4", () => {
    expect(classifier.classify("PASSWORD")).toBe("S4");
  });

  it("should classify AUTH_TOKEN as S4", () => {
    expect(classifier.classify("AUTH_TOKEN")).toBe("S4");
  });

  it("should classify CREDIT_CARD as S3", () => {
    expect(classifier.classify("CREDIT_CARD")).toBe("S3");
  });

  it("should classify FACE as S3", () => {
    expect(classifier.classify("FACE")).toBe("S3");
  });

  it("should classify EMAIL as S2", () => {
    expect(classifier.classify("EMAIL")).toBe("S2");
  });

  it("should classify PHONE as S2", () => {
    expect(classifier.classify("PHONE")).toBe("S2");
  });

  it("should classify PERSON as S2", () => {
    expect(classifier.classify("PERSON")).toBe("S2");
  });

  it("should classify ADDRESS as S2", () => {
    expect(classifier.classify("ADDRESS")).toBe("S2");
  });

  it("should identify high-risk types correctly", () => {
    expect(classifier.isHighRisk("PASSWORD")).toBe(true);
    expect(classifier.isHighRisk("AUTH_TOKEN")).toBe(true);
    expect(classifier.isHighRisk("CREDIT_CARD")).toBe(true);
    expect(classifier.isHighRisk("EMAIL")).toBe(false);
    expect(classifier.isHighRisk("PHONE")).toBe(false);
  });

  it("should allow custom overrides", () => {
    const custom = new SensitivityClassifier({ EMAIL: "S4" });
    expect(custom.classify("EMAIL")).toBe("S4");
    expect(custom.classify("PASSWORD")).toBe("S4"); // default preserved
  });
});

describe("PolicyEngine", () => {
  const classifier = new SensitivityClassifier();
  const policy = new PolicyEngine(classifier);

  it("should REDACT PASSWORD", () => {
    const fused = makeFused({
      entityId: "PASSWORD_1",
      entityType: "PASSWORD",
      fusedConfidence: 1.0,
    });
    const decisions = policy.decide(fused);
    expect(decisions.length).toBeGreaterThan(0);
    expect(decisions[0]!.action).toBe("REDACT");
    expect(decisions[0]!.sensitivity).toBe("S4");
  });

  it("should REDACT AUTH_TOKEN", () => {
    const fused = makeFused({
      entityId: "TOKEN_1",
      entityType: "AUTH_TOKEN",
      fusedConfidence: 0.9,
    });
    const decisions = policy.decide(fused);
    expect(decisions[0]!.action).toBe("REDACT");
  });

  it("should REDACT CREDIT_CARD", () => {
    const fused = makeFused({
      entityId: "CARD_1",
      entityType: "CREDIT_CARD",
      fusedConfidence: 0.95,
    });
    const decisions = policy.decide(fused);
    expect(decisions[0]!.action).toBe("REDACT");
  });

  it("should TOKENIZE EMAIL", () => {
    const fused = makeFused({
      entityId: "EMAIL_1",
      entityType: "EMAIL",
      fusedConfidence: 0.9,
    });
    const decisions = policy.decide(fused);
    expect(decisions[0]!.action).toBe("TOKENIZE");
  });

  it("should TOKENIZE PHONE", () => {
    const fused = makeFused({
      entityId: "PHONE_1",
      entityType: "PHONE",
      fusedConfidence: 0.85,
    });
    const decisions = policy.decide(fused);
    expect(decisions[0]!.action).toBe("TOKENIZE");
  });

  it("should TOKENIZE PERSON", () => {
    const fused = makeFused({
      entityId: "PERSON_1",
      entityType: "PERSON",
      fusedConfidence: 0.7,
    });
    const decisions = policy.decide(fused);
    expect(decisions[0]!.action).toBe("TOKENIZE");
  });

  it("should BLUR FACE", () => {
    const fused = makeFused({
      entityId: "FACE_1",
      entityType: "FACE",
      fusedConfidence: 0.8,
    });
    const decisions = policy.decide(fused);
    expect(decisions[0]!.action).toBe("BLUR");
  });

  it("should ALLOW when confidence is below threshold", () => {
    const fused = makeFused({
      entityId: "EMAIL_1",
      entityType: "EMAIL",
      fusedConfidence: 0.1, // Below 0.3 threshold
    });
    const decisions = policy.decide(fused);
    expect(decisions[0]!.action).toBe("ALLOW");
    expect(decisions[0]!.sensitivity).toBe("S0");
  });

  it("should produce decisions for each element ID", () => {
    const fused = makeFused({
      entityId: "EMAIL_1",
      entityType: "EMAIL",
      elementIds: ["el_1", "el_2", "el_3"],
    });
    const decisions = policy.decide(fused);
    expect(decisions.length).toBe(3);
  });

  it("should be deterministic (same input → same output)", () => {
    const fused = makeFused({ entityId: "EMAIL_1", entityType: "EMAIL" });
    const d1 = policy.decide(fused);
    const d2 = policy.decide(fused);
    expect(d1[0]!.action).toBe(d2[0]!.action);
    expect(d1[0]!.sensitivity).toBe(d2[0]!.sensitivity);
  });
});
