import { GraphIndex } from "../src/graph/indexGraph.ts";
import { buildSampleGraph } from "../src/graph/sampleGraph.ts";
import { NODE_TYPES } from "../src/graph/types.ts";
import { visibleNodeIds } from "../src/graph/visibility.ts";
import { highlightFor } from "../src/graph/path.ts";
import { searchGraph } from "../src/graph/search.ts";
import { absolutePosition, layoutVisible } from "../src/layout/elkLayout.ts";
import { DEFAULT_FILTERS } from "../src/graph/visibility.ts";

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

const overview = visibleNodeIds(index, {
  depth: "overview",
  focusId: null,
  flowId: null,
  pinned: [],
  filters: DEFAULT_FILTERS,
});
if (overview.size !== 7) {
  throw new Error(`Overview should be the 7 pages, got ${overview.size}.`);
}

const projectsOpen = visibleNodeIds(index, {
  depth: "page",
  focusId: "page-projects",
  flowId: null,
  pinned: ["page-projects"],
  filters: DEFAULT_FILTERS,
});
if (!projectsOpen.has("ix-create")) {
  throw new Error("Opening Projects does not reveal Create Project.");
}
if (projectsOpen.has("api-projects-create")) {
  throw new Error("Opening a page should not reveal its API chain.");
}

const chain = visibleNodeIds(index, {
  depth: "chain",
  focusId: "ix-create",
  flowId: null,
  pinned: ["ix-create", "page-projects"],
  filters: DEFAULT_FILTERS,
});
for (const id of ["ix-create", "api-projects-create", "fn-project-create", "table-projects", "db-postgres"]) {
  if (!chain.has(id)) throw new Error(`Visible create chain is missing ${id}.`);
}
if (!chain.has("file-create-btn")) {
  throw new Error("Focusing Create Project should reveal its source file.");
}

const highlight = highlightFor(index, "ix-create", null);
if (!highlight?.nodes.has("api-projects-create") || !highlight.nodes.has("page-dashboard")) {
  throw new Error("Create Project highlight should include the API and the dashboard.");
}

await layoutAndCheck("overview", overview);
await layoutAndCheck("projects", projectsOpen);
await layoutAndCheck("create", chain);

const stripeView = visibleNodeIds(index, {
  depth: "chain",
  focusId: "ext-stripe",
  flowId: null,
  pinned: ["ext-stripe"],
  filters: DEFAULT_FILTERS,
});
if (!stripeView.has("ix-subscribe") || !stripeView.has("fn-checkout")) {
  throw new Error("Focusing Stripe should reveal the checkout path that calls it.");
}
await layoutAndCheck("stripe", stripeView);

console.log("Sample graph and layouts ok.");

async function layoutAndCheck(label: string, visible: Set<string>): Promise<void> {
  const laid = await layoutVisible(index, visible);
  const positions = new Map(laid.nodes.map((node) => [node.id, node]));
  const absolute = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const id of visible) {
    const box = absolutePosition(positions, id);
    if (!box) throw new Error(`${label}: ${id} has no position.`);
    absolute.set(id, box);
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
