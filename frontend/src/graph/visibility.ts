import { GraphIndex } from "./indexGraph.ts";
import type { GraphNode } from "./types.ts";

/**
 * What the map draws.
 *
 * The whole architecture is on screen from the start: pages with what users
 * do on them, the API and logic behind them, and the data and services they
 * reach. Selection never adds or removes nodes; it only changes emphasis, so
 * the map stays still while the user explores it.
 *
 * - The application node is the header of the map, not a box on it.
 * - Source-file nodes stay in the inspector unless one is selected.
 * - A collapsed page hides its children (the page still shows a count).
 */
export interface VisibilityInput {
  collapsed: ReadonlySet<string>;
  focusId: string | null;
}

export function visibleNodeIds(index: GraphIndex, input: VisibilityInput): Set<string> {
  const visible = new Set<string>();
  for (const node of index.nodes) {
    if (node.type === "application") continue;
    if (node.type === "file" && node.id !== input.focusId) continue;
    const container = containerOf(index, node.id);
    if (container && input.collapsed.has(container) && node.id !== input.focusId) continue;
    visible.add(node.id);
  }
  return visible;
}

/**
 * The page or database a node is drawn inside, if any. Nodes nested more
 * deeply (a button inside a component) are drawn in their nearest page.
 */
export function containerOf(index: GraphIndex, id: string): string | null {
  let current = index.tryNode(id);
  let parentId = current?.parentId ?? null;
  while (parentId) {
    current = index.tryNode(parentId);
    if (!current) return null;
    if (isContainerType(current)) return current.id;
    parentId = current.parentId;
  }
  return null;
}

export function isContainerType(node: Pick<GraphNode, "type">): boolean {
  return node.type === "page" || node.type === "database";
}

/** Nodes that are drawn inside a container. */
export function containedIds(index: GraphIndex, containerId: string): string[] {
  return index.nodes
    .filter((node) => node.type !== "file" && containerOf(index, node.id) === containerId)
    .map((node) => node.id);
}

/**
 * Pages start collapsed only when opening every page would bury the overview.
 * Small applications show everything they do at once.
 */
export const EXPANDED_CHILD_LIMIT = 20;

export function defaultCollapsed(index: GraphIndex): Set<string> {
  const pages = index.nodesOfType("page").filter((page) => containedIds(index, page.id).length > 0);
  const total = pages.reduce((sum, page) => sum + containedIds(index, page.id).length, 0);
  if (total <= EXPANDED_CHILD_LIMIT) return new Set();
  return new Set(pages.map((page) => page.id));
}
