import {
  EDGE_KINDS,
  LAYER_FOR_TYPE,
  LAYERS,
  NODE_TYPES,
  SCHEMA_VERSION,
  type ApplicationGraph,
  type Flow,
  type GraphEdge,
  type GraphNode,
  type NodeMetadata,
  type RuntimeEvidence,
  type SourceRef,
} from "./types.ts";

export class GraphParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GraphParseError";
  }
}

export function parseApplicationGraph(input: unknown): ApplicationGraph {
  const root = asRecord(input, "graph");
  const schemaVersion = asNumber(root.schemaVersion, "schemaVersion");
  if (schemaVersion !== SCHEMA_VERSION) {
    throw new GraphParseError(
      `Unsupported schemaVersion ${schemaVersion}. This map reads version ${SCHEMA_VERSION}.`,
    );
  }

  const nodes = asArray(root.nodes, "nodes").map((value, index) =>
    parseNode(value, `nodes[${index}]`),
  );
  const edges = asArray(root.edges, "edges").map((value, index) =>
    parseEdge(value, `edges[${index}]`),
  );
  const flows = asArray(root.flows, "flows").map((value, index) =>
    parseFlow(value, `flows[${index}]`),
  );

  const graph: ApplicationGraph = {
    schemaVersion: SCHEMA_VERSION,
    id: asId(root.id, "id"),
    name: asString(root.name, "name"),
    nodes,
    edges,
    flows,
  };

  if ("description" in root && root.description != null) {
    graph.description = asString(root.description, "description");
  }
  if ("sources" in root && root.sources != null) {
    graph.sources = parseSources(root.sources);
  }

  validateGraph(graph);
  return graph;
}

function parseNode(value: unknown, path: string): GraphNode {
  const record = asRecord(value, path);
  const type = asEnum(record.type, NODE_TYPES, `${path}.type`);
  const layer = asEnum(record.layer, LAYERS, `${path}.layer`);
  if (layer !== LAYER_FOR_TYPE[type]) {
    throw new GraphParseError(
      `${path}.layer is "${layer}" but type "${type}" belongs on the ${LAYER_FOR_TYPE[type]} layer.`,
    );
  }

  const node: GraphNode = {
    id: asId(record.id, `${path}.id`),
    type,
    layer,
    parentId: parseParentId(record.parentId, `${path}.parentId`),
    label: asString(record.label, `${path}.label`),
  };

  if ("summary" in record && record.summary != null) {
    node.summary = asString(record.summary, `${path}.summary`);
  }
  if ("detail" in record && record.detail != null) {
    node.detail = asString(record.detail, `${path}.detail`);
  }
  if ("source" in record && record.source != null) {
    node.source = parseSourceRef(record.source, `${path}.source`);
  }
  if ("metadata" in record && record.metadata != null) {
    node.metadata = parseMetadata(record.metadata, `${path}.metadata`);
  }
  if ("runtime" in record && record.runtime != null) {
    node.runtime = parseRuntime(record.runtime, `${path}.runtime`);
  }
  return node;
}

function parseEdge(value: unknown, path: string): GraphEdge {
  const record = asRecord(value, path);
  const edge: GraphEdge = {
    id: asId(record.id, `${path}.id`),
    source: asId(record.source, `${path}.source`),
    target: asId(record.target, `${path}.target`),
    kind: asEnum(record.kind, EDGE_KINDS, `${path}.kind`),
    label: asString(record.label, `${path}.label`),
  };
  if ("expand" in record && record.expand != null) {
    edge.expand = asBoolean(record.expand, `${path}.expand`);
  }
  if ("skeleton" in record && record.skeleton != null) {
    edge.skeleton = asBoolean(record.skeleton, `${path}.skeleton`);
  }
  return edge;
}

function parseFlow(value: unknown, path: string): Flow {
  const record = asRecord(value, path);
  const flow: Flow = {
    id: asId(record.id, `${path}.id`),
    label: asString(record.label, `${path}.label`),
    nodeIds: asArray(record.nodeIds, `${path}.nodeIds`).map((item, index) =>
      asId(item, `${path}.nodeIds[${index}]`),
    ),
    edgeIds: asArray(record.edgeIds, `${path}.edgeIds`).map((item, index) =>
      asId(item, `${path}.edgeIds[${index}]`),
    ),
  };
  if ("description" in record && record.description != null) {
    flow.description = asString(record.description, `${path}.description`);
  }
  if (flow.nodeIds.length < 2) {
    throw new GraphParseError(`${path} needs at least two nodes.`);
  }
  return flow;
}

function parseSourceRef(value: unknown, path: string): SourceRef {
  const record = asRecord(value, path);
  const startLine = asLine(record.startLine, `${path}.startLine`);
  const endLine = asLine(record.endLine, `${path}.endLine`);
  if (endLine < startLine) {
    throw new GraphParseError(`${path}.endLine is before startLine.`);
  }
  return {
    file: asString(record.file, `${path}.file`),
    startLine,
    endLine,
  };
}

function parseMetadata(value: unknown, path: string): NodeMetadata {
  const record = asRecord(value, path);
  const metadata: NodeMetadata = {};
  if ("route" in record && record.route != null) {
    metadata.route = asString(record.route, `${path}.route`);
  }
  if ("method" in record && record.method != null) {
    metadata.method = asEnum(
      record.method,
      ["GET", "POST", "PUT", "PATCH", "DELETE"] as const,
      `${path}.method`,
    );
  }
  if ("path" in record && record.path != null) {
    metadata.path = asString(record.path, `${path}.path`);
  }
  if ("authRequired" in record && record.authRequired != null) {
    metadata.authRequired = asBoolean(record.authRequired, `${path}.authRequired`);
  }
  if ("errorMessage" in record && record.errorMessage != null) {
    metadata.errorMessage = asString(record.errorMessage, `${path}.errorMessage`);
  }
  if ("statusCode" in record && record.statusCode != null) {
    metadata.statusCode = asNumber(record.statusCode, `${path}.statusCode`);
  }
  return metadata;
}

function parseRuntime(value: unknown, path: string): RuntimeEvidence {
  const record = asRecord(value, path);
  const runtime: RuntimeEvidence = {
    observed: asBoolean(record.observed, `${path}.observed`),
  };
  if ("requestCount" in record && record.requestCount != null) {
    runtime.requestCount = asNumber(record.requestCount, `${path}.requestCount`);
  }
  if ("errorCount" in record && record.errorCount != null) {
    runtime.errorCount = asNumber(record.errorCount, `${path}.errorCount`);
  }
  if ("avgDuration" in record && record.avgDuration != null) {
    runtime.avgDuration = asNumber(record.avgDuration, `${path}.avgDuration`);
  }
  if ("lastSeen" in record && record.lastSeen != null) {
    runtime.lastSeen = asString(record.lastSeen, `${path}.lastSeen`);
  }
  return runtime;
}

function parseSources(value: unknown): Record<string, string> {
  const record = asRecord(value, "sources");
  const sources: Record<string, string> = {};
  for (const [file, text] of Object.entries(record)) {
    sources[file] = asString(text, `sources[${file}]`);
  }
  return sources;
}

function validateGraph(graph: ApplicationGraph): void {
  const nodes = new Map<string, GraphNode>();
  for (const node of graph.nodes) {
    if (nodes.has(node.id)) {
      throw new GraphParseError(`Duplicate node id "${node.id}".`);
    }
    nodes.set(node.id, node);
  }

  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (edges.has(edge.id)) {
      throw new GraphParseError(`Duplicate edge id "${edge.id}".`);
    }
    edges.add(edge.id);
    if (!nodes.has(edge.source)) {
      throw new GraphParseError(`Edge "${edge.id}" source "${edge.source}" does not exist.`);
    }
    if (!nodes.has(edge.target)) {
      throw new GraphParseError(`Edge "${edge.id}" target "${edge.target}" does not exist.`);
    }
    if (edge.source === edge.target) {
      throw new GraphParseError(`Edge "${edge.id}" links a node to itself.`);
    }
  }

  for (const node of graph.nodes) {
    if (node.parentId == null) continue;
    if (!nodes.has(node.parentId)) {
      throw new GraphParseError(`Node "${node.id}" parent "${node.parentId}" does not exist.`);
    }
    const contains = graph.edges.some(
      (edge) =>
        edge.kind === "contains" &&
        edge.source === node.parentId &&
        edge.target === node.id,
    );
    if (!contains) {
      throw new GraphParseError(
        `Node "${node.id}" has parentId "${node.parentId}" but no contains edge from that parent.`,
      );
    }
    assertNoParentCycle(node, nodes);
  }

  const flowIds = new Set<string>();
  for (const flow of graph.flows) {
    if (flowIds.has(flow.id)) {
      throw new GraphParseError(`Duplicate flow id "${flow.id}".`);
    }
    flowIds.add(flow.id);
    for (const nodeId of flow.nodeIds) {
      if (!nodes.has(nodeId)) {
        throw new GraphParseError(`Flow "${flow.id}" references missing node "${nodeId}".`);
      }
    }
    for (const edgeId of flow.edgeIds) {
      if (!edges.has(edgeId)) {
        throw new GraphParseError(`Flow "${flow.id}" references missing edge "${edgeId}".`);
      }
    }
  }
}

function assertNoParentCycle(start: GraphNode, nodes: Map<string, GraphNode>): void {
  const seen = new Set<string>([start.id]);
  let parentId = start.parentId;
  while (parentId) {
    if (seen.has(parentId)) {
      throw new GraphParseError(`Parent cycle involving "${start.id}".`);
    }
    seen.add(parentId);
    parentId = nodes.get(parentId)?.parentId ?? null;
  }
}

function parseParentId(value: unknown, path: string): string | null {
  if (value == null) return null;
  return asId(value, path);
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new GraphParseError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new GraphParseError(`${path} must be an array.`);
  }
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new GraphParseError(`${path} must be a non-empty string.`);
  }
  return value;
}

function asId(value: unknown, path: string): string {
  const id = asString(value, path);
  if (/\s/.test(id)) {
    throw new GraphParseError(`${path} must not contain whitespace.`);
  }
  return id;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new GraphParseError(`${path} must be a number.`);
  }
  return value;
}

function asLine(value: unknown, path: string): number {
  const line = asNumber(value, path);
  if (!Number.isInteger(line) || line < 1) {
    throw new GraphParseError(`${path} must be a 1-based line number.`);
  }
  return line;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new GraphParseError(`${path} must be a boolean.`);
  }
  return value;
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new GraphParseError(
      `${path} must be one of: ${allowed.join(", ")}.`,
    );
  }
  return value as T;
}
