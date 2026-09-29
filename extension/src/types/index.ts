/**
 * Shared types for the Privacy Browser Agent DOM perception pipeline.
 *
 * These types define the data flow:
 *   DOM Element → ElementCandidate → ScoredCandidate → SelectedContext
 *
 * PRIVACY: No type here captures current form values (input.value, etc.).
 * Candidates describe element identity, not user-entered content.
 */

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementCandidate {
  id: string;
  tagName: string;
  role?: string;
  label?: string;
  text?: string;
  ariaLabel?: string;
  placeholder?: string;
  type?: string;
  autocomplete?: string;
  visible: boolean;
  enabled: boolean;
  bbox: BoundingBox;
}

export interface ScoredCandidate extends ElementCandidate {
  relevanceScore: number;
  relevanceReasons: string[];
}

export interface SelectedContext {
  task: string;
  candidates: ScoredCandidate[];
}

/**
 * Simple action-intent enum derived from task text.
 * Used only as a heuristic scoring signal — no actions are executed.
 */
export type ActionIntent = "CLICK" | "TYPE" | "SELECT" | "SCROLL" | "UNKNOWN";
