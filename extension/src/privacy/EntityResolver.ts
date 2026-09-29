/**
 * EntityResolver
 *
 * Deduplicates equivalent PII detections into unified logical entities.
 *
 * Identity is based on:
 *   entityType + normalizedValueHash + elementId overlap
 *
 * Example:
 *   DOM → EMAIL detected for el_5
 *   Regex → EMAIL detected for el_5
 *   Both have the same normalizedValueHash
 *   → resolved to a single entity "EMAIL_1"
 *
 * No database. No network. No raw values exposed.
 */

import type { Evidence, EntityType } from "./types";

export interface ResolvedEntity {
  /** Unique entity ID (e.g. "EMAIL_1", "PERSON_1"). */
  entityId: string;

  /** Entity type. */
  entityType: EntityType;

  /** IDs of all evidence supporting this entity. */
  evidenceIds: string[];

  /** DOM element IDs associated with this entity. */
  elementIds: string[];

  /** Highest confidence across all evidence for this entity. */
  maxConfidence: number;

  /** Normalized value hash (for dedup — NOT the raw value). */
  normalizedValueHash?: string;
}

export class EntityResolver {
  private counters: Map<EntityType, number> = new Map();
  private entities: Map<string, ResolvedEntity> = new Map();

  /**
   * Resolve a list of evidence items into deduplicated entities.
   * Returns a map of entityId → ResolvedEntity.
   */
  resolve(evidenceList: Evidence[]): Map<string, ResolvedEntity> {
    this.counters.clear();
    this.entities.clear();

    // Group key: entityType + normalizedValueHash (or elementId fallback)
    const groupMap = new Map<string, Evidence[]>();

    for (const ev of evidenceList) {
      const groupKey = this.buildGroupKey(ev);
      const group = groupMap.get(groupKey);
      if (group) {
        group.push(ev);
      } else {
        groupMap.set(groupKey, [ev]);
      }
    }

    for (const [, group] of groupMap) {
      const first = group[0]!;
      const entityId = this.nextId(first.entityType);

      const elementIds = new Set<string>();
      const evidenceIds: string[] = [];
      let maxConfidence = 0;

      for (const ev of group) {
        evidenceIds.push(ev.id);
        if (ev.elementId) elementIds.add(ev.elementId);
        if (ev.confidence > maxConfidence) maxConfidence = ev.confidence;
      }

      const entity: ResolvedEntity = {
        entityId,
        entityType: first.entityType,
        evidenceIds,
        elementIds: Array.from(elementIds),
        maxConfidence,
        normalizedValueHash: first.normalizedValueHash,
      };

      this.entities.set(entityId, entity);
    }

    return new Map(this.entities);
  }

  /** Find the entity that an element belongs to. */
  getEntityForElement(
    elementId: string,
    entityType: EntityType,
  ): ResolvedEntity | undefined {
    for (const entity of this.entities.values()) {
      if (
        entity.entityType === entityType &&
        entity.elementIds.includes(elementId)
      ) {
        return entity;
      }
    }
    return undefined;
  }

  // ── Internal ───────────────────────────────────────────────────────

  private buildGroupKey(ev: Evidence): string {
    // Group by entity type + value hash when available
    if (ev.normalizedValueHash) {
      return `${ev.entityType}::${ev.normalizedValueHash}`;
    }
    // Fallback: group by entity type + element ID
    return `${ev.entityType}::el::${ev.elementId ?? "unknown"}`;
  }

  private nextId(entityType: EntityType): string {
    const count = (this.counters.get(entityType) ?? 0) + 1;
    this.counters.set(entityType, count);
    return `${entityType}_${count}`;
  }
}
