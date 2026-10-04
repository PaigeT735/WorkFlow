/**
 * WorkFlow application graph.
 *
 * This is the JSON document `backend/src/analyzer.ts` should emit.
 * The map reads it through `loadApplicationGraph()` and does not care
 * whether the bytes came from the sample file or from the backend.
 *
 * Schema version: 1
 *
 * Top-level shape:
 * {
 *   "schemaVersion": 1,
 *   "id": "harbor",
 *   "name": "Harbor",
 *   "description": "optional",
 *   "nodes": [GraphNode],
 *   "edges": [GraphEdge],
 *   "flows": [Flow],
 *   "sources": { "src/services/project.ts": "file text…" }
 * }
 *
 * Hierarchy
 * - `parentId` is the container (page contains a button, database contains a
 *   table). `null` means the node sits at the top of the map.
 * - Also emit a `contains` edge from parent to child. The UI nests children
 *   inside the parent and does not draw that edge.
 *
 * Layers (depths of the same map, never separate screens)
 * - surface:  page, component
 * - behavior: interaction, api, auth, error
 * - backend:  service, function, file
 * - data:     database, table
 * - external: external
 *
 * Chain expansion follows edges whose `expand` is not false. Set `expand` to
 * false on links into shared nodes (a service used by many callers) so opening
 * one caller does not pull every other caller's chain onto the map. The edge
 * is still real: it is drawn whenever both ends are visible, and it shows up
 * in Calls / Depends on / Used by.
 *
 * `skeleton` marks a page-to-page overview edge ("Login authenticates
 * Dashboard"). It is hidden once a more specific edge between the same nodes
 * is on screen.
 *
 * Source
 * - `source.file` is a repo-relative path. `startLine` and `endLine` are
 *   1-based and inclusive.
 * - `sources` maps those paths to text excerpts. View Source slices the
 *   range. The analyzer may omit `sources`; the UI still shows the path.
 */

export const SCHEMA_VERSION = 1;

export const NODE_TYPES = [
  "application",
  "page",
  "component",
  "interaction",
  "api",
  "auth",
  "service",
  "function",
  "database",
  "table",
  "external",
  "error",
  "file",
] as const;

export type NodeType = (typeof NODE_TYPES)[number];

export const LAYERS = [
  "surface",
  "behavior",
  "backend",
  "data",
  "external",
] as const;

export type Layer = (typeof LAYERS)[number];

export const EDGE_KINDS = [
  "contains",
  "navigates_to",
  "calls",
  "authenticates",
  "handles",
  "queries",
  "reads",
  "writes",
  "sends_payment_to",
  "depends_on",
  "raises",
  "defined_in",
] as const;

export type EdgeKind = (typeof EDGE_KINDS)[number];

/** Layer each node type belongs to. The parser rejects mismatches. */
export const LAYER_FOR_TYPE: Record<NodeType, Layer> = {
  application: "surface",
  page: "surface",
  component: "surface",
  interaction: "behavior",
  api: "behavior",
  auth: "behavior",
  error: "behavior",
  service: "backend",
  function: "backend",
  file: "backend",
  database: "data",
  table: "data",
  external: "external",
};

export interface SourceRef {
  /** Repo-relative path, using forward slashes. */
  file: string;
  /** 1-based inclusive. */
  startLine: number;
  /** 1-based inclusive. */
  endLine: number;
}

/**
 * Reserved for Bronto. The analyzer never fills this in and never invents
 * counts. `observed` stays false until a telemetry pass attaches real data.
 */
export interface RuntimeEvidence {
  observed: boolean;
  requestCount?: number;
  errorCount?: number;
  avgDuration?: number;
  lastSeen?: string;
}

export interface NodeMetadata {
  /** Page URL, for example `/app/projects`. */
  route?: string;
  /** HTTP method for an API node. */
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** HTTP path for an API node, for example `/api/projects`. */
  path?: string;
  /** The node is behind authentication. */
  authRequired?: boolean;
  /** Error nodes: the failure the user or the API surfaces. */
  errorMessage?: string;
  /** HTTP status associated with an error, when there is one. */
  statusCode?: number;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  layer: Layer;
  /** Container id, or null for a top-level node. */
  parentId: string | null;
  label: string;
  /** Short second line: route, file, or role. */
  summary?: string;
  /** One sentence for the side panel. */
  detail?: string;
  source?: SourceRef;
  metadata?: NodeMetadata;
  /** Present only when runtime telemetry has actually been attached. */
  runtime?: RuntimeEvidence;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  /**
   * Words drawn on the edge. Use the verb the reader should see:
   * "contains", "navigates to", "calls", "authenticates",
   * "authentication required", "handles", "queries", "reads",
   * "writes", "sends payment to", "references", "raises", "defined in".
   */
  label: string;
  /**
   * Chain expansion follows this edge unless set to false.
   * Omitted means true.
   */
  expand?: boolean;
  /**
   * Page-level overview edge. Hidden when any other edge between the
   * same nodes is visible. Omitted means false.
   */
  skeleton?: boolean;
  /**
   * File and line that justify the edge. Analyzer graphs always include this.
   * Hand-written samples may omit it.
   */
  metadata?: {
    evidence: {
      file: string;
      startLine: number;
      endLine: number;
    };
  };
}

export interface Flow {
  id: string;
  label: string;
  description?: string;
  /** Nodes in story order. */
  nodeIds: string[];
  /** Edges that join those steps. May be empty; the UI can derive them. */
  edgeIds: string[];
}

export interface ApplicationGraph {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  description?: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  flows: Flow[];
  /** Optional excerpts keyed by the same path used in `source.file`. */
  sources?: Record<string, string>;
}

export interface GrokActionIdMap {
  explain_page: "explain_page";
  explain_api: "explain_api";
  explain_interaction: "explain_interaction";
  explain_flow: "explain_flow";
  why_failing: "why_failing";
  what_depends: "what_depends";
  explain_node: "explain_node";
}

export type GrokActionId = keyof GrokActionIdMap | "what_calls";

/**
 * POST /api/grok/explain
 * The browser sends graph context only. It never sends API keys.
 */
export interface GrokExplainRequest {
  action: GrokActionId;
  /** The button label the user clicked, so the backend can phrase the prompt. */
  promptLabel: string;
  /** Set when the map is showing an analyzed project, so the server can read source. */
  projectId?: string;
  node: GraphNode | null;
  context: {
    graphId: string;
    graphName: string;
    /** The selected node plus its immediate neighborhood and highlighted path. */
    neighborhood: {
      nodes: GraphNode[];
      edges: GraphEdge[];
    };
    path: {
      nodeIds: string[];
      edgeIds: string[];
    };
    flow: Flow | null;
  };
}

export interface GrokExplainResponse {
  explanation: string;
}
