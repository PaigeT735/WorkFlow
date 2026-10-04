import { ReactFlowProvider } from "@xyflow/react";
import { useEffect } from "react";
import { useMap } from "../state/mapStore.tsx";
import { AnalysisLoading } from "./AnalysisLoading.tsx";
import { ApplicationMap } from "./ApplicationMap.tsx";
import { EmptyState } from "./EmptyState.tsx";
import { FlowsBar } from "./FlowsBar.tsx";
import { Inspector } from "./Inspector.tsx";
import { Legend } from "./Legend.tsx";
import { MapControls } from "./MapControls.tsx";
import { SourceViewer } from "./SourceViewer.tsx";
import { TopBar } from "./TopBar.tsx";

export function Shell() {
  const map = useMap();

  if (map.phase === "boot") return <main className="landing" aria-busy="true" />;
  if (map.phase === "empty") return <EmptyState />;
  if (map.phase === "analyzing") return <AnalysisLoading />;
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}

/** The map is the home. Details, source and explanations open beside it. */
function Workspace() {
  const map = useMap();
  const panelOpen = Boolean(map.focusId || map.flowId);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      if (map.sourceOpen) map.closeSource();
      else map.clearSelection();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [map]);

  const classes = ["stage", panelOpen ? "has-panel" : "", map.sourceOpen && panelOpen ? "has-source" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="app-shell">
      <TopBar />
      <div className={classes}>
        <ApplicationMap />
        <FlowsBar />
        {!panelOpen && !map.emphasis ? (
          <p className="map-hint" data-testid="map-hint">
            Click anything to see how it connects
          </p>
        ) : null}
        <div className="map-dock">
          <Legend />
          <MapControls />
        </div>
        {panelOpen && map.sourceOpen ? <SourceViewer /> : null}
        <Inspector />
      </div>
    </div>
  );
}
