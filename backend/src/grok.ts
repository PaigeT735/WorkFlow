import process from "node:process";
import type { GraphEdge, GraphNode } from "./graphTypes.js";
import { readRepoFile } from "./sourceAccess.js";
import { getProject } from "./projectStore.js";

export interface ExplainRequest {
  action?: string;
  promptLabel?: string;
  projectId?: string;
  node?: GraphNode | null;
  context?: {
    graphName?: string;
    neighborhood?: { nodes?: GraphNode[]; edges?: GraphEdge[] };
    path?: { nodeIds?: string[] };
    flow?: { label?: string; description?: string } | null;
  };
}

export interface GrokPrompt {
  system: string;
  user: string;
}

export class GrokError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GrokError";
    this.status = status;
  }
}

const ACTION_INTENT: Record<string, string> = {
  explain_page: "Explain this page in simple terms, using only the evidence.",
  explain_api: "Explain this API in simple terms, using only the evidence.",
  explain_interaction: "Explain how this user action moves through the application.",
  explain_flow: "Explain this flow: how a user action moves through the application.",
  explain_node: "Explain this in simple terms, using only the evidence.",
  why_failing: "Why is this failing? Use nearby error evidence. Do not invent a cause.",
  what_depends: "What depends on this? Describe the downstream nodes that are present.",
  what_calls: "What calls this? Describe the upstream nodes that are present.",
};

/**
 * Builds the Grok prompt from graph context and an optional source excerpt.
 * This does not perform I/O and must not include secret values.
 */
export function buildGrokPrompt(input: {
  action: string;
  promptLabel: string;
  graphName: string;
  node: GraphNode | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  flowLabel: string | null;
  sourceExcerpt: string | null;
}): GrokPrompt {
  const intent = ACTION_INTENT[input.action] ?? input.promptLabel;
  const lines: string[] = [];
  lines.push(`Application: ${input.graphName}`);
  lines.push(`User request: ${input.promptLabel}`);
  lines.push(`Intent: ${intent}`);
  if (input.flowLabel) lines.push(`Selected flow: ${input.flowLabel}`);
  if (input.node) {
    lines.push("");
    lines.push("Selected node:");
    lines.push(describeNode(input.node));
  }
  lines.push("");
  lines.push("Connected nodes:");
  if (input.nodes.length === 0) lines.push("- none supplied");
  for (const node of input.nodes) lines.push(`- ${describeNode(node)}`);
  lines.push("");
  lines.push("Relationships:");
  if (input.edges.length === 0) lines.push("- none supplied");
  const byId = new Map(input.nodes.map((node) => [node.id, node.label]));
  if (input.node) byId.set(input.node.id, input.node.label);
  for (const edge of input.edges) {
    const from = byId.get(edge.source) ?? edge.source;
    const to = byId.get(edge.target) ?? edge.target;
    lines.push(`- ${from} -> ${to} (${edge.label})`);
  }
  if (input.sourceExcerpt) {
    lines.push("");
    lines.push("Source excerpt:");
    lines.push(redactSecrets(input.sourceExcerpt).slice(0, 6000));
  }
  return {
    system: [
      "You explain one part of a software application using only the evidence in the user message.",
      "Do not invent architecture, files, endpoints, tables, or behavior that is not in the evidence.",
      "Distinguish observed facts from inference.",
      "Be concise. Refer to nodes and files by the names you were given.",
      "Never repeat, guess, or request secrets, tokens, or environment variable values.",
    ].join(" "),
    user: lines.join("\n"),
  };
}

export async function explain(request: ExplainRequest, deps?: {
  apiKey?: string | null;
  fetchImpl?: typeof fetch;
  model?: string;
}): Promise<{ explanation: string; prompt: GrokPrompt }> {
  const action = request.action ?? "explain_node";
  const promptLabel = request.promptLabel?.trim() || "Explain this";
  const node = request.node ?? null;
  const neighborhood = request.context?.neighborhood;
  const nodes = neighborhood?.nodes ?? [];
  const edges = neighborhood?.edges ?? [];
  const sourceExcerpt = await sourceFor(request.projectId, node);
  const prompt = buildGrokPrompt({
    action,
    promptLabel,
    graphName: request.context?.graphName ?? "Application",
    node,
    nodes,
    edges,
    flowLabel: request.context?.flow?.label ?? null,
    sourceExcerpt,
  });

  const apiKey = deps && "apiKey" in deps ? deps.apiKey : process.env.GROK_API_KEY?.trim();
  if (!apiKey) {
    throw new GrokError(503, "GROK_API_KEY is not set. Add it to the repo-root .env and restart the backend.");
  }
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const model = (deps?.model ?? process.env.GROK_MODEL?.trim()) || "grok-4";
  const explanation = await completeChat({ apiKey, model, prompt, fetchImpl });
  return { explanation, prompt };
}

async function sourceFor(projectId: string | undefined, node: GraphNode | null): Promise<string | null> {
  if (!projectId || !node?.source) return null;
  const project = getProject(projectId);
  if (!project) return null;
  try {
    const file = await readRepoFile(project.root, node.source.file);
    const lines = file.content.split("\n");
    const start = Math.max(1, node.source.startLine);
    const end = Math.min(lines.length, node.source.endLine);
    return lines
      .slice(start - 1, end)
      .map((line, index) => `${start + index}|${line}`)
      .join("\n");
  } catch {
    return null;
  }
}

export async function completeChat(input: {
  apiKey: string;
  model: string;
  prompt: GrokPrompt;
  fetchImpl: typeof fetch;
}): Promise<string> {
  let response: Response;
  try {
    response = await input.fetchImpl("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: input.prompt.system },
          { role: "user", content: input.prompt.user },
        ],
      }),
    });
  } catch {
    throw new GrokError(502, "The Grok request failed before a response arrived.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new GrokError(502, "Grok returned an error. The explanation is unavailable.");
  }
  const content = readContent(body);
  if (!content) throw new GrokError(502, "Grok returned an empty explanation.");
  return redactSecrets(content);
}

function readContent(body: unknown): string | null {
  if (body == null || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const first = choices[0];
  if (first == null || typeof first !== "object") return null;
  const message = (first as { message?: unknown }).message;
  if (message == null || typeof message !== "object") return null;
  const content = (message as { content?: unknown }).content;
  return typeof content === "string" && content.trim() !== "" ? content.trim() : null;
}

function describeNode(node: GraphNode): string {
  const source = node.source ? ` file ${node.source.file}:${node.source.startLine}-${node.source.endLine}` : "";
  const route = node.metadata?.route ? ` route ${node.metadata.route}` : "";
  const api = node.metadata?.method && node.metadata.path ? ` ${node.metadata.method} ${node.metadata.path}` : "";
  return `${node.label} (${node.type}${api}${route}${source})`;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(/x-access-token:\S+/g, "x-access-token:[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._-]{8,}/g, "Bearer [REDACTED]");
}
