import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type { GraphIndex } from "../graph/indexGraph.ts";
import { LANES, laneIndex, type LaneId } from "../graph/lanes.ts";
import type { GraphNode } from "../graph/types.ts";
import { containerOf } from "../graph/visibility.ts";

const elk = new ELK();

/** A node drawn on its own. */
export const CARD = { width: 240, height: 66 } as const;
/** A node drawn inside a page or database. */
export const CHILD = { width: 212, height: 58 } as const;
const CLUSTER = { padX: 14, header: 52, padBottom: 14, gap: 22, maxCols: 3 } as const;

/** Lane titles sit in a column on the left of the map. */
export const LANE_LABEL_WIDTH = 196;
const LANE_PAD_Y = 28;
const LANE_PAD_X = 36;
const EMPTY_LANE_HEIGHT = 96;
const LOOSE_GAP_X = 20;
const LOOSE_GAP_Y = 18;
const LOOSE_OFFSET = 88;

export interface PositionedNode {
  id: string;
  /** Container drawn around this node, or null when it sits in a lane. */
  parentId: string | null;
  /** Relative to the container when there is one. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LaneBand {
  id: LaneId;
  y: number;
  height: number;
  /** Top-level items in this lane. Zero means nothing of this kind was detected. */
  count: number;
}

/**
 * An analyzer edge whose end is inside a collapsed page, drawn from that page
 * instead. It stands for the real edges in `edgeIds`; nothing is inferred.
 */
export interface LiftedEdge {
  id: string;
  source: string;
  target: string;
  edgeIds: string[];
}

export interface LayoutResult {
  nodes: PositionedNode[];
  /** Edge ids that should be drawn. `contains` and redundant skeleton edges are omitted. */
  edgeIds: string[];
  lifted: LiftedEdge[];
  lanes: LaneBand[];
  width: number;
  height: number;
}

interface Item {
  id: string;
  node: GraphNode;
  lane: number;
  width: number;
  height: number;
  children: PositionedNode[];
}

/**
 * Positions come from the graph's own structure, never from hand-placed
 * coordinates:
 *
 * 1. Every visible node goes in a lane by type. Children of a page or
 *    database are packed inside it.
 * 2. Items joined by an edge are laid out top to bottom with ELK, with the
 *    lanes as partitions so the flow always moves down through them.
 * 3. Items with no recorded edge are packed in a grid beside that lane's
 *    flow, so an unconnected endpoint never stretches the map sideways.
 */
export async function layoutLanes(
  index: GraphIndex,
  visible: ReadonlySet<string>,
): Promise<LayoutResult> {
  const edgeIds = drawableEdgeIds(index, visible);
  const order = new Map(index.nodes.map((node, position) => [node.id, position]));

  const topOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const id of visible) {
    const container = containerOf(index, id);
    if (container && visible.has(container)) {
      topOf.set(id, container);
      const list = childrenOf.get(container) ?? [];
      list.push(id);
      childrenOf.set(container, list);
    } else {
      topOf.set(id, id);
    }
  }

  const items = new Map<string, Item>();
  for (const id of visible) {
    if (topOf.get(id) !== id) continue;
    const node = index.node(id);
    const kids = childrenOf.get(id) ?? [];
    const packed = kids.length > 0 ? packChildren(index, kids, edgeIds, order) : null;
    items.set(id, {
      id,
      node,
      lane: laneIndex(node.type),
      width: packed?.width ?? CARD.width,
      height: packed?.height ?? CARD.height,
      children: packed?.children ?? [],
    });
  }

  const lifted = liftedEdges(index, visible, edgeIds);
  const pairs = new Map<string, { source: string; target: string }>();
  const linked = new Set<string>();
  const ends = [
    ...edgeIds.map((id) => index.edge(id)).filter((edge) => edge != null),
    ...lifted,
  ];
  for (const edge of ends) {
    const source = topOf.get(edge.source);
    const target = topOf.get(edge.target);
    if (!source || !target || source === target) continue;
    linked.add(source);
    linked.add(target);
    const a = items.get(source);
    const b = items.get(target);
    if (!a || !b || a.lane > b.lane) continue;
    pairs.set(`${source}>${target}`, { source, target });
  }

  const sorted = [...items.values()].sort(
    (a, b) => a.lane - b.lane || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  const flowing = sorted.filter((item) => linked.has(item.id));
  const loose = sorted.filter((item) => !linked.has(item.id));

  let placed = new Map<string, { x: number; y: number }>();
  try {
    placed = await layeredPositions(flowing, [...pairs.values()]);
  } catch {
    loose.unshift(...flowing);
    flowing.length = 0;
  }

  const contentX = LANE_LABEL_WIDTH + LANE_PAD_X;
  let flowMinX = Number.POSITIVE_INFINITY;
  let flowMaxX = Number.NEGATIVE_INFINITY;
  for (const item of flowing) {
    const at = placed.get(item.id);
    if (!at) continue;
    flowMinX = Math.min(flowMinX, at.x);
    flowMaxX = Math.max(flowMaxX, at.x + item.width);
  }
  const hasFlow = flowing.length > 0 && Number.isFinite(flowMinX);
  const looseX = hasFlow ? contentX + (flowMaxX - flowMinX) + LOOSE_OFFSET : contentX;

  const nodes: PositionedNode[] = [];
  const lanes: LaneBand[] = [];
  let laneTop = 0;
  let right = contentX + CARD.width;

  LANES.forEach((lane, laneNumber) => {
    const inFlow = flowing.filter((item) => item.lane === laneNumber);
    const inLoose = loose.filter((item) => item.lane === laneNumber);

    let flowTop = Number.POSITIVE_INFINITY;
    let flowBottom = Number.NEGATIVE_INFINITY;
    for (const item of inFlow) {
      const at = placed.get(item.id);
      if (!at) continue;
      flowTop = Math.min(flowTop, at.y);
      flowBottom = Math.max(flowBottom, at.y + item.height);
    }
    const flowHeight = inFlow.length > 0 ? flowBottom - flowTop : 0;

    const columns = hasFlow
      ? Math.min(inLoose.length, 3)
      : Math.min(6, Math.max(1, Math.ceil(Math.sqrt(inLoose.length * 2.2))));
    const shelf = shelfPack(inLoose, columns * (CARD.width + LOOSE_GAP_X));

    const count = inFlow.length + inLoose.length;
    const contentHeight = Math.max(flowHeight, shelf.height);
    const height = count === 0 ? EMPTY_LANE_HEIGHT : contentHeight + LANE_PAD_Y * 2;
    const top = laneTop + LANE_PAD_Y;

    for (const item of inFlow) {
      const at = placed.get(item.id);
      if (!at) continue;
      const x = contentX + (at.x - flowMinX);
      const y = top + (at.y - flowTop);
      nodes.push({ id: item.id, parentId: null, x, y, width: item.width, height: item.height });
      nodes.push(...item.children);
      right = Math.max(right, x + item.width);
    }
    for (const item of inLoose) {
      const at = shelf.positions.get(item.id);
      if (!at) continue;
      const x = looseX + at.x;
      const y = top + at.y;
      nodes.push({ id: item.id, parentId: null, x, y, width: item.width, height: item.height });
      nodes.push(...item.children);
      right = Math.max(right, x + item.width);
    }

    lanes.push({ id: lane.id, y: laneTop, height, count });
    laneTop += height;
  });

  return { nodes, edgeIds, lifted, lanes, width: right + LANE_PAD_X, height: laneTop };
}

async function layeredPositions(
  items: Item[],
  pairs: { source: string; target: string }[],
): Promise<Map<string, { x: number; y: number }>> {
  const positions = new Map<string, { x: number; y: number }>();
  if (items.length === 0) return positions;

  const children: ElkNode[] = items.map((item) => ({
    id: item.id,
    width: item.width,
    height: item.height,
    layoutOptions: { "elk.partitioning.partition": String(item.lane) },
  }));
  const edges: ElkExtendedEdge[] = pairs.map((pair, position) => ({
    id: `l${position}`,
    sources: [pair.source],
    targets: [pair.target],
  }));

  const laid = (await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "DOWN",
      "elk.partitioning.activate": "true",
      "elk.separateConnectedComponents": "false",
      "elk.spacing.nodeNode": "40",
      "elk.layered.spacing.nodeNodeBetweenLayers": "50",
      // Place each step as close to the user action that leads to it as possible,
      // so a route's auth check and its handler sit side by side.
      "elk.layered.layering.strategy": "LONGEST_PATH_SOURCE",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.padding": "[top=0,left=0,bottom=0,right=0]",
    },
    children,
    edges,
  })) as ElkNode;

  for (const child of laid.children ?? []) {
    positions.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }
  if (positions.size !== items.length) {
    throw new Error(`Layout placed ${positions.size} of ${items.length} items.`);
  }
  return positions;
}

/** Rows, left to right, wrapping at `maxWidth`. */
function shelfPack(
  items: Item[],
  maxWidth: number,
): { positions: Map<string, { x: number; y: number }>; height: number } {
  const positions = new Map<string, { x: number; y: number }>();
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const item of items) {
    if (x > 0 && x + item.width > maxWidth) {
      x = 0;
      y += rowHeight + LOOSE_GAP_Y;
      rowHeight = 0;
    }
    positions.set(item.id, { x, y });
    x += item.width + LOOSE_GAP_X;
    rowHeight = Math.max(rowHeight, item.height);
  }
  return { positions, height: items.length > 0 ? y + rowHeight : 0 };
}

/**
 * Children of a page or database in a small grid. A child that triggers a
 * sibling is placed before it, so "Button → Create Project" reads left to right.
 */
function packChildren(
  index: GraphIndex,
  ids: string[],
  edgeIds: readonly string[],
  order: Map<string, number>,
): { width: number; height: number; children: PositionedNode[] } {
  const members = new Set(ids);
  const ranked = [...ids].sort((a, b) => {
    const nodeA = index.node(a);
    const nodeB = index.node(b);
    return (
      siblingRank(nodeA) - siblingRank(nodeB) ||
      (order.get(a) ?? 0) - (order.get(b) ?? 0)
    );
  });

  const before = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  for (const edgeId of edgeIds) {
    const edge = index.edge(edgeId);
    if (!edge || !members.has(edge.source) || !members.has(edge.target)) continue;
    before.get(edge.target)?.add(edge.source);
  }
  const arranged: string[] = [];
  const placed = new Set<string>();
  while (arranged.length < ranked.length) {
    const next =
      ranked.find(
        (id) => !placed.has(id) && [...(before.get(id) ?? [])].every((dep) => placed.has(dep)),
      ) ?? ranked.find((id) => !placed.has(id));
    if (!next) break;
    arranged.push(next);
    placed.add(next);
  }

  const count = arranged.length;
  const columns = count <= CLUSTER.maxCols ? count : count === 4 ? 2 : CLUSTER.maxCols;
  const rows = Math.ceil(count / columns);
  const width = Math.max(
    CARD.width,
    CLUSTER.padX * 2 + columns * CHILD.width + (columns - 1) * CLUSTER.gap,
  );
  const height = CLUSTER.header + rows * CHILD.height + (rows - 1) * CLUSTER.gap + CLUSTER.padBottom;
  const children = arranged.map((id, position) => {
    const column = position % columns;
    const row = Math.floor(position / columns);
    const parent = index.node(id);
    return {
      id,
      parentId: containerOf(index, parent.id),
      x: CLUSTER.padX + column * (CHILD.width + CLUSTER.gap),
      y: CLUSTER.header + row * (CHILD.height + CLUSTER.gap),
      width: CHILD.width,
      height: CHILD.height,
    };
  });
  return { width, height, children };
}

function siblingRank(node: GraphNode): number {
  if (node.type === "component") return 0;
  if (node.type === "interaction") return 1;
  if (node.type === "table") return 2;
  return 3;
}

export function drawableEdgeIds(index: GraphIndex, visible: ReadonlySet<string>): string[] {
  const candidates = index.edges.filter(
    (edge) => edge.kind !== "contains" && visible.has(edge.source) && visible.has(edge.target),
  );
  const specific = new Set(
    candidates.filter((edge) => !edge.skeleton).map((edge) => pairKey(edge.source, edge.target)),
  );
  return candidates
    .filter((edge) => !edge.skeleton || !specific.has(pairKey(edge.source, edge.target)))
    .map((edge) => edge.id);
}

function liftedEdges(
  index: GraphIndex,
  visible: ReadonlySet<string>,
  drawn: readonly string[],
): LiftedEdge[] {
  const proxy = (id: string): string | null => {
    if (visible.has(id)) return id;
    const container = containerOf(index, id);
    return container && visible.has(container) ? container : null;
  };
  const direct = new Set(
    drawn
      .map((id) => index.edge(id))
      .filter((edge) => edge != null)
      .map((edge) => pairKey(edge.source, edge.target)),
  );
  const lifted = new Map<string, LiftedEdge>();
  for (const edge of index.edges) {
    if (edge.kind === "contains" || edge.kind === "defined_in") continue;
    if (visible.has(edge.source) && visible.has(edge.target)) continue;
    const source = proxy(edge.source);
    const target = proxy(edge.target);
    if (!source || !target || source === target) continue;
    const key = pairKey(source, target);
    if (direct.has(key)) continue;
    const entry = lifted.get(key) ?? { id: `via:${key}`, source, target, edgeIds: [] };
    entry.edgeIds.push(edge.id);
    lifted.set(key, entry);
  }
  return [...lifted.values()];
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
