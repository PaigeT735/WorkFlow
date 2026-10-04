import { useMap } from "../state/mapStore.tsx";
import { PlayIcon } from "./icons.tsx";

/**
 * User flows the analyzer reconstructed. One click plays the whole path from
 * the screen to the data.
 */
export function FlowsBar() {
  const map = useMap();
  const flows = map.index?.flows ?? [];
  if (flows.length === 0) return null;
  return (
    <div className="flows-bar" data-testid="flow-list" aria-label="User flows">
      <span className="flows-label">User flows</span>
      <div className="flows-chips">
        {flows.map((flow) => {
          const active = map.flowId === flow.id && map.focusId == null;
          return (
            <button
              key={flow.id}
              type="button"
              data-testid={`flow-${flow.id}`}
              className={active ? "flow-chip is-active" : "flow-chip"}
              aria-pressed={active}
              title={flow.description ?? flow.label}
              onClick={() => map.selectFlow(flow.id)}
            >
              <PlayIcon size={10} />
              {flow.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
