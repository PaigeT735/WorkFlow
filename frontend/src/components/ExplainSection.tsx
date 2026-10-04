import { useEffect, useRef, useState } from "react";
import { actionsFor, buildGrokRequest, explainWithGrok, type GrokAction } from "../graph/grok.ts";
import type { Flow, GraphNode } from "../graph/types.ts";
import { useMap } from "../state/mapStore.tsx";
import { SparkIcon } from "./icons.tsx";
import { Markdown } from "./Markdown.tsx";

type Status = "idle" | "loading" | "done" | "error";

/**
 * The optional deeper layer under the map and the inspector. The browser sends
 * graph context only; the backend adds the source excerpt and calls Grok.
 */
export function ExplainSection({
  node,
  flow,
  autoRunKey,
}: {
  node: GraphNode | null;
  flow: Flow | null;
  /** Changes when the user presses the header's Explain button. */
  autoRunKey: number;
}) {
  const map = useMap();
  const [status, setStatus] = useState<Status>("idle");
  const [text, setText] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const actions = actionsFor(node, flow);
  const target = node?.id ?? flow?.id ?? "";

  useEffect(() => {
    controller.current?.abort();
    setStatus("idle");
    setText(null);
    setAsked(null);
  }, [target]);

  async function run(action: GrokAction) {
    if (!map.index) return;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setStatus("loading");
    setText(null);
    setAsked(action.label);
    try {
      const request = buildGrokRequest(map.index, action, map.focusId, flow ? map.flowId : null);
      if (map.projectId) request.projectId = map.projectId;
      const response = await explainWithGrok(request, abort.signal);
      if (abort.signal.aborted) return;
      setText(response.explanation);
      setStatus("done");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setText(error instanceof Error ? error.message : "The explanation is unavailable.");
      setStatus("error");
    }
  }

  useEffect(() => {
    if (status === "idle") return;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [status]);

  const runRef = useRef(run);
  runRef.current = run;
  useEffect(() => {
    if (autoRunKey === 0) return;
    sectionRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
    const first = actions[0];
    if (first && status === "idle") void runRef.current(first);
    // Only the header button triggers this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRunKey]);

  if (actions.length === 0) return null;

  return (
    <section className="insp-section explain" ref={sectionRef} aria-labelledby="explain-title">
      <h3 id="explain-title" className="insp-heading">
        <SparkIcon size={13} />
        Explain
      </h3>
      <div className="explain-actions">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            className={asked === action.label ? "chip is-active" : "chip"}
            data-testid={`grok-${action.id}`}
            disabled={status === "loading"}
            onClick={() => void run(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
      {status === "loading" ? (
        <div className="explain-loading" role="status" aria-live="polite">
          <span className="skeleton" />
          <span className="skeleton short" />
          <span className="skeleton" />
          <span className="sr-only">Asking Grok…</span>
        </div>
      ) : null}
      {status === "done" && text ? (
        <div className="explain-answer" role="status" aria-live="polite">
          <Markdown text={text} />
          <p className="explain-source">
            Grok, grounded in this node&rsquo;s connections{map.projectId ? " and source" : ""}. Check it against the code.
          </p>
        </div>
      ) : null}
      {status === "error" && text ? (
        <p className="explain-error" role="status">
          {text}
        </p>
      ) : null}
    </section>
  );
}
