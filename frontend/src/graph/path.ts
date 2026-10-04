import { followsChain, GraphIndex } from "./indexGraph.ts";
import type { GraphNode } from "./types.ts";

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
    // A page is what its users can do on it: follow each of those actions.
    for (const child of descendantsOf(index, focusId)) {
      nodes.add(child.id);
      walk(index, child.id, "out", nodes, edges);
    }
    for (const id of [...nodes]) {
      for (const ancestor of index.ancestorIds(id)) nodes.add(ancestor);
    }
    return { nodes, edges };
  }

  if (start.type === "database") {
    // A database is what reads and writes its tables.
    for (const child of descendantsOf(index, focusId)) {
      nodes.add(child.id);
      walk(index, child.id, "in", nodes, edges);
      walk(index, child.id, "out", nodes, edges);
    }
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

function descendantsOf(index: GraphIndex, id: string): GraphNode[] {
  const out: GraphNode[] = [];
  const stack = [...index.childrenOf(id)];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) continue;
    out.push(next);
    stack.push(...index.childrenOf(next.id));
  }
  return out;
}

/**
 * The order a trace walks through the highlighted path, as steps of node ids.
 *
 * - A flow walks its own story order.
 * - A node walks from its furthest caller, through itself, to the furthest
 *   thing it reaches. Nodes at the same distance share a step (a route that
 *   both checks auth and calls a handler lights both at once).
 *
 * Only edges already in the highlight are followed, so a trace never shows a
 * relationship the analyzer did not record.
 */
export function traceFor(
  index: GraphIndex,
  focusId: string | null,
  flowId: string | null,
): string[][] {
  if (flowId && !focusId) {
    const flow = index.flow(flowId);
    if (!flow) return [];
    return flow.nodeIds
      .filter((id) => {
        const type = index.tryNode(id)?.type;
        return type != null && type !== "application";
      })
      .map((id) => [id]);
  }

  const highlight = highlightFor(index, focusId, null);
  if (!highlight || !focusId) return [];
  const start = index.node(focusId);

  // A page's actions come after the page; a database's tables sit with it.
  const members = start.type === "page" || start.type === "database" ? descendantsOf(index, focusId) : [];
  const memberDepth = start.type === "page" ? 1 : 0;
  const down = new Map<string, number>([[focusId, 0]]);
  const queue: string[] = [focusId];
  for (const child of members) {
    if (!down.has(child.id)) {
      down.set(child.id, memberDepth);
      queue.push(child.id);
    }
  }
  while (queue.length > 0) {
    const id = queue.shift();
    if (id == null) continue;
    const depth = down.get(id) ?? 0;
    for (const edge of index.outgoingOf(id)) {
      if (!highlight.edges.has(edge.id) || down.has(edge.target)) continue;
      if (edge.kind === "defined_in") continue;
      down.set(edge.target, depth + 1);
      queue.push(edge.target);
    }
  }

  const up = new Map<string, number>();
  const back: string[] = [focusId, ...members.map((child) => child.id)];
  const upDepth = new Map<string, number>(back.map((id) => [id, 0]));
  while (back.length > 0) {
    const id = back.shift();
    if (id == null) continue;
    const depth = upDepth.get(id) ?? 0;
    for (const edge of index.incomingOf(id)) {
      if (!highlight.edges.has(edge.id) || edge.kind === "defined_in") continue;
      if (upDepth.has(edge.source) || down.has(edge.source)) continue;
      upDepth.set(edge.source, depth + 1);
      up.set(edge.source, depth + 1);
      back.push(edge.source);
    }
  }

  const steps: string[][] = [];
  const furthestUp = Math.max(0, ...up.values());
  for (let distance = furthestUp; distance >= 1; distance -= 1) {
    const step = [...up.entries()].filter(([, d]) => d === distance).map(([id]) => id);
    if (step.length > 0) steps.push(step);
  }
  const furthestDown = Math.max(0, ...down.values());
  for (let distance = 0; distance <= furthestDown; distance += 1) {
    const step = [...down.entries()].filter(([, d]) => d === distance).map(([id]) => id);
    if (step.length > 0) steps.push(step);
  }
  return steps;
}
