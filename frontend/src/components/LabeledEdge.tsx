import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

export interface LabeledEdgeData {
  dimmed: boolean;
  onPath: boolean;
  [key: string]: unknown;
}

export type LabeledEdgeType = Edge<LabeledEdgeData, "labeled">;

export function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  data,
}: EdgeProps<LabeledEdgeType>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
  });
  const showLabel = Boolean(label) && !data?.dimmed;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} {...(markerEnd ? { markerEnd } : {})} />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className={data?.onPath ? "edge-label is-path" : "edge-label"}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
