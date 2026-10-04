import { GraphIndex } from "./indexGraph.ts";
import type { NodeType } from "./types.ts";

export interface SearchHit {
  id: string;
  nodeId: string;
  label: string;
  type: NodeType;
  detail: string;
  usedBy: string[];
  /** File results open the excerpt as well as focusing the map. */
  openSource: boolean;
}

export function searchGraph(index: GraphIndex, rawQuery: string): SearchHit[] {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return [];

  const hits: Array<SearchHit & { rank: number }> = [];

  for (const node of index.nodes) {
    const fields = [
      node.label,
      node.summary ?? "",
      node.detail ?? "",
      node.type,
      node.metadata?.route ?? "",
      node.metadata?.path ?? "",
      node.metadata?.method ?? "",
      node.metadata?.errorMessage ?? "",
      node.source?.file ?? "",
    ];
    const label = node.label.toLowerCase();
    const haystack = fields.join(" ").toLowerCase();
    if (!haystack.includes(query)) continue;
    const rank = label === query ? 0 : label.startsWith(query) ? 1 : label.includes(query) ? 2 : 3;
    hits.push({
      id: node.id,
      nodeId: node.id,
      label: node.label,
      type: node.type,
      detail: node.summary ?? node.source?.file ?? node.metadata?.path ?? "",
      usedBy: usedByLabels(index, node.id, 3),
      openSource: false,
      rank,
    });
  }

  const owners = new Map<string, string[]>();
  for (const node of index.nodes) {
    const file = node.source?.file;
    if (!file) continue;
    const list = owners.get(file) ?? [];
    list.push(node.id);
    owners.set(file, list);
  }

  for (const [file, nodeIds] of owners) {
    if (!file.toLowerCase().includes(query)) continue;
    const fileNode = index.nodes.find(
      (node) => node.type === "file" && (node.label === file || node.summary === file),
    );
    const ownerId = fileNode?.id ?? nodeIds[0];
    if (!ownerId) continue;
    if (hits.some((hit) => hit.id === `file:${file}` || (fileNode && hit.id === fileNode.id))) {
      continue;
    }
    hits.push({
      id: `file:${file}`,
      nodeId: ownerId,
      label: file,
      type: "file",
      detail: "Source file",
      usedBy: nodeIds
        .map((id) => index.node(id).label)
        .filter((label, index, all) => all.indexOf(label) === index)
        .slice(0, 3),
      openSource: true,
      rank: file.toLowerCase().endsWith(query) || file.toLowerCase().includes(`/${query}`) ? 1 : 2,
    });
  }

  hits.sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  return hits.slice(0, 12).map((hit) => ({
    id: hit.id,
    nodeId: hit.nodeId,
    label: hit.label,
    type: hit.type,
    detail: hit.detail,
    usedBy: hit.usedBy,
    openSource: hit.openSource,
  }));
}

export function usedByLabels(index: GraphIndex, id: string, limit: number): string[] {
  const labels: string[] = [];
  for (const edge of index.incomingOf(id)) {
    if (edge.kind === "contains" || edge.kind === "defined_in") continue;
    const source = index.tryNode(edge.source);
    if (!source) continue;
    if (!labels.includes(source.label)) labels.push(source.label);
    if (labels.length >= limit) return labels;
  }
  if (labels.length === 0) {
    for (const flow of index.flows) {
      if (!flow.nodeIds.includes(id)) continue;
      labels.push(flow.label);
      if (labels.length >= limit) break;
    }
  }
  return labels;
}
