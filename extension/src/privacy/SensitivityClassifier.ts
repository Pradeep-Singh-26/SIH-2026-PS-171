/**
 * SensitivityClassifier
 *
 * Deterministic sensitivity classification for detected entity types.
 *
 * Sensitivity levels:
 *   S0 — Public / non-sensitive
 *   S1 — Low sensitivity
 *   S2 — Medium (EMAIL, PHONE, PERSON, ADDRESS)
 *   S3 — High (CREDIT_CARD, FACE)
 *   S4 — Critical (PASSWORD, AUTH_TOKEN)
 *
 * The classifier does NOT decide the transformation.
 * It only assigns a sensitivity level.
 */

import type { EntityType, Sensitivity } from "./types";

// ── Default sensitivity configuration ──────────────────────────────────

const DEFAULT_SENSITIVITY_MAP: Record<EntityType, Sensitivity> = {
  PASSWORD: "S4",
  AUTH_TOKEN: "S4",
  CREDIT_CARD: "S3",
  FACE: "S3",
  EMAIL: "S2",
  PHONE: "S2",
  PERSON: "S2",
  ADDRESS: "S2",
};

/** Conservative default for unknown/unclassified entity types. */
const DEFAULT_UNKNOWN_SENSITIVITY: Sensitivity = "S2";

export class SensitivityClassifier {
  private sensitivityMap: Record<EntityType, Sensitivity>;

  constructor(
    overrides?: Partial<Record<EntityType, Sensitivity>>,
  ) {
    this.sensitivityMap = {
      ...DEFAULT_SENSITIVITY_MAP,
      ...overrides,
    };
  }

  /**
   * Classify the sensitivity of a given entity type.
   *
   * @param entityType - The entity type to classify.
   * @returns The assigned sensitivity level.
   */
  classify(entityType: EntityType): Sensitivity {
    return this.sensitivityMap[entityType] ?? DEFAULT_UNKNOWN_SENSITIVITY;
  }

  /**
   * Check if an entity type is high-risk (S3 or S4).
   */
  isHighRisk(entityType: EntityType): boolean {
    const sensitivity = this.classify(entityType);
    return sensitivity === "S3" || sensitivity === "S4";
  }

  /**
   * Get the full sensitivity map (for debugging/receipts).
   */
  getSensitivityMap(): Record<EntityType, Sensitivity> {
    return { ...this.sensitivityMap };
  }
}
