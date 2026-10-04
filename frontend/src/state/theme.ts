import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "workflow-theme";
const listeners = new Set<() => void>();

/** The theme index.html applied before first paint. */
function current(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function saved(): Theme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme): void {
  const root = document.documentElement;
  if (root.dataset.theme === theme) return;
  root.classList.add("theme-switching");
  root.dataset.theme = theme;
  window.setTimeout(() => root.classList.remove("theme-switching"), 300);
  for (const listener of listeners) listener();
}

// Until the user picks a theme, follow the system setting as it changes.
const system = window.matchMedia("(prefers-color-scheme: light)");
system.addEventListener("change", (event) => {
  if (saved() == null) apply(event.matches ? "light" : "dark");
});

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme(): { theme: Theme; toggle: () => void } {
  const theme = useSyncExternalStore(subscribe, current);
  const toggle = useCallback(() => {
    const next: Theme = current() === "light" ? "dark" : "light";
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private windows can refuse storage; the switch still applies.
    }
    apply(next);
  }, []);
  return { theme, toggle };
}
