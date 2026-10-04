import {
  MarkerType,
  ReactFlow,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphIndex } from "../graph/indexGraph.ts";
import { TYPE_GROUPS } from "../graph/lanes.ts";
import type { Highlight } from "../graph/path.ts";
import { containerOf } from "../graph/visibility.ts";
import { absolutePosition, layoutLanes, type LayoutResult, type PositionedNode } from "../layout/laneLayout.ts";
import { useMap } from "../state/mapStore.tsx";
import { useTheme, type Theme } from "../state/theme.ts";
import { MapEdge, type EdgeState, type MapEdgeData } from "./MapEdge.tsx";
import {
  CardNode,
  ChildNode,
  ClusterNode,
  LaneNode,
  type LaneNodeData,
  type MapNodeData,
  type NodeState,
} from "./MapNode.tsx";

const nodeTypes = { card: CardNode, child: ChildNode, cluster: ClusterNode, lane: LaneNode };
const edgeTypes = { flow: MapEdge };

/** Must match --inspector-width in index.css. */
export const INSPECTOR_WIDTH = 392;

/** Lane bands run well past the content so they read as full-width swimlanes. */
const LANE_BLEED = 4000;

/** Arrowhead colours; the strokes themselves come from index.css. Keep the two in step. */
const EDGE_COLOR: Record<Theme, Record<EdgeState, string>> = {
  dark: {
    idle: "#4b5361",
    path: "#7aa7ff",
    pending: "#353c48",
    dim: "#262b33",
    near: "#9aa4b2",
    quiet: "#2d333c",
  },
  light: {
    idle: "#aab2bd",
    path: "#2f6bdf",
    pending: "#d3d8de",
    dim: "#e2e5e9",
    near: "#59626e",
    quiet: "#dadee3",
  },
};

interface Model {
  key: string;
  layout: LayoutResult;
  positions: Map<string, PositionedNode>;
}

export function ApplicationMap() {
  const map = useMap();
  const flow = useReactFlow();
  const hostRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const model = useLayout(map.index, map.visible);
  const zoom = useStore((state) => state.transform[2]);
  const { theme } = useTheme();

  const elements = useMemo(() => {
    if (!map.index || !model) return { nodes: [] as Node[], edges: [] as Edge<MapEdgeData>[] };
    return toElements(map, model, hoverId, theme);
  }, [map, model, hoverId, theme]);

  const panelOpen = Boolean(map.focusId || map.flowId);
  const cameraRef = useRef({ panelOpen, sourceOpen: map.sourceOpen, flows: (map.index?.flows.length ?? 0) > 0 });
  cameraRef.current = { panelOpen, sourceOpen: map.sourceOpen, flows: (map.index?.flows.length ?? 0) > 0 };

  useEffect(() => {
    if (!model) return;
    const request = map.viewRequest;
    const host = hostRef.current;
    const width = host?.clientWidth ?? window.innerWidth;
    const height = host?.clientHeight ?? window.innerHeight;
    const camera = cameraRef.current;
    const sourceWidth = camera.sourceOpen ? Math.min(680, width * 0.44) + 12 : 0;
    const padding = {
      top: camera.flows ? 76 : 40,
      bottom: 84,
      left: 32,
      right: (camera.panelOpen ? INSPECTOR_WIDTH + 28 : 32) + sourceWidth,
    };
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce || request.reason === "load" ? 0 : 450;
    const viewport = flow.getViewport();

    let bounds: Box | null;
    let maxZoom = 1;
    if (request.reason === "select") {
      const wanted = request.nodeIds.filter((id) => model.positions.has(id));
      bounds = boundsOf(model.positions, wanted);
      if (!bounds) return;
      const left = bounds.x * viewport.zoom + viewport.x;
      const top = bounds.y * viewport.zoom + viewport.y;
      const right = (bounds.x + bounds.width) * viewport.zoom + viewport.x;
      const bottom = (bounds.y + bounds.height) * viewport.zoom + viewport.y;
      const onScreen =
        left >= padding.left - 8 &&
        top >= padding.top - 8 &&
        right <= width - padding.right + 8 &&
        bottom <= height - padding.bottom + 8;
      if (onScreen) return;
      maxZoom = Math.min(1.05, Math.max(viewport.zoom, 0.8));
    } else {
      // The whole map, lane titles included.
      bounds = { x: 12, y: 0, width: model.layout.width - 12, height: model.layout.height };
    }

    const availableWidth = Math.max(120, width - padding.left - padding.right);
    const availableHeight = Math.max(120, height - padding.top - padding.bottom);
    const zoom = clamp(
      Math.min(availableWidth / bounds.width, availableHeight / bounds.height),
      0.25,
      maxZoom,
    );
    const x = padding.left + (availableWidth - bounds.width * zoom) / 2 - bounds.x * zoom;
    const y = padding.top + (availableHeight - bounds.height * zoom) / 2 - bounds.y * zoom;
    const frame = window.requestAnimationFrame(() => {
      void flow.setViewport({ x, y, zoom }, { duration });
    });
    return () => window.cancelAnimationFrame(frame);
    // The camera moves on a request or a new layout, not on every hover.
  }, [flow, map.viewRequest, model]);

  const scale = zoom < 0.55 ? "is-far" : zoom < 0.8 ? "is-mid" : "is-near";

  return (
    <div className={`map-canvas ${scale}`} ref={hostRef} data-testid="map-canvas">
      <ReactFlow
        nodes={elements.nodes}
        edges={elements.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_event, node) => {
          if (node.type === "lane") {
            map.clearSelection();
            return;
          }
          map.selectNode(node.id);
        }}
        onNodeMouseEnter={(_event, node) => {
          if (node.type !== "lane") setHoverId(node.id);
        }}
        onNodeMouseLeave={(_event, node) => {
          setHoverId((current) => (current === node.id ? null : current));
        }}
        onPaneClick={() => map.clearSelection()}
        minZoom={0.2}
        maxZoom={1.75}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        attributionPosition="bottom-left"
        colorMode={theme}
      />
    </div>
  );
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function boundsOf(
  positions: ReadonlyMap<string, PositionedNode>,
  ids: readonly string[],
): Box | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const id of ids) {
    const box = absolutePosition(positions, id);
    if (!box) continue;
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function useLayout(index: GraphIndex | null, visible: Set<string>): Model | null {
  const key = useMemo(() => [...visible].sort().join("|"), [visible]);
  const [model, setModel] = useState<Model | null>(null);

  useEffect(() => {
    if (!index) return;
    let cancel = false;
    layoutLanes(index, visible)
      .then((layout) => {
        if (cancel) return;
        setModel({ key, layout, positions: new Map(layout.nodes.map((node) => [node.id, node])) });
      })
      .catch(() => {
        if (!cancel) setModel(null);
      });
    return () => {
      cancel = true;
    };
    // `key` captures the visible set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, key]);

  return model;
}

interface Emphasis {
  nodes: Map<string, NodeState>;
  current: Set<string>;
  hovered: string | null;
  edges: Map<string, EdgeState>;
  drawing: Set<string>;
}

interface DrawnEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  kind: MapEdgeData["kind"];
  underlying: string[];
}

function drawnEdges(index: GraphIndex, model: Model): DrawnEdge[] {
  const out: DrawnEdge[] = [];
  for (const id of model.layout.edgeIds) {
    const edge = index.edge(id);
    if (!edge || !model.positions.has(edge.source) || !model.positions.has(edge.target)) continue;
    out.push({ id, source: edge.source, target: edge.target, label: edge.label, kind: edge.kind, underlying: [id] });
  }
  for (const lifted of model.layout.lifted) {
    if (!model.positions.has(lifted.source) || !model.positions.has(lifted.target)) continue;
    const first = index.edge(lifted.edgeIds[0] ?? "");
    const label =
      lifted.edgeIds.length === 1 && first
        ? `${first.label} · via ${index.tryNode(first.source)?.label ?? first.source}`
        : `${lifted.edgeIds.length} links inside`;
    out.push({
      id: lifted.id,
      source: lifted.source,
      target: lifted.target,
      label,
      kind: "lifted",
      underlying: lifted.edgeIds,
    });
  }
  return out;
}

function emphasisFor(
  map: ReturnType<typeof useMap>,
  model: Model,
  edges: DrawnEdge[],
  hoverId: string | null,
): Emphasis {
  const index = map.index;
  const nodes = new Map<string, NodeState>();
  const edgeStates = new Map<string, EdgeState>();
  const current = new Set<string>();
  const drawing = new Set<string>();
  const ids = [...model.positions.keys()];
  if (!index) return { nodes, current, hovered: hoverId, edges: edgeStates, drawing };

  const highlight: Highlight | null = map.highlight;
  if (highlight) {
    let lit: Set<string> | null = null;
    const trace = map.trace;
    if (trace) {
      const stepped = new Set(trace.steps.flat());
      lit = new Set([...highlight.nodes].filter((id) => !stepped.has(id)));
      for (let step = 0; step <= trace.at; step += 1) {
        for (const id of trace.steps[step] ?? []) {
          lit.add(id);
          let container = containerOf(index, id);
          while (container) {
            lit.add(container);
            container = containerOf(index, container);
          }
        }
      }
      if (trace.playing) for (const id of trace.steps[trace.at] ?? []) current.add(id);
    }
    for (const id of ids) {
      if (id === map.focusId) nodes.set(id, "selected");
      else if (highlight.nodes.has(id)) nodes.set(id, !lit || lit.has(id) ? "path" : "pending");
      else nodes.set(id, "dim");
    }
    for (const edge of edges) {
      const onPath = edge.underlying.some((id) => highlight.edges.has(id));
      if (!onPath) {
        edgeStates.set(edge.id, "dim");
        continue;
      }
      const reached = !lit || (lit.has(edge.source) && lit.has(edge.target));
      edgeStates.set(edge.id, reached ? "path" : "pending");
      if (reached && current.has(edge.target)) drawing.add(edge.id);
    }
    return { nodes, current, hovered: hoverId, edges: edgeStates, drawing };
  }

  if (map.emphasis) {
    const types = TYPE_GROUPS.find((group) => group.id === map.emphasis)?.types ?? [];
    const inGroup = new Set(ids.filter((id) => types.includes(index.node(id).type)));
    for (const id of [...inGroup]) {
      const container = containerOf(index, id);
      if (container) inGroup.add(container);
    }
    for (const id of ids) nodes.set(id, inGroup.has(id) ? "idle" : "dim");
    for (const edge of edges) {
      const both = inGroup.has(edge.source) && inGroup.has(edge.target);
      edgeStates.set(edge.id, both ? "idle" : "dim");
    }
    return { nodes, current, hovered: null, edges: edgeStates, drawing };
  }

  // Hovering something with no recorded edges leaves the map as it is.
  const touches = (id: string) => id === hoverId || model.positions.get(id)?.parentId === hoverId;
  const hoverHasLinks = hoverId != null && edges.some((edge) => touches(edge.source) || touches(edge.target));
  if (hoverId && hoverHasLinks && model.positions.has(hoverId)) {
    const group = new Set<string>([hoverId]);
    for (const position of model.positions.values()) {
      if (position.parentId === hoverId) group.add(position.id);
    }
    const near = new Set<string>(group);
    for (const edge of edges) {
      if (group.has(edge.source)) near.add(edge.target);
      if (group.has(edge.target)) near.add(edge.source);
    }
    const hoverContainer = containerOf(index, hoverId);
    for (const id of ids) {
      if (near.has(id)) nodes.set(id, "near");
      else if (id === hoverContainer || [...near].some((n) => containerOf(index, n) === id)) nodes.set(id, "idle");
      else nodes.set(id, "quiet");
    }
    for (const edge of edges) {
      edgeStates.set(edge.id, group.has(edge.source) || group.has(edge.target) ? "near" : "quiet");
    }
    return { nodes, current, hovered: hoverId, edges: edgeStates, drawing };
  }

  for (const id of ids) nodes.set(id, "idle");
  for (const edge of edges) edgeStates.set(edge.id, "idle");
  return { nodes, current, hovered: null, edges: edgeStates, drawing };
}

function handlesFor(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  reachesIn: boolean,
): { sourceHandle: string; targetHandle: string } {
  if (b.y >= a.y + a.height - 4) return { sourceHandle: "s-bottom", targetHandle: reachesIn ? "t-top-in" : "t-top" };
  if (a.y >= b.y + b.height - 4) return { sourceHandle: "s-top", targetHandle: "t-bottom" };
  if (b.x >= a.x + a.width) return { sourceHandle: "s-right", targetHandle: "t-left" };
  return { sourceHandle: "s-left", targetHandle: "t-right" };
}

/** The target is drawn inside a container that the source is outside of. */
function reachesIn(positions: ReadonlyMap<string, PositionedNode>, source: string, target: string): boolean {
  const parent = positions.get(target)?.parentId;
  if (!parent) return false;
  return positions.get(source)?.parentId !== parent && source !== parent;
}

function toElements(
  map: ReturnType<typeof useMap>,
  model: Model,
  hoverId: string | null,
  theme: Theme,
): { nodes: Node[]; edges: Edge<MapEdgeData>[] } {
  const index = map.index;
  if (!index) return { nodes: [], edges: [] };
  const edges = drawnEdges(index, model);
  const emphasis = emphasisFor(map, model, edges, hoverId);

  const clusters = new Set<string>();
  for (const position of model.positions.values()) {
    if (position.parentId) clusters.add(position.parentId);
  }

  const nodes: Node[] = model.layout.lanes.map(
    (lane, order): Node<LaneNodeData, "lane"> => ({
      id: `lane:${lane.id}`,
      type: "lane",
      position: { x: -LANE_BLEED, y: lane.y },
      width: model.layout.width + LANE_BLEED * 2,
      height: lane.height,
      style: { width: model.layout.width + LANE_BLEED * 2, height: lane.height },
      data: { lane: lane.id, count: lane.count, order, inset: LANE_BLEED },
      draggable: false,
      selectable: false,
      focusable: false,
      zIndex: -10,
    }),
  );

  const flowNodes: Node<MapNodeData>[] = [];
  for (const position of model.positions.values()) {
    const node = index.tryNode(position.id);
    if (!node) continue;
    const isCluster = clusters.has(node.id);
    const insideCount = index.nodes.filter(
      (other) => other.type !== "file" && containerOf(index, other.id) === node.id,
    ).length;
    const collapsible = node.type === "page" && insideCount > 0;
    const data: MapNodeData = {
      node,
      state: emphasis.nodes.get(node.id) ?? "idle",
      current: emphasis.current.has(node.id),
      childCount: insideCount,
      collapsed: map.collapsed.has(node.id),
      onToggle: collapsible ? map.toggleCollapsed : null,
    };
    const type = isCluster ? "cluster" : position.parentId ? "child" : "card";
    const item: Node<MapNodeData> = {
      id: node.id,
      type,
      position: { x: position.x, y: position.y },
      width: position.width,
      height: position.height,
      style: { width: position.width, height: position.height },
      data,
      draggable: false,
      connectable: false,
      selectable: false,
      zIndex: isCluster ? 0 : 2,
      ariaLabel: `${node.label}, ${node.type}`,
    };
    if (emphasis.hovered === node.id) item.className = "is-hovered";
    if (position.parentId) item.parentId = position.parentId;
    flowNodes.push(item);
  }
  flowNodes.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
  nodes.push(...flowNodes);

  // A long path labels only the selected node's own edges, so words never pile up.
  const pathEdges = edges.filter((edge) => emphasis.edges.get(edge.id) === "path").length;
  const crowded = pathEdges > 9;
  const labeled = (edge: DrawnEdge, state: EdgeState) =>
    state === "near" ||
    (state === "path" &&
      (!crowded ||
        edge.source === map.focusId ||
        edge.target === map.focusId ||
        emphasis.current.has(edge.target)));

  const flowEdges: Edge<MapEdgeData>[] = [];
  for (const edge of edges) {
    const a = absolutePosition(model.positions, edge.source);
    const b = absolutePosition(model.positions, edge.target);
    if (!a || !b) continue;
    const state = emphasis.edges.get(edge.id) ?? "idle";
    const color = EDGE_COLOR[theme][state];
    flowEdges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...handlesFor(a, b, reachesIn(model.positions, edge.source, edge.target)),
      type: "flow",
      label: edge.label,
      data: { state, kind: edge.kind, drawing: emphasis.drawing.has(edge.id), labeled: labeled(edge, state) },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
      zIndex: 1,
      focusable: false,
    });
  }

  return { nodes, edges: flowEdges };
}
