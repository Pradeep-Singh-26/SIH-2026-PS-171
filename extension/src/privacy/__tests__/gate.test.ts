/**
 * Privacy Gate Tests
 *
 * Tests:
 * - ALLOW when all checks pass
 * - BLOCK on verification failure
 * - BLOCK on unknown/null state
 * - BLOCK on malformed context
 * - BLOCK on stale context
 * - BLOCK on residual leakage
 */

import { describe, it, expect } from "bun:test";
import { PrivacyGate } from "../PrivacyGate";
import { PrivacyGraph } from "../PrivacyGraph";
import type { LeakageResult, PolicyDecision, SanitizedContext } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────

function makeCleanContext(): SanitizedContext {
  return {
    task: "click Download Invoice",
    elements: [
      {
        id: "el_1",
        tagName: "button",
        role: "button",
        label: "Download Invoice",
        text: "Download Invoice",
        transformed: false,
      },
    ],
    timestamp: Date.now(),
  };
}

function makePassingLeakage(): LeakageResult {
  return {
    passed: true,
    rawHighRiskValuesOutbound: 0,
    residualLeakage: 0,
    violations: [],
  };
}

function makeFailingLeakage(): LeakageResult {
  return {
    passed: false,
    rawHighRiskValuesOutbound: 1,
    residualLeakage: 1,
    violations: ["Residual email pattern found"],
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("PrivacyGate", () => {
  const gate = new PrivacyGate();

  it("should ALLOW when all checks pass", () => {
    const graph = new PrivacyGraph();
    const result = gate.evaluate(
      makeCleanContext(),
      makePassingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("ALLOW");
    expect(result.context).toBeDefined();
    expect(result.reason).toBe("All privacy checks passed");
  });

  it("should BLOCK when context is null", () => {
    const graph = new PrivacyGraph();
    const result = gate.evaluate(
      null,
      makePassingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("BLOCK");
    expect(result.context).toBeUndefined();
  });

  it("should BLOCK when leakage check fails", () => {
    const graph = new PrivacyGraph();
    const result = gate.evaluate(
      makeCleanContext(),
      makeFailingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("BLOCK");
  });

  it("should BLOCK when task is missing", () => {
    const graph = new PrivacyGraph();
    const context = makeCleanContext();
    (context as any).task = "";

    const result = gate.evaluate(
      context,
      makePassingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("BLOCK");
  });

  it("should BLOCK when elements is not an array", () => {
    const graph = new PrivacyGraph();
    const context = makeCleanContext();
    (context as any).elements = "not an array";

    const result = gate.evaluate(
      context,
      makePassingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("BLOCK");
  });

  it("should BLOCK when context is stale", () => {
    const graph = new PrivacyGraph();
    const context = makeCleanContext();
    context.timestamp = Date.now() - 60_000; // 1 minute old

    const result = gate.evaluate(
      context,
      makePassingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("BLOCK");
    expect(result.reason).toContain("stale");
  });

  it("should BLOCK when a BLOCK policy decision exists", () => {
    const graph = new PrivacyGraph();
    const decisions: PolicyDecision[] = [{
      entityType: "PASSWORD",
      sensitivity: "S4",
      action: "BLOCK",
      elementId: "el_1",
      entityId: "PASSWORD_1",
    }];

    const result = gate.evaluate(
      makeCleanContext(),
      makePassingLeakage(),
      decisions,
      graph,
    );

    expect(result.decision).toBe("BLOCK");
  });

  it("should BLOCK when tainted element is in context without transformation", () => {
    const graph = new PrivacyGraph();
    graph.taintElement("el_1", "EMAIL_1", "EMAIL");

    const context = makeCleanContext();
    // el_1 is tainted but NOT transformed
    context.elements[0]!.transformed = false;

    const result = gate.evaluate(
      context,
      makePassingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("BLOCK");
  });

  it("should ALLOW when tainted element is transformed", () => {
    const graph = new PrivacyGraph();
    graph.taintElement("el_1", "EMAIL_1", "EMAIL");

    const context = makeCleanContext();
    context.elements[0]!.transformed = true;
    context.elements[0]!.label = "<EMAIL_1>";

    const result = gate.evaluate(
      context,
      makePassingLeakage(),
      [],
      graph,
    );

    expect(result.decision).toBe("ALLOW");
  });

  it("should include verification in result", () => {
    const graph = new PrivacyGraph();
    const leakage = makePassingLeakage();
    const result = gate.evaluate(makeCleanContext(), leakage, [], graph);

    expect(result.verification).toEqual(leakage);
  });
});
