/**
 * TokenizationEngine
 *
 * Converts sensitive values into privacy tokens:
 *   <PERSON_1>, <EMAIL_1>, <PHONE_1>, <CARD_1>, etc.
 *
 * SECURITY INVARIANT:
 *   The token ↔ value mapping stays ENTIRELY LOCAL.
 *   It is NEVER included in SanitizedContext.
 *   It is NEVER logged.
 *   It is NEVER sent to any remote endpoint.
 *
 * Repeated references to the same entity always use the same token.
 */

import type { EntityType } from "./types";

/** Short display prefixes for token generation. */
const TOKEN_PREFIX: Record<EntityType, string> = {
  PERSON: "PERSON",
  EMAIL: "EMAIL",
  PHONE: "PHONE",
  ADDRESS: "ADDRESS",
  PASSWORD: "PASSWORD",
  CREDIT_CARD: "CARD",
  AUTH_TOKEN: "TOKEN",
  FACE: "FACE",
};

export class TokenizationEngine {
  /**
   * entityId → token string.
   * e.g. "EMAIL_1" → "<EMAIL_1>"
   */
  private entityToToken: Map<string, string> = new Map();

  /**
   * token → raw value (LOCAL ONLY — never leaves the browser).
   * This mapping is NEVER serialized into SanitizedContext.
   */
  private tokenToValue: Map<string, string> = new Map();

  /**
   * Counters for each entity type to generate sequential tokens.
   */
  private counters: Map<EntityType, number> = new Map();

  /**
   * normalizedValueHash → entityId mapping for dedup.
   */
  private hashToEntityId: Map<string, string> = new Map();

  /**
   * Get or create a token for a given entity.
   *
   * @param entityId - The resolved entity ID (e.g. "EMAIL_1").
   * @param entityType - The entity type.
   * @param rawValue - The raw value (LOCAL ONLY — stored for potential local de-tokenization).
   * @param normalizedValueHash - Hash for dedup.
   * @returns The privacy token string (e.g. "<EMAIL_1>").
   */
  tokenize(
    entityId: string,
    entityType: EntityType,
    rawValue?: string,
    normalizedValueHash?: string,
  ): string {
    // Check if this entity already has a token
    const existing = this.entityToToken.get(entityId);
    if (existing) return existing;

    // Check if we've seen this hash before (dedup across entities)
    if (normalizedValueHash) {
      const existingEntityId = this.hashToEntityId.get(
        `${entityType}::${normalizedValueHash}`,
      );
      if (existingEntityId) {
        const existingToken = this.entityToToken.get(existingEntityId);
        if (existingToken) {
          // Reuse the same token
          this.entityToToken.set(entityId, existingToken);
          return existingToken;
        }
      }
    }

    // Generate new token
    const count = (this.counters.get(entityType) ?? 0) + 1;
    this.counters.set(entityType, count);

    const prefix = TOKEN_PREFIX[entityType] ?? entityType;
    const token = `<${prefix}_${count}>`;

    this.entityToToken.set(entityId, token);

    if (rawValue) {
      this.tokenToValue.set(token, rawValue);
    }

    if (normalizedValueHash) {
      this.hashToEntityId.set(
        `${entityType}::${normalizedValueHash}`,
        entityId,
      );
    }

    return token;
  }

  /**
   * Get the token for an entity if it exists.
   */
  getToken(entityId: string): string | undefined {
    return this.entityToToken.get(entityId);
  }

  /**
   * Get all known token strings (for leakage checking).
   * Returns tokens only, NEVER the mapped values.
   */
  getAllTokens(): string[] {
    return Array.from(this.entityToToken.values());
  }

  /**
   * Get count of tokens generated.
   */
  get size(): number {
    return this.entityToToken.size;
  }

  /**
   * Check if a raw value has been tokenized (for leakage detection).
   * Returns true if the value exists in the local mapping.
   * NEVER exposes the mapping externally.
   */
  hasRawValue(value: string): boolean {
    for (const storedValue of this.tokenToValue.values()) {
      if (storedValue === value) return true;
    }
    return false;
  }

  /**
   * Get all raw values (LOCAL ONLY — for leakage checking).
   * This method must NEVER be called from code that produces outbound context.
   */
  getRawValues(): string[] {
    return Array.from(this.tokenToValue.values());
  }

  /**
   * Clear all mappings.
   */
  clear(): void {
    this.entityToToken.clear();
    this.tokenToValue.clear();
    this.counters.clear();
    this.hashToEntityId.clear();
  }
}
