import { followsChain, GraphIndex } from "./indexGraph.ts";

export interface Highlight {
  nodes: Set<string>;
  edges: Set<string>;
}

/**
 * The connected path for a selection. Everything else on the map is subdued,
 * not removed. A flow selection uses the flow's own steps.
 */
export function highlightFor(
  index: GraphIndex,
  focusId: string | null,
  flowId: string | null,
): Highlight | null {
  if (flowId && !focusId) {
    const flow = index.flow(flowId);
    if (!flow) return null;
    const nodes = new Set<string>(flow.nodeIds);
    const edges = new Set<string>(flow.edgeIds);
    for (const id of flow.nodeIds) {
      for (const ancestor of index.ancestorIds(id)) nodes.add(ancestor);
    }
    if (edges.size === 0) {
      for (const edge of index.edges) {
        if (edge.kind === "contains") continue;
        if (nodes.has(edge.source) && nodes.has(edge.target)) edges.add(edge.id);
      }
    }
    return { nodes, edges };
  }

  if (!focusId || !index.tryNode(focusId)) return null;
  return connectedPath(index, focusId);
}

function connectedPath(index: GraphIndex, focusId: string): Highlight {
  const nodes = new Set<string>([focusId]);
  const edges = new Set<string>();
  const start = index.node(focusId);

  for (const ancestor of index.ancestorIds(focusId)) nodes.add(ancestor);

  if (start.type === "page") {
    connectPages(index, focusId, nodes, edges);
    for (const child of index.childrenOf(focusId)) nodes.add(child.id);
    return { nodes, edges };
  }

  walk(index, focusId, "out", nodes, edges);
  walk(index, focusId, "in", nodes, edges);

  for (const edge of index.outgoingOf(focusId)) {
    if (edge.kind !== "defined_in") continue;
    nodes.add(edge.target);
    edges.add(edge.id);
    for (const ancestor of index.ancestorIds(edge.target)) nodes.add(ancestor);
  }

  const page = index.owningPage(focusId);
  if (page) {
    nodes.add(page.id);
    connectPages(index, page.id, nodes, edges);
  }

  for (const id of [...nodes]) {
    for (const ancestor of index.ancestorIds(id)) nodes.add(ancestor);
  }

  return { nodes, edges };
}

function connectPages(
  index: GraphIndex,
  pageId: string,
  nodes: Set<string>,
  edges: Set<string>,
): void {
  const incident = [...index.outgoingOf(pageId), ...index.incomingOf(pageId)];
  for (const edge of incident) {
    if (edge.kind !== "navigates_to" && edge.kind !== "authenticates") continue;
    const otherId = edge.source === pageId ? edge.target : edge.source;
    const other = index.tryNode(otherId);
    if (!other || other.type !== "page") continue;
    nodes.add(other.id);
    edges.add(edge.id);
  }
}

function walk(
  index: GraphIndex,
  startId: string,
  direction: "out" | "in",
  nodes: Set<string>,
  edges: Set<string>,
): void {
  const seen = new Set<string>([startId]);
  const stack = [startId];
  while (stack.length > 0) {
    const id = stack.pop();
    if (!id) continue;
    const node = index.tryNode(id);
    if (!node) continue;
    if (node.type === "page" && id !== startId) continue;

    const incident = direction === "out" ? index.outgoingOf(id) : index.incomingOf(id);
    for (const edge of incident) {
      if (direction === "out") {
        if (!followsChain(edge)) continue;
      } else if (edge.kind === "contains") {
        continue;
      }
      const nextId = direction === "out" ? edge.target : edge.source;
      const next = index.tryNode(nextId);
      if (!next) continue;
      if (direction === "out" && edge.kind === "navigates_to" && next.type === "page") {
        nodes.add(next.id);
        edges.add(edge.id);
        continue;
      }
      nodes.add(next.id);
      edges.add(edge.id);
      for (const ancestor of index.ancestorIds(next.id)) nodes.add(ancestor);
      if (next.type === "page") continue;
      if (!seen.has(next.id)) {
        seen.add(next.id);
        stack.push(next.id);
      }
    }
  }
}
