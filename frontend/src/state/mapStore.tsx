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
import type { TypeGroup } from "../graph/lanes.ts";
import { loadApplicationGraph } from "../graph/loadGraph.ts";
import { highlightFor, traceFor, type Highlight } from "../graph/path.ts";
import type { ApplicationGraph } from "../graph/types.ts";
import { containerOf, defaultCollapsed, visibleNodeIds } from "../graph/visibility.ts";

export type Phase = "boot" | "empty" | "analyzing" | "ready";

export interface AnalysisSummary {
  filesAnalyzed: number;
  filesSkipped: number;
  warnings: string[];
}

export interface LoadedProject {
  graph: ApplicationGraph;
  /** Set for analyzed repositories; null for the built-in sample. */
  projectId: string | null;
  repository: string | null;
  summary: AnalysisSummary | null;
  sample: boolean;
}

export interface AnalysisRun {
  id: number;
  repository: string;
  startedAt: number;
  status: "running" | "done";
  result: LoadedProject | null;
}

/** Ask the map to move the camera. `select` only moves when the path is off screen. */
export interface ViewRequest {
  id: number;
  nodeIds: string[];
  reason: "load" | "select" | "fit";
}

export interface TraceState {
  steps: string[][];
  /** Index of the last lit step. */
  at: number;
  playing: boolean;
}

interface MapContextValue {
  phase: Phase;
  run: AnalysisRun | null;
  landingError: string | null;
  landingRepository: string;
  analyze: (repository: string) => void;
  openSample: () => void;
  finishAnalysis: () => void;
  startOver: () => void;

  project: LoadedProject | null;
  graph: ApplicationGraph | null;
  index: GraphIndex | null;
  projectId: string | null;

  visible: Set<string>;
  collapsed: ReadonlySet<string>;
  toggleCollapsed: (id: string) => void;

  focusId: string | null;
  flowId: string | null;
  highlight: Highlight | null;
  selectNode: (id: string, options?: { openSource?: boolean }) => void;
  selectFlow: (id: string) => void;
  clearSelection: () => void;

  emphasis: TypeGroup | null;
  setEmphasis: (group: TypeGroup | null) => void;

  trace: TraceState | null;
  traceSteps: string[][];
  startTrace: () => void;
  stopTrace: () => void;

  sourceOpen: boolean;
  openSource: () => void;
  closeSource: () => void;

  viewRequest: ViewRequest;
  fit: () => void;
  resetView: () => void;
}

const MapContext = createContext<MapContextValue | null>(null);

const TRACE_STEP_MS = 520;

export function GraphProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("boot");
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [landingError, setLandingError] = useState<string | null>(null);
  const [landingRepository, setLandingRepository] = useState("");
  const [project, setProject] = useState<LoadedProject | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [emphasis, setEmphasisState] = useState<TypeGroup | null>(null);
  const [trace, setTrace] = useState<TraceState | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [viewRequest, setViewRequest] = useState<ViewRequest>({ id: 0, nodeIds: [], reason: "load" });
  const runCounter = useRef(0);

  const graph = project?.graph ?? null;
  const index = useMemo(() => (graph ? new GraphIndex(graph) : null), [graph]);

  const visible = useMemo(() => {
    if (!index) return new Set<string>();
    return visibleNodeIds(index, { collapsed, focusId });
  }, [index, collapsed, focusId]);

  const highlight = useMemo(() => {
    if (!index) return null;
    return highlightFor(index, focusId, flowId);
  }, [index, focusId, flowId]);

  const traceSteps = useMemo(() => {
    if (!index) return [];
    return traceFor(index, focusId, flowId);
  }, [index, focusId, flowId]);

  const requestView = useCallback((nodeIds: string[], reason: ViewRequest["reason"]) => {
    setViewRequest((current) => ({ id: current.id + 1, nodeIds, reason }));
  }, []);

  const resetSelection = useCallback(() => {
    setFocusId(null);
    setFlowId(null);
    setTrace(null);
    setSourceOpen(false);
  }, []);

  const commitProject = useCallback(
    (loaded: LoadedProject) => {
      const nextIndex = new GraphIndex(loaded.graph);
      setProject(loaded);
      setCollapsed(defaultCollapsed(nextIndex));
      setEmphasisState(null);
      resetSelection();
      setPhase("ready");
      setLandingError(null);
      requestView([], "load");
      writeLocation(loaded);
    },
    [requestView, resetSelection],
  );

  const analyze = useCallback((repository: string) => {
    const trimmed = repository.trim();
    setLandingRepository(trimmed);
    if (!trimmed) {
      setLandingError("Paste a GitHub repository URL to analyze.");
      setPhase("empty");
      return;
    }
    const id = runCounter.current + 1;
    runCounter.current = id;
    setLandingError(null);
    setRun({ id, repository: trimmed, startedAt: Date.now(), status: "running", result: null });
    setPhase("analyzing");

    void requestAnalysis(trimmed)
      .then((result) => {
        if (runCounter.current !== id) return;
        setRun((current) => (current && current.id === id ? { ...current, status: "done", result } : current));
      })
      .catch((error: unknown) => {
        if (runCounter.current !== id) return;
        setRun(null);
        setPhase("empty");
        setLandingError(error instanceof Error ? error.message : "Could not analyze that repository.");
      });
  }, []);

  const finishAnalysis = useCallback(() => {
    if (!run || run.status !== "done" || !run.result) return;
    const result = run.result;
    setRun(null);
    commitProject(result);
  }, [commitProject, run]);

  const openSample = useCallback(() => {
    runCounter.current += 1;
    setLandingError(null);
    loadApplicationGraph()
      .then((loaded) => {
        commitProject({ graph: loaded, projectId: null, repository: null, summary: null, sample: true });
      })
      .catch((error: unknown) => {
        setPhase("empty");
        setLandingError(error instanceof Error ? error.message : "Could not load the example map.");
      });
  }, [commitProject]);

  const startOver = useCallback(() => {
    runCounter.current += 1;
    setRun(null);
    setProject(null);
    resetSelection();
    setEmphasisState(null);
    setPhase("empty");
    setLandingError(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, [resetSelection]);

  // Reopen the analysis named in the address bar, so a refresh during a demo
  // keeps the map. Projects live on the backend for a few hours.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("project");
    const repository = params.get("repo") ?? "";
    if (params.has("sample")) {
      openSample();
      return;
    }
    if (!projectId || !/^[a-f0-9]+$/.test(projectId)) {
      setPhase("empty");
      return;
    }
    setLandingRepository(repository);
    loadApplicationGraph(`/api/projects/${projectId}/graph`)
      .then((loaded) => {
        commitProject({ graph: loaded, projectId, repository: repository || null, summary: null, sample: false });
      })
      .catch(() => {
        setPhase("empty");
        setLandingError("That analysis is no longer on the server. Analyze the repository again.");
        window.history.replaceState(null, "", window.location.pathname);
      });
    // Runs once on boot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectNode = useCallback(
    (id: string, options?: { openSource?: boolean }) => {
      if (!index) return;
      const node = index.tryNode(id);
      if (!node) return;
      // Selecting a page opens it; selecting something inside a closed page opens that page.
      const container = node.type === "page" ? id : containerOf(index, id);
      if (container && collapsed.has(container)) {
        setCollapsed((current) => {
          const next = new Set(current);
          next.delete(container);
          return next;
        });
      }
      setEmphasisState(null);
      setFlowId(null);
      setTrace(null);
      setFocusId(id);
      if (options?.openSource) setSourceOpen(true);
      const path = highlightFor(index, id, null);
      requestView(path ? [...path.nodes] : [id], "select");
    },
    [collapsed, index, requestView],
  );

  const selectFlow = useCallback(
    (id: string) => {
      if (!index) return;
      const flow = index.flow(id);
      if (!flow) return;
      setEmphasisState(null);
      setFocusId(null);
      setSourceOpen(false);
      setFlowId(id);
      setCollapsed((current) => {
        const next = new Set(current);
        for (const nodeId of flow.nodeIds) {
          const container = containerOf(index, nodeId);
          if (container) next.delete(container);
        }
        return next;
      });
      const steps = traceFor(index, null, id);
      setTrace(steps.length > 1 ? { steps, at: 0, playing: !reducedMotion() } : null);
      requestView(flow.nodeIds, "select");
    },
    [index, requestView],
  );

  const clearSelection = useCallback(() => {
    resetSelection();
  }, [resetSelection]);

  const setEmphasis = useCallback(
    (group: TypeGroup | null) => {
      if (group) resetSelection();
      setEmphasisState(group);
    },
    [resetSelection],
  );

  const toggleCollapsed = useCallback(
    (id: string) => {
      if (!index) return;
      const next = new Set(collapsed);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        if (focusId && focusId !== id && containerOf(index, focusId) === id) setFocusId(id);
      }
      setCollapsed(next);
      requestView([], "fit");
    },
    [collapsed, focusId, index, requestView],
  );

  const startTrace = useCallback(() => {
    if (traceSteps.length === 0) return;
    const reduce = reducedMotion();
    setTrace({
      steps: traceSteps,
      at: reduce ? traceSteps.length - 1 : 0,
      playing: !reduce && traceSteps.length > 1,
    });
  }, [traceSteps]);

  const stopTrace = useCallback(() => {
    setTrace(null);
  }, []);

  useEffect(() => {
    if (!trace?.playing) return;
    const timer = window.setTimeout(() => {
      setTrace((current) => {
        if (!current || !current.playing) return current;
        const at = current.at + 1;
        return { ...current, at, playing: at < current.steps.length - 1 };
      });
    }, TRACE_STEP_MS);
    return () => window.clearTimeout(timer);
  }, [trace]);

  const openSource = useCallback(() => {
    setSourceOpen(true);
    // Keep the node being read visible beside its code.
    if (focusId) requestView([focusId], "select");
  }, [focusId, requestView]);
  const closeSource = useCallback(() => setSourceOpen(false), []);

  const fit = useCallback(() => requestView([], "fit"), [requestView]);

  const resetView = useCallback(() => {
    resetSelection();
    setEmphasisState(null);
    if (index) setCollapsed(defaultCollapsed(index));
    requestView([], "fit");
  }, [index, requestView, resetSelection]);

  const value = useMemo<MapContextValue>(
    () => ({
      phase,
      run,
      landingError,
      landingRepository,
      analyze,
      openSample,
      finishAnalysis,
      startOver,
      project,
      graph,
      index,
      projectId: project?.projectId ?? null,
      visible,
      collapsed,
      toggleCollapsed,
      focusId,
      flowId,
      highlight,
      selectNode,
      selectFlow,
      clearSelection,
      emphasis,
      setEmphasis,
      trace,
      traceSteps,
      startTrace,
      stopTrace,
      sourceOpen,
      openSource,
      closeSource,
      viewRequest,
      fit,
      resetView,
    }),
    [
      phase,
      run,
      landingError,
      landingRepository,
      analyze,
      openSample,
      finishAnalysis,
      startOver,
      project,
      graph,
      index,
      visible,
      collapsed,
      toggleCollapsed,
      focusId,
      flowId,
      highlight,
      selectNode,
      selectFlow,
      clearSelection,
      emphasis,
      setEmphasis,
      trace,
      traceSteps,
      startTrace,
      stopTrace,
      sourceOpen,
      openSource,
      closeSource,
      viewRequest,
      fit,
      resetView,
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

async function requestAnalysis(repository: string): Promise<LoadedProject> {
  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ repository }),
    });
  } catch {
    throw new Error("The WorkFlow backend is not reachable. Start it with `npm run dev` in backend/.");
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 502 || response.status === 504 || body == null) {
      throw new Error(messageFrom(body) ?? "The WorkFlow backend is not reachable. Start it with `npm run dev` in backend/.");
    }
    throw new Error(messageFrom(body) ?? `Analysis failed (${response.status}).`);
  }
  const project = readProject(body);
  if (!project) throw new Error("The analysis did not return a project.");
  const graph = await loadApplicationGraph(project.graphUrl);
  return {
    graph,
    projectId: project.projectId,
    repository: project.repository ?? repository,
    summary: project.summary,
    sample: false,
  };
}

function messageFrom(body: unknown): string | null {
  if (body == null || typeof body !== "object" || !("error" in body)) return null;
  const message = (body as { error?: unknown }).error;
  return typeof message === "string" && message.trim() !== "" ? message : null;
}

function readProject(body: unknown): {
  projectId: string;
  graphUrl: string;
  repository: string | null;
  summary: AnalysisSummary | null;
} | null {
  if (body == null || typeof body !== "object") return null;
  const record = body as {
    projectId?: unknown;
    graphUrl?: unknown;
    repository?: unknown;
    summary?: unknown;
  };
  if (typeof record.projectId !== "string" || typeof record.graphUrl !== "string") return null;
  let summary: AnalysisSummary | null = null;
  if (record.summary != null && typeof record.summary === "object") {
    const raw = record.summary as { filesAnalyzed?: unknown; filesSkipped?: unknown; warnings?: unknown };
    summary = {
      filesAnalyzed: typeof raw.filesAnalyzed === "number" ? raw.filesAnalyzed : 0,
      filesSkipped: typeof raw.filesSkipped === "number" ? raw.filesSkipped : 0,
      warnings: Array.isArray(raw.warnings)
        ? raw.warnings.filter((item): item is string => typeof item === "string")
        : [],
    };
  }
  return {
    projectId: record.projectId,
    graphUrl: record.graphUrl,
    repository: typeof record.repository === "string" ? record.repository : null,
    summary,
  };
}

function writeLocation(project: LoadedProject): void {
  const params = new URLSearchParams();
  if (project.sample) params.set("sample", "1");
  else if (project.projectId) {
    params.set("project", project.projectId);
    if (project.repository) params.set("repo", project.repository);
  }
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
