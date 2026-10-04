import type { EdgeKind, Layer, NodeType } from "./types.ts";

export const TYPE_LABEL: Record<NodeType, string> = {
  application: "Application",
  page: "Page",
  component: "Component",
  interaction: "Interaction",
  api: "API",
  auth: "Authentication",
  service: "Service",
  function: "Function",
  database: "Database",
  table: "Table",
  external: "External service",
  error: "Error",
  file: "File",
};

export const LAYER_LABEL: Record<Layer, string> = {
  surface: "Surface",
  behavior: "Behavior",
  backend: "Backend",
  data: "Data",
  external: "External",
};

/** Suggested edge labels. Each edge still carries its own `label`. */
export const EDGE_KIND_HINT: Record<EdgeKind, string> = {
  contains: "contains",
  navigates_to: "navigates to",
  calls: "calls",
  authenticates: "authenticates",
  handles: "handles",
  queries: "queries",
  reads: "reads",
  writes: "writes",
  sends_payment_to: "sends payment to",
  depends_on: "depends on",
  raises: "raises",
  defined_in: "defined in",
};
