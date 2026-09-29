/**
 * FormContextSelection — Regression Tests
 *
 * Verifies that ContextSelector correctly handles structural
 * form-intent tasks like "fill the form with the available information".
 *
 * Tests:
 *   - Form controls receive adequate relevance scores
 *   - Non-form elements (headings, links) are NOT boosted
 *   - Existing specific-target behavior is preserved
 *   - Form intent detection edge cases
 */

import { describe, it, expect } from "bun:test";
import { ContextSelector } from "./ContextSelector";
import type { ElementCandidate } from "../types/index";

// ── Helpers ────────────────────────────────────────────────────────────

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

/** Minimization threshold from ContextMinimizer (0.15). */
const MINIMIZATION_THRESHOLD = 0.15;

// ── Test data: realistic form page ─────────────────────────────────────

const formPageCandidates: ElementCandidate[] = [
  // Form controls
  makeCandidate({ id: "el_name", tagName: "input", role: "textbox", label: "Full Name", placeholder: "Your full name", type: "text" }),
  makeCandidate({ id: "el_email", tagName: "input", role: "textbox", label: "Email", placeholder: "Email address", type: "email" }),
  makeCandidate({ id: "el_phone", tagName: "input", role: "textbox", label: "Phone", placeholder: "Phone number", type: "tel" }),
  makeCandidate({ id: "el_password", tagName: "input", role: "textbox", label: "Password", placeholder: "Enter password", type: "password" }),
  makeCandidate({ id: "el_address", tagName: "input", role: "textbox", label: "Address", placeholder: "Street address", type: "text" }),
  makeCandidate({ id: "el_country", tagName: "select", role: "combobox", label: "Country" }),
  makeCandidate({ id: "el_remember", tagName: "input", role: "checkbox", label: "Remember me", type: "checkbox" }),
  // Non-form elements
  makeCandidate({ id: "el_heading", tagName: "h1", role: "heading", label: "Invoice Portal", text: "Invoice Portal" }),
  makeCandidate({ id: "el_download", tagName: "button", role: "button", label: "Download Invoice", text: "Download Invoice" }),
  makeCandidate({ id: "el_view_link", tagName: "a", role: "link", label: "View Invoice", text: "View Invoice" }),
  makeCandidate({ id: "el_cancel", tagName: "button", role: "button", label: "Cancel", text: "Cancel" }),
];

// ── Tests ──────────────────────────────────────────────────────────────

describe("FormContextSelection", () => {
  const selector = new ContextSelector();

  // ── Test 1: "fill the form with the available information" ──────────
  describe("fill the form with the available information", () => {
    const task = "fill the form with the available information";

    it("should detect TYPE intent", () => {
      expect(selector.detectIntent(task)).toBe("TYPE");
    });

    it("should detect form intent", () => {
      const intent = selector.detectIntent(task);
      const contentPhrase = (selector as any).extractContentPhrase(task);
      expect(selector.detectFormIntent(task, intent, contentPhrase)).toBe(true);
    });

    it("should give form controls scores above minimization threshold (0.15)", () => {
      const result = selector.select(task, formPageCandidates);
      const formControlIds = ["el_name", "el_email", "el_phone", "el_password", "el_address", "el_country", "el_remember"];

      for (const id of formControlIds) {
        const candidate = result.candidates.find((c) => c.id === id);
        expect(candidate).toBeDefined();
        expect(candidate!.relevanceScore).toBeGreaterThanOrEqual(MINIMIZATION_THRESHOLD);
      }
    });

    it("should include form_intent_match in relevance reasons for form controls", () => {
      const result = selector.select(task, formPageCandidates);
      const nameInput = result.candidates.find((c) => c.id === "el_name");
      expect(nameInput).toBeDefined();
      expect(nameInput!.relevanceReasons).toContain("form_intent_match");
    });

    it("should NOT give headings or links the form-intent boost", () => {
      const result = selector.select(task, formPageCandidates);
      const heading = result.candidates.find((c) => c.id === "el_heading");
      const viewLink = result.candidates.find((c) => c.id === "el_view_link");

      // Heading should either be absent or have very low score
      if (heading) {
        expect(heading.relevanceReasons).not.toContain("form_intent_match");
      }

      // Link should either be absent or have very low score
      if (viewLink) {
        expect(viewLink.relevanceReasons).not.toContain("form_intent_match");
      }
    });

    it("should select at least 5 form controls", () => {
      const result = selector.select(task, formPageCandidates);
      const formControls = result.candidates.filter((c) =>
        ["el_name", "el_email", "el_phone", "el_password", "el_address", "el_country", "el_remember"].includes(c.id),
      );
      expect(formControls.length).toBeGreaterThanOrEqual(5);
    });
  });

  // ── Test 2: "fill out the form" ────────────────────────────────────
  describe("fill out the form", () => {
    const task = "fill out the form";

    it("should detect form intent", () => {
      const intent = selector.detectIntent(task);
      const contentPhrase = (selector as any).extractContentPhrase(task);
      expect(selector.detectFormIntent(task, intent, contentPhrase)).toBe(true);
    });

    it("should give form controls scores above minimization threshold", () => {
      const result = selector.select(task, formPageCandidates);
      const nameInput = result.candidates.find((c) => c.id === "el_name");
      expect(nameInput).toBeDefined();
      expect(nameInput!.relevanceScore).toBeGreaterThanOrEqual(MINIMIZATION_THRESHOLD);
    });
  });

  // ── Test 3: Multiple input types ───────────────────────────────────
  describe("Multiple input types get form-intent boost", () => {
    const task = "fill the form";

    it("should boost text, email, tel, select, and checkbox elements", () => {
      const result = selector.select(task, formPageCandidates);

      const textInput = result.candidates.find((c) => c.id === "el_name");
      const emailInput = result.candidates.find((c) => c.id === "el_email");
      const telInput = result.candidates.find((c) => c.id === "el_phone");
      const selectInput = result.candidates.find((c) => c.id === "el_country");
      const checkbox = result.candidates.find((c) => c.id === "el_remember");

      expect(textInput).toBeDefined();
      expect(emailInput).toBeDefined();
      expect(telInput).toBeDefined();
      expect(selectInput).toBeDefined();
      expect(checkbox).toBeDefined();

      // All should be above minimization threshold
      expect(textInput!.relevanceScore).toBeGreaterThanOrEqual(MINIMIZATION_THRESHOLD);
      expect(emailInput!.relevanceScore).toBeGreaterThanOrEqual(MINIMIZATION_THRESHOLD);
      expect(telInput!.relevanceScore).toBeGreaterThanOrEqual(MINIMIZATION_THRESHOLD);
      expect(selectInput!.relevanceScore).toBeGreaterThanOrEqual(MINIMIZATION_THRESHOLD);
      expect(checkbox!.relevanceScore).toBeGreaterThanOrEqual(MINIMIZATION_THRESHOLD);
    });
  });

  // ── Test 4: Existing "click Download Invoice" is not affected ──────
  describe("Existing invoice task not affected by form-intent", () => {
    const task = "click the Download Invoice button";

    it("should NOT detect form intent for click tasks", () => {
      const intent = selector.detectIntent(task);
      const contentPhrase = (selector as any).extractContentPhrase(task);
      expect(selector.detectFormIntent(task, intent, contentPhrase)).toBe(false);
    });

    it("should still rank Download Invoice first", () => {
      const result = selector.select(task, formPageCandidates);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0]!.id).toBe("el_download");
      expect(result.candidates[0]!.relevanceScore).toBeGreaterThanOrEqual(0.5);
    });
  });

  // ── Test 5: Specific-target TYPE task should NOT trigger form-intent
  describe("Specific-target task 'enter email' should NOT trigger form-intent", () => {
    const task = "enter email";

    it("should NOT detect form intent (has specific content word 'email')", () => {
      const intent = selector.detectIntent(task);
      const contentPhrase = (selector as any).extractContentPhrase(task);
      expect(selector.detectFormIntent(task, intent, contentPhrase)).toBe(false);
    });

    it("should still rank email input first", () => {
      const result = selector.select(task, formPageCandidates);
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates[0]!.id).toBe("el_email");
    });
  });

  // ── Test 6: Form intent detection edge cases ──────────────────────
  describe("Form intent detection edge cases", () => {
    it("should detect form intent for 'fill all the fields'", () => {
      const intent = selector.detectIntent("fill all the fields");
      const contentPhrase = (selector as any).extractContentPhrase("fill all the fields");
      expect(selector.detectFormIntent("fill all the fields", intent, contentPhrase)).toBe(true);
    });

    it("should detect form intent for 'enter the required information'", () => {
      const intent = selector.detectIntent("enter the required information");
      const contentPhrase = (selector as any).extractContentPhrase("enter the required information");
      expect(selector.detectFormIntent("enter the required information", intent, contentPhrase)).toBe(true);
    });

    it("should NOT detect form intent for 'click the form button' (CLICK intent)", () => {
      const intent = selector.detectIntent("click the form button");
      const contentPhrase = (selector as any).extractContentPhrase("click the form button");
      expect(selector.detectFormIntent("click the form button", intent, contentPhrase)).toBe(false);
    });

    it("should NOT detect form intent for 'fill the name field' (has specific target)", () => {
      const intent = selector.detectIntent("fill the name field");
      const contentPhrase = (selector as any).extractContentPhrase("fill the name field");
      expect(selector.detectFormIntent("fill the name field", intent, contentPhrase)).toBe(false);
    });

    it("should NOT detect form intent for 'scroll down' (SCROLL intent)", () => {
      const intent = selector.detectIntent("scroll down");
      const contentPhrase = (selector as any).extractContentPhrase("scroll down");
      expect(selector.detectFormIntent("scroll down", intent, contentPhrase)).toBe(false);
    });
  });

  // ── Test 7: Unrelated page elements not indiscriminately included ──
  describe("Unrelated elements not indiscriminately included", () => {
    const task = "fill the form with the available information";

    it("should give form controls higher scores than unrelated headings", () => {
      const result = selector.select(task, formPageCandidates);
      const nameInput = result.candidates.find((c) => c.id === "el_name");
      const heading = result.candidates.find((c) => c.id === "el_heading");

      expect(nameInput).toBeDefined();
      if (heading) {
        expect(nameInput!.relevanceScore).toBeGreaterThan(heading.relevanceScore);
      }
    });

    it("should give form controls higher scores than unrelated links", () => {
      const result = selector.select(task, formPageCandidates);
      const nameInput = result.candidates.find((c) => c.id === "el_name");
      const viewLink = result.candidates.find((c) => c.id === "el_view_link");

      expect(nameInput).toBeDefined();
      if (viewLink) {
        expect(nameInput!.relevanceScore).toBeGreaterThan(viewLink.relevanceScore);
      }
    });
  });
});
