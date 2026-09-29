/**
 * DomPerceptionAdapter
 *
 * Extracts interactive and semantic elements from the live DOM,
 * producing ElementCandidate[] with visibility, enabled-state,
 * role, label, and bounding-box metadata.
 *
 * PRIVACY: Never reads current form values (input.value, etc.).
 * SECURITY: Treats all webpage content as UNTRUSTED_WEB_CONTENT.
 */

import type { BoundingBox, ElementCandidate } from "../types/index";

// ── Selectors ──────────────────────────────────────────────────────────

/** Tags to always query. */
const TAG_SELECTORS = [
  "button",
  "a",
  "input",
  "textarea",
  "select",
  "h1",
  "h2",
  "h3",
] as const;

/**
 * ARIA roles that represent meaningful interactive / accessibility
 * semantics worth extracting.  Generic or layout roles are excluded.
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "checkbox",
  "radio",
  "combobox",
  "menuitem",
  "tab",
  "switch",
  "option",
  "searchbox",
  "slider",
  "spinbutton",
]);

// ── Input-type → semantic role mapping ─────────────────────────────────

const INPUT_ROLE_MAP: Record<string, string> = {
  text: "textbox",
  email: "textbox",
  password: "textbox",
  search: "searchbox",
  tel: "textbox",
  url: "textbox",
  number: "spinbutton",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
};

// ── Tag → default role mapping ─────────────────────────────────────────

const TAG_ROLE_MAP: Record<string, string> = {
  button: "button",
  a: "link",
  textarea: "textbox",
  select: "combobox",
  h1: "heading",
  h2: "heading",
  h3: "heading",
};

// ── Helpers ────────────────────────────────────────────────────────────

/** Collapse whitespace and clamp to maxLen characters. */
function normalizeText(raw: string, maxLen = 200): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, maxLen);
}

/** Check element visibility using computed style + bounding rect. */
function isElementVisible(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  if (style.display === "none") return false;
  if (style.visibility === "hidden") return false;
  if (parseFloat(style.opacity) === 0) return false;

  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  return true;
}

/** Determine whether the element is interactive-enabled. */
function isElementEnabled(el: HTMLElement): boolean {
  // Native form controls have a boolean `disabled` property.
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLButtonElement ||
    el instanceof HTMLSelectElement ||
    el instanceof HTMLTextAreaElement
  ) {
    return !el.disabled;
  }

  // For generic elements, respect aria-disabled.
  const ariaDisabled = el.getAttribute("aria-disabled");
  if (ariaDisabled === "true") return false;

  return true;
}

/** Resolve the semantic role for an element. */
function resolveRole(el: HTMLElement): string | undefined {
  // 1. Explicit role attribute (highest priority).
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;

  const tag = el.tagName.toLowerCase();

  // 2. Input sub-types.
  if (tag === "input" && el instanceof HTMLInputElement) {
    return INPUT_ROLE_MAP[el.type] ?? "textbox";
  }

  // 3. Tag-based default.
  return TAG_ROLE_MAP[tag];
}

/**
 * Build a semantic label WITHOUT reading current values.
 *
 * Priority:
 *  1. aria-label
 *  2. Associated <label> (via `for` / wrapping)
 *  3. Visible text content (buttons, links, headings)
 *  4. placeholder
 *  5. title
 */
function resolveLabel(el: HTMLElement): string | undefined {
  // 1. aria-label
  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) return normalizeText(ariaLabel);

  // 2. Associated <label>
  if (el.id) {
    const labelEl = document.querySelector<HTMLLabelElement>(
      `label[for="${CSS.escape(el.id)}"]`
    );
    if (labelEl) {
      const t = normalizeText(labelEl.textContent ?? "");
      if (t) return t;
    }
  }

  // Wrapping <label>
  const parentLabel = el.closest("label");
  if (parentLabel) {
    const t = normalizeText(parentLabel.textContent ?? "");
    if (t) return t;
  }

  // 3. Element text (only for non-input elements to avoid value leaks).
  const tag = el.tagName.toLowerCase();
  if (!["input", "textarea", "select"].includes(tag)) {
    const text = normalizeText(el.innerText ?? el.textContent ?? "");
    if (text) return text;
  }

  // 4. placeholder
  if (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement
  ) {
    if (el.placeholder) return normalizeText(el.placeholder);
  }

  // 5. title
  const title = el.getAttribute("title");
  if (title) return normalizeText(title);

  return undefined;
}

/** Extract visible semantic text (buttons, links, headings). */
function extractText(el: HTMLElement): string | undefined {
  const tag = el.tagName.toLowerCase();
  // Only extract text for non-value-bearing elements.
  if (["input", "textarea", "select"].includes(tag)) return undefined;

  const raw = el.innerText ?? el.textContent ?? "";
  const text = normalizeText(raw);
  return text || undefined;
}

/** Get bounding box snapshot. */
function getBBox(el: HTMLElement): BoundingBox {
  const r = el.getBoundingClientRect();
  return { x: r.x, y: r.y, width: r.width, height: r.height };
}

// ── Public adapter ─────────────────────────────────────────────────────

export class DomPerceptionAdapter {
  /** Map of local temp-IDs → live DOM elements (for future action execution). */
  private elementMap: Record<string, HTMLElement> = {};
  private counter = 0;

  /**
   * Walk the DOM and return an array of ElementCandidate objects
   * describing every interactive / semantic element found.
   */
  extract(): ElementCandidate[] {
    this.elementMap = {};
    this.counter = 0;

    const seen = new Set<HTMLElement>();
    const candidates: ElementCandidate[] = [];

    // 1. Tag-based query
    const tagQuery = TAG_SELECTORS.join(",");
    document
      .querySelectorAll<HTMLElement>(tagQuery)
      .forEach((el) => this.processElement(el, seen, candidates));

    // 2. Role-based query (only interactive roles not already found by tag)
    document
      .querySelectorAll<HTMLElement>("[role]")
      .forEach((el) => {
        const role = el.getAttribute("role");
        if (role && INTERACTIVE_ROLES.has(role)) {
          this.processElement(el, seen, candidates);
        }
      });

    return candidates;
  }

  /** Retrieve the live DOM element for a given local ID. */
  getElement(id: string): HTMLElement | undefined {
    return this.elementMap[id];
  }

  // ── Internal ───────────────────────────────────────────────────────

  private processElement(
    el: HTMLElement,
    seen: Set<HTMLElement>,
    out: ElementCandidate[]
  ): void {
    if (seen.has(el)) return;
    seen.add(el);

    const id = `el_${++this.counter}`;
    this.elementMap[id] = el;

    const tag = el.tagName.toLowerCase();

    const candidate: ElementCandidate = {
      id,
      tagName: tag,
      role: resolveRole(el),
      label: resolveLabel(el),
      text: extractText(el),
      ariaLabel: el.getAttribute("aria-label") ?? undefined,
      placeholder:
        el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
          ? el.placeholder || undefined
          : undefined,
      type:
        el instanceof HTMLInputElement ? el.type : undefined,
      autocomplete: el.getAttribute("autocomplete") ?? undefined,
      visible: isElementVisible(el),
      enabled: isElementEnabled(el),
      bbox: getBBox(el),
    };

    out.push(candidate);
  }
}
