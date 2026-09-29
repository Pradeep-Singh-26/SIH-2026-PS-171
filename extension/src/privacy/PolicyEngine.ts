/**
 * PolicyEngine
 *
 * Deterministic, configuration-driven privacy policy.
 *
 * The detector identifies PII.
 * The classifier assigns sensitivity.
 * The PolicyEngine decides the action.
 *
 * Default policy:
 *   PASSWORD     → REDACT
 *   AUTH_TOKEN   → REDACT
 *   CREDIT_CARD  → REDACT
 *   EMAIL        → TOKENIZE
 *   PHONE        → TOKENIZE
 *   PERSON       → TOKENIZE
 *   ADDRESS      → TOKENIZE
 *   FACE         → BLUR
 *
 * The remote LLM must NEVER decide privacy policy.
 */

import type {
  EntityType,
  PolicyAction,
  PolicyDecision,
  Sensitivity,
} from "./types";
import type { FusedEvidence } from "./EvidenceFusionEngine";
import { SensitivityClassifier } from "./SensitivityClassifier";

// ── Default policy configuration ───────────────────────────────────────

const DEFAULT_POLICY_MAP: Record<EntityType, PolicyAction> = {
  PASSWORD: "REDACT",
  AUTH_TOKEN: "REDACT",
  CREDIT_CARD: "REDACT",
  EMAIL: "TOKENIZE",
  PHONE: "TOKENIZE",
  PERSON: "TOKENIZE",
  ADDRESS: "TOKENIZE",
  FACE: "BLUR",
};

/** Minimum confidence to trigger the policy action. */
const MIN_CONFIDENCE_THRESHOLD = 0.3;

export class PolicyEngine {
  private policyMap: Record<EntityType, PolicyAction>;
  private classifier: SensitivityClassifier;

  constructor(
    classifier: SensitivityClassifier,
    overrides?: Partial<Record<EntityType, PolicyAction>>,
  ) {
    this.classifier = classifier;
    this.policyMap = {
      ...DEFAULT_POLICY_MAP,
      ...overrides,
    };
  }

  /**
   * Decide the privacy action for a fused evidence item.
   *
   * @param fused - Fused evidence for a resolved entity.
   * @returns A PolicyDecision for each element associated with the entity.
   */
  decide(fused: FusedEvidence): PolicyDecision[] {
    const decisions: PolicyDecision[] = [];

    // Below the minimum confidence threshold → ALLOW
    if (fused.fusedConfidence < MIN_CONFIDENCE_THRESHOLD) {
      for (const elementId of fused.elementIds) {
        decisions.push({
          entityType: fused.entityType,
          sensitivity: "S0",
          action: "ALLOW",
          elementId,
          entityId: fused.entityId,
        });
      }
      return decisions;
    }

    const sensitivity = this.classifier.classify(fused.entityType);
    const action = this.policyMap[fused.entityType] ?? "REDACT";

    for (const elementId of fused.elementIds) {
      decisions.push({
        entityType: fused.entityType,
        sensitivity,
        action,
        elementId,
        entityId: fused.entityId,
      });
    }

    return decisions;
  }

  /**
   * Get the policy action for a specific entity type.
   */
  getAction(entityType: EntityType): PolicyAction {
    return this.policyMap[entityType] ?? "REDACT";
  }

  /**
   * Get the full policy map (for debugging/receipts).
   */
  getPolicyMap(): Record<EntityType, PolicyAction> {
    return { ...this.policyMap };
  }
}
