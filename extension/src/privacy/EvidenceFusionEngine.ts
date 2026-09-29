/**
 * EvidenceFusionEngine
 *
 * Combines PII evidence from multiple detection sources
 * (DOM, A11Y, Regex, future OCR/Face) to produce a unified
 * confidence assessment for each entity.
 *
 * Rules:
 *   - Multiple agreeing detectors → increase confidence
 *   - Strong deterministic detector → high confidence
 *   - Weak visual evidence → lower confidence
 *
 * Evidence fusion does NOT authorize network transmission.
 * It only produces a better local understanding of sensitivity.
 */

import type { Evidence, EntityType, EvidenceSource } from "./types";
import type { ResolvedEntity } from "./EntityResolver";

export interface FusedEvidence {
  /** The resolved entity ID. */
  entityId: string;

  /** Entity type. */
  entityType: EntityType;

  /** Fused confidence after combining all sources. */
  fusedConfidence: number;

  /** Sources that contributed to this fusion. */
  sources: EvidenceSource[];

  /** Number of independent detections. */
  detectionCount: number;

  /** Element IDs involved. */
  elementIds: string[];
}

// ── Source reliability weights ──────────────────────────────────────────

const SOURCE_WEIGHTS: Record<EvidenceSource, number> = {
  DOM: 0.9,
  A11Y: 0.8,
  REGEX: 0.95,
  OCR: 0.6,
  FACE: 0.7,
};

export class EvidenceFusionEngine {
  /**
   * Fuse evidence for resolved entities.
   *
   * @param entities - Resolved entities from EntityResolver.
   * @param allEvidence - All evidence items from EvidenceStore.
   * @returns Fused evidence for each entity.
   */
  fuse(
    entities: Map<string, ResolvedEntity>,
    allEvidence: Evidence[],
  ): Map<string, FusedEvidence> {
    const evidenceById = new Map<string, Evidence>();
    for (const ev of allEvidence) {
      evidenceById.set(ev.id, ev);
    }

    const result = new Map<string, FusedEvidence>();

    for (const [entityId, entity] of entities) {
      const entityEvidence: Evidence[] = [];
      for (const evId of entity.evidenceIds) {
        const ev = evidenceById.get(evId);
        if (ev) entityEvidence.push(ev);
      }

      const fusedConfidence = this.computeFusedConfidence(entityEvidence);
      const sources = this.collectSources(entityEvidence);

      result.set(entityId, {
        entityId,
        entityType: entity.entityType,
        fusedConfidence,
        sources,
        detectionCount: entityEvidence.length,
        elementIds: entity.elementIds,
      });
    }

    return result;
  }

  // ── Internal ───────────────────────────────────────────────────────

  /**
   * Compute fused confidence from multiple evidence items.
   *
   * Uses the Noisy-OR model:
   *   P(detect) = 1 - ∏(1 - p_i * w_i)
   *
   * Multiple agreeing detectors increase confidence.
   * Source reliability weights modulate individual contributions.
   */
  private computeFusedConfidence(evidence: Evidence[]): number {
    if (evidence.length === 0) return 0;
    if (evidence.length === 1) {
      const ev = evidence[0]!;
      return ev.confidence * (SOURCE_WEIGHTS[ev.source] ?? 0.5);
    }

    // Noisy-OR fusion
    let productOfComplements = 1;
    for (const ev of evidence) {
      const weight = SOURCE_WEIGHTS[ev.source] ?? 0.5;
      const effectiveConfidence = ev.confidence * weight;
      productOfComplements *= 1 - effectiveConfidence;
    }

    return Math.min(1, 1 - productOfComplements);
  }

  private collectSources(evidence: Evidence[]): EvidenceSource[] {
    const sources = new Set<EvidenceSource>();
    for (const ev of evidence) {
      sources.add(ev.source);
    }
    return Array.from(sources);
  }
}
