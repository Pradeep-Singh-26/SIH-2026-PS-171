/**
 * ContextSelector
 *
 * Receives a trusted user task and an array of ElementCandidates,
 * scores each candidate for relevance, and returns the Top-K
 * ScoredCandidates wrapped in a SelectedContext.
 *
 * All scoring is deterministic — no LLM, no network, no embeddings.
 *
 * SECURITY:
 *  - `task` is TRUSTED_USER_TASK.
 *  - Candidate text is UNTRUSTED_WEB_CONTENT and is only compared
 *    against the task — never executed or interpreted.
 */

import type {
  ActionIntent,
  ElementCandidate,
  ScoredCandidate,
  SelectedContext,
} from "../types/index";

// ── Configuration ──────────────────────────────────────────────────────

const DEFAULT_TOP_K = 10;
const MIN_SCORE_THRESHOLD = 0.05;

// ── Scoring weights ────────────────────────────────────────────────────

const W = {
  // Dominant semantic weights
  EXACT_LABEL_MATCH: 0.45,
  PHRASE_LABEL_MATCH: 0.35,
  EXACT_TEXT_MATCH: 0.40,
  PHRASE_TEXT_MATCH: 0.30,
  KEYWORD_LABEL: 0.25,
  KEYWORD_TEXT: 0.15,
  KEYWORD_ARIA: 0.15,
  KEYWORD_PLACEHOLDER: 0.15,

  // Supporting signals (full bonus when semantic match > 0)
  ROLE_MATCH: 0.10,
  ACTION_INTENT: 0.08,

  // Supporting signals (damped baseline when semantic match == 0)
  ROLE_MATCH_DAMPED: 0.02,
  ACTION_INTENT_DAMPED: 0.01,

  // Form-intent boost (structural/categorical task targeting form controls)
  FORM_INTENT_CONTROL: 0.20,
  FORM_INTENT_ACTION: 0.10,

  // Tiebreakers
  VISIBLE_BONUS: 0.01,
  ENABLED_BONUS: 0.01,
} as const;

// ── Stop words (removed from both task and candidate text) ─────────────

const STOP_WORDS = new Set([
  "the", "a", "an", "this", "my", "to", "on", "in", "of", "and",
  "or", "for", "is", "it", "that", "with", "please", "can", "you",
  "i", "me", "do", "should", "would", "could", "will", "just",
  "go", "up", "at", "by", "be", "as", "so", "if", "no", "not",
  "into", "onto", "from", "here",
]);

// ── Meta-action verbs (instructions directed to agent) ─────────────────
// These verbs represent command instructions rather than domain-specific content labels.
const META_ACTION_VERBS = new Set([
  "click", "press", "tap", "hit", "push",
  "type", "enter", "fill", "write", "input", "set", "put",
  "select", "choose", "pick",
  "scroll", "swipe",
  "open", "close", "toggle",
]);

// ── UI control descriptor terms commonly used in prompts ───────────────
const UI_DESCRIPTOR_TERMS = new Set([
  "button", "btn", "link", "textbox", "searchbox", "input", "field", "box",
  "dropdown", "checkbox", "radio", "tab", "menu", "menuitem", "icon", "element",
]);

// ── Structural form-intent target words ────────────────────────────────
// These words, when combined with a TYPE verb and no specific label target,
// indicate the user is targeting form controls as a category.
const FORM_TARGET_WORDS = new Set([
  "form", "fields", "details", "information", "info",
]);

// ── Form-control roles (elements targeted by form-intent) ──────────────
const FORM_CONTROL_ROLES = new Set([
  "textbox", "searchbox", "combobox", "spinbutton",
  "checkbox", "radio",
]);

// ── Form-action roles (submit/action buttons related to forms) ─────────
const FORM_ACTION_ROLES = new Set(["button"]);

// ── Action-verb → intent mapping ──────────────────────────────────────

const CLICK_VERBS = new Set([
  "click", "press", "tap", "hit", "push", "open", "close", "toggle",
  "submit", "confirm", "accept", "deny", "reject", "dismiss",
  "download", "upload", "delete", "remove", "expand", "collapse",
]);

const TYPE_VERBS = new Set([
  "type", "enter", "fill", "write", "input", "set", "put",
]);

const SELECT_VERBS = new Set([
  "select", "choose", "pick",
]);

const SCROLL_VERBS = new Set([
  "scroll", "swipe",
]);

// ── Roles that match action intents ────────────────────────────────────

const CLICK_ROLES = new Set(["button", "link", "menuitem", "tab", "switch", "option"]);
const TYPE_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);
const SELECT_ROLES = new Set(["combobox", "radio", "checkbox", "option"]);

// ── Helpers ────────────────────────────────────────────────────────────

/** Tokenise text into lowercase words, removing stop words. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
}

/** Normalize text for clean equality and phrase containment checks. */
function normalizeText(text?: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Check if `haystack` contains the exact `phrase` as a substring (case-insensitive). */
function containsPhrase(haystack: string, phrase: string): boolean {
  if (!haystack || !phrase) return false;
  return haystack.toLowerCase().includes(phrase.toLowerCase());
}

/** Keyword overlap between task content tokens and target text. */
function keywordOverlap(
  contentTokens: string[],
  target?: string,
): { recall: number; precision: number; score: number } {
  if (!target || contentTokens.length === 0) return { recall: 0, precision: 0, score: 0 };
  const targetTokens = tokenize(target);
  if (targetTokens.length === 0) return { recall: 0, precision: 0, score: 0 };

  const targetSet = new Set(targetTokens);
  let hits = 0;
  for (const t of contentTokens) {
    if (targetSet.has(t)) hits++;
  }

  const recall = hits / contentTokens.length;
  const precision = hits / targetTokens.length;
  // Weighted overlap giving high priority to recall while rewarding precision (exactness)
  const score = recall * 0.8 + precision * 0.2;
  return { recall, precision, score };
}

// ── Public API ─────────────────────────────────────────────────────────

export class ContextSelector {
  private topK: number;

  constructor(topK: number = DEFAULT_TOP_K) {
    this.topK = topK;
  }

  /**
   * Score and rank candidates against the given task.
   * Returns a SelectedContext with the Top-K results.
   */
  select(task: string, candidates: ElementCandidate[]): SelectedContext {
    const intent = this.detectIntent(task);
    const contentPhrase = this.extractContentPhrase(task);
    const contentTokens = this.extractContentTokens(task, contentPhrase);
    const formIntent = this.detectFormIntent(task, intent, contentPhrase);

    // Score each candidate
    const scored: ScoredCandidate[] = candidates
      // Pre-filter: drop invisible and disabled interactive elements.
      .filter((c) => {
        if (!c.visible) return false;
        if (!c.enabled && intent !== "UNKNOWN") return false;
        return true;
      })
      .map((c) => this.scoreCandidate(c, contentTokens, contentPhrase, intent, formIntent));

    // Sort descending by score
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Apply threshold and top-K
    const filtered = scored
      .filter((s) => s.relevanceScore >= MIN_SCORE_THRESHOLD)
      .slice(0, this.topK);

    return { task, candidates: filtered };
  }

  /**
   * Detect a simple action intent from the task text.
   * Public so it can be unit-tested independently.
   */
  detectIntent(task: string): ActionIntent {
    const words = task.toLowerCase().split(/\s+/);
    for (const w of words) {
      if (CLICK_VERBS.has(w)) return "CLICK";
      if (TYPE_VERBS.has(w)) return "TYPE";
      if (SELECT_VERBS.has(w)) return "SELECT";
      if (SCROLL_VERBS.has(w)) return "SCROLL";
    }
    return "UNKNOWN";
  }

  /**
   * Extract the "content" portion of the task by stripping leading meta-action
   * verbs (e.g. "click", "type"), stop words ("the", "on"), and trailing
   * UI descriptors ("button", "link", "field").
   *
   * "click the Download Invoice button" → "download invoice"
   * "click Download Invoice"            → "download invoice"
   * "enter email"                       → "email"
   */
  private extractContentPhrase(task: string): string {
    const rawWords = task
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 0);

    if (rawWords.length === 0) return "";

    // Strip leading meta-action verbs and stop words
    let start = 0;
    while (
      start < rawWords.length &&
      (STOP_WORDS.has(rawWords[start]!) || META_ACTION_VERBS.has(rawWords[start]!))
    ) {
      start++;
    }

    // Strip trailing UI descriptors and stop words
    let end = rawWords.length;
    while (
      end > start &&
      (STOP_WORDS.has(rawWords[end - 1]!) || UI_DESCRIPTOR_TERMS.has(rawWords[end - 1]!))
    ) {
      end--;
    }

    const contentWords = rawWords.slice(start, end).filter((w) => !STOP_WORDS.has(w));
    if (contentWords.length > 0) {
      return contentWords.join(" ");
    }

    // Fallback if stripping removed all words
    const withoutStopWords = rawWords.filter((w) => !STOP_WORDS.has(w));
    if (withoutStopWords.length > 0) {
      const withoutMeta = withoutStopWords.filter((w) => !META_ACTION_VERBS.has(w));
      if (withoutMeta.length > 0) return withoutMeta.join(" ");
      return withoutStopWords.join(" ");
    }

    return rawWords.join(" ");
  }

  /**
   * Extract the key semantic content tokens from the task.
   */
  private extractContentTokens(task: string, contentPhrase: string): string[] {
    if (contentPhrase) {
      const tokens = tokenize(contentPhrase).filter((t) => !UI_DESCRIPTOR_TERMS.has(t));
      if (tokens.length > 0) return tokens;
    }
    const taskTokens = tokenize(task).filter(
      (t) => !META_ACTION_VERBS.has(t) && !UI_DESCRIPTOR_TERMS.has(t),
    );
    if (taskTokens.length > 0) return taskTokens;
    return tokenize(task);
  }

  /**
   * Detect whether the task is a structural "form intent" — targeting
   * form controls as a category rather than a specific element by label.
   *
   * Returns true when:
   *  1. Intent is TYPE (fill, enter, write, etc.)
   *  2. The content phrase consists entirely of generic structural terms
   *     ("form", "fields", "details", "information") with no specific label target.
   *
   * Public so it can be unit-tested independently.
   */
  detectFormIntent(task: string, intent: ActionIntent, contentPhrase: string): boolean {
    // Only TYPE-intent tasks can trigger form-intent
    if (intent !== "TYPE") return false;

    // If there's no content phrase at all, not a form intent
    if (!contentPhrase) return false;

    // Tokenize the content phrase and check if ALL tokens are
    // generic structural/form-related words (no specific label target)
    const tokens = tokenize(contentPhrase);
    if (tokens.length === 0) return false;

    // Every content token must be a form-target word or a common qualifier
    const FORM_QUALIFIERS = new Set(["out", "all", "available", "required", "necessary", "remaining"]);
    for (const t of tokens) {
      if (!FORM_TARGET_WORDS.has(t) && !FORM_QUALIFIERS.has(t)) {
        // Found a specific content word → this is a targeted task, not form-intent
        return false;
      }
    }

    return true;
  }

  // ── Internal scoring ─────────────────────────────────────────────────

  private scoreCandidate(
    c: ElementCandidate,
    contentTokens: string[],
    contentPhrase: string,
    intent: ActionIntent,
    formIntent: boolean,
  ): ScoredCandidate {
    let semanticScore = 0;
    let supportingScore = 0;
    const reasons: string[] = [];

    const normLabel = normalizeText(c.label);
    const normText = normalizeText(c.text);
    const normAria = normalizeText(c.ariaLabel);
    const normPlaceholder = normalizeText(c.placeholder);

    // ── Form-intent boost ───────────────────────────────────────────
    // When the task is a structural form intent, boost form-control roles.
    // This acts as semantic relevance: the user IS targeting these elements.
    if (formIntent && c.role) {
      if (FORM_CONTROL_ROLES.has(c.role)) {
        semanticScore += W.FORM_INTENT_CONTROL;
        reasons.push("form_intent_match");
      } else if (FORM_ACTION_ROLES.has(c.role)) {
        supportingScore += W.FORM_INTENT_ACTION;
        reasons.push("form_intent_action");
      }
    }

    // ── Exact phrase / label match ──────────────────────────────────
    if (contentPhrase) {
      if (normLabel) {
        if (normLabel === contentPhrase) {
          semanticScore += W.EXACT_LABEL_MATCH;
          reasons.push("label_exact_match");
        } else if (containsPhrase(normLabel, contentPhrase)) {
          semanticScore += W.PHRASE_LABEL_MATCH;
          reasons.push("label_exact_match");
        }
      }

      if (!reasons.includes("label_exact_match") && normText) {
        if (normText === contentPhrase) {
          semanticScore += W.EXACT_TEXT_MATCH;
          reasons.push("text_exact_match");
        } else if (containsPhrase(normText, contentPhrase)) {
          semanticScore += W.PHRASE_TEXT_MATCH;
          reasons.push("text_exact_match");
        }
      }

      if (!reasons.includes("label_exact_match") && !reasons.includes("text_exact_match") && normAria) {
        if (normAria === contentPhrase) {
          semanticScore += W.EXACT_LABEL_MATCH;
          reasons.push("aria_label_match");
        } else if (containsPhrase(normAria, contentPhrase)) {
          semanticScore += W.PHRASE_LABEL_MATCH;
          reasons.push("aria_label_match");
        }
      }
    }

    // ── Keyword overlap ────────────────────────────────────────────
    if (c.label) {
      const { recall, score: overlap } = keywordOverlap(contentTokens, c.label);
      if (recall > 0) {
        semanticScore += W.KEYWORD_LABEL * overlap;
        reasons.push("text_keyword_match");
      }
    }

    if (c.text && c.text !== c.label) {
      const { recall, score: overlap } = keywordOverlap(contentTokens, c.text);
      if (recall > 0) {
        semanticScore += W.KEYWORD_TEXT * overlap;
        if (!reasons.includes("text_keyword_match")) {
          reasons.push("text_keyword_match");
        }
      }
    }

    if (c.ariaLabel) {
      const { recall, score: overlap } = keywordOverlap(contentTokens, c.ariaLabel);
      if (recall > 0) {
        semanticScore += W.KEYWORD_ARIA * overlap;
        if (!reasons.includes("aria_label_match")) {
          reasons.push("aria_label_match");
        }
      }
    }

    if (c.placeholder) {
      const { recall, score: overlap } = keywordOverlap(contentTokens, c.placeholder);
      if (recall > 0) {
        semanticScore += W.KEYWORD_PLACEHOLDER * overlap;
        reasons.push("placeholder_match");
      }
    }

    // ── Supporting signals ─────────────────────────────────────────
    // Semantic relevance must dominate. Supporting signals only act as
    // secondary boosters. When semanticScore === 0, supporting signals
    // are heavily damped so unrelated elements receive a very low score (<= 0.05).
    const hasSemanticMatch = semanticScore > 0;

    // ── Role match (does role align with detected intent?) ─────────
    if (c.role && intent !== "UNKNOWN") {
      let roleMatches = false;
      if (intent === "CLICK" && CLICK_ROLES.has(c.role)) roleMatches = true;
      if (intent === "TYPE" && TYPE_ROLES.has(c.role)) roleMatches = true;
      if (intent === "SELECT" && SELECT_ROLES.has(c.role)) roleMatches = true;

      if (roleMatches) {
        supportingScore += hasSemanticMatch ? W.ROLE_MATCH : W.ROLE_MATCH_DAMPED;
        reasons.push("role_match");
      }
    }

    // ── Action intent match ────────────────────────────────────────
    if (intent !== "UNKNOWN") {
      const roleFamily = this.getRoleFamily(c.role);
      if (
        (intent === "CLICK" && roleFamily === "action") ||
        (intent === "TYPE" && roleFamily === "input") ||
        (intent === "SELECT" && roleFamily === "input")
      ) {
        supportingScore += hasSemanticMatch ? W.ACTION_INTENT : W.ACTION_INTENT_DAMPED;
        reasons.push("action_intent_match");
      }
    }

    // ── Visibility & enabled bonuses (small tiebreakers) ───────────
    if (c.visible) {
      supportingScore += W.VISIBLE_BONUS;
      reasons.push("visible");
    }
    if (c.enabled) {
      supportingScore += W.ENABLED_BONUS;
      reasons.push("enabled");
    }

    let totalScore = semanticScore + supportingScore;
    // Clamp to [0, 1]
    totalScore = Math.min(1, Math.max(0, totalScore));

    return {
      ...c,
      relevanceScore: Math.round(totalScore * 100) / 100, // 2 decimal places
      relevanceReasons: reasons,
    };
  }

  private getRoleFamily(role?: string): "action" | "input" | "content" | "unknown" {
    if (!role) return "unknown";
    if (CLICK_ROLES.has(role)) return "action";
    if (TYPE_ROLES.has(role)) return "input";
    if (role === "heading") return "content";
    return "unknown";
  }
}
