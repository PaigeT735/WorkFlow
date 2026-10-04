import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { GraphIndex } from "../graph/indexGraph.ts";
import { loadApplicationGraph } from "../graph/loadGraph.ts";
import { highlightFor, type Highlight } from "../graph/path.ts";
import type { ApplicationGraph } from "../graph/types.ts";
import {
  DEFAULT_FILTERS,
  visibleNodeIds,
  type Depth,
  type Filters,
  type VisibilityInput,
} from "../graph/visibility.ts";

export interface ViewRequest {
  id: number;
  mode: "overview" | "selection";
  nodeIds: string[];
  maxZoom: number;
}

interface Snapshot {
  depth: Depth;
  focusId: string | null;
  flowId: string | null;
  pinned: string[];
  sourceOpen: boolean;
}

interface ViewState {
  depth: Depth;
  focusId: string | null;
  flowId: string | null;
  pinned: string[];
  filters: Filters;
  showIssues: boolean;
  showFlows: boolean;
  search: string;
  searchOpen: boolean;
  sourceOpen: boolean;
  history: Snapshot[];
  viewRequest: ViewRequest;
}

export interface ZoomHint {
  pageId: string | null;
  seedId: string | null;
}

interface MapContextValue {
  status: "loading" | "error" | "ready";
  errorMessage: string | null;
  graph: ApplicationGraph | null;
  index: GraphIndex | null;
  depth: Depth;
  focusId: string | null;
  flowId: string | null;
  pinned: readonly string[];
  filters: Filters;
  showIssues: boolean;
  showFlows: boolean;
  search: string;
  searchOpen: boolean;
  sourceOpen: boolean;
  canBack: boolean;
  viewRequest: ViewRequest;
  visible: Set<string>;
  highlight: Highlight | null;
  selectNode: (id: string, options?: { openSource?: boolean }) => void;
  selectFlow: (id: string) => void;
  collapseNode: (id: string) => void;
  clearSelection: () => void;
  back: () => void;
  reset: () => void;
  fit: () => void;
  semanticZoom: (direction: "in" | "out", hint: ZoomHint) => boolean;
  setFilter: (key: keyof Filters, value: boolean) => void;
  toggleIssues: () => void;
  toggleFlows: () => void;
  setSearch: (value: string) => void;
  setSearchOpen: (open: boolean) => void;
  openSource: () => void;
  closeSource: () => void;
  projectId: string | null;
  analyzeState: "idle" | "running" | "error";
  analyzeMessage: string | null;
  analyzeRepository: (repository: string) => void;
  useSample: () => void;
}

const MapContext = createContext<MapContextValue | null>(null);

export function GraphProvider({ children }: { children: ReactNode }) {
  const [graph, setGraph] = useState<ApplicationGraph | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [analyzeState, setAnalyzeState] = useState<"idle" | "running" | "error">("idle");
  const [analyzeMessage, setAnalyzeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [view, setView] = useState<ViewState>(() => initialView());
  const viewRef = useRef(view);
  viewRef.current = view;

  const applyGraph = useCallback((loaded: ApplicationGraph, nextProjectId: string | null) => {
    setProjectId(nextProjectId);
    setGraph(loaded);
    setErrorMessage(null);
    setView(initialView());
  }, []);

  useEffect(() => {
    let cancel = false;
    loadApplicationGraph()
      .then((loaded) => {
        if (!cancel) applyGraph(loaded, null);
      })
      .catch((error: unknown) => {
        if (cancel) return;
        setErrorMessage(error instanceof Error ? error.message : "Could not load the map.");
      });
    return () => {
      cancel = true;
    };
  }, [applyGraph]);

  const analyzeRepository = useCallback((repository: string) => {
    const trimmed = repository.trim();
    if (!trimmed) {
      setAnalyzeState("error");
      setAnalyzeMessage("Enter a GitHub repository URL.");
      return;
    }
    setAnalyzeState("running");
    setAnalyzeMessage("Analyzing repository…");
    void fetch("/api/analyze", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ repository: trimmed }),
    })
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(messageFrom(body) ?? `Analyze failed (${response.status}).`);
        }
        const project = readProject(body);
        if (!project) throw new Error("Analyze did not return a project id.");
        const loaded = await loadApplicationGraph(project.graphUrl);
        applyGraph(loaded, project.projectId);
        const warning = project.warning;
        setAnalyzeState("idle");
        setAnalyzeMessage(
          warning
            ? `Showing ${loaded.name}. ${warning}`
            : `Showing ${loaded.name} from the analyzed repository.`,
        );
      })
      .catch((error: unknown) => {
        setAnalyzeState("error");
        setAnalyzeMessage(error instanceof Error ? error.message : "Could not analyze that repository.");
      });
  }, [applyGraph]);

  const useSample = useCallback(() => {
    setAnalyzeState("running");
    setAnalyzeMessage(null);
    loadApplicationGraph()
      .then((loaded) => {
        applyGraph(loaded, null);
        setAnalyzeState("idle");
        setAnalyzeMessage("Showing the Harbor sample.");
      })
      .catch((error: unknown) => {
        setAnalyzeState("error");
        setAnalyzeMessage(error instanceof Error ? error.message : "Could not load the sample.");
      });
  }, [applyGraph]);

  const index = useMemo(() => (graph ? new GraphIndex(graph) : null), [graph]);

  const visible = useMemo(() => {
    if (!index) return new Set<string>();
    return visibleNodeIds(index, toInput(view));
  }, [index, view]);

  const highlight = useMemo(() => {
    if (!index) return null;
    return highlightFor(index, view.focusId, view.flowId);
  }, [index, view.focusId, view.flowId]);

  const selectNode = useCallback(
    (id: string, options?: { openSource?: boolean }) => {
      if (!index) return;
      setView((current) => {
        const node = index.tryNode(id);
        if (!node) return current;
        const page = index.owningPage(id);
        const depth: Depth = node.type === "page" ? "page" : "chain";
        const pinned =
          node.type === "page" ? [id] : page && page.id !== id ? [page.id, id] : [id];
        const sourceOpen = options?.openSource ?? false;
        if (
          current.focusId === id &&
          current.depth === depth &&
          current.flowId == null &&
          current.sourceOpen === sourceOpen &&
          samePins(current.pinned, pinned)
        ) {
          return current.searchOpen ? { ...current, searchOpen: false } : current;
        }
        const next: VisibilityInput = {
          depth,
          focusId: id,
          flowId: null,
          pinned,
          filters: current.filters,
        };
        return {
          ...current,
          depth,
          focusId: id,
          flowId: null,
          pinned,
          sourceOpen,
          searchOpen: false,
          history: pushHistory(current),
          viewRequest: frameRequest(index, current.viewRequest.id, next, "selection"),
        };
      });
    },
    [index],
  );

  const selectFlow = useCallback(
    (id: string) => {
      if (!index || !index.flow(id)) return;
      setView((current) => {
        const next: VisibilityInput = {
          depth: "chain",
          focusId: null,
          flowId: id,
          pinned: [],
          filters: current.filters,
        };
        return {
          ...current,
          depth: "chain",
          focusId: null,
          flowId: id,
          pinned: [],
          sourceOpen: false,
          showFlows: true,
          history: pushHistory(current),
          viewRequest: frameRequest(index, current.viewRequest.id, next, "selection"),
        };
      });
    },
    [index],
  );

  const collapseNode = useCallback(
    (id: string) => {
      if (!index) return;
      setView((current) => {
        const node = index.tryNode(id);
        if (!node) return current;
        const pinned = current.pinned.filter(
          (pin) => pin !== id && !index.ancestorIds(pin).includes(id),
        );
        const chainLeft = pinned.some((pin) => {
          const item = index.tryNode(pin);
          return item != null && item.type !== "page";
        });
        const pageLeft = pinned.some((pin) => index.tryNode(pin)?.type === "page");
        const depth: Depth = chainLeft ? "chain" : pageLeft ? "page" : "overview";
        let focusId = current.focusId;
        if (focusId === id || (focusId != null && index.ancestorIds(focusId).includes(id))) {
          focusId = node.type === "page" ? id : (index.owningPage(id)?.id ?? null);
        }
        if (depth === "overview") focusId = node.type === "page" ? id : focusId;
        const next: VisibilityInput = {
          depth,
          focusId,
          flowId: null,
          pinned,
          filters: current.filters,
        };
        return {
          ...current,
          depth,
          focusId,
          flowId: null,
          pinned,
          sourceOpen: false,
          history: pushHistory(current),
          viewRequest: frameRequest(
            index,
            current.viewRequest.id,
            next,
            depth === "overview" ? "overview" : "selection",
          ),
        };
      });
    },
    [index],
  );

  const clearSelection = useCallback(() => {
    setView((current) => {
      if (current.focusId == null && current.flowId == null && !current.sourceOpen) return current;
      return { ...current, focusId: null, flowId: null, sourceOpen: false };
    });
  }, []);

  const back = useCallback(() => {
    if (!index) return;
    setView((current) => {
      if (current.history.length === 0) return current;
      const history = current.history.slice(0, -1);
      const previous = current.history[current.history.length - 1];
      if (!previous) return current;
      const next: VisibilityInput = {
        depth: previous.depth,
        focusId: previous.focusId,
        flowId: previous.flowId,
        pinned: previous.pinned,
        filters: current.filters,
      };
      return {
        ...current,
        ...previous,
        history,
        viewRequest: frameRequest(
          index,
          current.viewRequest.id,
          next,
          previous.depth === "overview" && previous.focusId == null ? "overview" : "selection",
        ),
      };
    });
  }, [index]);

  const reset = useCallback(() => {
    if (!index) return;
    setView((current) => {
      const next = initialView();
      next.viewRequest = frameRequest(
        index,
        current.viewRequest.id,
        toInput(next),
        "overview",
      );
      return next;
    });
  }, [index]);

  const fit = useCallback(() => {
    if (!index) return;
    setView((current) => {
      const mode = current.depth === "overview" && current.focusId == null ? "overview" : "selection";
      return {
        ...current,
        viewRequest: frameRequest(index, current.viewRequest.id, toInput(current), mode),
      };
    });
  }, [index]);

  const semanticZoom = useCallback(
    (direction: "in" | "out", hint: ZoomHint) => {
      const current = viewRef.current;
      if (!index) return false;
      if (direction === "in") {
        if (current.depth === "chain") return false;
        if (current.depth === "overview") {
          const pageId =
            hint.pageId ??
            (current.focusId && index.tryNode(current.focusId)?.type === "page"
              ? current.focusId
              : null) ??
            index.nodesOfType("page").find((page) => page.parentId == null)?.id ??
            null;
          if (!pageId) return false;
          selectNode(pageId);
          return true;
        }
        const seed = hint.seedId ?? firstInteraction(index, current.pinned, current.focusId);
        if (!seed) return false;
        selectNode(seed);
        return true;
      }
      if (current.depth === "chain") {
        const pageId =
          hint.pageId ??
          current.pinned.find((id) => index.tryNode(id)?.type === "page") ??
          expandedPage(index, visibleNodeIds(index, toInput(current)));
        if (pageId) {
          selectNode(pageId);
          return true;
        }
      }
      if (current.depth === "overview") return false;
      setView((latest) => {
        const focusId =
          latest.focusId && index.tryNode(latest.focusId)?.type === "page" ? latest.focusId : null;
        const next: VisibilityInput = {
          depth: "overview",
          focusId,
          flowId: null,
          pinned: [],
          filters: latest.filters,
        };
        return {
          ...latest,
          depth: "overview",
          focusId,
          flowId: null,
          pinned: [],
          sourceOpen: false,
          viewRequest: frameRequest(index, latest.viewRequest.id, next, "overview"),
        };
      });
      return true;
    },
    [index, selectNode],
  );

  const setFilter = useCallback(
    (key: keyof Filters, value: boolean) => {
      if (!index) return;
      setView((current) => {
        const filters = { ...current.filters, [key]: value };
        const next: VisibilityInput = { ...toInput(current), filters };
        return {
          ...current,
          filters,
          viewRequest: frameRequest(
            index,
            current.viewRequest.id,
            next,
            current.depth === "overview" && current.focusId == null ? "overview" : "selection",
          ),
        };
      });
    },
    [index],
  );

  const toggleIssues = useCallback(() => {
    setView((current) => ({ ...current, showIssues: !current.showIssues }));
  }, []);

  const toggleFlows = useCallback(() => {
    setView((current) => ({ ...current, showFlows: !current.showFlows }));
  }, []);

  const setSearch = useCallback((value: string) => {
    setView((current) => ({ ...current, search: value, searchOpen: true }));
  }, []);

  const setSearchOpen = useCallback((open: boolean) => {
    setView((current) => ({ ...current, searchOpen: open }));
  }, []);

  const openSource = useCallback(() => {
    setView((current) => ({ ...current, sourceOpen: true }));
  }, []);

  const closeSource = useCallback(() => {
    setView((current) => ({ ...current, sourceOpen: false }));
  }, []);

  const value = useMemo<MapContextValue>(
    () => ({
      status: errorMessage ? "error" : graph ? "ready" : "loading",
      errorMessage,
      graph,
      index,
      depth: view.depth,
      focusId: view.focusId,
      flowId: view.flowId,
      pinned: view.pinned,
      filters: view.filters,
      showIssues: view.showIssues,
      showFlows: view.showFlows,
      search: view.search,
      searchOpen: view.searchOpen,
      sourceOpen: view.sourceOpen,
      canBack: view.history.length > 0,
      viewRequest: view.viewRequest,
      visible,
      highlight,
      selectNode,
      selectFlow,
      collapseNode,
      clearSelection,
      back,
      reset,
      fit,
      semanticZoom,
      setFilter,
      toggleIssues,
      toggleFlows,
      setSearch,
      setSearchOpen,
      openSource,
      closeSource,
      projectId,
      analyzeState,
      analyzeMessage,
      analyzeRepository,
      useSample,
    }),
    [
      errorMessage,
      graph,
      index,
      view,
      visible,
      highlight,
      selectNode,
      selectFlow,
      collapseNode,
      clearSelection,
      back,
      reset,
      fit,
      semanticZoom,
      setFilter,
      toggleIssues,
      toggleFlows,
      setSearch,
      setSearchOpen,
      openSource,
      closeSource,
      projectId,
      analyzeState,
      analyzeMessage,
      analyzeRepository,
      useSample,
    ],
  );

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

// Context modules export the provider component and the hook that reads it.
// eslint-disable-next-line react-refresh/only-export-components
export function useMap(): MapContextValue {
  const value = useContext(MapContext);
  if (!value) throw new Error("useMap must be used inside GraphProvider.");
  return value;
}

function messageFrom(body: unknown): string | null {
  if (body == null || typeof body !== "object" || !("error" in body)) return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

function readProject(body: unknown): { projectId: string; graphUrl: string; warning: string | null } | null {
  if (body == null || typeof body !== "object") return null;
  const record = body as { projectId?: unknown; graphUrl?: unknown; summary?: unknown };
  if (typeof record.projectId !== "string" || typeof record.graphUrl !== "string") return null;
  let warning: string | null = null;
  if (record.summary != null && typeof record.summary === "object" && "warnings" in record.summary) {
    const warnings = (record.summary as { warnings?: unknown }).warnings;
    if (Array.isArray(warnings) && typeof warnings[0] === "string") warning = warnings[0];
  }
  return { projectId: record.projectId, graphUrl: record.graphUrl, warning };
}

function initialView(): ViewState {
  return {
    depth: "overview",
    focusId: null,
    flowId: null,
    pinned: [],
    filters: { ...DEFAULT_FILTERS },
    showIssues: false,
    showFlows: false,
    search: "",
    searchOpen: false,
    sourceOpen: false,
    history: [],
    viewRequest: { id: 1, mode: "overview", nodeIds: [], maxZoom: 0.9 },
  };
}

function toInput(view: ViewState): VisibilityInput {
  return {
    depth: view.depth,
    focusId: view.focusId,
    flowId: view.flowId,
    pinned: view.pinned,
    filters: view.filters,
  };
}

function snapshot(view: ViewState): Snapshot {
  return {
    depth: view.depth,
    focusId: view.focusId,
    flowId: view.flowId,
    pinned: view.pinned,
    sourceOpen: view.sourceOpen,
  };
}

function pushHistory(view: ViewState): Snapshot[] {
  const history = [...view.history, snapshot(view)];
  return history.length > 40 ? history.slice(history.length - 40) : history;
}

function frameRequest(
  index: GraphIndex,
  previousId: number,
  input: VisibilityInput,
  mode: "overview" | "selection",
): ViewRequest {
  const visible = visibleNodeIds(index, input);
  let nodeIds = [...visible];
  if (mode === "selection") {
    const highlight = highlightFor(index, input.focusId, input.flowId);
    const framed = [...(highlight?.nodes ?? [])].filter((id) => visible.has(id));
    if (framed.length > 0) nodeIds = framed;
  }
  return {
    id: previousId + 1,
    mode,
    nodeIds,
    maxZoom: mode === "overview" ? 0.9 : 1.08,
  };
}

function samePins(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const right = new Set(b);
  return a.every((id) => right.has(id));
}

function firstInteraction(
  index: GraphIndex,
  pinned: readonly string[],
  focusId: string | null,
): string | null {
  const pages = pinned.filter((id) => index.tryNode(id)?.type === "page");
  if (focusId && index.tryNode(focusId)?.type === "page" && !pages.includes(focusId)) {
    pages.push(focusId);
  }
  const children = pages.flatMap((id) => index.childrenOf(id));
  const calling = children.find(
    (child) =>
      child.type === "interaction" &&
      index.outgoingOf(child.id).some((edge) => edge.kind === "calls" || edge.kind === "queries"),
  );
  return calling?.id ?? children.find((child) => child.type === "interaction")?.id ?? null;
}

function expandedPage(index: GraphIndex, visible: Set<string>): string | null {
  for (const page of index.nodesOfType("page")) {
    if (!visible.has(page.id)) continue;
    if (index.childrenOf(page.id).some((child) => visible.has(child.id))) return page.id;
  }
  return null;
}
