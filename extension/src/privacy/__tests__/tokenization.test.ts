/**
 * Tokenization Tests
 *
 * Test 5: Values are replaced with tokens (<PERSON_1>, <EMAIL_1>)
 * Test 6: Repeated entity uses the same token
 */

import { describe, it, expect } from "bun:test";
import { TokenizationEngine } from "../TokenizationEngine";

describe("TokenizationEngine", () => {
  // ── Test 5: Basic tokenization ─────────────────────────────────────

  describe("Test 5 — Tokenization", () => {
    it("should tokenize PERSON to <PERSON_1>", () => {
      const engine = new TokenizationEngine();
      const token = engine.tokenize("PERSON_1", "PERSON", "Rahul Sharma");
      expect(token).toBe("<PERSON_1>");
    });

    it("should tokenize EMAIL to <EMAIL_1>", () => {
      const engine = new TokenizationEngine();
      const token = engine.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
      expect(token).toBe("<EMAIL_1>");
    });

    it("should tokenize PHONE to <PHONE_1>", () => {
      const engine = new TokenizationEngine();
      const token = engine.tokenize("PHONE_1", "PHONE", "9876543210");
      expect(token).toBe("<PHONE_1>");
    });

    it("should tokenize CREDIT_CARD to <CARD_1>", () => {
      const engine = new TokenizationEngine();
      const token = engine.tokenize("CARD_1", "CREDIT_CARD", "4111111111111111");
      expect(token).toBe("<CARD_1>");
    });

    it("should tokenize multiple types with independent counters", () => {
      const engine = new TokenizationEngine();
      engine.tokenize("PERSON_1", "PERSON", "Rahul Sharma");
      engine.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
      engine.tokenize("PERSON_2", "PERSON", "John Doe");

      expect(engine.getToken("PERSON_1")).toBe("<PERSON_1>");
      expect(engine.getToken("EMAIL_1")).toBe("<EMAIL_1>");
      expect(engine.getToken("PERSON_2")).toBe("<PERSON_2>");
    });
  });

  // ── Test 6: Repeated entity ────────────────────────────────────────

  describe("Test 6 — Repeated entity", () => {
    it("should return the same token for the same entity", () => {
      const engine = new TokenizationEngine();
      const token1 = engine.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
      const token2 = engine.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
      expect(token1).toBe(token2);
      expect(token1).toBe("<EMAIL_1>");
    });

    it("should deduplicate via normalizedValueHash", () => {
      const engine = new TokenizationEngine();
      const token1 = engine.tokenize(
        "EMAIL_1", "EMAIL", "rahul@example.com", "hash_abc",
      );
      const token2 = engine.tokenize(
        "EMAIL_2", "EMAIL", "rahul@example.com", "hash_abc",
      );
      // Same hash → same token
      expect(token1).toBe(token2);
    });

    it("should use different tokens for different entities", () => {
      const engine = new TokenizationEngine();
      const token1 = engine.tokenize("EMAIL_1", "EMAIL", "rahul@example.com", "hash_1");
      const token2 = engine.tokenize("EMAIL_2", "EMAIL", "john@example.com", "hash_2");
      expect(token1).not.toBe(token2);
      expect(token1).toBe("<EMAIL_1>");
      expect(token2).toBe("<EMAIL_2>");
    });
  });

  // ── Token mapping stays local ──────────────────────────────────────

  describe("Token mapping locality", () => {
    it("should track raw values locally for leakage checking", () => {
      const engine = new TokenizationEngine();
      engine.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
      expect(engine.hasRawValue("rahul@example.com")).toBe(true);
      expect(engine.hasRawValue("unknown@example.com")).toBe(false);
    });

    it("should clear all mappings", () => {
      const engine = new TokenizationEngine();
      engine.tokenize("EMAIL_1", "EMAIL", "rahul@example.com");
      engine.clear();
      expect(engine.size).toBe(0);
      expect(engine.getToken("EMAIL_1")).toBeUndefined();
    });
  });
});
