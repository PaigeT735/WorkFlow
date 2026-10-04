export const ZOOM_EVENT = "workflow-zoom";

export function requestZoom(direction: "in" | "out"): void {
  window.dispatchEvent(new CustomEvent(ZOOM_EVENT, { detail: { direction } }));
}
