/**
 * PrivacyEngine — Main Facade
 *
 * Orchestrates the complete privacy pipeline:
 *
 *   SelectedContext
 *       ↓
 *   PII Detection
 *       ↓
 *   Evidence Store
 *       ↓
 *   Evidence Fusion
 *       ↓
 *   Entity Resolution
 *       ↓
 *   Privacy Graph / Taint
 *       ↓
 *   Sensitivity Classification
 *       ↓
 *   Policy Engine
 *       ↓
 *   Tokenization / Redaction
 *       ↓
 *   Context Minimization
 *       ↓
 *   Residual Leakage Check
 *       ↓
 *   Privacy Gate
 *       ↓
 *   ALLOW / BLOCK
 *
 * SECURITY INVARIANT:
 *   Raw sensitive information must NEVER be included in outbound context.
 *
 * No LLM. No network. No database. Entirely local.
 */

import type { ScoredCandidate } from "../types/index";
import type {
  DetectionInput,
  DetectionResult,
  EntityType,
  Evidence,
  PolicyAction,
  PolicyDecision,
  PrivacyInput,
  PrivacyReceipt,
  PrivacyResult,
  SanitizedContext,
  SanitizedElement,
} from "./types";

import type { PiiDetector } from "./PiiDetector";
import { RegexPiiDetector } from "./RegexPiiDetector";
import { EvidenceStore } from "./EvidenceStore";
import { EntityResolver } from "./EntityResolver";
import { EvidenceFusionEngine } from "./EvidenceFusionEngine";
import { PrivacyGraph } from "./PrivacyGraph";
import { SensitivityClassifier } from "./SensitivityClassifier";
import { PolicyEngine } from "./PolicyEngine";
import { TokenizationEngine } from "./TokenizationEngine";
import { DomRedactor } from "./DomRedactor";
import { ContextMinimizer } from "./ContextMinimizer";
import { ResidualLeakageChecker } from "./ResidualLeakageChecker";
import { PrivacyGate } from "./PrivacyGate";

export class PrivacyEngine {
  private detectors: PiiDetector[];
  private evidenceStore: EvidenceStore;
  private entityResolver: EntityResolver;
  private fusionEngine: EvidenceFusionEngine;
  private graph: PrivacyGraph;
  private classifier: SensitivityClassifier;
  private policyEngine: PolicyEngine;
  private tokenizer: TokenizationEngine;
  private redactor: DomRedactor;
  private minimizer: ContextMinimizer;
  private leakageChecker: ResidualLeakageChecker;
  private gate: PrivacyGate;

  private evidenceCounter = 0;

  constructor() {
    // Initialize all sub-systems
    this.detectors = [new RegexPiiDetector()];
    this.evidenceStore = new EvidenceStore();
    this.entityResolver = new EntityResolver();
    this.fusionEngine = new EvidenceFusionEngine();
    this.graph = new PrivacyGraph();
    this.classifier = new SensitivityClassifier();
    this.policyEngine = new PolicyEngine(this.classifier);
    this.tokenizer = new TokenizationEngine();
    this.redactor = new DomRedactor(this.tokenizer);
    this.minimizer = new ContextMinimizer();
    this.leakageChecker = new ResidualLeakageChecker(this.tokenizer);
    this.gate = new PrivacyGate();
  }

  /**
   * Process a SelectedContext through the complete privacy pipeline.
   *
   * @param input - Privacy input containing the selected context and task.
   * @returns Privacy result with gate decision, sanitized context, and safe receipt.
   */
  async process(input: PrivacyInput): Promise<PrivacyResult> {
    const { selectedContext, task } = input;
    const candidates = selectedContext.candidates;

    // Reset state for this processing run
    this.reset();

    // ── 1. PII Detection ─────────────────────────────────────────────
    const allDetections: DetectionResult[] = [];

    for (const candidate of candidates) {
      const detectionInput = this.candidateToDetectionInput(candidate);

      for (const detector of this.detectors) {
        const detections = detector.detect(detectionInput);
        allDetections.push(...detections);
      }
    }

    // ── 2. Evidence Store ────────────────────────────────────────────
    for (const detection of allDetections) {
      const evidence = this.detectionToEvidence(detection);
      this.evidenceStore.add(evidence);
    }

    // ── 3. Entity Resolution ─────────────────────────────────────────
    const allEvidence = this.evidenceStore.getAll();
    const entities = this.entityResolver.resolve(allEvidence);

    // ── 4. Evidence Fusion ───────────────────────────────────────────
    const fusedEvidence = this.fusionEngine.fuse(entities, allEvidence);

    // ── 5. Taint / Provenance ────────────────────────────────────────
    for (const [entityId, fused] of fusedEvidence) {
      for (const elementId of fused.elementIds) {
        this.graph.taintElement(elementId, entityId, fused.entityType);
      }
    }

    // ── 6. Sensitivity Classification + Policy ───────────────────────
    const allDecisions: PolicyDecision[] = [];

    for (const [, fused] of fusedEvidence) {
      const decisions = this.policyEngine.decide(fused);
      allDecisions.push(...decisions);
    }

    // ── 7. Tokenization ──────────────────────────────────────────────
    for (const decision of allDecisions) {
      if (decision.action === "TOKENIZE") {
        const entity = entities.get(decision.entityId);
        this.tokenizer.tokenize(
          decision.entityId,
          decision.entityType,
          undefined, // We don't have the raw value (by design)
          entity?.normalizedValueHash,
        );

        // Record in graph
        const token = this.tokenizer.getToken(decision.entityId);
        if (token) {
          this.graph.recordTokenization(decision.entityId, token);
        }
      }
    }

    // ── 8. DOM Redaction ──────────────────────────────────────────────
    const sanitizedElements = this.redactor.redact(candidates, allDecisions);

    // ── 9. Context Minimization ──────────────────────────────────────
    const minimizedElements = this.minimizer.minimize(
      sanitizedElements,
      candidates,
      allDecisions,
    );

    // ── 10. Build Sanitized Context ──────────────────────────────────
    const sanitizedContext: SanitizedContext = {
      task,
      elements: minimizedElements,
      timestamp: Date.now(),
    };

    // ── 11. Residual Leakage Check ───────────────────────────────────
    const leakageResult = this.leakageChecker.check(sanitizedContext);

    // ── 12. Privacy Gate ─────────────────────────────────────────────
    const gateResult = this.gate.evaluate(
      sanitizedContext,
      leakageResult,
      allDecisions,
      this.graph,
    );

    // ── 13. Build Receipt ────────────────────────────────────────────
    const receipt = this.buildReceipt(
      allDetections,
      allDecisions,
      candidates.length,
      minimizedElements.length,
      leakageResult,
      gateResult.decision,
    );

    return {
      gateResult,
      receipt,
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private reset(): void {
    this.evidenceStore.clear();
    this.graph.clear();
    this.tokenizer.clear();
    this.evidenceCounter = 0;
  }

  private candidateToDetectionInput(candidate: ScoredCandidate): DetectionInput {
    return {
      elementId: candidate.id,
      tagName: candidate.tagName,
      role: candidate.role,
      label: candidate.label,
      text: candidate.text,
      ariaLabel: candidate.ariaLabel,
      placeholder: candidate.placeholder,
      type: candidate.type,
      autocomplete: (candidate as any).autocomplete,
      bbox: candidate.bbox,
    };
  }

  private detectionToEvidence(detection: DetectionResult): Evidence {
    return {
      id: `ev_${++this.evidenceCounter}`,
      source: detection.source,
      entityType: detection.entityType,
      confidence: detection.confidence,
      elementId: detection.elementId,
      normalizedValueHash: detection.normalizedValueHash,
      createdAt: Date.now(),
    };
  }

  private buildReceipt(
    detections: DetectionResult[],
    decisions: PolicyDecision[],
    totalCandidates: number,
    selectedCount: number,
    leakageResult: { rawHighRiskValuesOutbound: number; residualLeakage: number; passed: boolean },
    gate: "ALLOW" | "BLOCK",
  ): PrivacyReceipt {
    // Count detections by entity type
    const detected: Partial<Record<EntityType, number>> = {};
    for (const d of detections) {
      detected[d.entityType] = (detected[d.entityType] ?? 0) + 1;
    }

    // Count transformations by action
    const transformations: Partial<Record<PolicyAction, number>> = {};
    for (const d of decisions) {
      if (d.action !== "ALLOW") {
        transformations[d.action] = (transformations[d.action] ?? 0) + 1;
      }
    }

    return {
      detected,
      transformations,
      context: {
        candidates: totalCandidates,
        selected: selectedCount,
      },
      verification: {
        rawHighRiskValuesOutbound: leakageResult.rawHighRiskValuesOutbound,
        residualLeakage: leakageResult.residualLeakage,
        passed: leakageResult.passed,
      },
      gate,
    };
  }
}
