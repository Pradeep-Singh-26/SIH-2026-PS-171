/**
 * PiiDetector — Interface
 *
 * Pluggable detector interface for PII identification.
 * Detectors examine DOM candidate metadata (labels, placeholders,
 * types, roles) — never user-entered form values.
 *
 * Implementations:
 *  - RegexPiiDetector (deterministic, Phase 2)
 *  - Future: OCR-based detector, face detector
 */

import type { DetectionInput, DetectionResult } from "./types";

export interface PiiDetector {
  /**
   * Examine an element's metadata and return any PII detections.
   *
   * @param input - Element metadata (never contains input.value).
   * @returns Array of detections found. Empty array if none.
   */
  detect(input: DetectionInput): DetectionResult[];
}
