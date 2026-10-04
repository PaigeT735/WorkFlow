import { useEffect, useMemo, useRef, useState } from "react";
import { useMap } from "../state/mapStore.tsx";
import { highlightLines } from "./highlight.ts";
import { CloseIcon, TypeIcon } from "./icons.tsx";

type Load =
  | { status: "loading" }
  | { status: "ready"; content: string; origin: "repository" | "sample" }
  | { status: "error"; message: string }
  | { status: "unavailable" };

/**
 * The real file behind the selected node, beside the map. Analyzed projects
 * read it from `/api/source`; the sample reads its embedded excerpts.
 */
export function SourceViewer() {
  const map = useMap();
  const node = map.focusId && map.index ? map.index.tryNode(map.focusId) : null;
  const source = node?.source ?? null;
  const file = source?.file ?? null;
  const embedded = file && map.graph?.sources ? map.graph.sources[file] : undefined;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!map.sourceOpen || !file) return;
    if (embedded != null) {
      setLoad({ status: "ready", content: embedded, origin: "sample" });
      return;
    }
    if (!map.projectId) {
      setLoad({ status: "unavailable" });
      return;
    }
    let cancel = false;
    setLoad({ status: "loading" });
    const url = `/api/source?project=${encodeURIComponent(map.projectId)}&path=${encodeURIComponent(file)}`;
    fetch(url)
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            body != null && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
              ? (body as { error: string }).error
              : `Could not load source (${response.status}).`;
          throw new Error(message);
        }
        const content = body != null && typeof body === "object" ? (body as { content?: unknown }).content : null;
        if (typeof content !== "string") throw new Error("The source response did not include the file.");
        return content;
      })
      .then((content) => {
        if (!cancel) setLoad({ status: "ready", content, origin: "repository" });
      })
      .catch((error: unknown) => {
        if (!cancel) setLoad({ status: "error", message: error instanceof Error ? error.message : "Could not load source." });
      });
    return () => {
      cancel = true;
    };
  }, [map.sourceOpen, map.projectId, file, embedded]);

  const lines = useMemo(() => (load.status === "ready" ? highlightLines(load.content) : []), [load]);

  useEffect(() => {
    if (!source || lines.length === 0) return;
    const target = bodyRef.current?.querySelector<HTMLElement>(`[data-line="${source.startLine}"]`);
    if (!target || !bodyRef.current) return;
    const top = target.offsetTop - bodyRef.current.clientHeight * 0.28;
    bodyRef.current.scrollTo({ top: Math.max(0, top) });
  }, [lines, source]);

  if (!map.sourceOpen || !node) return null;

  const range = source
    ? source.startLine === source.endLine
      ? `Line ${source.startLine}`
      : `Lines ${source.startLine}–${source.endLine}`
    : null;

  return (
    <section className="source-viewer" data-testid="source-drawer" aria-label="Source file">
      <header className="sv-head">
        <div className="sv-title">
          <TypeIcon type="file" size={14} />
          <span className="mono sv-path" title={file ?? undefined}>
            {file ?? "No source location"}
          </span>
          <button type="button" className="icon-btn" onClick={map.closeSource} aria-label="Close source" title="Close source">
            <CloseIcon size={14} />
          </button>
        </div>
        <p className="sv-sub">
          {range ? <span className="sv-range mono">{range}</span> : null}
          <span>
            {node.label}
            {load.status === "ready"
              ? load.origin === "repository"
                ? " · the file as it is in the analyzed repository"
                : " · excerpt embedded in the example map"
              : ""}
          </span>
        </p>
      </header>
      <div className="sv-body" ref={bodyRef}>
        {!source ? (
          <p className="sv-message">The analyzer did not record where {node.label} is defined.</p>
        ) : load.status === "loading" ? (
          <p className="sv-message">Loading {file}…</p>
        ) : load.status === "error" ? (
          <p className="sv-message is-error">{load.message}</p>
        ) : load.status === "unavailable" ? (
          <p className="sv-message">This map names the file but does not include its text.</p>
        ) : (
          <pre className="code" aria-label={`${file}, ${range ?? ""}`}>
            {lines.map((tokens, position) => {
              const number = position + 1;
              const hot = number >= source.startLine && number <= source.endLine;
              const edge = number === source.startLine ? " is-first" : number === source.endLine ? " is-last" : "";
              return (
                <div key={number} data-line={number} className={hot ? `code-line is-hot${edge}` : "code-line"}>
                  <span className="ln">{number}</span>
                  <span className="lc">
                    {tokens.length === 0
                      ? " "
                      : tokens.map((token, part) =>
                          token.kind === "plain" ? (
                            token.text
                          ) : (
                            <span key={part} className={`tk-${token.kind}`}>
                              {token.text}
                            </span>
                          ),
                        )}
                  </span>
                </div>
              );
            })}
          </pre>
        )}
      </div>
    </section>
  );
}
