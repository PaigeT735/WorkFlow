import type { GraphIndex } from "./indexGraph.ts";
import { highlightFor } from "./path.ts";
import type {
  Flow,
  GraphNode,
  GrokActionId,
  GrokExplainRequest,
  GrokExplainResponse,
} from "./types.ts";

export interface GrokAction {
  id: GrokActionId;
  label: string;
}

export function actionsFor(node: GraphNode | null, flow: Flow | null): GrokAction[] {
  if (flow && !node) {
    return [{ id: "explain_flow", label: "Explain this flow" }];
  }
  if (!node) return [];
  switch (node.type) {
    case "page":
      return [
        {
          id: "explain_page",
          label: "What happens when users interact with this page?",
        },
      ];
    case "api":
      return [
        { id: "explain_api", label: "Explain this API" },
        { id: "what_calls", label: "What calls this?" },
      ];
    case "error":
      return [{ id: "why_failing", label: "Why is this failing?" }];
    case "database":
    case "table":
      return [{ id: "what_depends", label: "What depends on this?" }];
    case "interaction":
      return [{ id: "explain_interaction", label: "Explain this interaction" }];
    case "service":
    case "function":
      return [
        { id: "explain_node", label: "Explain this" },
        { id: "what_calls", label: "What calls this?" },
        { id: "what_depends", label: "What depends on this?" },
      ];
    default:
      return [{ id: "explain_node", label: "Explain this" }];
  }
}

export function buildGrokRequest(
  index: GraphIndex,
  action: GrokAction,
  focusId: string | null,
  flowId: string | null,
): GrokExplainRequest {
  const node = focusId ? index.tryNode(focusId) : null;
  const flow = flowId ? index.flow(flowId) : null;
  const highlight = highlightFor(index, focusId, flowId);
  const ids = new Set<string>();
  if (node) ids.add(node.id);
  if (highlight) {
    for (const id of highlight.nodes) ids.add(id);
  }
  if (node) {
    for (const edge of index.outgoingOf(node.id)) {
      ids.add(edge.target);
    }
    for (const edge of index.incomingOf(node.id)) {
      ids.add(edge.source);
    }
  }

  const nodes = [...ids]
    .map((id) => index.tryNode(id))
    .filter((item): item is GraphNode => item != null);
  const edges = index.edges.filter(
    (edge) => ids.has(edge.source) && ids.has(edge.target),
  );

  return {
    action: action.id,
    promptLabel: action.label,
    node,
    context: {
      graphId: index.graph.id,
      graphName: index.graph.name,
      neighborhood: { nodes, edges },
      path: {
        nodeIds: highlight ? [...highlight.nodes] : [],
        edgeIds: highlight ? [...highlight.edges] : [],
      },
      flow,
    },
  };
}

export class GrokUnavailableError extends Error {
  constructor(message = "Analysis backend is not available.") {
    super(message);
    this.name = "GrokUnavailableError";
  }
}

/**
 * Sends graph context to the backend. The browser never calls Grok itself.
 * A missing backend, a proxy error, or any non-2xx response is "unavailable".
 */
export async function explainWithGrok(
  request: GrokExplainRequest,
  signal?: AbortSignal,
): Promise<GrokExplainResponse> {
  let response: Response;
  try {
    const init: RequestInit = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    };
    if (signal) init.signal = signal;
    response = await fetch("/api/grok/explain", init);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new GrokUnavailableError();
  }

  if (!response.ok) {
    throw new GrokUnavailableError(await readError(response));
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new GrokUnavailableError();
  }

  if (!isExplanation(body)) {
    throw new GrokUnavailableError();
  }
  return { explanation: body.explanation };
}

function isExplanation(value: unknown): value is GrokExplainResponse {
  if (value == null || typeof value !== "object") return false;
  const explanation = (value as { explanation?: unknown }).explanation;
  return typeof explanation === "string" && explanation.trim().length > 0;
}

async function readError(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body != null && typeof body === "object" && "error" in body) {
      const message = (body as { error?: unknown }).error;
      if (typeof message === "string" && message.trim() !== "") return message;
    }
  } catch {
    // The proxy or a crashed server may not return JSON.
  }
  return "Analysis backend is not available.";
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
