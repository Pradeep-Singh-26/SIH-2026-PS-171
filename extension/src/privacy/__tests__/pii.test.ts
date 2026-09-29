/**
 * PII Detection Tests
 *
 * Test 1: Email detection
 * Test 2: Phone detection (Indian +91, international)
 * Test 3: Password semantic detection (never reads value)
 * Test 4: Credit card detection with Luhn validation
 */

import { describe, it, expect } from "bun:test";
import { RegexPiiDetector, luhnCheck, simpleHash } from "../RegexPiiDetector";
import type { DetectionInput } from "../types";

// ── Helpers ────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<DetectionInput> & { elementId: string }): DetectionInput {
  return {
    tagName: "input",
    role: "textbox",
    label: undefined,
    text: undefined,
    ariaLabel: undefined,
    placeholder: undefined,
    type: undefined,
    autocomplete: undefined,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("RegexPiiDetector", () => {
  const detector = new RegexPiiDetector();

  // ── Test 1: Email detection ────────────────────────────────────────

  describe("Test 1 — Email detection", () => {
    it("should detect EMAIL from type='email'", () => {
      const input = makeInput({
        elementId: "el_1",
        type: "email",
        placeholder: "Email address",
      });
      const results = detector.detect(input);
      const emailResults = results.filter((r) => r.entityType === "EMAIL");
      expect(emailResults.length).toBeGreaterThan(0);
    });

    it("should detect EMAIL from label text containing email pattern", () => {
      const input = makeInput({
        elementId: "el_2",
        label: "Contact: rahul@example.com",
      });
      const results = detector.detect(input);
      const emailResults = results.filter((r) => r.entityType === "EMAIL");
      expect(emailResults.length).toBeGreaterThan(0);
      expect(emailResults.some((r) => r.source === "REGEX")).toBe(true);
    });

    it("should detect EMAIL from placeholder containing email pattern", () => {
      const input = makeInput({
        elementId: "el_3",
        placeholder: "john.doe@gmail.com",
      });
      const results = detector.detect(input);
      const emailResults = results.filter((r) => r.entityType === "EMAIL");
      expect(emailResults.length).toBeGreaterThan(0);
    });

    it("should detect EMAIL from autocomplete='email'", () => {
      const input = makeInput({
        elementId: "el_4",
        autocomplete: "email",
      });
      const results = detector.detect(input);
      const emailResults = results.filter((r) => r.entityType === "EMAIL");
      expect(emailResults.length).toBeGreaterThan(0);
      expect(emailResults.some((r) => r.source === "DOM")).toBe(true);
    });

    it("should detect EMAIL from label 'Email'", () => {
      const input = makeInput({
        elementId: "el_5",
        label: "Email",
      });
      const results = detector.detect(input);
      const emailResults = results.filter((r) => r.entityType === "EMAIL");
      expect(emailResults.length).toBeGreaterThan(0);
      expect(emailResults.some((r) => r.source === "A11Y")).toBe(true);
    });

    it("should NOT detect EMAIL from unrelated text", () => {
      const input = makeInput({
        elementId: "el_6",
        label: "Download Invoice",
        type: "text",
      });
      const results = detector.detect(input);
      const emailResults = results.filter((r) => r.entityType === "EMAIL");
      expect(emailResults.length).toBe(0);
    });
  });

  // ── Test 2: Phone detection ────────────────────────────────────────

  describe("Test 2 — Phone detection", () => {
    it("should detect PHONE from Indian format +91 98765 43210", () => {
      const input = makeInput({
        elementId: "el_1",
        text: "+91 98765 43210",
      });
      const results = detector.detect(input);
      const phoneResults = results.filter((r) => r.entityType === "PHONE");
      expect(phoneResults.length).toBeGreaterThan(0);
    });

    it("should detect PHONE from type='tel'", () => {
      const input = makeInput({
        elementId: "el_2",
        type: "tel",
        placeholder: "Phone number",
      });
      const results = detector.detect(input);
      const phoneResults = results.filter((r) => r.entityType === "PHONE");
      expect(phoneResults.length).toBeGreaterThan(0);
    });

    it("should detect PHONE from label containing 'phone'", () => {
      const input = makeInput({
        elementId: "el_3",
        label: "Phone Number",
      });
      const results = detector.detect(input);
      const phoneResults = results.filter((r) => r.entityType === "PHONE");
      expect(phoneResults.length).toBeGreaterThan(0);
    });

    it("should detect PHONE from autocomplete='tel'", () => {
      const input = makeInput({
        elementId: "el_4",
        autocomplete: "tel",
      });
      const results = detector.detect(input);
      const phoneResults = results.filter((r) => r.entityType === "PHONE");
      expect(phoneResults.length).toBeGreaterThan(0);
    });
  });

  // ── Test 3: Password detection ─────────────────────────────────────

  describe("Test 3 — Password detection", () => {
    it("should detect PASSWORD from type='password'", () => {
      const input = makeInput({
        elementId: "el_1",
        type: "password",
        placeholder: "Enter password",
      });
      const results = detector.detect(input);
      const pwResults = results.filter((r) => r.entityType === "PASSWORD");
      expect(pwResults.length).toBeGreaterThan(0);
      expect(pwResults[0]!.confidence).toBe(1.0);
      expect(pwResults[0]!.source).toBe("DOM");
    });

    it("should NEVER have a 'value' property in the detection result", () => {
      const input = makeInput({
        elementId: "el_2",
        type: "password",
      });
      const results = detector.detect(input);
      for (const r of results) {
        expect((r as any).value).toBeUndefined();
      }
    });

    it("should NOT detect PASSWORD from type='text'", () => {
      const input = makeInput({
        elementId: "el_3",
        type: "text",
        placeholder: "Username",
      });
      const results = detector.detect(input);
      const pwResults = results.filter((r) => r.entityType === "PASSWORD");
      expect(pwResults.length).toBe(0);
    });
  });

  // ── Test 4: Credit card detection ──────────────────────────────────

  describe("Test 4 — Credit card detection", () => {
    it("should detect CREDIT_CARD with valid Luhn (4111 1111 1111 1111)", () => {
      const input = makeInput({
        elementId: "el_1",
        text: "Card: 4111 1111 1111 1111",
      });
      const results = detector.detect(input);
      const ccResults = results.filter((r) => r.entityType === "CREDIT_CARD");
      expect(ccResults.length).toBeGreaterThan(0);
    });

    it("should NOT detect random 16-digit number that fails Luhn", () => {
      const input = makeInput({
        elementId: "el_2",
        text: "ID: 1234 5678 9012 3456",
      });
      const results = detector.detect(input);
      const ccResults = results.filter((r) => r.entityType === "CREDIT_CARD");
      expect(ccResults.length).toBe(0);
    });

    it("should detect CREDIT_CARD from autocomplete='cc-number'", () => {
      const input = makeInput({
        elementId: "el_3",
        autocomplete: "cc-number",
      });
      const results = detector.detect(input);
      const ccResults = results.filter((r) => r.entityType === "CREDIT_CARD");
      expect(ccResults.length).toBeGreaterThan(0);
    });
  });

  // ── PERSON detection ───────────────────────────────────────────────

  describe("PERSON detection", () => {
    it("should detect PERSON from label 'Customer' or 'Full Name'", () => {
      const input = makeInput({
        elementId: "el_1",
        label: "Customer Name",
      });
      const results = detector.detect(input);
      const personResults = results.filter((r) => r.entityType === "PERSON");
      expect(personResults.length).toBeGreaterThan(0);
    });

    it("should detect PERSON from autocomplete='name'", () => {
      const input = makeInput({
        elementId: "el_2",
        autocomplete: "name",
      });
      const results = detector.detect(input);
      const personResults = results.filter((r) => r.entityType === "PERSON");
      expect(personResults.length).toBeGreaterThan(0);
    });
  });

  // ── ADDRESS detection ──────────────────────────────────────────────

  describe("ADDRESS detection", () => {
    it("should detect ADDRESS from label 'Street Address'", () => {
      const input = makeInput({
        elementId: "el_1",
        label: "Street Address",
      });
      const results = detector.detect(input);
      const addrResults = results.filter((r) => r.entityType === "ADDRESS");
      expect(addrResults.length).toBeGreaterThan(0);
    });
  });

  // ── AUTH_TOKEN detection ───────────────────────────────────────────

  describe("AUTH_TOKEN detection", () => {
    it("should detect AUTH_TOKEN from JWT-like pattern", () => {
      const input = makeInput({
        elementId: "el_1",
        text: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
      });
      const results = detector.detect(input);
      const tokenResults = results.filter((r) => r.entityType === "AUTH_TOKEN");
      expect(tokenResults.length).toBeGreaterThan(0);
    });
  });

  // ── Luhn checksum ──────────────────────────────────────────────────

  describe("Luhn checksum", () => {
    it("should validate 4111111111111111", () => {
      expect(luhnCheck("4111111111111111")).toBe(true);
    });

    it("should validate 4111 1111 1111 1111 (with spaces)", () => {
      expect(luhnCheck("4111 1111 1111 1111")).toBe(true);
    });

    it("should reject 1234567890123456", () => {
      expect(luhnCheck("1234567890123456")).toBe(false);
    });
  });

  // ── Hash function ──────────────────────────────────────────────────

  describe("simpleHash", () => {
    it("should produce consistent hashes", () => {
      expect(simpleHash("test")).toBe(simpleHash("test"));
    });

    it("should produce different hashes for different inputs", () => {
      expect(simpleHash("hello")).not.toBe(simpleHash("world"));
    });
  });
});
