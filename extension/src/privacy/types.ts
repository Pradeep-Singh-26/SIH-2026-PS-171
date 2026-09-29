/**
 * Privacy Engine — Core Types
 *
 * SECURITY INVARIANT:
 *   Raw sensitive information must NEVER be included in outbound context.
 *   The Evidence type intentionally has NO `value: string` field.
 *   Only normalizedValueHash is stored for entity resolution.
 */

import type { BoundingBox, ScoredCandidate, SelectedContext } from "../types/index";

// ── Entity classification ──────────────────────────────────────────────

export type EntityType =
  | "PERSON"
  | "EMAIL"
  | "PHONE"
  | "ADDRESS"
  | "PASSWORD"
  | "CREDIT_CARD"
  | "AUTH_TOKEN"
  | "FACE";

// ── Sensitivity levels (S0 = public, S4 = critical) ───────────────────

export type Sensitivity = "S0" | "S1" | "S2" | "S3" | "S4";

// ── Policy actions ─────────────────────────────────────────────────────

export type PolicyAction =
  | "ALLOW"
  | "TOKENIZE"
  | "REDACT"
  | "BLUR"
  | "BLOCK";

// ── Evidence sources ───────────────────────────────────────────────────

export type EvidenceSource = "DOM" | "A11Y" | "REGEX" | "OCR" | "FACE";

// ── Evidence (never contains raw values) ───────────────────────────────

export interface Evidence {
  /** Unique evidence identifier. */
  id: string;

  /** Which detection source produced this evidence. */
  source: EvidenceSource;

  /** The type of entity detected. */
  entityType: EntityType;

  /** Detection confidence in [0, 1]. */
  confidence: number;

  /** ID of the DOM element this evidence relates to. */
  elementId?: string;

  /** Bounding box (for future visual detections). */
  bbox?: BoundingBox;

  /** Hash of the normalized value — used for entity resolution without exposing the raw value. */
  normalizedValueHash?: string;

  /** Timestamp of evidence creation. */
  createdAt: number;
}

// ── Taint tracking ─────────────────────────────────────────────────────

export interface TaintInfo {
  /** Whether this item is tainted with sensitive data. */
  tainted: boolean;

  /** IDs of the source entities causing the taint. */
  sourceEntityIds: string[];

  /** Human-readable explanation. */
  reason: string;
}

// ── Detection I/O ──────────────────────────────────────────────────────

export interface DetectionInput {
  /** Element ID from Phase 1. */
  elementId: string;

  /** Tag name (e.g. "input", "button"). */
  tagName: string;

  /** Semantic role (e.g. "textbox", "button"). */
  role?: string;

  /** Resolved label text (from aria-label, <label>, text content). */
  label?: string;

  /** Visible text content (buttons, links, headings). */
  text?: string;

  /** ARIA label attribute. */
  ariaLabel?: string;

  /** Placeholder text. */
  placeholder?: string;

  /** Input type (e.g. "email", "password", "text"). */
  type?: string;

  /** Autocomplete attribute. */
  autocomplete?: string;

  /** Bounding box. */
  bbox?: BoundingBox;
}

export interface DetectionResult {
  /** The type of entity detected. */
  entityType: EntityType;

  /** Detection confidence in [0, 1]. */
  confidence: number;

  /** Which source produced this detection. */
  source: EvidenceSource;

  /** ID of the related DOM element. */
  elementId: string;

  /**
   * Hash of the normalized detected value — used for entity resolution.
   * MUST be a hash, NEVER the raw sensitive value.
   */
  normalizedValueHash?: string;

  /** Human-readable reason for the detection. */
  reason: string;
}

// ── Policy decision ────────────────────────────────────────────────────

export interface PolicyDecision {
  /** The entity this decision applies to. */
  entityType: EntityType;

  /** Assigned sensitivity level. */
  sensitivity: Sensitivity;

  /** Determined action. */
  action: PolicyAction;

  /** Element ID. */
  elementId: string;

  /** Entity ID (from entity resolution). */
  entityId: string;
}

// ── Sanitized output ───────────────────────────────────────────────────

export interface SanitizedElement {
  /** Original element ID. */
  id: string;

  /** Tag name. */
  tagName: string;

  /** Semantic role. */
  role?: string;

  /** Sanitized label (sensitive values replaced with tokens). */
  label?: string;

  /** Sanitized text. */
  text?: string;

  /** Bounding box. */
  bbox?: BoundingBox;

  /** Whether any transformation was applied to this element. */
  transformed: boolean;
}

export interface SanitizedContext {
  /** The original user task. */
  task: string;

  /** Sanitized elements (sensitive values replaced/removed). */
  elements: SanitizedElement[];

  /** Timestamp of sanitization. */
  timestamp: number;
}

// ── Leakage check ──────────────────────────────────────────────────────

export interface LeakageResult {
  /** Whether the leakage check passed (no leaks found). */
  passed: boolean;

  /** Count of raw high-risk values found in outbound context. */
  rawHighRiskValuesOutbound: number;

  /** Count of residual leakage patterns found. */
  residualLeakage: number;

  /** List of specific violations found. */
  violations: string[];
}

// ── Privacy gate ───────────────────────────────────────────────────────

export interface PrivacyGateResult {
  /** Final gate decision. */
  decision: "ALLOW" | "BLOCK";

  /** Human-readable reason for the decision. */
  reason?: string;

  /** Sanitized context (only present when decision is ALLOW). */
  context?: SanitizedContext;

  /** Leakage verification result. */
  verification: LeakageResult;
}

// ── Privacy engine I/O ─────────────────────────────────────────────────

export interface PrivacyInput {
  /** The selected context from Phase 1. */
  selectedContext: SelectedContext;

  /** The original user task. */
  task: string;
}

export interface PrivacyReceipt {
  /** Counts of detected entity types. */
  detected: Partial<Record<EntityType, number>>;

  /** Counts of transformations applied. */
  transformations: Partial<Record<PolicyAction, number>>;

  /** Context statistics. */
  context: {
    candidates: number;
    selected: number;
  };

  /** Verification result. */
  verification: {
    rawHighRiskValuesOutbound: number;
    residualLeakage: number;
    passed: boolean;
  };

  /** Gate decision. */
  gate: "ALLOW" | "BLOCK";
}

export interface PrivacyResult {
  /** Gate result (ALLOW/BLOCK + sanitized context). */
  gateResult: PrivacyGateResult;

  /** Safe receipt for development logging (no raw values). */
  receipt: PrivacyReceipt;
}
