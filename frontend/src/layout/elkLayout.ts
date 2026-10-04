import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { GraphIndex } from "../graph/indexGraph.ts";
import type { GraphNode } from "../graph/types.ts";

const elk = new ELK();

export const NODE_WIDTH = 252;

export interface PositionedNode {
  id: string;
  /** React Flow parent, or null when the node sits on the canvas. */
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutResult {
  nodes: PositionedNode[];
  /** Edge ids that should be drawn. Contains and redundant skeleton edges are omitted. */
  edgeIds: string[];
}

export function leafSize(
  node: GraphNode,
  childCount: number,
  expanded: boolean,
): { width: number; height: number } {
  const showCount =
    childCount > 0 &&
    !expanded &&
    (node.type === "page" || node.type === "database");
  return { width: NODE_WIDTH, height: showCount ? 108 : 86 };
}

/**
 * Layered layout of whatever is currently visible. Positions come from the
 * graph structure (ELK), never from hand-placed coordinates.
 */
export async function layoutVisible(
  index: GraphIndex,
  visible: ReadonlySet<string>,
): Promise<LayoutResult> {
  const edgeIds = drawableEdgeIds(index, visible);
  try {
    const nodes = await runLayout(index, visible, edgeIds, true);
    return { nodes, edgeIds };
  } catch {
    const nodes = await runLayout(index, visible, edgeIds, false);
    return { nodes, edgeIds };
  }
}

export function drawableEdgeIds(
  index: GraphIndex,
  visible: ReadonlySet<string>,
): string[] {
  const candidates = index.edges.filter(
    (edge) =>
      edge.kind !== "contains" &&
      visible.has(edge.source) &&
      visible.has(edge.target),
  );
  const specific = new Set(
    candidates.filter((edge) => !edge.skeleton).map((edge) => pairKey(edge.source, edge.target)),
  );
  return candidates
    .filter((edge) => !edge.skeleton || !specific.has(pairKey(edge.source, edge.target)))
    .map((edge) => edge.id);
}

async function runLayout(
  index: GraphIndex,
  visible: ReadonlySet<string>,
  edgeIds: readonly string[],
  compound: boolean,
): Promise<PositionedNode[]> {
  const clusters = new Set<string>();
  if (compound) {
    for (const id of visible) {
      const node = index.tryNode(id);
      if (!node || (node.type !== "page" && node.type !== "database")) continue;
      const kids = index.childrenOf(id).filter((child) => visible.has(child.id));
      if (kids.length > 0) clusters.add(id);
    }
  }

  const rootChildren: ElkNode[] = [];
  for (const id of visible) {
    const node = index.node(id);
    if (node.parentId && clusters.has(node.parentId) && visible.has(node.parentId)) {
      continue;
    }
    rootChildren.push(toElk(index, visible, clusters, id));
  }

  const edges: ElkExtendedEdge[] = edgeIds.map((id) => {
    const edge = index.edge(id);
    if (!edge) {
      throw new Error(`Missing edge ${id} during layout.`);
    }
    return { id, sources: [edge.source], targets: [edge.target] };
  });

  const graph: ElkNode = {
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "108",
      "elk.layered.spacing.edgeNodeBetweenLayers": "36",
      "elk.padding": "[top=12,left=12,bottom=12,right=12]",
      "elk.separateConnectedComponents": "true",
      "elk.spacing.componentComponent": "64",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeRouting": "ORTHOGONAL",
    },
    children: rootChildren,
    edges,
  };

  const laid = (await elk.layout(graph)) as ElkNode;
  const positions: PositionedNode[] = [];
  collect(laid, null, positions);
  if (positions.length !== visible.size) {
    throw new Error(
      `Layout produced ${positions.length} nodes for ${visible.size} visible nodes.`,
    );
  }
  return positions;
}

function toElk(
  index: GraphIndex,
  visible: ReadonlySet<string>,
  clusters: ReadonlySet<string>,
  id: string,
): ElkNode {
  const node = index.node(id);
  if (!clusters.has(id)) {
    const size = leafSize(node, index.childrenOf(id).length, false);
    return { id, width: size.width, height: size.height };
  }

  const children = index
    .childrenOf(id)
    .filter((child) => visible.has(child.id))
    .sort(compareSiblings)
    .map((child) => toElk(index, visible, clusters, child.id));

  return {
    id,
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.padding":
        node.type === "page"
          ? "[top=52,left=18,bottom=18,right=18]"
          : "[top=44,left=14,bottom=14,right=14]",
      "elk.spacing.nodeNode": "14",
      "elk.layered.spacing.nodeNodeBetweenLayers": "40",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children,
  };
}

function collect(node: ElkNode, parentId: string | null, into: PositionedNode[]): void {
  if (node.id !== "root") {
    const width = node.width ?? 0;
    const height = node.height ?? 0;
    if (width < 8 || height < 8) {
      throw new Error(`Layout gave "${node.id}" no size.`);
    }
    into.push({
      id: node.id,
      parentId,
      x: node.x ?? 0,
      y: node.y ?? 0,
      width,
      height,
    });
  }
  const nextParent = node.id === "root" ? null : node.id;
  for (const child of node.children ?? []) {
    collect(child, nextParent, into);
  }
}

function compareSiblings(a: GraphNode, b: GraphNode): number {
  return siblingRank(a) - siblingRank(b) || a.label.localeCompare(b.label);
}

function siblingRank(node: GraphNode): number {
  if (node.type === "interaction") return 0;
  if (node.type === "component") return 1;
  if (node.type === "table") return 2;
  return 3;
}

function pairKey(source: string, target: string): string {
  return `${source}>${target}`;
}

export function absolutePosition(
  positions: ReadonlyMap<string, PositionedNode>,
  id: string,
): { x: number; y: number; width: number; height: number } | null {
  const node = positions.get(id);
  if (!node) return null;
  let x = node.x;
  let y = node.y;
  let parentId = node.parentId;
  while (parentId) {
    const parent = positions.get(parentId);
    if (!parent) break;
    x += parent.x;
    y += parent.y;
    parentId = parent.parentId;
  }
  return { x, y, width: node.width, height: node.height };
}
