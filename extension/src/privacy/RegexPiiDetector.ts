/**
 * RegexPiiDetector
 *
 * Deterministic, local PII detection using regular expressions
 * and DOM semantics. Scans element metadata — NEVER reads
 * user-entered form values (input.value, textarea.value, etc.).
 *
 * Supported entity types:
 *   EMAIL        — standard email regex
 *   PHONE        — Indian (+91), international formats
 *   CREDIT_CARD  — 13–19 digit patterns + Luhn checksum
 *   AUTH_TOKEN    — conservative JWT/Bearer/API key patterns
 *   PASSWORD     — DOM semantic (type="password"), value NEVER read
 *   PERSON       — heuristic from labels ("customer", "name", etc.)
 *   ADDRESS      — heuristic from labels ("address", "city", etc.)
 */

import type { PiiDetector } from "./PiiDetector";
import type { DetectionInput, DetectionResult, EntityType, EvidenceSource } from "./types";

// ── Regex patterns ─────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/;

const PHONE_RE =
  /(?:\+?\d{1,3}[\s\-.]?)?\(?\d{2,4}\)?[\s\-.]?\d{3,5}[\s\-.]?\d{3,5}/;

const CREDIT_CARD_RE =
  /\b(?:\d[ \-]?){12,18}\d\b/;

const AUTH_TOKEN_RE =
  /\b(?:eyJ[A-Za-z0-9_\-]{10,}\.eyJ[A-Za-z0-9_\-]{10,}|Bearer\s+[A-Za-z0-9_\-]{20,}|sk[\-_][a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{36,}|xox[bpas]\-[a-zA-Z0-9\-]{10,})\b/;

// ── DOM-semantic label patterns ────────────────────────────────────────

const PERSON_LABEL_RE =
  /\b(?:customer|full\s*name|first\s*name|last\s*name|user\s*name|your\s*name|name|recipient|contact\s*person)\b/i;

const ADDRESS_LABEL_RE =
  /\b(?:address|street|city|state|zip\s*code|postal\s*code|pin\s*code|country|apt|suite|region|province)\b/i;

const EMAIL_LABEL_RE =
  /\b(?:e[\-\s]?mail|email\s*address)\b/i;

const PHONE_LABEL_RE =
  /\b(?:phone|mobile|cell|telephone|tel|contact\s*number)\b/i;

// ── Helpers ────────────────────────────────────────────────────────────

/** Simple non-cryptographic hash for entity resolution. */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return `h_${(hash >>> 0).toString(36)}`;
}

/** Validate a credit card number using the Luhn algorithm. */
export function luhnCheck(digits: string): boolean {
  const cleaned = digits.replace(/[\s\-]/g, "");
  if (!/^\d{13,19}$/.test(cleaned)) return false;

  let sum = 0;
  let alternate = false;

  for (let i = cleaned.length - 1; i >= 0; i--) {
    let n = parseInt(cleaned[i]!, 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }

  return sum % 10 === 0;
}

/** Collect all text fields from an input into a single scannable string. */
function collectScanText(input: DetectionInput): string {
  return [
    input.label,
    input.text,
    input.ariaLabel,
    input.placeholder,
  ]
    .filter(Boolean)
    .join(" ");
}

// ── Detector implementation ────────────────────────────────────────────

export class RegexPiiDetector implements PiiDetector {
  detect(input: DetectionInput): DetectionResult[] {
    const results: DetectionResult[] = [];
    const scanText = collectScanText(input);

    // ── PASSWORD (DOM semantic — NEVER reads the value) ──────────────
    if (input.type === "password") {
      results.push({
        entityType: "PASSWORD",
        confidence: 1.0,
        source: "DOM",
        elementId: input.elementId,
        reason: 'input type="password" detected',
      });
    }

    // ── EMAIL ────────────────────────────────────────────────────────
    if (input.type === "email" || input.autocomplete === "email") {
      results.push({
        entityType: "EMAIL",
        confidence: 0.9,
        source: "DOM",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`email:${input.elementId}`),
        reason: `DOM type/autocomplete="${input.type === "email" ? "email" : input.autocomplete}"`,
      });
    }

    if (EMAIL_LABEL_RE.test(scanText)) {
      results.push({
        entityType: "EMAIL",
        confidence: 0.8,
        source: "A11Y",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`email:${input.elementId}`),
        reason: "Label/placeholder suggests email field",
      });
    }

    const emailMatch = scanText.match(EMAIL_RE);
    if (emailMatch) {
      const hash = simpleHash(`email:${emailMatch[0].toLowerCase()}`);
      results.push({
        entityType: "EMAIL",
        confidence: 0.95,
        source: "REGEX",
        elementId: input.elementId,
        normalizedValueHash: hash,
        reason: "Email pattern matched in text",
      });
    }

    // ── PHONE ────────────────────────────────────────────────────────
    if (input.type === "tel" || input.autocomplete === "tel") {
      results.push({
        entityType: "PHONE",
        confidence: 0.9,
        source: "DOM",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`phone:${input.elementId}`),
        reason: `DOM type/autocomplete="${input.type === "tel" ? "tel" : input.autocomplete}"`,
      });
    }

    if (PHONE_LABEL_RE.test(scanText)) {
      results.push({
        entityType: "PHONE",
        confidence: 0.7,
        source: "A11Y",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`phone:${input.elementId}`),
        reason: "Label/placeholder suggests phone field",
      });
    }

    const phoneMatch = scanText.match(PHONE_RE);
    if (phoneMatch) {
      const cleaned = phoneMatch[0].replace(/[\s\-().]/g, "");
      // Only flag if it looks like a real phone number (7+ digits)
      if (cleaned.replace(/\D/g, "").length >= 7) {
        const hash = simpleHash(`phone:${cleaned}`);
        results.push({
          entityType: "PHONE",
          confidence: 0.85,
          source: "REGEX",
          elementId: input.elementId,
          normalizedValueHash: hash,
          reason: "Phone number pattern matched in text",
        });
      }
    }

    // ── CREDIT CARD ──────────────────────────────────────────────────
    const cardMatch = scanText.match(CREDIT_CARD_RE);
    if (cardMatch) {
      const cleaned = cardMatch[0].replace(/[\s\-]/g, "");
      if (luhnCheck(cleaned)) {
        const hash = simpleHash(`card:${cleaned}`);
        results.push({
          entityType: "CREDIT_CARD",
          confidence: 0.95,
          source: "REGEX",
          elementId: input.elementId,
          normalizedValueHash: hash,
          reason: "Credit card number pattern matched with valid Luhn checksum",
        });
      }
    }

    if (input.autocomplete?.includes("cc-number")) {
      results.push({
        entityType: "CREDIT_CARD",
        confidence: 0.9,
        source: "DOM",
        elementId: input.elementId,
        reason: 'autocomplete="cc-number" detected',
      });
    }

    // ── AUTH TOKEN ────────────────────────────────────────────────────
    const tokenMatch = scanText.match(AUTH_TOKEN_RE);
    if (tokenMatch) {
      results.push({
        entityType: "AUTH_TOKEN",
        confidence: 0.9,
        source: "REGEX",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`token:${tokenMatch[0].slice(0, 10)}`),
        reason: "Authentication token pattern matched",
      });
    }

    // ── PERSON (heuristic) ───────────────────────────────────────────
    if (PERSON_LABEL_RE.test(scanText)) {
      results.push({
        entityType: "PERSON",
        confidence: 0.6,
        source: "A11Y",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`person:${input.elementId}`),
        reason: "Label/text suggests person name field",
      });
    }

    if (
      input.autocomplete === "name" ||
      input.autocomplete === "given-name" ||
      input.autocomplete === "family-name"
    ) {
      results.push({
        entityType: "PERSON",
        confidence: 0.85,
        source: "DOM",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`person:${input.elementId}`),
        reason: `autocomplete="${input.autocomplete}" detected`,
      });
    }

    // ── ADDRESS (heuristic) ──────────────────────────────────────────
    if (ADDRESS_LABEL_RE.test(scanText)) {
      results.push({
        entityType: "ADDRESS",
        confidence: 0.6,
        source: "A11Y",
        elementId: input.elementId,
        normalizedValueHash: simpleHash(`address:${input.elementId}`),
        reason: "Label/text suggests address field",
      });
    }

    if (
      input.autocomplete === "street-address" ||
      input.autocomplete === "address-line1" ||
      input.autocomplete === "postal-code"
    ) {
      results.push({
        entityType: "ADDRESS",
        confidence: 0.85,
        source: "DOM",
        elementId: input.elementId,
        reason: `autocomplete="${input.autocomplete}" detected`,
      });
    }

    return results;
  }
}
