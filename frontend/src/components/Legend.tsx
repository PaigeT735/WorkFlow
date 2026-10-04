import { TYPE_GROUPS } from "../graph/lanes.ts";
import { useMap } from "../state/mapStore.tsx";
import { TypeIcon } from "./icons.tsx";

/**
 * The key to the map, and a filter: pick a kind of node to bring it forward.
 * Other nodes fade rather than disappear, so no edge is ever cut.
 */
export function Legend() {
  const map = useMap();
  const index = map.index;
  if (!index) return null;
  const groups = TYPE_GROUPS.map((group) => ({
    ...group,
    count: index.nodes.filter((node) => group.types.includes(node.type) && node.type !== "file").length,
  })).filter((group) => group.count > 0);

  return (
    <div className="legend" role="toolbar" aria-label="Show on the map" data-testid="legend">
      <button
        type="button"
        className={map.emphasis == null ? "legend-chip is-active" : "legend-chip"}
        aria-pressed={map.emphasis == null}
        onClick={() => map.setEmphasis(null)}
      >
        All
      </button>
      {groups.map((group) => {
        const active = map.emphasis === group.id;
        const icon = group.types[0];
        return (
          <button
            key={group.id}
            type="button"
            className={active ? "legend-chip is-active" : "legend-chip"}
            aria-pressed={active}
            data-testid={`filter-${group.id}`}
            onClick={() => map.setEmphasis(active ? null : group.id)}
          >
            {icon ? (
              <span className="rel-icon" data-type={icon}>
                <TypeIcon type={icon} size={13} />
              </span>
            ) : null}
            {group.label}
            <span className="legend-count">{group.count}</span>
          </button>
        );
      })}
    </div>
  );
}
