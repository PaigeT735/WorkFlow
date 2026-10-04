import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { TYPE_LABEL } from "../graph/labels.ts";
import { isCodeLabel, LANES, type LaneId } from "../graph/lanes.ts";
import type { GraphNode } from "../graph/types.ts";
import { ChevronIcon, LockIcon, TypeIcon } from "./icons.tsx";

/**
 * idle     nothing is selected
 * selected the node the inspector describes
 * path     on the selected node's trace
 * pending  on the trace, not reached yet while the trace plays
 * dim      everything else while something is selected or emphasised
 * near     hovered, or one edge away from the hovered node
 * quiet    everything else while hovering
 */
export type NodeState = "idle" | "selected" | "path" | "pending" | "dim" | "near" | "quiet";

export interface MapNodeData {
  node: GraphNode;
  state: NodeState;
  /** The trace step currently lighting up. */
  current: boolean;
  /** Children drawn inside this node, or hidden inside it when collapsed. */
  childCount: number;
  collapsed: boolean;
  onToggle: ((id: string) => void) | null;
  [key: string]: unknown;
}

export interface LaneNodeData {
  lane: LaneId;
  count: number;
  order: number;
  /** Where the map content starts inside this (extra-wide) band. */
  inset: number;
  [key: string]: unknown;
}

export type CardNodeType = Node<MapNodeData, "card">;
export type ChildNodeType = Node<MapNodeData, "child">;
export type ClusterNodeType = Node<MapNodeData, "cluster">;
export type LaneNodeType = Node<LaneNodeData, "lane">;

function Handles() {
  return (
    <>
      <Handle id="t-top" type="target" position={Position.Top} isConnectable={false} />
      {/* Entry for edges reaching into a page or database, clear of its title. */}
      <Handle id="t-top-in" type="target" position={Position.Top} isConnectable={false} style={{ left: "72%" }} />
      <Handle id="t-bottom" type="target" position={Position.Bottom} isConnectable={false} />
      <Handle id="t-left" type="target" position={Position.Left} isConnectable={false} />
      <Handle id="t-right" type="target" position={Position.Right} isConnectable={false} />
      <Handle id="s-top" type="source" position={Position.Top} isConnectable={false} />
      <Handle id="s-bottom" type="source" position={Position.Bottom} isConnectable={false} />
      <Handle id="s-left" type="source" position={Position.Left} isConnectable={false} />
      <Handle id="s-right" type="source" position={Position.Right} isConnectable={false} />
    </>
  );
}

function stateClass(data: MapNodeData): string {
  return [`is-${data.state}`, data.current ? "is-current" : ""].filter(Boolean).join(" ");
}

function fileLine(node: GraphNode): string | null {
  if (!node.source) return null;
  const base = node.source.file.split("/").pop() ?? node.source.file;
  return `${base}:${node.source.startLine}`;
}

/** The second line under a node title. Only ever analyzer facts. */
function metaFor(node: GraphNode, childCount: number, collapsed: boolean): string | null {
  switch (node.type) {
    case "page": {
      const route = node.metadata?.route ?? node.summary ?? null;
      if (collapsed && childCount > 0) {
        const inside = `${childCount} inside`;
        return route ? `${route} · ${inside}` : inside;
      }
      return route;
    }
    case "interaction":
    case "component":
      return node.summary && node.summary !== node.source?.file ? node.summary : fileLine(node);
    case "database":
      return childCount > 0 ? `${childCount} ${childCount === 1 ? "table" : "tables"}` : null;
    case "table":
      return null;
    case "error": {
      const status = node.metadata?.statusCode;
      const message = node.metadata?.errorMessage ?? node.summary ?? null;
      if (status && message) return `${status} · ${message}`;
      return message ?? (status ? String(status) : null);
    }
    case "external":
      return fileLine(node) ?? (node.summary ? `in ${node.summary.split("/").pop()}` : null);
    default:
      return fileLine(node) ?? node.summary ?? null;
  }
}

function Title({ node }: { node: GraphNode }) {
  const method = node.type === "api" ? node.metadata?.method : undefined;
  const path = node.type === "api" ? node.metadata?.path : undefined;
  if (method && path) {
    return (
      <span className="mnode-title mono">
        <span className={`method method-${method.toLowerCase()}`}>{method}</span>
        <span className="mnode-title-text">{path}</span>
      </span>
    );
  }
  return (
    <span className={isCodeLabel(node) ? "mnode-title mono" : "mnode-title"}>
      <span className="mnode-title-text">{node.label}</span>
    </span>
  );
}

function CardBody({ data, compact }: { data: MapNodeData; compact: boolean }) {
  const { node } = data;
  const meta = metaFor(node, data.childCount, data.collapsed);
  const auth = node.metadata?.authRequired === true && node.type !== "auth";
  return (
    <div
      className={`mnode ${compact ? "mnode-child" : ""} ${stateClass(data)}`}
      data-type={node.type}
      data-testid={`node-${node.id}`}
      title={node.label}
    >
      <span className="mnode-icon" aria-hidden="true">
        <TypeIcon type={node.type} size={compact ? 15 : 16} />
      </span>
      <span className="mnode-text">
        <span className="mnode-kicker">
          {TYPE_LABEL[node.type]}
          {auth ? (
            <span className="auth-tag" title="Authentication required">
              <LockIcon size={11} />
              Auth
            </span>
          ) : null}
        </span>
        <Title node={node} />
        {meta ? <span className="mnode-meta mono">{meta}</span> : null}
      </span>
      {data.onToggle && data.childCount > 0 ? (
        <button
          type="button"
          className="mnode-toggle nodrag"
          aria-label={`Show what is inside ${node.label}`}
          aria-expanded={false}
          onClick={(event) => {
            event.stopPropagation();
            data.onToggle?.(node.id);
          }}
        >
          <ChevronIcon size={12} />
        </button>
      ) : null}
      <Handles />
    </div>
  );
}

export const CardNode = memo(function CardNode({ data }: NodeProps<CardNodeType>) {
  return <CardBody data={data} compact={false} />;
});

export const ChildNode = memo(function ChildNode({ data }: NodeProps<ChildNodeType>) {
  return <CardBody data={data} compact />;
});

export const ClusterNode = memo(function ClusterNode({ data }: NodeProps<ClusterNodeType>) {
  const { node } = data;
  const route = node.type === "page" ? (node.metadata?.route ?? node.summary ?? null) : null;
  const auth = node.metadata?.authRequired === true;
  return (
    <div
      className={`mcluster ${stateClass(data)}`}
      data-type={node.type}
      data-testid={`node-${node.id}`}
    >
      <div className="mcluster-head" title={node.label}>
        <span className="mnode-icon" aria-hidden="true">
          <TypeIcon type={node.type} />
        </span>
        <span className="mcluster-titles">
          <span className="mnode-kicker">
            {TYPE_LABEL[node.type]}
            {auth ? (
              <span className="auth-tag" title="Authentication required">
                <LockIcon size={11} />
                Auth
              </span>
            ) : null}
          </span>
          <span className="mcluster-title">
            {node.label}
            {route ? <span className="mcluster-route mono">{route}</span> : null}
          </span>
        </span>
        {data.onToggle ? (
          <button
            type="button"
            className="mnode-toggle is-open nodrag"
            aria-label={`Hide what is inside ${node.label}`}
            aria-expanded
            onClick={(event) => {
              event.stopPropagation();
              data.onToggle?.(node.id);
            }}
          >
            <ChevronIcon size={12} />
          </button>
        ) : null}
      </div>
      <Handles />
    </div>
  );
});

export const LaneNode = memo(function LaneNode({ data }: NodeProps<LaneNodeType>) {
  const lane = LANES.find((item) => item.id === data.lane);
  if (!lane) return null;
  return (
    <div className="lane" data-lane={lane.id} aria-hidden="true">
      <div className="lane-label" style={{ left: data.inset + 28 }}>
        <span className="lane-order mono">{String(data.order + 1).padStart(2, "0")}</span>
        <span className="lane-title">{lane.title}</span>
        <span className="lane-caption">{lane.caption}</span>
        {data.count === 0 ? <span className="lane-empty">None detected</span> : null}
      </div>
    </div>
  );
});
