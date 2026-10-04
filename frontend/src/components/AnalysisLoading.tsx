import { useEffect, useMemo, useState } from "react";
import { GraphIndex } from "../graph/indexGraph.ts";
import type { NodeType } from "../graph/types.ts";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { useMap, type LoadedProject } from "../state/mapStore.tsx";
import { ArrowRightIcon, CheckIcon, LogoMark } from "./icons.tsx";

const STEP_MS = 150;
const HOLD_MS = 650;

/**
 * The backend reports no progress while it clones and parses, so this screen
 * does not invent stages. It shows that work is happening, then lists what the
 * analysis actually found before the map takes over.
 */
export function AnalysisLoading() {
  const map = useMap();
  const run = map.run;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (run?.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [run?.status]);

  if (!run) return null;
  const elapsed = Math.max(0, Math.floor((now - run.startedAt) / 1000));

  return (
    <main className="analysis" aria-live="polite">
      <ThemeToggle className="corner-toggle" />
      <div className="analysis-inner">
        <div className="landing-brand">
          <LogoMark size={20} />
          <span>WorkFlow</span>
        </div>
        <p className="analysis-kicker">{run.status === "running" ? "Analyzing" : "Analyzed"}</p>
        <h1 className="analysis-repo mono">{displayName(run.repository)}</h1>
        {run.status === "running" || !run.result ? (
          <>
            <div className="analysis-bar" role="progressbar" aria-label="Analyzing repository">
              <span />
            </div>
            <p className="analysis-note">
              Cloning the repository and reading its source
              <span className="analysis-elapsed mono">{elapsed}s</span>
            </p>
            <button type="button" className="link-btn" onClick={map.startOver}>
              Cancel
            </button>
          </>
        ) : (
          <Findings result={run.result} onDone={map.finishAnalysis} />
        )}
      </div>
    </main>
  );
}

function Findings({ result, onDone }: { result: LoadedProject; onDone: () => void }) {
  const lines = useMemo(() => findings(new GraphIndex(result.graph), result), [result]);
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduce ? lines.length : 0);

  useEffect(() => {
    if (shown < lines.length) {
      const timer = window.setTimeout(() => setShown((count) => count + 1), STEP_MS);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(onDone, HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [shown, lines.length, onDone]);

  return (
    <>
      <ul className="findings" data-testid="analysis-findings">
        {lines.map((line, position) => (
          <li key={line.text} className={position < shown ? (line.found ? "is-shown" : "is-shown is-none") : ""}>
            <span className="finding-mark">{line.found ? <CheckIcon size={13} /> : "–"}</span>
            {line.text}
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn-primary" onClick={onDone}>
        Open the map
        <ArrowRightIcon size={14} />
      </button>
    </>
  );
}

function findings(index: GraphIndex, result: LoadedProject): { text: string; found: boolean }[] {
  const count = (...types: NodeType[]) => index.nodes.filter((node) => types.includes(node.type)).length;
  const lines: { text: string; found: boolean }[] = [];
  if (result.summary) {
    const skipped = result.summary.filesSkipped > 0 ? ` (${result.summary.filesSkipped} skipped)` : "";
    lines.push({ text: `${plural(result.summary.filesAnalyzed, "source file")} analyzed${skipped}`, found: true });
  }
  const pages = count("page");
  const actions = count("interaction");
  lines.push({
    text: pages + actions > 0 ? join(plural(pages, "page"), plural(actions, "user interaction")) : "No pages detected",
    found: pages + actions > 0,
  });
  const apis = count("api");
  const auth = count("auth");
  lines.push({
    text: apis + auth > 0 ? join(plural(apis, "API endpoint"), plural(auth, "auth check")) : "No API endpoints detected",
    found: apis + auth > 0,
  });
  const logic = count("service", "function");
  lines.push({
    text: logic > 0 ? `${plural(logic, "service or function", "services and functions")} on request paths` : "No backend logic detected",
    found: logic > 0,
  });
  const data = count("database");
  const tables = count("table");
  const external = count("external");
  lines.push({
    text:
      data + tables + external > 0
        ? join(plural(data, "database"), plural(tables, "table"), plural(external, "external service"))
        : "No databases or external services detected",
    found: data + tables + external > 0,
  });
  const links = index.edges.filter((edge) => edge.kind !== "contains" && edge.kind !== "defined_in").length;
  lines.push({
    text: links > 0 ? join(plural(links, "connection"), plural(index.flows.length, "user flow")) : "No connections detected",
    found: links > 0,
  });
  return lines;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return count === 0 ? "" : `${count} ${count === 1 ? one : many}`;
}

function join(...parts: string[]): string {
  return parts.filter(Boolean).join(" · ");
}

function displayName(repository: string): string {
  const match = /github\.com\/([^/\s]+\/[^/\s#?]+?)(?:\.git)?\/?$/i.exec(repository);
  if (match?.[1]) return match[1];
  // A local directory (backend started with WORKFLOW_ALLOW_LOCAL=1): its folder name.
  if (repository.startsWith("/")) return repository.split("/").filter(Boolean).pop() ?? repository;
  return repository;
}
