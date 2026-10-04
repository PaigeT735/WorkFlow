import { parseApplicationGraph } from "./parse.ts";
import type { ApplicationGraph } from "./types.ts";

/**
 * The only place the map obtains a graph.
 *
 * The map reads Harbor from `/graph.json`.
 * After Analyze, the toolbar loads `GET /api/projects/:id/graph` through this
 * same function. `VITE_GRAPH_URL` still overrides the default sample URL.
 */
const DEFAULT_GRAPH_URL = "/graph.json";

export async function loadApplicationGraph(url?: string): Promise<ApplicationGraph> {
  const configured = import.meta.env.VITE_GRAPH_URL?.trim();
  const target = url && url.length > 0 ? url : configured && configured.length > 0 ? configured : DEFAULT_GRAPH_URL;

  let response: Response;
  try {
    response = await fetch(target);
  } catch {
    throw new Error(`Unable to load the application graph from ${target}.`);
  }
  if (!response.ok) {
    throw new Error(
      `Unable to load the application graph from ${target} (${response.status}).`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The graph at ${target} is not JSON.`);
  }
  return parseApplicationGraph(payload);
}
