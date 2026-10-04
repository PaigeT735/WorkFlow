import { EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import type { EdgeKind } from "../graph/types.ts";

export type EdgeState = "idle" | "path" | "pending" | "dim" | "near" | "quiet";

export interface MapEdgeData {
  state: EdgeState;
  kind: EdgeKind | "lifted";
  /** Set while a trace is lighting this edge for the first time. */
  drawing: boolean;
  /** Whether this edge's words are worth showing (dense paths only label the selection's own edges). */
  labeled: boolean;
  [key: string]: unknown;
}

export type MapEdgeType = Edge<MapEdgeData, "flow">;

/**
 * Relationships to things outside the code (a payment provider, a
 * dependency) are dashed; calls and data access are solid. A lifted edge
 * (drawn from a collapsed page on behalf of its children) is dotted.
 */
function dashFor(kind: MapEdgeData["kind"]): string | undefined {
  if (kind === "lifted") return "2 5";
  if (kind === "depends_on" || kind === "sends_payment_to" || kind === "navigates_to") return "6 5";
  return undefined;
}

export const MapEdge = memo(function MapEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  data,
}: EdgeProps<MapEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.32,
  });
  const state = data?.state ?? "idle";
  // A short hop (a button triggering an action beside it) has no room for words.
  const roomy = Math.hypot(targetX - sourceX, targetY - sourceY) > 72;
  const showLabel = Boolean(label) && roomy && data?.labeled === true && (state === "path" || state === "near");
  const dash = dashFor(data?.kind ?? "calls");

  return (
    <>
      <path d={path} className="medge-hit" fill="none" />
      <path
        id={id}
        d={path}
        className={`medge is-${state} ${data?.drawing ? "is-drawing" : ""}`}
        fill="none"
        strokeDasharray={data?.drawing ? undefined : dash}
        pathLength={data?.drawing ? 1 : undefined}
        markerEnd={markerEnd}
      />
      {showLabel ? (
        <EdgeLabelRenderer>
          <div
            className={`medge-label is-${state}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
});
