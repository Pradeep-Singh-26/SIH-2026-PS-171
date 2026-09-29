/**
 * Unit tests for ContextSelector.
 *
 * These tests verify deterministic relevance scoring WITHOUT Chrome APIs.
 * Run with:  bun test extension/src/context/ContextSelector.test.ts
 */

import { describe, it, expect } from "bun:test";
import { ContextSelector } from "./ContextSelector";
import type { ElementCandidate, ActionIntent } from "../types/index";

// ── Helpers ────────────────────────────────────────────────────────────

/** Create a minimal visible, enabled candidate with defaults. */
function makeCandidate(overrides: Partial<ElementCandidate> & { id: string }): ElementCandidate {
  return {
    tagName: "button",
    role: "button",
    label: undefined,
    text: undefined,
    ariaLabel: undefined,
    placeholder: undefined,
    type: undefined,
    visible: true,
    enabled: true,
    bbox: { x: 0, y: 0, width: 100, height: 40 },
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe("ContextSelector", () => {
  const selector = new ContextSelector();

  // ────────────────────────────────────────────────────────────────────
  // Test 1: "click Download Invoice" → Download Invoice ranks first
  // ────────────────────────────────────────────────────────────────────
  describe("Test 1 — click Download Invoice", () => {
    const candidates: ElementCandidate[] = [
      makeCandidate({ id: "el_1", tagName: "h1", role: "heading", label: "Invoice Portal", text: "Invoice Portal" }),
      makeCandidate({ id: "el_2", tagName: "h2", role: "heading", label: "Your Invoice", text: "Your Invoice" }),
      makeCandidate({ id: "el_3", tagName: "button", role: "button", label: "Download Invoice", text: "Download Invoice" }),
      makeCandidate({ id: "el_4", tagName: "a", role: "link", label: "View Invoice", text: "View Invoice" }),
      makeCandidate({ id: "el_5", tagName: "input", role: "textbox", label: undefined, placeholder: "Search invoice", type: "text" }),
      makeCandidate({ id: "el_6", tagName: "input", role: "textbox", label: undefined, placeholder: "Email address", type: "email" }),
      makeCandidate({ id: "el_7", tagName: "textarea", role: "textbox", label: undefined, placeholder: "Notes" }),
      makeCandidate({ id: "el_8", tagName: "button", role: "button", label: "Cancel", text: "Cancel" }),
      makeCandidate({ id: "el_9", tagName: "button", role: "button", label: "Download Receipt", text: "Download Receipt" }),
    ];

    it("should rank 'Download Invoice' button first", () => {
      const result = selector.select("click Download Invoice", candidates);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0]!.id).toBe("el_3");
      expect(result.candidates[0]!.label).toBe("Download Invoice");
    });

    it("should have a high score for the top candidate", () => {
      const result = selector.select("click Download Invoice", candidates);
      expect(result.candidates[0]!.relevanceScore).toBeGreaterThanOrEqual(0.5);
    });

    it("should include explainable reasons", () => {
      const result = selector.select("click Download Invoice", candidates);
      const reasons = result.candidates[0]!.relevanceReasons;
      expect(reasons).toContain("label_exact_match");
      expect(reasons).toContain("role_match");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 2: "enter email" → Email textbox ranks first
  // ────────────────────────────────────────────────────────────────────
  describe("Test 2 — enter email", () => {
    const candidates: ElementCandidate[] = [
      makeCandidate({ id: "el_1", tagName: "button", role: "button", label: "Download Invoice", text: "Download Invoice" }),
      makeCandidate({ id: "el_2", tagName: "input", role: "textbox", label: "Email", placeholder: "Email address", type: "email" }),
      makeCandidate({ id: "el_3", tagName: "input", role: "textbox", label: undefined, placeholder: "Search invoice", type: "text" }),
      makeCandidate({ id: "el_4", tagName: "button", role: "button", label: "Cancel", text: "Cancel" }),
    ];

    it("should rank 'Email' textbox first", () => {
      const result = selector.select("enter email", candidates);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0]!.id).toBe("el_2");
    });

    it("should detect TYPE intent", () => {
      expect(selector.detectIntent("enter email")).toBe("TYPE" as ActionIntent);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 3: "click login" → Login button ranks first
  // ────────────────────────────────────────────────────────────────────
  describe("Test 3 — click login", () => {
    const candidates: ElementCandidate[] = [
      makeCandidate({ id: "el_1", tagName: "input", role: "textbox", label: "Email", placeholder: "Email", type: "email" }),
      makeCandidate({ id: "el_2", tagName: "input", role: "textbox", label: "Password", placeholder: "Password", type: "password" }),
      makeCandidate({ id: "el_3", tagName: "button", role: "button", label: "Login", text: "Login" }),
      makeCandidate({ id: "el_4", tagName: "a", role: "link", label: "Forgot password?", text: "Forgot password?" }),
    ];

    it("should rank 'Login' button first", () => {
      const result = selector.select("click login", candidates);
      expect(result.candidates[0]!.id).toBe("el_3");
      expect(result.candidates[0]!.label).toBe("Login");
    });

    it("should detect CLICK intent", () => {
      expect(selector.detectIntent("click login")).toBe("CLICK" as ActionIntent);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 4: Disabled candidate must NOT outrank enabled candidate
  // ────────────────────────────────────────────────────────────────────
  describe("Test 4 — disabled vs enabled", () => {
    const candidates: ElementCandidate[] = [
      makeCandidate({
        id: "el_1",
        tagName: "button",
        role: "button",
        label: "Download Invoice",
        text: "Download Invoice",
        enabled: true,
      }),
      makeCandidate({
        id: "el_2",
        tagName: "button",
        role: "button",
        label: "Download Invoice (disabled)",
        text: "Download Invoice (disabled)",
        enabled: false,
      }),
    ];

    it("should rank enabled 'Download Invoice' above disabled one", () => {
      const result = selector.select("click Download Invoice", candidates);
      // Disabled element should be filtered out entirely for CLICK intent
      const ids = result.candidates.map((c) => c.id);
      expect(ids[0]).toBe("el_1");
      // The disabled element should either be absent or ranked lower
      if (ids.includes("el_2")) {
        const idx = ids.indexOf("el_2");
        expect(idx).toBeGreaterThan(0);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 5: Irrelevant candidates should receive low scores
  // ────────────────────────────────────────────────────────────────────
  describe("Test 5 — irrelevant candidates get low scores", () => {
    const candidates: ElementCandidate[] = [
      makeCandidate({ id: "el_1", tagName: "button", role: "button", label: "Download Invoice", text: "Download Invoice" }),
      makeCandidate({ id: "el_2", tagName: "button", role: "button", label: "Cancel", text: "Cancel" }),
      makeCandidate({ id: "el_3", tagName: "input", role: "textbox", label: undefined, placeholder: "Notes", type: "text" }),
    ];

    it("should give 'Cancel' a much lower score than 'Download Invoice'", () => {
      const result = selector.select("click Download Invoice", candidates);
      const top = result.candidates.find((c) => c.id === "el_1");
      const cancel = result.candidates.find((c) => c.id === "el_2");

      expect(top).toBeDefined();
      if (cancel) {
        expect(top!.relevanceScore).toBeGreaterThan(cancel.relevanceScore);
      }
    });

    it("should give 'Notes' input a very low score for 'click Download Invoice'", () => {
      const result = selector.select("click Download Invoice", candidates);
      const notes = result.candidates.find((c) => c.id === "el_3");
      // Notes input should be filtered out (disabled for CLICK intent? No — it's
      // enabled but simply irrelevant). It might appear with a very low score.
      if (notes) {
        expect(notes.relevanceScore).toBeLessThan(0.2);
      }
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 6: Invisible elements should be filtered out
  // ────────────────────────────────────────────────────────────────────
  describe("Test 6 — invisible elements filtered", () => {
    const candidates: ElementCandidate[] = [
      makeCandidate({ id: "el_1", tagName: "button", role: "button", label: "Download Invoice", text: "Download Invoice", visible: true }),
      makeCandidate({ id: "el_2", tagName: "button", role: "button", label: "Download Invoice", text: "Download Invoice", visible: false }),
    ];

    it("should not include invisible candidates", () => {
      const result = selector.select("click Download Invoice", candidates);
      const ids = result.candidates.map((c) => c.id);
      expect(ids).not.toContain("el_2");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 7: Action intent detection
  // ────────────────────────────────────────────────────────────────────
  describe("Test 7 — intent detection", () => {
    it("should detect CLICK for 'press submit'", () => {
      expect(selector.detectIntent("press submit")).toBe("CLICK");
    });

    it("should detect TYPE for 'type my name'", () => {
      expect(selector.detectIntent("type my name")).toBe("TYPE");
    });

    it("should detect SELECT for 'select India'", () => {
      expect(selector.detectIntent("select India")).toBe("SELECT");
    });

    it("should detect SCROLL for 'scroll down'", () => {
      expect(selector.detectIntent("scroll down")).toBe("SCROLL");
    });

    it("should return UNKNOWN for ambiguous tasks", () => {
      expect(selector.detectIntent("find the invoice")).toBe("UNKNOWN");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 8: ARIA label matching
  // ────────────────────────────────────────────────────────────────────
  describe("Test 8 — ARIA label matching", () => {
    const candidates: ElementCandidate[] = [
      makeCandidate({ id: "el_1", tagName: "div", role: "button", ariaLabel: "Print Invoice", label: "Print Invoice", text: "Print" }),
      makeCandidate({ id: "el_2", tagName: "button", role: "button", label: "Cancel", text: "Cancel" }),
    ];

    it("should rank element with matching aria-label higher", () => {
      const result = selector.select("click Print Invoice", candidates);
      expect(result.candidates[0]!.id).toBe("el_1");
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 9: SelectedContext shape
  // ────────────────────────────────────────────────────────────────────
  describe("Test 9 — output shape", () => {
    it("should return a SelectedContext with task and candidates", () => {
      const result = selector.select("click something", [
        makeCandidate({ id: "el_1", label: "Something", text: "Something" }),
      ]);
      expect(result.task).toBe("click something");
      expect(Array.isArray(result.candidates)).toBe(true);
      expect(result.candidates[0]!.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.candidates[0]!.relevanceReasons)).toBe(true);
    });
  });

  // ────────────────────────────────────────────────────────────────────
  // Test 10: Phase 1 Relevance Scoring — 'click the Download Invoice button'
  // ────────────────────────────────────────────────────────────────────
  describe("Test 10 — click the Download Invoice button (Wikipedia / real-world scenario)", () => {
    const task = "click the Download Invoice button";

    const candidates: ElementCandidate[] = [
      makeCandidate({
        id: "el_download_invoice",
        tagName: "button",
        role: "button",
        label: "Download Invoice",
        text: "Download Invoice",
      }),
      makeCandidate({
        id: "el_download_receipt",
        tagName: "button",
        role: "button",
        label: "Download Receipt",
        text: "Download Receipt",
      }),
      makeCandidate({
        id: "el_download_partial",
        tagName: "button",
        role: "button",
        label: "Download Invoice Today",
        text: "Download Invoice Today",
      }),
      makeCandidate({
        id: "el_search",
        tagName: "button",
        role: "button",
        label: "Search",
        text: "Search",
      }),
      makeCandidate({
        id: "el_donate",
        tagName: "a",
        role: "link",
        label: "Donate",
        text: "Donate",
      }),
      makeCandidate({
        id: "el_login",
        tagName: "a",
        role: "link",
        label: "Login",
        text: "Login",
      }),
      makeCandidate({
        id: "el_main_page",
        tagName: "a",
        role: "link",
        label: "Main Page",
        text: "Main Page",
      }),
    ];

    it("should rank 'Download Invoice' first for 'click the Download Invoice button'", () => {
      const result = selector.select(task, candidates);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0]!.id).toBe("el_download_invoice");
      expect(result.candidates[0]!.label).toBe("Download Invoice");
    });

    it("should assign substantially lower scores to unrelated elements (Search, Donate, Login, Main Page)", () => {
      const result = selector.select(task, candidates);
      const topCandidate = result.candidates.find((c) => c.id === "el_download_invoice");
      expect(topCandidate).toBeDefined();

      const unrelatedIds = ["el_search", "el_donate", "el_login", "el_main_page"];
      for (const id of unrelatedIds) {
        const unrelated = result.candidates.find((c) => c.id === id);
        if (unrelated) {
          // Score should be low (supporting signals damped without semantic relevance)
          expect(unrelated.relevanceScore).toBeLessThanOrEqual(0.1);
          // And significantly lower than the target candidate (e.g. difference >= 0.5)
          expect(topCandidate!.relevanceScore - unrelated.relevanceScore).toBeGreaterThanOrEqual(0.5);
        }
      }
    });

    it("should have 'Download Invoice' strongly outperform 'Download Receipt'", () => {
      const result = selector.select(task, candidates);
      const invoice = result.candidates.find((c) => c.id === "el_download_invoice")!;
      const receipt = result.candidates.find((c) => c.id === "el_download_receipt")!;

      expect(invoice).toBeDefined();
      expect(receipt).toBeDefined();
      expect(invoice.relevanceScore).toBeGreaterThan(receipt.relevanceScore);
      // 'Download Invoice' has both exact match + all keywords, while receipt only has 'download'
      expect(invoice.relevanceScore - receipt.relevanceScore).toBeGreaterThanOrEqual(0.4);
    });

    it("should rank exact label match above partial keyword/phrase matches", () => {
      const result = selector.select(task, candidates);
      const exact = result.candidates.find((c) => c.id === "el_download_invoice")!;
      const partial = result.candidates.find((c) => c.id === "el_download_partial")!;

      expect(exact).toBeDefined();
      expect(partial).toBeDefined();
      expect(exact.relevanceScore).toBeGreaterThan(partial.relevanceScore);
    });

    it("should ensure disabled 'Download Invoice' does not outrank enabled 'Download Invoice'", () => {
      const candidatesWithDisabled: ElementCandidate[] = [
        makeCandidate({
          id: "el_enabled",
          tagName: "button",
          role: "button",
          label: "Download Invoice",
          text: "Download Invoice",
          enabled: true,
        }),
        makeCandidate({
          id: "el_disabled",
          tagName: "button",
          role: "button",
          label: "Download Invoice",
          text: "Download Invoice",
          enabled: false,
        }),
      ];

      const result = selector.select(task, candidatesWithDisabled);
      const ids = result.candidates.map((c) => c.id);
      expect(ids[0]).toBe("el_enabled");
      if (ids.includes("el_disabled")) {
        expect(ids.indexOf("el_disabled")).toBeGreaterThan(0);
      }
    });
  });
});

