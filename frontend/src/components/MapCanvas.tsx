import {
  Background,
  BackgroundVariant,
  MarkerType,
  ReactFlow,
  useReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TYPE_LABEL } from "../graph/labels.ts";
import { followsChain } from "../graph/indexGraph.ts";
import { layoutVisible, type PositionedNode } from "../layout/elkLayout.ts";
import { ZOOM_EVENT } from "./zoom.ts";
import { useMap, type ZoomHint } from "../state/mapStore.tsx";
import { LabeledEdge, type LabeledEdgeData, type LabeledEdgeType } from "./LabeledEdge.tsx";
import { CardNode, ClusterNode, type MapNodeData } from "./nodes.tsx";

const nodeTypes = { card: CardNode, cluster: ClusterNode };
const edgeTypes = { labeled: LabeledEdge };

const TYPE_COLOR: Record<string, string> = {
  application: "#8fb4d6",
  page: "#8fb4d6",
  component: "#a3adbd",
  interaction: "#d2b48a",
  api: "#7dcdc2",
  auth: "#b9a6de",
  service: "#8eadd4",
  function: "#a9b7c9",
  database: "#8fbfa0",
  table: "#8fbfa0",
  external: "#d4a684",
  error: "#e09a9a",
  file: "#9aa3b2",
};

export function MapCanvas() {
  const map = useMap();
  const flow = useReactFlow();
  const hostRef = useRef<HTMLDivElement>(null);
  const programmatic = useRef(false);
  const accum = useRef(0);
  const lastZoom = useRef<number | null>(null);
  const model = useModel(map.index, map.visible);

  const graph = useMemo(() => {
    if (!map.index || !model) return { nodes: [] as Node<MapNodeData>[], edges: [] as LabeledEdgeType[] };
    return toFlow(map, model.positions, model.edgeIds);
  }, [map, model]);

  const frameRef = useRef({
    nodeIds: map.viewRequest.nodeIds,
    maxZoom: map.viewRequest.maxZoom,
    flows: map.showFlows,
    panel: Boolean(map.focusId || map.flowId),
  });
  frameRef.current = {
    nodeIds: map.viewRequest.nodeIds,
    maxZoom: map.viewRequest.maxZoom,
    flows: map.showFlows,
    panel: Boolean(map.focusId || map.flowId),
  };

  useEffect(() => {
    if (!model) return;
    const frameState = frameRef.current;
    const ids = frameState.nodeIds.filter((id) => model.positions.has(id));
    const framed = ids.length > 0 ? ids : [...model.positions.keys()];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduce ? 0 : 460;
    programmatic.current = true;
    const frame = window.requestAnimationFrame(() => {
      void flow.fitView({
        nodes: framed.map((id) => ({ id })),
        duration,
        maxZoom: frameState.maxZoom,
        minZoom: 0.28,
        padding: {
          top: "56px",
          bottom: "48px",
          left: frameState.flows ? "300px" : "36px",
          right: frameState.panel ? "380px" : "36px",
        },
      });
    });
    const timer = window.setTimeout(() => {
      lastZoom.current = flow.getViewport().zoom;
      accum.current = 0;
      programmatic.current = false;
    }, duration + 80);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [flow, map.viewRequest.id, model]);

  function hintAtCenter(): ZoomHint {
    const host = hostRef.current;
    if (!host) return { pageId: null, seedId: null };
    const rect = host.getBoundingClientRect();
    const center = flow.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    });
    let pageId: string | null = null;
    let pageDistance = Number.POSITIVE_INFINITY;
    let seedId: string | null = null;
    let seedDistance = Number.POSITIVE_INFINITY;
    for (const node of flow.getNodes()) {
      const internal = flow.getInternalNode(node.id);
      const abs = internal?.internals.positionAbsolute;
      if (!abs) continue;
      const width = node.width ?? 220;
      const height = node.height ?? 80;
      const distance = Math.hypot(abs.x + width / 2 - center.x, abs.y + height / 2 - center.y);
      const data = node.data as MapNodeData;
      if (data.nodeType === "page" && distance < pageDistance) {
        pageDistance = distance;
        pageId = node.id;
      }
      if (data.nodeType === "interaction" && distance < seedDistance) {
        seedDistance = distance;
        seedId = node.id;
      }
    }
    return { pageId, seedId };
  }

  return (
    <div className="map-canvas" ref={hostRef} data-testid="map-canvas">
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={(_event, node) => {
          map.selectNode(node.id);
        }}
        onPaneClick={() => {
          map.clearSelection();
        }}
        onMove={(_event, viewport) => {
          if (programmatic.current) {
            lastZoom.current = viewport.zoom;
            return;
          }
          if (lastZoom.current == null) {
            lastZoom.current = viewport.zoom;
            return;
          }
          accum.current += viewport.zoom - lastZoom.current;
          lastZoom.current = viewport.zoom;
          if (accum.current > 0.18) {
            accum.current = 0;
            const changed = map.semanticZoom("in", hintAtCenter());
            if (!changed) return;
          } else if (accum.current < -0.18) {
            accum.current = 0;
            map.semanticZoom("out", hintAtCenter());
          }
        }}
        minZoom={0.2}
        maxZoom={1.6}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        panOnScroll={false}
        zoomOnDoubleClick={false}
        selectionOnDrag={false}
        deleteKeyCode={null}
        multiSelectionKeyCode={null}
        proOptions={{ hideAttribution: false }}
        colorMode="dark"
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#222833" />
      </ReactFlow>
      <ZoomBridge hintAtCenter={hintAtCenter} />
    </div>
  );
}

function ZoomBridge({ hintAtCenter }: { hintAtCenter: () => ZoomHint }) {
  const map = useMap();
  const flow = useReactFlow();
  const bridge = useRef({ hintAtCenter, zoomIn: flow.zoomIn, zoomOut: flow.zoomOut, map });
  bridge.current = { hintAtCenter, zoomIn: flow.zoomIn, zoomOut: flow.zoomOut, map };

  useEffect(() => {
    function onZoom(event: Event) {
      const detail = (event as CustomEvent<{ direction: "in" | "out" }>).detail;
      const current = bridge.current;
      const changed = current.map.semanticZoom(detail.direction, current.hintAtCenter());
      if (!changed) {
        if (detail.direction === "in") void current.zoomIn({ duration: 180 });
        else void current.zoomOut({ duration: 180 });
      }
    }
    window.addEventListener(ZOOM_EVENT, onZoom);
    return () => window.removeEventListener(ZOOM_EVENT, onZoom);
  }, []);

  return null;
}


function useModel(
  index: ReturnType<typeof useMap>["index"],
  visible: Set<string>,
): { key: string; positions: Map<string, PositionedNode>; edgeIds: string[] } | null {
  const key = useMemo(() => [...visible].sort().join("|"), [visible]);
  const [model, setModel] = useState<{
    key: string;
    positions: Map<string, PositionedNode>;
    edgeIds: string[];
  } | null>(null);

  useEffect(() => {
    if (!index) return;
    let cancel = false;
    layoutVisible(index, visible)
      .then((result) => {
        if (cancel) return;
        setModel({
          key,
          positions: new Map(result.nodes.map((node) => [node.id, node])),
          edgeIds: result.edgeIds,
        });
      })
      .catch(() => {
        if (!cancel) setModel(null);
      });
    return () => {
      cancel = true;
    };
  }, [index, key, visible]);

  return model;
}

function toFlow(
  map: ReturnType<typeof useMap>,
  positions: Map<string, PositionedNode>,
  edgeIds: string[],
): { nodes: Node<MapNodeData>[]; edges: Edge<LabeledEdgeData>[] } {
  const index = map.index;
  if (!index) return { nodes: [], edges: [] };
  const highlight = map.highlight;
  const active = highlight != null;
  const clusters = new Set<string>();
  for (const position of positions.values()) {
    if (position.parentId) clusters.add(position.parentId);
  }

  const nodes: Node<MapNodeData>[] = [];
  for (const position of positions.values()) {
    if (!map.visible.has(position.id)) continue;
    const node = index.tryNode(position.id);
    if (!node) continue;
    const childCount = index.childrenOf(node.id).length;
    const expanded = index.childrenOf(node.id).some((child) => positions.has(child.id));
    const expandable =
      childCount > 0 ||
      index.outgoingOf(node.id).some((edge) => followsChain(edge) || edge.kind === "defined_in");
    const onPath = highlight?.nodes.has(node.id) ?? false;
    const data: MapNodeData = {
      label: node.label,
      summary: node.summary ?? "",
      typeLabel: TYPE_LABEL[node.type],
      nodeType: node.type,
      authRequired: node.metadata?.authRequired === true,
      childCount,
      expanded,
      expandable,
      dimmed: active && !onPath,
      onPath: active && onPath,
      issue: node.type === "error" && (map.showIssues || onPath),
    };
    const flowNode: Node<MapNodeData, "card"> | Node<MapNodeData, "cluster"> = {
      id: node.id,
      type: clusters.has(node.id) ? "cluster" : "card",
      position: { x: position.x, y: position.y },
      width: position.width,
      height: position.height,
      style: { width: position.width, height: position.height },
      data,
      draggable: false,
      connectable: false,
      selectable: true,
      selected: map.focusId === node.id,
      zIndex: clusters.has(node.id) ? 0 : 2,
    };
    if (position.parentId) flowNode.parentId = position.parentId;
    nodes.push(flowNode);
  }

  nodes.sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));

  const edges: Edge<LabeledEdgeData>[] = [];
  for (const id of edgeIds) {
    const edge = index.edge(id);
    if (!edge || !positions.has(edge.source) || !positions.has(edge.target)) continue;
    const onPath = highlight?.edges.has(edge.id) ?? false;
    const dimmed = active && !onPath;
    const source = index.tryNode(edge.source);
    const stroke = dimmed
      ? "#2a3140"
      : onPath
        ? (TYPE_COLOR[source?.type ?? "page"] ?? "#8fb4d6")
        : "#66758c";
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "labeled",
      label: edge.label,
      style: { stroke, strokeWidth: onPath ? 1.6 : 1 },
      markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: stroke },
      data: { dimmed, onPath },
      zIndex: onPath ? 3 : 1,
    });
  }

  return { nodes, edges };
}
