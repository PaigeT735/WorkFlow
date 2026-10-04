import type { ApplicationGraph, Flow, GraphEdge, GraphNode, NodeType } from "./types.ts";

/**
 * Adjacency indexes over a parsed graph. Built once per document.
 */
export class GraphIndex {
  readonly graph: ApplicationGraph;
  readonly nodes: GraphNode[];
  readonly edges: GraphEdge[];
  readonly flows: Flow[];
  private readonly byId: Map<string, GraphNode>;
  private readonly children: Map<string, GraphNode[]>;
  private readonly outgoing: Map<string, GraphEdge[]>;
  private readonly incoming: Map<string, GraphEdge[]>;
  private readonly edgesById: Map<string, GraphEdge>;

  constructor(graph: ApplicationGraph) {
    this.graph = graph;
    this.nodes = graph.nodes;
    this.edges = graph.edges;
    this.flows = graph.flows;
    this.byId = new Map(graph.nodes.map((node) => [node.id, node]));
    this.edgesById = new Map(graph.edges.map((edge) => [edge.id, edge]));
    this.children = new Map();
    this.outgoing = new Map();
    this.incoming = new Map();

    for (const node of graph.nodes) {
      this.children.set(node.id, []);
      this.outgoing.set(node.id, []);
      this.incoming.set(node.id, []);
    }
    for (const node of graph.nodes) {
      if (!node.parentId) continue;
      this.children.get(node.parentId)?.push(node);
    }
    for (const edge of graph.edges) {
      this.outgoing.get(edge.source)?.push(edge);
      this.incoming.get(edge.target)?.push(edge);
    }
  }

  node(id: string): GraphNode {
    const found = this.byId.get(id);
    if (!found) {
      throw new Error(`Unknown node "${id}".`);
    }
    return found;
  }

  tryNode(id: string): GraphNode | null {
    return this.byId.get(id) ?? null;
  }

  edge(id: string): GraphEdge | null {
    return this.edgesById.get(id) ?? null;
  }

  flow(id: string): Flow | null {
    return this.flows.find((item) => item.id === id) ?? null;
  }

  childrenOf(id: string): GraphNode[] {
    return this.children.get(id) ?? [];
  }

  outgoingOf(id: string): GraphEdge[] {
    return this.outgoing.get(id) ?? [];
  }

  incomingOf(id: string): GraphEdge[] {
    return this.incoming.get(id) ?? [];
  }

  nodesOfType(type: NodeType): GraphNode[] {
    return this.nodes.filter((node) => node.type === type);
  }

  /** The page that contains this node, or the node itself when it is a page. */
  owningPage(id: string): GraphNode | null {
    let current = this.tryNode(id);
    while (current) {
      if (current.type === "page") return current;
      current = current.parentId ? this.tryNode(current.parentId) : null;
    }
    return null;
  }

  /**
   * Follow expandable edges outward. Stops at pages so one chain does not
   * swallow the rest of the app. Does not walk `contains` (nesting does that).
   */
  downstream(startId: string): Set<string> {
    const seen = new Set<string>();
    const stack = [startId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const node = this.tryNode(id);
      if (!node || (node.type === "page" && id !== startId)) continue;
      for (const edge of this.outgoingOf(id)) {
        if (!followsChain(edge)) continue;
        const target = this.tryNode(edge.target);
        if (!target || seen.has(target.id)) continue;
        if (edge.kind === "navigates_to" && target.type === "page") {
          seen.add(target.id);
          continue;
        }
        stack.push(target.id);
      }
    }
    return seen;
  }

  /** Walk callers back toward the surface. Includes pages, then stops. */
  upstream(startId: string): Set<string> {
    const seen = new Set<string>();
    const stack = [startId];
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const node = this.tryNode(id);
      if (!node || (node.type === "page" && id !== startId)) continue;
      for (const edge of this.incomingOf(id)) {
        if (edge.kind === "contains") continue;
        const source = this.tryNode(edge.source);
        if (!source || seen.has(source.id)) continue;
        if (source.type === "page") {
          seen.add(source.id);
          continue;
        }
        stack.push(source.id);
      }
    }
    return seen;
  }

  ancestorIds(id: string): string[] {
    const ids: string[] = [];
    let current = this.tryNode(id);
    while (current?.parentId) {
      ids.push(current.parentId);
      current = this.tryNode(current.parentId);
    }
    return ids;
  }
}

export function followsChain(edge: GraphEdge): boolean {
  if (edge.kind === "contains") return false;
  if (edge.expand === false) return false;
  if (edge.skeleton) return false;
  return true;
}
