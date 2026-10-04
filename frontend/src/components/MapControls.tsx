import { useReactFlow } from "@xyflow/react";
import { useMap } from "../state/mapStore.tsx";
import { FitIcon, MinusIcon, PlusIcon, ResetIcon } from "./icons.tsx";

/** Zoom, fit and reset. Panning is drag; scrolling zooms. */
export function MapControls() {
  const flow = useReactFlow();
  const map = useMap();
  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      <button type="button" className="icon-btn" onClick={() => void flow.zoomIn({ duration: 180 })} aria-label="Zoom in" title="Zoom in" data-testid="toolbar-zoom-in">
        <PlusIcon size={15} />
      </button>
      <button type="button" className="icon-btn" onClick={() => void flow.zoomOut({ duration: 180 })} aria-label="Zoom out" title="Zoom out" data-testid="toolbar-zoom-out">
        <MinusIcon size={15} />
      </button>
      <span className="map-controls-sep" aria-hidden="true" />
      <button type="button" className="icon-btn" onClick={map.fit} aria-label="Fit the map" title="Fit the map" data-testid="toolbar-fit">
        <FitIcon size={15} />
      </button>
      <button type="button" className="icon-btn" onClick={map.resetView} aria-label="Reset the view" title="Reset the view" data-testid="toolbar-reset">
        <ResetIcon size={15} />
      </button>
    </div>
  );
}
