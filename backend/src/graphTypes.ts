/**
 * Application graph emitted by the analyzer.
 * This matches frontend/src/graph/types.ts schema version 1.
 * The map parses this JSON; do not add required fields the parser rejects.
 *
 * Brief vocabulary mapped onto the existing kinds:
 * - navigates → navigates_to
 * - renders / contains → contains
 * - triggers → calls, label "triggers"
 * - handled_by → handles
 * - uses → depends_on
 * - integrates_with → depends_on, or sends_payment_to for a payment SDK
 * - throws → raises
 */

export const SCHEMA_VERSION = 1;

export type NodeType =
  | "application"
  | "page"
  | "component"
  | "interaction"
  | "api"
  | "auth"
  | "service"
  | "function"
  | "database"
  | "table"
  | "external"
  | "error"
  | "file";

export type Layer = "surface" | "behavior" | "backend" | "data" | "external";

export type EdgeKind =
  | "contains"
  | "navigates_to"
  | "calls"
  | "authenticates"
  | "handles"
  | "queries"
  | "reads"
  | "writes"
  | "sends_payment_to"
  | "depends_on"
  | "raises"
  | "defined_in";

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
  file: string;
  startLine: number;
  endLine: number;
}

export interface NodeMetadata {
  route?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path?: string;
  authRequired?: boolean;
  errorMessage?: string;
  statusCode?: number;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  layer: Layer;
  parentId: string | null;
  label: string;
  summary?: string;
  detail?: string;
  source?: SourceRef;
  metadata?: NodeMetadata;
}

/** Where the analyzer saw the relationship. Omitted only on hand-written samples. */
export interface EdgeEvidence {
  file: string;
  startLine: number;
  endLine: number;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  label: string;
  expand?: boolean;
  skeleton?: boolean;
  metadata?: {
    evidence: EdgeEvidence;
  };
}

export interface Flow {
  id: string;
  label: string;
  description?: string;
  nodeIds: string[];
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
}
