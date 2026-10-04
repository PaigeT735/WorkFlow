import { GraphIndex } from "../src/graph/indexGraph.ts";
import { laneIndex } from "../src/graph/lanes.ts";
import { highlightFor, traceFor } from "../src/graph/path.ts";
import { buildSampleGraph } from "../src/graph/sampleGraph.ts";
import { searchGraph } from "../src/graph/search.ts";
import { NODE_TYPES } from "../src/graph/types.ts";
import { defaultCollapsed, visibleNodeIds } from "../src/graph/visibility.ts";
import { absolutePosition, layoutLanes } from "../src/layout/laneLayout.ts";

const graph = buildSampleGraph();
const index = new GraphIndex(graph);

for (const type of NODE_TYPES) {
  if (!graph.nodes.some((node) => node.type === type)) {
    throw new Error(`Sample graph is missing a ${type} node.`);
  }
}

const loginEdge = graph.edges.find(
  (edge) =>
    edge.source === "page-login" &&
    edge.target === "page-dashboard" &&
    edge.kind === "authenticates",
);
if (!loginEdge) throw new Error("Login does not authenticate the dashboard.");

const create = index.downstream("ix-create");
for (const id of [
  "api-projects-create",
  "auth-require",
  "fn-project-controller",
  "svc-project",
  "fn-project-create",
  "table-projects",
  "err-duplicate",
]) {
  if (!create.has(id)) throw new Error(`Create Project chain is missing ${id}.`);
}
if (create.has("ext-stripe")) {
  throw new Error("Create Project chain should not include Stripe.");
}

const stripeHits = searchGraph(index, "stripe");
if (!stripeHits.some((hit) => hit.nodeId === "ext-stripe")) {
  throw new Error("Search cannot find Stripe.");
}
if (stripeHits[0]?.usedBy.length === 0) {
  throw new Error("Stripe search result has no used-by preview.");
}

// The overview is the whole architecture, not just pages.
const collapsed = defaultCollapsed(index);
if (!collapsed.has("page-projects")) {
  throw new Error("A sample this size should start with its pages collapsed.");
}
const overview = visibleNodeIds(index, { collapsed, focusId: null });
for (const id of ["page-projects", "api-projects-create", "fn-project-create", "db-postgres", "ext-stripe"]) {
  if (!overview.has(id)) throw new Error(`Overview is missing ${id}.`);
}
if (overview.has("ix-create")) throw new Error("A collapsed page should hide its interactions.");
if ([...overview].some((id) => index.node(id).type === "application")) {
  throw new Error("The application node is the map header, not a box on the map.");
}
if ([...overview].some((id) => index.node(id).type === "file")) {
  throw new Error("Source files belong in the inspector until one is selected.");
}

const expanded = visibleNodeIds(index, { collapsed: new Set(), focusId: null });
if (!expanded.has("ix-create")) throw new Error("An open page should show Create Project.");

const fileFocus = visibleNodeIds(index, { collapsed, focusId: "file-create-btn" });
if (!fileFocus.has("file-create-btn")) throw new Error("A selected source file should appear on the map.");

const highlight = highlightFor(index, "ix-create", null);
if (!highlight?.nodes.has("api-projects-create") || !highlight.nodes.has("page-dashboard")) {
  throw new Error("Create Project highlight should include the API and the dashboard.");
}

const pageHighlight = highlightFor(index, "page-projects", null);
if (!pageHighlight?.nodes.has("api-projects-create")) {
  throw new Error("Selecting a page should trace what its interactions call.");
}

// Every edge in a highlight is a recorded edge between highlighted nodes.
for (const focus of ["ix-create", "page-projects", "ext-stripe", "fn-project-create"]) {
  const path = highlightFor(index, focus, null);
  if (!path) throw new Error(`No highlight for ${focus}.`);
  for (const id of path.edges) {
    const edge = index.edge(id);
    if (!edge) throw new Error(`${focus}: highlight names missing edge ${id}.`);
    if (!path.nodes.has(edge.source) || !path.nodes.has(edge.target)) {
      throw new Error(`${focus}: highlighted edge ${id} leaves the highlight.`);
    }
  }
}

const trace = traceFor(index, "ix-create", null).map((step) => step.join(","));
const at = (id: string) => trace.findIndex((step) => step.split(",").includes(id));
if (at("ix-create") < 0 || at("api-projects-create") <= at("ix-create")) {
  throw new Error(`Trace should reach the API after Create Project: ${trace.join(" | ")}`);
}
if (at("fn-project-create") <= at("api-projects-create") || at("table-projects") <= at("fn-project-create")) {
  throw new Error(`Trace order is wrong: ${trace.join(" | ")}`);
}

const flowTrace = traceFor(index, null, graph.flows[0]?.id ?? null);
if (flowTrace.length === 0) throw new Error("A flow should produce a trace.");

await layoutAndCheck("overview", overview);
await layoutAndCheck("expanded", expanded);
await layoutAndCheck("file focus", fileFocus);

console.log("Sample graph and layouts ok.");

async function layoutAndCheck(label: string, visible: Set<string>): Promise<void> {
  const laid = await layoutLanes(index, visible);
  const positions = new Map(laid.nodes.map((node) => [node.id, node]));
  const absolute = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const id of visible) {
    const box = absolutePosition(positions, id);
    if (!box) throw new Error(`${label}: ${id} has no position.`);
    absolute.set(id, box);
  }

  // Lanes read top to bottom: experience, application, data.
  const tops = laid.lanes.map((lane) => lane.y);
  for (let i = 1; i < tops.length; i += 1) {
    if ((tops[i] ?? 0) <= (tops[i - 1] ?? 0)) throw new Error(`${label}: lanes are out of order.`);
  }
  for (const [id, box] of absolute) {
    const node = index.node(id);
    const lane = laid.lanes[laneIndex(node.type)];
    const top = positions.get(id)?.parentId ? absolute.get(positions.get(id)?.parentId ?? "") : box;
    if (!lane || !top) continue;
    if (top.y < lane.y || top.y + top.height > lane.y + lane.height) {
      throw new Error(`${label}: ${id} sits outside the ${lane.id} lane.`);
    }
  }

  const ids = [...absolute.keys()];
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      if (!a || !b) continue;
      if (isAncestor(positions, a, b) || isAncestor(positions, b, a)) continue;
      const boxA = absolute.get(a);
      const boxB = absolute.get(b);
      if (!boxA || !boxB) continue;
      if (overlaps(boxA, boxB)) {
        throw new Error(
          `${label}: ${a} overlaps ${b} (${JSON.stringify(boxA)} vs ${JSON.stringify(boxB)}).`,
        );
      }
    }
  }
}

function isAncestor(
  positions: Map<string, { parentId: string | null }>,
  maybeAncestor: string,
  id: string,
): boolean {
  let parentId = positions.get(id)?.parentId ?? null;
  while (parentId) {
    if (parentId === maybeAncestor) return true;
    parentId = positions.get(parentId)?.parentId ?? null;
  }
  return false;
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): boolean {
  const pad = 1;
  return (
    a.x + pad < b.x + b.width &&
    a.x + a.width > b.x + pad &&
    a.y + pad < b.y + b.height &&
    a.y + a.height > b.y + pad
  );
}
