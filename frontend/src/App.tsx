import { GraphProvider } from "./state/mapStore.tsx";
import { Shell } from "./components/Shell.tsx";

export function App() {
  return (
    <GraphProvider>
      <Shell />
    </GraphProvider>
  );
}
