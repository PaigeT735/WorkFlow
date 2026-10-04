import { useEffect, useState } from "react";
import { LAYER_LABEL, TYPE_LABEL } from "../graph/labels.ts";
import { actionsFor, buildGrokRequest, explainWithGrok, GrokUnavailableError } from "../graph/grok.ts";
import type { GraphIndex } from "../graph/indexGraph.ts";
import type { Flow, GraphNode } from "../graph/types.ts";
import { useMap } from "../state/mapStore.tsx";

interface Relation {
  key: string;
  nodeId: string;
  verb: string;
  label: string;
}

export function SidePanel() {
  const map = useMap();
  const index = map.index;
  if (!index) return null;
  const node = map.focusId ? index.tryNode(map.focusId) : null;
  const flow = map.flowId && !node ? index.flow(map.flowId) : null;
  if (!node && !flow) return null;

  return (
    <aside className="side-panel" data-testid="side-panel">
      <div className="panel-head">
        <p className="panel-kicker">
          {node ? (
            <>
              <span className="type-mark" data-type={node.type} />
              {TYPE_LABEL[node.type]}
              <span className="dot">·</span>
              {LAYER_LABEL[node.layer]}
            </>
          ) : (
            "Flow"
          )}
        </p>
        <button type="button" className="text-btn" onClick={map.clearSelection} aria-label="Close details">
          Close
        </button>
      </div>
      {node ? <NodeBody index={index} node={node} /> : null}
      {flow ? <FlowBody flow={flow} /> : null}
    </aside>
  );
}

function NodeBody({ index, node }: { index: GraphIndex; node: GraphNode }) {
  const map = useMap();
  const contains = index.childrenOf(node.id).map((child) => ({
    key: `contains-${child.id}`,
    nodeId: child.id,
    verb: "contains",
    label: child.label,
  }));
  const navigation: Relation[] = [];
  const calls: Relation[] = [];
  const depends: Relation[] = [];
  for (const edge of index.outgoingOf(node.id)) {
    if (edge.kind === "contains") continue;
    const target = index.tryNode(edge.target);
    if (!target) continue;
    const row = { key: edge.id, nodeId: target.id, verb: edge.label, label: target.label };
    if (edge.kind === "navigates_to" || (edge.kind === "authenticates" && target.type === "page")) {
      navigation.push(row);
    } else if (
      edge.kind === "authenticates" ||
      edge.kind === "depends_on" ||
      edge.kind === "defined_in"
    ) {
      depends.push(row);
    } else {
      calls.push(row);
    }
  }
  const usedBy: Relation[] = [];
  const seen = new Set<string>();
  for (const edge of index.incomingOf(node.id)) {
    if (edge.kind === "contains") continue;
    const source = index.tryNode(edge.source);
    if (!source || seen.has(source.id)) continue;
    seen.add(source.id);
    usedBy.push({ key: edge.id, nodeId: source.id, verb: edge.label, label: source.label });
  }

  const auth = node.metadata?.authRequired;

  return (
    <div className="panel-body">
      <h2>{node.label}</h2>
      {node.detail ? <p className="detail">{node.detail}</p> : null}
      {node.source ? (
        <p className="file-line">
          <span className="file-label">File</span>
          <span className="mono">
            {node.source.file}:{node.source.startLine}–{node.source.endLine}
          </span>
        </p>
      ) : null}
      {auth != null ? (
        <p className={auth ? "auth-line is-required" : "auth-line"} data-testid="auth-requirement">
          {auth ? "Authentication required" : "No authentication"}
        </p>
      ) : null}
      <RelationList title="Contains" rows={contains} />
      <RelationList title="Navigation" rows={navigation} />
      <RelationList title="Calls" rows={calls} />
      <RelationList title="Depends on" rows={depends} />
      <RelationList title="Used by" rows={usedBy} />
      <div className="panel-actions">
        <button
          type="button"
          className="action"
          data-testid="view-source"
          disabled={!node.source}
          onClick={map.openSource}
        >
          View source
        </button>
        <GrokActions node={node} flow={null} />
      </div>
    </div>
  );
}

function FlowBody({ flow }: { flow: Flow }) {
  const map = useMap();
  const index = map.index;
  if (!index) return null;
  return (
    <div className="panel-body">
      <h2>{flow.label}</h2>
      {flow.description ? <p className="detail">{flow.description}</p> : null}
      <section className="rel-section">
        <h3>Steps</h3>
        <ol className="steps">
          {flow.nodeIds.map((id, step) => {
            const node = index.tryNode(id);
            if (!node) return null;
            return (
              <li key={id}>
                <button type="button" onClick={() => map.selectNode(id)}>
                  <span className="verb">{step + 1}</span>
                  <span>{node.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>
      <div className="panel-actions">
        <GrokActions node={null} flow={flow} />
      </div>
    </div>
  );
}

function RelationList({ title, rows }: { title: string; rows: Relation[] }) {
  const map = useMap();
  if (rows.length === 0) return null;
  return (
    <section className="rel-section">
      <h3>{title}</h3>
      <ul>
        {rows.map((row) => (
          <li key={row.key}>
            <button type="button" onClick={() => map.selectNode(row.nodeId)}>
              <span className="verb">{row.verb}</span>
              <span>{row.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function GrokActions({ node, flow }: { node: GraphNode | null; flow: Flow | null }) {
  const map = useMap();
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "unavailable">("idle");
  const [text, setText] = useState<string | null>(null);
  const actions = actionsFor(node, flow);
  const target = node?.id ?? flow?.id ?? "";

  useEffect(() => {
    setStatus("idle");
    setText(null);
  }, [target]);

  async function run(action: (typeof actions)[number]) {
    if (!map.index) return;
    const controller = new AbortController();
    setStatus("loading");
    setText(null);
    try {
      const request = buildGrokRequest(map.index, action, map.focusId, flow ? map.flowId : null);
      const response = await explainWithGrok(request, controller.signal);
      setText(response.explanation);
      setStatus("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (error instanceof GrokUnavailableError || error instanceof Error) {
        setStatus("unavailable");
      }
    }
  }

  return (
    <>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="action grok"
          data-testid={`grok-${action.id}`}
          disabled={status === "loading"}
          onClick={() => void run(action)}
        >
          {status === "loading" ? "Asking…" : action.label}
        </button>
      ))}
      {status === "unavailable" ? (
        <p className="grok-note" role="status">
          The analysis backend isn’t running, so this can’t be answered yet. The selected node and
          its path are ready for <span className="mono">POST /api/grok/explain</span>.
        </p>
      ) : null}
      {status === "done" && text ? (
        <p className="grok-note" role="status">
          {text}
        </p>
      ) : null}
    </>
  );
}
