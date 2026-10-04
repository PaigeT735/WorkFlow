import { ReactFlowProvider } from "@xyflow/react";
import { useMap } from "../state/mapStore.tsx";
import { FlowsPanel } from "./FlowsPanel.tsx";
import { MapCanvas } from "./MapCanvas.tsx";
import { SidePanel } from "./SidePanel.tsx";
import { SourceDrawer } from "./SourceDrawer.tsx";
import { Toolbar } from "./Toolbar.tsx";

export function Shell() {
  const map = useMap();
  if (map.status !== "ready") {
    return (
      <div className="boot">
        <p className="product">WorkFlow</p>
        <p>{map.status === "error" ? map.errorMessage : "Mapping the application…"}</p>
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <Toolbar />
        <div className="stage">
          <MapCanvas />
          <FlowsPanel />
          <SidePanel />
          <SourceDrawer />
          {map.focusId == null && map.flowId == null ? (
            <p className="hint">Click a page to look inside. Zoom in to follow a call.</p>
          ) : null}
        </div>
      </div>
    </ReactFlowProvider>
  );
}
