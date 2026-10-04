import { useState, type FormEvent } from "react";
import { ThemeToggle } from "./ThemeToggle.tsx";
import { useMap } from "../state/mapStore.tsx";
import { ArrowRightIcon, LogoMark, TypeIcon } from "./icons.tsx";

const IDEA = [
  { type: "page", label: "Screens" },
  { type: "interaction", label: "Actions" },
  { type: "api", label: "APIs" },
  { type: "function", label: "Logic" },
  { type: "database", label: "Data" },
] as const;

/** Before anything is analyzed: one field, one button, one sentence. */
export function EmptyState() {
  const map = useMap();
  const [value, setValue] = useState(map.landingRepository);

  function submit(event: FormEvent) {
    event.preventDefault();
    map.analyze(normalizeRepository(value));
  }

  return (
    <main className="landing">
      <ThemeToggle className="corner-toggle" />
      <div className="landing-inner">
        <div className="landing-brand">
          <LogoMark size={22} />
          <span>WorkFlow</span>
        </div>
        <h1 className="landing-title">Understand any application.</h1>
        <p className="landing-lede">
          WorkFlow maps how your application actually works — from user interactions to APIs, business logic,
          databases, and external services.
        </p>

        <form className="analyze-form" onSubmit={submit}>
          <label htmlFor="repo-url" className="analyze-label">
            Paste a GitHub repository URL
          </label>
          <div className={map.landingError ? "analyze-field has-error" : "analyze-field"}>
            <input
              id="repo-url"
              name="repository"
              data-testid="repo-url"
              className="analyze-input mono"
              placeholder="https://github.com/owner/repository"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(map.landingError)}
              aria-describedby={map.landingError ? "repo-error" : undefined}
            />
            <button type="submit" className="btn btn-primary btn-large" data-testid="analyze-repo">
              Analyze repository
              <ArrowRightIcon size={15} />
            </button>
          </div>
          {map.landingError ? (
            <ErrorMessage id="repo-error" message={map.landingError} />
          ) : (
            <p className="analyze-hint">Public repositories written in JavaScript or TypeScript.</p>
          )}
        </form>

        <ol className="idea" aria-label="What WorkFlow maps">
          {IDEA.map((step, position) => (
            <li key={step.label}>
              <span className="idea-icon" data-type={step.type}>
                <TypeIcon type={step.type} size={15} />
              </span>
              <span>{step.label}</span>
              {position < IDEA.length - 1 ? <span className="idea-arrow" aria-hidden="true" /> : null}
            </li>
          ))}
        </ol>

        <p className="landing-foot">
          <button type="button" className="link-btn" data-testid="use-sample" onClick={map.openSample}>
            Open the example map
          </button>
          <span aria-hidden="true"> · </span>
          <span>hand-written, to show the format</span>
        </p>
      </div>
    </main>
  );
}

/** The backend's message, with any tool output (git, for example) set apart. */
function ErrorMessage({ id, message }: { id: string; message: string }) {
  const lines = message.split("\n");
  let head = lines[0] ?? message;
  const rest = lines.slice(1);
  const stop = head.indexOf(". ");
  if (stop > 0 && head.length > 90) {
    rest.unshift(head.slice(stop + 2));
    head = head.slice(0, stop + 1);
  }
  const clone = head.startsWith("Could not clone");
  return (
    <div className="analyze-error" id={id} role="alert">
      <p>
        {head}
        {clone ? " Check that the URL is right and the repository is public." : ""}
      </p>
      {rest.length > 0 ? <pre className="analyze-error-detail mono">{rest.join("\n").trim()}</pre> : null}
    </div>
  );
}

/** Accept `owner/repo` and `github.com/owner/repo` as well as the full URL. */
function normalizeRepository(raw: string): string {
  const value = raw.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(value)) return `https://github.com/${value}`;
  if (/^(www\.)?github\.com\//i.test(value)) return `https://${value}`;
  return value;
}
