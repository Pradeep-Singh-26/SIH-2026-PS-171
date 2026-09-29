/**
 * PrivacyGraph — In-Memory Taint / Provenance Tracking
 *
 * Tracks relationships between:
 *   DOM element → PII entity → privacy token
 *
 * Fundamental rule:
 *   Information derived from sensitive information remains tainted
 *   until an approved transformation makes it safe for the destination.
 *
 * NO graph database. In-memory Maps only.
 */

import type { TaintInfo, EntityType } from "./types";

/** A node in the privacy graph. */
interface GraphNode {
  /** Node ID (element ID, entity ID, or token). */
  id: string;

  /** Node type. */
  kind: "element" | "entity" | "token";

  /** Taint information. */
  taint: TaintInfo;
}

/** An edge connecting two nodes. */
interface GraphEdge {
  /** Source node ID. */
  from: string;

  /** Target node ID. */
  to: string;

  /** Relationship type. */
  relation: "detected_in" | "resolved_to" | "tokenized_as" | "derived_from";
}

export class PrivacyGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: GraphEdge[] = [];

  // ── Node operations ────────────────────────────────────────────────

  /** Add or update a node. */
  addNode(
    id: string,
    kind: GraphNode["kind"],
    taint: TaintInfo,
  ): void {
    this.nodes.set(id, { id, kind, taint });
  }

  /** Get a node by ID. */
  getNode(id: string): GraphNode | undefined {
    return this.nodes.get(id);
  }

  /** Check if a node is tainted. */
  isTainted(id: string): boolean {
    return this.nodes.get(id)?.taint.tainted ?? false;
  }

  /** Get taint info for a node. */
  getTaint(id: string): TaintInfo {
    return (
      this.nodes.get(id)?.taint ?? {
        tainted: false,
        sourceEntityIds: [],
        reason: "unknown node",
      }
    );
  }

  // ── Edge operations ────────────────────────────────────────────────

  /** Add a directed edge between two nodes. */
  addEdge(from: string, to: string, relation: GraphEdge["relation"]): void {
    this.edges.push({ from, to, relation });
  }

  /** Get all edges originating from a node. */
  getOutgoingEdges(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.from === nodeId);
  }

  /** Get all edges pointing to a node. */
  getIncomingEdges(nodeId: string): GraphEdge[] {
    return this.edges.filter((e) => e.to === nodeId);
  }

  // ── Taint propagation ──────────────────────────────────────────────

  /**
   * Mark a DOM element as tainted because a PII entity was detected in it.
   */
  taintElement(elementId: string, entityId: string, entityType: EntityType): void {
    // Element node
    const existing = this.nodes.get(elementId);
    if (existing) {
      existing.taint.tainted = true;
      if (!existing.taint.sourceEntityIds.includes(entityId)) {
        existing.taint.sourceEntityIds.push(entityId);
      }
      existing.taint.reason = `Contains ${entityType} data`;
    } else {
      this.addNode(elementId, "element", {
        tainted: true,
        sourceEntityIds: [entityId],
        reason: `Contains ${entityType} data`,
      });
    }

    // Entity node
    if (!this.nodes.has(entityId)) {
      this.addNode(entityId, "entity", {
        tainted: true,
        sourceEntityIds: [entityId],
        reason: `PII entity: ${entityType}`,
      });
    }

    // Edge: entity detected_in element
    this.addEdge(entityId, elementId, "detected_in");
  }

  /**
   * Record that an entity has been tokenized.
   * The token node inherits the taint until approved for the destination.
   */
  recordTokenization(entityId: string, token: string): void {
    this.addNode(token, "token", {
      tainted: true,
      sourceEntityIds: [entityId],
      reason: `Token for entity ${entityId}`,
    });
    this.addEdge(entityId, token, "tokenized_as");
  }

  /**
   * Mark a token as safe (taint cleared) after approved transformation.
   */
  clearTaint(nodeId: string, reason: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.taint = {
        tainted: false,
        sourceEntityIds: node.taint.sourceEntityIds,
        reason,
      };
    }
  }

  // ── Query ──────────────────────────────────────────────────────────

  /** Get all tainted element IDs. */
  getTaintedElements(): string[] {
    const result: string[] = [];
    for (const [id, node] of this.nodes) {
      if (node.kind === "element" && node.taint.tainted) {
        result.push(id);
      }
    }
    return result;
  }

  /** Get all entity IDs associated with an element. */
  getEntitiesForElement(elementId: string): string[] {
    return this.getIncomingEdges(elementId)
      .filter((e) => e.relation === "detected_in")
      .map((e) => e.from);
  }

  /** Clear the entire graph. */
  clear(): void {
    this.nodes.clear();
    this.edges = [];
  }
}
