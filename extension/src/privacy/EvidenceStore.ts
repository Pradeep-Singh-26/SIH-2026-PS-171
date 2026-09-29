/**
 * EvidenceStore
 *
 * In-memory storage for PII detection evidence.
 * No persistence, no network, no database.
 *
 * SECURITY: Evidence objects NEVER contain raw sensitive values.
 * Only normalizedValueHash is stored for entity resolution.
 */

import type { Evidence, EntityType } from "./types";

export class EvidenceStore {
  private store: Map<string, Evidence> = new Map();

  /** Add evidence to the store. */
  add(evidence: Evidence): void {
    this.store.set(evidence.id, evidence);
  }

  /** Retrieve evidence by its unique ID. */
  getById(id: string): Evidence | undefined {
    return this.store.get(id);
  }

  /** Retrieve all evidence for a specific DOM element. */
  getByElement(elementId: string): Evidence[] {
    const results: Evidence[] = [];
    for (const ev of this.store.values()) {
      if (ev.elementId === elementId) {
        results.push(ev);
      }
    }
    return results;
  }

  /** Retrieve all evidence for a specific entity type. */
  getByEntityType(entityType: EntityType): Evidence[] {
    const results: Evidence[] = [];
    for (const ev of this.store.values()) {
      if (ev.entityType === entityType) {
        results.push(ev);
      }
    }
    return results;
  }

  /** Retrieve all stored evidence. */
  getAll(): Evidence[] {
    return Array.from(this.store.values());
  }

  /** Count of evidence items. */
  get size(): number {
    return this.store.size;
  }

  /** Clear all evidence. */
  clear(): void {
    this.store.clear();
  }
}
