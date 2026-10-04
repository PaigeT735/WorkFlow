import { writeFileSync } from "node:fs";
import { buildSampleGraph } from "../src/graph/sampleGraph.ts";

const graph = buildSampleGraph();
const target = new URL("../public/graph.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Wrote ${graph.nodes.length} nodes, ${graph.edges.length} edges to public/graph.json`);
