import type { GraphNode, NodeType } from "./types.ts";

/**
 * The map reads top to bottom in three lanes:
 * what the user experiences → the application's machinery → where data goes.
 * The application node itself is the header of the whole map, not a lane item.
 */
export type LaneId = "experience" | "application" | "data";

export interface LaneInfo {
  id: LaneId;
  title: string;
  caption: string;
}

export const LANES: readonly LaneInfo[] = [
  { id: "experience", title: "User experience", caption: "Pages and what users do on them" },
  { id: "application", title: "Application", caption: "APIs, auth and business logic" },
  { id: "data", title: "Data & services", caption: "Databases and external services" },
];

export function laneOf(type: NodeType): LaneId {
  switch (type) {
    case "application":
    case "page":
    case "component":
    case "interaction":
      return "experience";
    case "api":
    case "auth":
    case "service":
    case "function":
    case "file":
    case "error":
      return "application";
    case "database":
    case "table":
    case "external":
      return "data";
  }
}

export function laneIndex(type: NodeType): number {
  return LANES.findIndex((lane) => lane.id === laneOf(type));
}

/** Groups used by the legend. Each group can be emphasised on the map. */
export type TypeGroup = "pages" | "interactions" | "api" | "logic" | "data" | "external" | "errors";

export const TYPE_GROUPS: readonly { id: TypeGroup; label: string; types: readonly NodeType[] }[] = [
  { id: "pages", label: "Pages", types: ["page", "component"] },
  { id: "interactions", label: "Interactions", types: ["interaction"] },
  { id: "api", label: "API & auth", types: ["api", "auth"] },
  { id: "logic", label: "Logic", types: ["service", "function", "file"] },
  { id: "data", label: "Data", types: ["database", "table"] },
  { id: "external", label: "External", types: ["external"] },
  { id: "errors", label: "Errors", types: ["error"] },
];

export function groupOf(type: NodeType): TypeGroup | null {
  return TYPE_GROUPS.find((group) => group.types.includes(type))?.id ?? null;
}

/** Labels that are code identifiers read better in a monospace face. */
export function isCodeLabel(node: Pick<GraphNode, "type">): boolean {
  return (
    node.type === "api" ||
    node.type === "function" ||
    node.type === "service" ||
    node.type === "table" ||
    node.type === "file"
  );
}
