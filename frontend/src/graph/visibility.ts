import { GraphIndex } from "./indexGraph.ts";
import type { GraphNode, NodeType } from "./types.ts";

export type Depth = "overview" | "page" | "chain";

/** Category toggles. Components and interactions follow Pages. */
export interface Filters {
  pages: boolean;
  apis: boolean;
  backend: boolean;
  databases: boolean;
  external: boolean;
  auth: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  pages: true,
  apis: true,
  backend: true,
  databases: true,
  external: true,
  auth: true,
};

export interface VisibilityInput {
  depth: Depth;
  focusId: string | null;
  flowId: string | null;
  pinned: readonly string[];
  filters: Filters;
}

/**
 * Nodes on the map for this depth.
 *
 * - overview: top-level pages
 * - page: those pages, plus the children of pages the user opened
 * - chain: that surface, plus the call chain of the focused or pinned node
 *   and the callers that lead to it
 */
export function visibleNodeIds(index: GraphIndex, input: VisibilityInput): Set<string> {
  const visible = new Set<string>();
  const flow = input.flowId ? index.flow(input.flowId) : null;
  const chain = new Set<string>();

  if (input.depth === "chain") {
    const seeds = new Set<string>();
    for (const id of input.pinned) {
      const node = index.tryNode(id);
      if (node && isChainSeed(node)) seeds.add(id);
    }
    if (input.focusId) {
      const node = index.tryNode(input.focusId);
      if (node && isChainSeed(node)) seeds.add(input.focusId);
    }
    for (const seed of seeds) {
      for (const id of index.downstream(seed)) chain.add(id);
      for (const id of index.upstream(seed)) chain.add(id);
    }
    if (input.focusId) {
      for (const edge of index.outgoingOf(input.focusId)) {
        if (edge.kind === "defined_in") chain.add(edge.target);
      }
    }
    if (flow) {
      for (const id of flow.nodeIds) chain.add(id);
    }
  }

  const openPages = new Set<string>();
  if (input.depth !== "overview") {
    const reasons = new Set<string>([...input.pinned, ...chain]);
    if (input.focusId) reasons.add(input.focusId);
    if (flow && input.depth === "chain") {
      for (const id of flow.nodeIds) reasons.add(id);
    }
    for (const id of reasons) {
      const node = index.tryNode(id);
      if (!node) continue;
      if (node.type === "page") {
        if (input.pinned.includes(id) || input.focusId === id) openPages.add(id);
        continue;
      }
      const page = index.owningPage(id);
      if (page) openPages.add(page.id);
    }
  }

  for (const page of index.nodesOfType("page")) {
    if (page.parentId == null) visible.add(page.id);
  }

  for (const pageId of openPages) {
    visible.add(pageId);
    for (const child of index.childrenOf(pageId)) visible.add(child.id);
  }

  for (const id of chain) visible.add(id);

  if (input.focusId && index.tryNode(input.focusId)) {
    visible.add(input.focusId);
  }

  if (input.depth === "chain") {
    const databases = new Set<string>();
    for (const id of input.pinned) databases.add(id);
    if (input.focusId) databases.add(input.focusId);
    for (const id of databases) {
      const node = index.tryNode(id);
      if (node?.type !== "database") continue;
      visible.add(id);
      for (const child of index.childrenOf(id)) visible.add(child.id);
    }
  }

  for (const id of [...visible]) {
    for (const ancestor of index.ancestorIds(id)) visible.add(ancestor);
  }

  for (const id of [...visible]) {
    const node = index.tryNode(id);
    if (!node) {
      visible.delete(id);
      continue;
    }
    if (id !== input.focusId && !nodeAllowed(node, input.filters)) {
      visible.delete(id);
    }
  }

  return visible;
}

export function isChainSeed(node: GraphNode): boolean {
  return node.type !== "page";
}

export function nodeAllowed(node: GraphNode, filters: Filters): boolean {
  if (node.type === "error") return true;
  return filters[filterKey(node.type)];
}

function filterKey(type: NodeType): keyof Filters {
  switch (type) {
    case "application":
    case "page":
    case "component":
    case "interaction":
      return "pages";
    case "api":
      return "apis";
    case "service":
    case "function":
    case "file":
      return "backend";
    case "database":
    case "table":
      return "databases";
    case "external":
      return "external";
    case "auth":
      return "auth";
    case "error":
      return "pages";
  }
}
