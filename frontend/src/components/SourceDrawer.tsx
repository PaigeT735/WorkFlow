import { useEffect, useRef, useState } from "react";
import { useMap } from "../state/mapStore.tsx";

export function SourceDrawer() {
  const map = useMap();
  const hotRef = useRef<HTMLDivElement>(null);
  const node = map.focusId && map.index ? map.index.tryNode(map.focusId) : null;
  const source = node?.source;
  const embedded = source && map.graph?.sources ? map.graph.sources[source.file] : undefined;
  const [loaded, setLoaded] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!map.sourceOpen || !source) return;
    hotRef.current?.scrollIntoView({ block: "center" });
  }, [map.sourceOpen, map.focusId, loaded]);

  useEffect(() => {
    if (!map.sourceOpen || !source || embedded != null || !map.projectId) {
      setLoaded(null);
      setLoadError(null);
      return;
    }
    const projectId = map.projectId;
    const file = source.file;
    let cancel = false;
    setLoadError(null);
    const url = `/api/source?project=${encodeURIComponent(projectId)}&path=${encodeURIComponent(file)}`;
    fetch(url)
      .then(async (response) => {
        const body: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            body != null &&
            typeof body === "object" &&
            "error" in body &&
            typeof (body as { error?: unknown }).error === "string"
              ? (body as { error: string }).error
              : `Could not load source (${response.status}).`;
          throw new Error(message);
        }
        if (
          body == null ||
          typeof body !== "object" ||
          typeof (body as { content?: unknown }).content !== "string"
        ) {
          throw new Error("Source response did not include file content.");
        }
        return (body as { content: string }).content;
      })
      .then((content) => {
        if (!cancel) setLoaded(content);
      })
      .catch((error: unknown) => {
        if (cancel) return;
        setLoaded(null);
        setLoadError(error instanceof Error ? error.message : "Could not load source.");
      });
    return () => {
      cancel = true;
    };
  }, [map.sourceOpen, map.projectId, source, embedded]);

  if (!map.sourceOpen || !node || !source) return null;

  const excerpt = embedded ?? loaded ?? undefined;
  const lines = excerpt ? excerpt.split("\n") : [];

  return (
    <section className="source-drawer" data-testid="source-drawer" aria-label="Source">
      <header>
        <div>
          <p className="panel-kicker">Source</p>
          <h2 className="mono">
            {source.file}:{source.startLine}–{source.endLine}
          </h2>
        </div>
        <button type="button" className="text-btn" onClick={map.closeSource}>
          Close
        </button>
      </header>
      {loadError ? (
        <p className="detail">{loadError}</p>
      ) : lines.length === 0 ? (
        <p className="detail">
          {map.projectId
            ? "Loading source…"
            : `This graph names the file but doesn’t include the excerpt. The path and line range are still the implementation of ${node.label}.`}
        </p>
      ) : (
        <pre>
          {lines.map((line, index) => {
            const number = index + 1;
            const hot = number >= source.startLine && number <= source.endLine;
            return (
              <div
                key={number}
                ref={number === source.startLine ? hotRef : undefined}
                className={hot ? "code-line is-hot" : "code-line"}
              >
                <span className="ln">{number}</span>
                <span>{line.length > 0 ? line : " "}</span>
              </div>
            );
          })}
        </pre>
      )}
    </section>
  );
}
