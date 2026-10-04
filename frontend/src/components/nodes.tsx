import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { NodeType } from "../graph/types.ts";
import { useMap } from "../state/mapStore.tsx";

export interface MapNodeData {
  label: string;
  summary: string;
  typeLabel: string;
  nodeType: NodeType;
  authRequired: boolean;
  childCount: number;
  expanded: boolean;
  expandable: boolean;
  dimmed: boolean;
  onPath: boolean;
  issue: boolean;
  [key: string]: unknown;
}

export type CardNodeType = Node<MapNodeData, "card">;
export type ClusterNodeType = Node<MapNodeData, "cluster">;

export function CardNode({ id, data, selected }: NodeProps<CardNodeType>) {
  return (
    <NodeBody id={id} data={data} selected={selected} cluster={false} />
  );
}

export function ClusterNode({ id, data, selected }: NodeProps<ClusterNodeType>) {
  return (
    <NodeBody id={id} data={data} selected={selected} cluster />
  );
}

function NodeBody({
  id,
  data,
  selected,
  cluster,
}: {
  id: string;
  data: MapNodeData;
  selected: boolean;
  cluster: boolean;
}) {
  const map = useMap();
  const className = [
    cluster ? "map-cluster" : "map-node",
    data.dimmed ? "is-dim" : "",
    data.onPath ? "is-path" : "",
    selected ? "is-selected" : "",
    data.issue ? "is-issue" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      data-type={data.nodeType}
      data-testid={`node-${id}`}
      title={data.label}
    >
      <div className="node-kicker">
        <span className="type-mark" aria-hidden="true" />
        <span>{data.typeLabel}</span>
        {data.authRequired ? <span className="auth-pill">Auth</span> : null}
        {data.expandable ? (
          <button
            type="button"
            className="chevron-btn"
            aria-label={data.expanded ? `Collapse ${data.label}` : `Expand ${data.label}`}
            aria-expanded={data.expanded}
            onClick={(event) => {
              event.stopPropagation();
              if (data.expanded) map.collapseNode(id);
              else map.selectNode(id);
            }}
          >
            <Chevron open={data.expanded} />
          </button>
        ) : null}
      </div>
      <div className="node-label">{data.label}</div>
      {data.summary ? <div className="node-summary">{data.summary}</div> : null}
      {!cluster && data.childCount > 0 && !data.expanded ? (
        <div className="node-meta">{data.childCount} inside</div>
      ) : null}
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" className={open ? "chevron is-open" : "chevron"} aria-hidden="true">
      <path d="M4.2 2.4 7.8 6 4.2 9.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
