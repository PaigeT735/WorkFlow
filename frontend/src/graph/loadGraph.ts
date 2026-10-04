import { parseApplicationGraph } from "./parse.ts";
import type { ApplicationGraph } from "./types.ts";

/**
 * The only place the map obtains a graph.
 *
 * Today the document is `frontend/public/graph.json` (the Harbor sample).
 * Point `VITE_GRAPH_URL` at the analyzer later — for example `/api/graph` —
 * and the canvas, panels, search, and flows stay the same.
 */
const DEFAULT_GRAPH_URL = "/graph.json";

export async function loadApplicationGraph(): Promise<ApplicationGraph> {
  const configured = import.meta.env.VITE_GRAPH_URL?.trim();
  const url = configured && configured.length > 0 ? configured : DEFAULT_GRAPH_URL;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(`Unable to load the application graph from ${url}.`);
  }
  if (!response.ok) {
    throw new Error(
      `Unable to load the application graph from ${url} (${response.status}).`,
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`The graph at ${url} is not JSON.`);
  }
  return parseApplicationGraph(payload);
}
