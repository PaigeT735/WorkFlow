import { useEffect, useRef, useState, type ReactNode } from "react";
import type { GraphIndex } from "../graph/indexGraph.ts";
import { TYPE_LABEL } from "../graph/labels.ts";
import { isCodeLabel, LANES, laneOf, TYPE_GROUPS } from "../graph/lanes.ts";
import type { GraphEdge, GraphNode } from "../graph/types.ts";
import { containedIds } from "../graph/visibility.ts";
import { useMap } from "../state/mapStore.tsx";
import { ExplainSection } from "./ExplainSection.tsx";
import { CloseIcon, CodeIcon, PlayIcon, SparkIcon, TypeIcon } from "./icons.tsx";

/**
 * Details beside the map. Everything here is read from the graph the analyzer
 * produced; when the analyzer did not record something, the panel says so.
 */
export function Inspector() {
  const map = useMap();
  const index = map.index;
  if (!index) return null;
  const node = map.focusId ? index.tryNode(map.focusId) : null;
  const flow = !node && map.flowId ? index.flow(map.flowId) : null;
  if (!node && !flow) return null;

  return (
    <aside className="inspector" data-testid="side-panel" aria-label="Details">
      {node ? <NodeDetails key={node.id} index={index} node={node} /> : null}
      {flow ? <FlowDetails key={flow.id} /> : null}
    </aside>
  );
}

function Header({
  kicker,
  type,
  title,
}: {
  kicker: ReactNode;
  type: GraphNode["type"] | null;
  title: ReactNode;
}) {
  const map = useMap();
  return (
    <header className="insp-head">
      <div className="insp-kicker">
        {type ? (
          <span className="insp-type-icon" data-type={type}>
            <TypeIcon type={type} size={14} />
          </span>
        ) : null}
        {kicker}
        <button
          type="button"
          className="icon-btn insp-close"
          onClick={map.clearSelection}
          aria-label="Close details"
          title="Close (Esc)"
        >
          <CloseIcon size={14} />
        </button>
      </div>
      <h2 className="insp-title">{title}</h2>
    </header>
  );
}

function NodeTitle({ node }: { node: GraphNode }) {
  const method = node.type === "api" ? node.metadata?.method : undefined;
  const path = node.type === "api" ? node.metadata?.path : undefined;
  if (method && path) {
    return (
      <span className="mono">
        <span className={`method method-${method.toLowerCase()}`}>{method}</span> {path}
      </span>
    );
  }
  return <span className={isCodeLabel(node) ? "mono" : undefined}>{node.label}</span>;
}

function NodeDetails({ index, node }: { index: GraphIndex; node: GraphNode }) {
  const map = useMap();
  const [explainKey, setExplainKey] = useState(0);
  const lane = LANES.find((item) => item.id === laneOf(node.type));
  const canTrace = map.traceSteps.length > 1;
  const tracing = map.trace != null;

  if (node.type === "application") return <ApplicationDetails index={index} node={node} />;

  const inside = containedIds(index, node.id)
    .map((id) => index.tryNode(id))
    .filter((item): item is GraphNode => item != null);
  const outgoing = index
    .outgoingOf(node.id)
    .filter((edge) => edge.kind !== "contains" && edge.kind !== "defined_in");
  const incoming = index.incomingOf(node.id).filter((edge) => edge.kind !== "contains");
  // A database is used through its tables: "ProjectService.create() writes projects".
  const viaTables: RelationRow[] =
    node.type === "database"
      ? inside.flatMap((table) =>
          index
            .incomingOf(table.id)
            .filter((edge) => edge.kind !== "contains")
            .map((edge) => ({
              key: edge.id,
              verb: `${edge.label} ${table.label}`,
              node: index.node(edge.source),
            })),
        )
      : [];
  const isData = node.type === "database" || node.type === "table" || node.type === "external";

  return (
    <>
      <Header
        type={node.type}
        kicker={
          <>
            <span className="insp-type">{TYPE_LABEL[node.type]}</span>
            {lane ? <span className="insp-lane">{lane.title}</span> : null}
          </>
        }
        title={<NodeTitle node={node} />}
      />

      <div className="insp-body">
        <SourceLine node={node} />
        {node.detail ? <p className="insp-note">{node.detail}</p> : null}

        <div className="insp-actions">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="trace-flow"
            disabled={!canTrace}
            title={canTrace ? "Walk through every step this connects to" : "No connected path was detected"}
            onClick={() => (tracing && map.trace?.playing ? map.stopTrace() : map.startTrace())}
          >
            <PlayIcon size={12} />
            {tracing ? "Replay trace" : "Trace flow"}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="view-source"
            disabled={!node.source}
            title={node.source ? "Open the real file" : "No source location was detected"}
            onClick={map.openSource}
          >
            <CodeIcon size={14} />
            View source
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setExplainKey((key) => key + 1)}>
            <SparkIcon size={14} />
            Explain this
          </button>
        </div>

        <Facts node={node} />

        {canTrace ? <TraceSteps index={index} /> : null}

        {inside.length > 0 ? (
          <Relations
            title={node.type === "database" ? "Tables" : "Inside"}
            rows={inside.map((child) => ({ key: child.id, verb: null, node: child }))}
          />
        ) : null}
        <Relations
          title={isData ? "Connects to" : "Calls"}
          rows={outgoing.map((edge) => relation(index, edge, edge.target))}
          empty={node.type === "service" || node.type === "function" || node.type === "api" ? "Nothing detected" : null}
        />
        <Relations
          title={isData ? "Used by" : "Called by"}
          rows={[...incoming.map((edge) => relation(index, edge, edge.source)), ...viaTables]}
          empty={node.type !== "page" ? "Nothing detected" : null}
        />

        <ExplainSection node={node} flow={null} autoRunKey={explainKey} />
      </div>
    </>
  );
}

function FlowDetails() {
  const map = useMap();
  const [explainKey, setExplainKey] = useState(0);
  const index = map.index;
  const flow = map.flowId && index ? index.flow(map.flowId) : null;
  if (!index || !flow) return null;
  return (
    <>
      <Header type={null} kicker={<span className="insp-type">User flow</span>} title={flow.label} />
      <div className="insp-body">
        {flow.description ? <p className="insp-note">{flow.description}</p> : null}
        <div className="insp-actions">
          <button type="button" className="btn btn-primary" onClick={map.startTrace}>
            <PlayIcon size={12} />
            Replay trace
          </button>
          <button type="button" className="btn btn-quiet" onClick={() => setExplainKey((key) => key + 1)}>
            <SparkIcon size={14} />
            Explain this flow
          </button>
        </div>
        <TraceSteps index={index} />
        <ExplainSection node={null} flow={flow} autoRunKey={explainKey} />
      </div>
    </>
  );
}

function ApplicationDetails({ index, node }: { index: GraphIndex; node: GraphNode }) {
  const counts = TYPE_GROUPS.map((group) => ({
    group,
    count: index.nodes.filter((item) => group.types.includes(item.type) && item.type !== "file").length,
  })).filter((item) => item.count > 0);
  return (
    <>
      <Header type="application" kicker={<span className="insp-type">Application</span>} title={node.label} />
      <div className="insp-body">
        {node.detail ? <p className="insp-note">{node.detail}</p> : null}
        <dl className="facts">
          {counts.map(({ group, count }) => (
            <div key={group.id} className="fact">
              <dt>{group.label}</dt>
              <dd>{count}</dd>
            </div>
          ))}
          <div className="fact">
            <dt>User flows</dt>
            <dd>{index.flows.length > 0 ? index.flows.length : <span className="unknown">Not detected</span>}</dd>
          </div>
        </dl>
      </div>
    </>
  );
}

function SourceLine({ node }: { node: GraphNode }) {
  const map = useMap();
  if (!node.source) {
    return <p className="insp-file is-missing">Source location not detected</p>;
  }
  const { file, startLine, endLine } = node.source;
  const lines = startLine === endLine ? `${startLine}` : `${startLine}–${endLine}`;
  return (
    <button type="button" className="insp-file" onClick={map.openSource} title="View source">
      <TypeIcon type="file" size={13} />
      <span className="mono insp-file-path">{file}</span>
      <span className="mono insp-file-lines">:{lines}</span>
    </button>
  );
}

function Facts({ node }: { node: GraphNode }) {
  const rows: { label: string; value: ReactNode }[] = [];
  const meta = node.metadata ?? {};
  if (node.type === "page") rows.push({ label: "Route", value: meta.route ? <code>{meta.route}</code> : <Unknown /> });
  if (node.type === "api") {
    rows.push({ label: "Method", value: meta.method ? <code>{meta.method}</code> : <Unknown /> });
    rows.push({ label: "Path", value: meta.path ? <code>{meta.path}</code> : <Unknown /> });
  }
  if (node.type === "api" || node.type === "page" || meta.authRequired != null) {
    rows.push({
      label: "Authentication",
      value:
        meta.authRequired === true ? (
          <span className="pill pill-auth">Required</span>
        ) : meta.authRequired === false ? (
          "Not required"
        ) : (
          <Unknown />
        ),
    });
  }
  if (meta.statusCode != null) rows.push({ label: "Status", value: <code>{meta.statusCode}</code> });
  if (meta.errorMessage) rows.push({ label: "Message", value: meta.errorMessage });
  rows.push({
    label: "Runtime",
    value: node.runtime?.observed ? (
      <span>
        {node.runtime.requestCount != null ? `${node.runtime.requestCount} requests` : "Observed"}
        {node.runtime.errorCount != null ? ` · ${node.runtime.errorCount} errors` : ""}
        {node.runtime.avgDuration != null ? ` · ${Math.round(node.runtime.avgDuration)} ms avg` : ""}
      </span>
    ) : (
      <span className="unknown">No telemetry attached</span>
    ),
  });
  return (
    <dl className="facts">
      {rows.map((row) => (
        <div className="fact" key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Unknown() {
  return <span className="unknown">Not detected</span>;
}

interface RelationRow {
  key: string;
  verb: string | null;
  node: GraphNode;
}

function relation(index: GraphIndex, edge: GraphEdge, otherId: string): RelationRow {
  return { key: edge.id, verb: edge.label, node: index.node(otherId) };
}

function Relations({ title, rows, empty = null }: { title: string; rows: RelationRow[]; empty?: string | null }) {
  const map = useMap();
  if (rows.length === 0 && !empty) return null;
  return (
    <section className="insp-section">
      <h3 className="insp-heading">{title}</h3>
      {rows.length === 0 ? (
        <p className="unknown small">{empty}</p>
      ) : (
        <ul className="rel-list">
          {rows.map((row) => (
            <li key={row.key}>
              <button type="button" className="rel-row" onClick={() => map.selectNode(row.node.id)} title={row.node.label}>
                {row.verb ? <span className="rel-verb">{row.verb}</span> : null}
                <span className="rel-icon" data-type={row.node.type}>
                  <TypeIcon type={row.node.type} size={13} />
                </span>
                <span className={isCodeLabel(row.node) ? "rel-label mono" : "rel-label"}>{row.node.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The path in reading order, lighting up as the trace plays. */
function TraceSteps({ index }: { index: GraphIndex }) {
  const map = useMap();
  const listRef = useRef<HTMLOListElement>(null);
  const steps = map.trace?.steps ?? map.traceSteps;
  const at = map.trace ? map.trace.at : steps.length - 1;
  const playing = map.trace?.playing ?? false;
  const highlight = map.highlight;

  useEffect(() => {
    if (!playing) return;
    const current = listRef.current?.querySelector<HTMLElement>("[data-current='true']");
    current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [at, playing]);

  if (steps.length < 2) return null;
  const seen = new Set<string>();

  return (
    <section className="insp-section">
      <h3 className="insp-heading">
        What happens
        <span className="insp-count">{steps.length} steps</span>
      </h3>
      <ol className="trace-list" ref={listRef}>
        {steps.map((step, position) => {
          const items = step.map((id) => {
            const node = index.tryNode(id);
            if (!node) return null;
            const verb = verbInto(index, id, seen, highlight?.edges ?? null);
            return { node, verb };
          });
          for (const id of step) seen.add(id);
          const state = position < at || (!playing && position <= at) ? "done" : position === at ? "current" : "todo";
          return (
            <li key={position} className={`trace-step is-${state}`} data-current={state === "current"}>
              <span className="trace-num mono">{String(position + 1).padStart(2, "0")}</span>
              <div className="trace-items">
                {items.map((item) =>
                  item ? (
                    <button
                      type="button"
                      key={item.node.id}
                      className={item.node.id === map.focusId ? "trace-item is-focus" : "trace-item"}
                      onClick={() => map.selectNode(item.node.id)}
                    >
                      {item.verb ? <span className="trace-verb">{item.verb}</span> : null}
                      <span className="trace-label">
                        <span className="rel-icon" data-type={item.node.type}>
                          <TypeIcon type={item.node.type} size={13} />
                        </span>
                        <span className={isCodeLabel(item.node) ? "mono" : undefined}>{item.node.label}</span>
                      </span>
                    </button>
                  ) : null,
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** The recorded edge that leads into this step from an earlier one, if any. */
function verbInto(index: GraphIndex, id: string, earlier: Set<string>, onPath: Set<string> | null): string | null {
  for (const edge of index.incomingOf(id)) {
    if (edge.kind === "contains") continue;
    if (onPath && !onPath.has(edge.id)) continue;
    if (earlier.has(edge.source)) return edge.label;
  }
  if ([...earlier].some((other) => index.node(id).parentId === other)) return "inside";
  return null;
}
