/**
 * TrustBoundary
 *
 * Documents and enforces the trust zones in the Privacy Browser Agent.
 *
 * Trust Zones:
 *
 *   T0 — Web Content          UNTRUSTED
 *     All webpage DOM content, scripts, styles.
 *     Treated as adversarial input.
 *
 *   T1 — Local Perception     TRUSTED
 *     DomPerceptionAdapter, ElementCanonicalizer, ContextSelector.
 *     Runs in the content script. Extracts metadata, never form values.
 *
 *   T2 — Privacy Engine       TRUSTED
 *     PII detection, evidence, fusion, entity resolution, taint tracking,
 *     sensitivity classification, policy, tokenization, redaction,
 *     context minimization, leakage verification, privacy gate.
 *     All processing is LOCAL. No network calls.
 *
 *   T3 — Remote LLM/VLM      UNTRUSTED
 *     The remote reasoning model receives ONLY sanitized context
 *     that has passed through the Privacy Gate.
 *     The remote model NEVER receives:
 *       - Raw sensitive values
 *       - Token ↔ value mappings
 *       - Raw screenshots containing PII
 *       - Unrestricted DOM dumps
 *
 *   T4 — Local Action Guard   TRUSTED
 *     (Future phase) Validates actions returned by the remote model
 *     before executing them on the local page.
 *
 * Data Flow:
 *
 *   T0 (Web Content)
 *       │
 *       ▼
 *   T1 (Local Perception)
 *       │  extracts metadata, no form values
 *       ▼
 *   T2 (Privacy Engine)
 *       │  detect → fuse → resolve → taint → classify → policy
 *       │  → transform → minimize → verify → gate
 *       ▼
 *   PRIVACY GATE
 *       │
 *   ┌───┴───┐
 *   │       │
 *  BLOCK   ALLOW
 *   │       │
 *   X       ▼
 *       T3 (Remote LLM)  — only sanitized context
 *           │
 *           ▼
 *       T4 (Action Guard) — validates before execution
 *           │
 *           ▼
 *       T0 (Web Content)  — executes approved actions
 *
 * FUNDAMENTAL RULE:
 *   The Privacy Engine (T2) protects LOCAL PRIVATE DATA from
 *   the REMOTE REASONING model (T3).
 *   The remote model must NEVER determine what private information
 *   is safe to transmit.
 */

export enum TrustZone {
  T0_WEB_CONTENT = "T0",
  T1_LOCAL_PERCEPTION = "T1",
  T2_PRIVACY_ENGINE = "T2",
  T3_REMOTE_LLM = "T3",
  T4_ACTION_GUARD = "T4",
}

export interface TrustZoneInfo {
  zone: TrustZone;
  name: string;
  trusted: boolean;
  description: string;
}

export const TRUST_ZONES: TrustZoneInfo[] = [
  {
    zone: TrustZone.T0_WEB_CONTENT,
    name: "Web Content",
    trusted: false,
    description: "All webpage DOM content, scripts, styles. Treated as adversarial input.",
  },
  {
    zone: TrustZone.T1_LOCAL_PERCEPTION,
    name: "Local Perception",
    trusted: true,
    description:
      "DomPerceptionAdapter, ElementCanonicalizer, ContextSelector. Extracts metadata, never form values.",
  },
  {
    zone: TrustZone.T2_PRIVACY_ENGINE,
    name: "Privacy Engine",
    trusted: true,
    description:
      "PII detection, evidence fusion, entity resolution, taint tracking, policy, tokenization, redaction, minimization, leakage verification, privacy gate. All LOCAL.",
  },
  {
    zone: TrustZone.T3_REMOTE_LLM,
    name: "Remote LLM/VLM",
    trusted: false,
    description:
      "Remote reasoning model. Receives ONLY sanitized context that has passed through the Privacy Gate.",
  },
  {
    zone: TrustZone.T4_ACTION_GUARD,
    name: "Local Action Guard",
    trusted: true,
    description:
      "(Future phase) Validates actions returned by the remote model before executing them on the local page.",
  },
];

/**
 * Validate that a data transfer between zones is permitted.
 *
 * @param from - Source trust zone.
 * @param to - Destination trust zone.
 * @param sanitized - Whether the data has been sanitized (passed through Privacy Gate).
 * @returns Whether the transfer is permitted.
 */
export function isTransferPermitted(
  from: TrustZone,
  to: TrustZone,
  sanitized: boolean,
): boolean {
  // T2 → T3 only if sanitized
  if (from === TrustZone.T2_PRIVACY_ENGINE && to === TrustZone.T3_REMOTE_LLM) {
    return sanitized;
  }

  // T0 → T1 always permitted (perception reads from DOM)
  if (from === TrustZone.T0_WEB_CONTENT && to === TrustZone.T1_LOCAL_PERCEPTION) {
    return true;
  }

  // T1 → T2 always permitted (perception feeds privacy engine)
  if (from === TrustZone.T1_LOCAL_PERCEPTION && to === TrustZone.T2_PRIVACY_ENGINE) {
    return true;
  }

  // T3 → T4 always permitted (LLM output goes to action guard)
  if (from === TrustZone.T3_REMOTE_LLM && to === TrustZone.T4_ACTION_GUARD) {
    return true;
  }

  // T4 → T0 always permitted (action guard executes on page)
  if (from === TrustZone.T4_ACTION_GUARD && to === TrustZone.T0_WEB_CONTENT) {
    return true;
  }

  // All other transfers are denied by default
  return false;
}
