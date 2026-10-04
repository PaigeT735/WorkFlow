import { useMap } from "../state/mapStore.tsx";

export function FlowsPanel() {
  const map = useMap();
  if (!map.showFlows || !map.index) return null;
  return (
    <aside className="flows-panel" data-testid="flow-list">
      <header>
        <p className="panel-kicker">Flows</p>
        <button type="button" className="text-btn" onClick={map.toggleFlows}>
          Close
        </button>
      </header>
      <ul>
        {map.index.flows.map((flow) => (
          <li key={flow.id}>
            <button
              type="button"
              data-testid={`flow-${flow.id}`}
              className={map.flowId === flow.id && map.focusId == null ? "is-selected" : ""}
              aria-pressed={map.flowId === flow.id && map.focusId == null}
              onClick={() => map.selectFlow(flow.id)}
            >
              <span className="flow-label">{flow.label}</span>
              <span className="flow-meta">{flow.nodeIds.length} steps</span>
              {flow.description ? <span className="flow-detail">{flow.description}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
