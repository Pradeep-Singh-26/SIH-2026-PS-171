/**
 * Evidence Fusion Tests
 *
 * Tests for:
 * - Multiple agreeing detectors increase confidence
 * - Single strong detector → high confidence
 * - Entity resolution deduplicates equivalent detections
 */

import { describe, it, expect } from "bun:test";
import { EvidenceStore } from "../EvidenceStore";
import { EntityResolver } from "../EntityResolver";
import { EvidenceFusionEngine } from "../EvidenceFusionEngine";
import type { Evidence } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────

function makeEvidence(overrides: Partial<Evidence> & { id: string }): Evidence {
  return {
    source: "REGEX",
    entityType: "EMAIL",
    confidence: 0.8,
    elementId: "el_1",
    createdAt: Date.now(),
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("EvidenceStore", () => {
  it("should add and retrieve evidence", () => {
    const store = new EvidenceStore();
    const ev = makeEvidence({ id: "ev_1" });
    store.add(ev);
    expect(store.getById("ev_1")).toEqual(ev);
    expect(store.size).toBe(1);
  });

  it("should retrieve evidence by element", () => {
    const store = new EvidenceStore();
    store.add(makeEvidence({ id: "ev_1", elementId: "el_1" }));
    store.add(makeEvidence({ id: "ev_2", elementId: "el_2" }));
    store.add(makeEvidence({ id: "ev_3", elementId: "el_1" }));

    const results = store.getByElement("el_1");
    expect(results.length).toBe(2);
  });

  it("should retrieve evidence by entity type", () => {
    const store = new EvidenceStore();
    store.add(makeEvidence({ id: "ev_1", entityType: "EMAIL" }));
    store.add(makeEvidence({ id: "ev_2", entityType: "PHONE" }));
    store.add(makeEvidence({ id: "ev_3", entityType: "EMAIL" }));

    const emails = store.getByEntityType("EMAIL");
    expect(emails.length).toBe(2);
  });

  it("should clear all evidence", () => {
    const store = new EvidenceStore();
    store.add(makeEvidence({ id: "ev_1" }));
    store.add(makeEvidence({ id: "ev_2" }));
    store.clear();
    expect(store.size).toBe(0);
    expect(store.getAll().length).toBe(0);
  });
});

describe("EntityResolver", () => {
  it("should deduplicate evidence with same hash into one entity", () => {
    const resolver = new EntityResolver();
    const evidence: Evidence[] = [
      makeEvidence({ id: "ev_1", source: "DOM", normalizedValueHash: "hash_email_1" }),
      makeEvidence({ id: "ev_2", source: "REGEX", normalizedValueHash: "hash_email_1" }),
      makeEvidence({ id: "ev_3", source: "A11Y", normalizedValueHash: "hash_email_1" }),
    ];

    const entities = resolver.resolve(evidence);
    expect(entities.size).toBe(1);

    const entity = Array.from(entities.values())[0]!;
    expect(entity.entityType).toBe("EMAIL");
    expect(entity.evidenceIds.length).toBe(3);
  });

  it("should create separate entities for different hashes", () => {
    const resolver = new EntityResolver();
    const evidence: Evidence[] = [
      makeEvidence({ id: "ev_1", entityType: "EMAIL", normalizedValueHash: "hash_1" }),
      makeEvidence({ id: "ev_2", entityType: "EMAIL", normalizedValueHash: "hash_2" }),
    ];

    const entities = resolver.resolve(evidence);
    expect(entities.size).toBe(2);
  });

  it("should create separate entities for different entity types", () => {
    const resolver = new EntityResolver();
    const evidence: Evidence[] = [
      makeEvidence({ id: "ev_1", entityType: "EMAIL", normalizedValueHash: "hash_1" }),
      makeEvidence({ id: "ev_2", entityType: "PHONE", normalizedValueHash: "hash_2" }),
    ];

    const entities = resolver.resolve(evidence);
    expect(entities.size).toBe(2);
  });

  it("should track max confidence across evidence", () => {
    const resolver = new EntityResolver();
    const evidence: Evidence[] = [
      makeEvidence({ id: "ev_1", confidence: 0.6, normalizedValueHash: "hash_1" }),
      makeEvidence({ id: "ev_2", confidence: 0.9, normalizedValueHash: "hash_1" }),
      makeEvidence({ id: "ev_3", confidence: 0.7, normalizedValueHash: "hash_1" }),
    ];

    const entities = resolver.resolve(evidence);
    const entity = Array.from(entities.values())[0]!;
    expect(entity.maxConfidence).toBe(0.9);
  });
});

describe("EvidenceFusionEngine", () => {
  const fusionEngine = new EvidenceFusionEngine();
  const resolver = new EntityResolver();

  it("should increase confidence with multiple agreeing detectors", () => {
    const singleEvidence: Evidence[] = [
      makeEvidence({ id: "ev_1", source: "REGEX", confidence: 0.8, normalizedValueHash: "hash_1" }),
    ];

    const multiEvidence: Evidence[] = [
      makeEvidence({ id: "ev_1", source: "REGEX", confidence: 0.8, normalizedValueHash: "hash_1" }),
      makeEvidence({ id: "ev_2", source: "DOM", confidence: 0.9, normalizedValueHash: "hash_1" }),
      makeEvidence({ id: "ev_3", source: "A11Y", confidence: 0.7, normalizedValueHash: "hash_1" }),
    ];

    const singleEntities = resolver.resolve(singleEvidence);
    const singleFused = fusionEngine.fuse(singleEntities, singleEvidence);

    const multiEntities = new EntityResolver().resolve(multiEvidence);
    const multiFused = fusionEngine.fuse(multiEntities, multiEvidence);

    const singleConfidence = Array.from(singleFused.values())[0]!.fusedConfidence;
    const multiConfidence = Array.from(multiFused.values())[0]!.fusedConfidence;

    expect(multiConfidence).toBeGreaterThan(singleConfidence);
  });

  it("should report all contributing sources", () => {
    const evidence: Evidence[] = [
      makeEvidence({ id: "ev_1", source: "REGEX", normalizedValueHash: "hash_1" }),
      makeEvidence({ id: "ev_2", source: "DOM", normalizedValueHash: "hash_1" }),
    ];

    const entities = resolver.resolve(evidence);
    const fused = fusionEngine.fuse(entities, evidence);
    const result = Array.from(fused.values())[0]!;

    expect(result.sources).toContain("REGEX");
    expect(result.sources).toContain("DOM");
    expect(result.detectionCount).toBe(2);
  });

  it("should assign high confidence for strong deterministic detector", () => {
    const evidence: Evidence[] = [
      makeEvidence({ id: "ev_1", source: "REGEX", confidence: 0.95, normalizedValueHash: "hash_1" }),
    ];

    const entities = resolver.resolve(evidence);
    const fused = fusionEngine.fuse(entities, evidence);
    const result = Array.from(fused.values())[0]!;

    expect(result.fusedConfidence).toBeGreaterThanOrEqual(0.8);
  });
});
