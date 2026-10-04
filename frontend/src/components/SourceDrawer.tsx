import { useEffect, useRef } from "react";
import { useMap } from "../state/mapStore.tsx";

export function SourceDrawer() {
  const map = useMap();
  const hotRef = useRef<HTMLDivElement>(null);
  const node = map.focusId && map.index ? map.index.tryNode(map.focusId) : null;
  const source = node?.source;
  const excerpt = source && map.graph?.sources ? map.graph.sources[source.file] : undefined;

  useEffect(() => {
    if (!map.sourceOpen) return;
    hotRef.current?.scrollIntoView({ block: "center" });
  }, [map.sourceOpen, map.focusId]);

  if (!map.sourceOpen || !node || !source) return null;

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
      {lines.length === 0 ? (
        <p className="detail">
          This graph names the file but doesn’t include the excerpt. The path and line range are
          still the implementation of {node.label}.
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
