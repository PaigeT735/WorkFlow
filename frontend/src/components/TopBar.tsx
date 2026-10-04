import { useMap } from "../state/mapStore.tsx";
import { ExternalLinkIcon, LogoMark, TypeIcon } from "./icons.tsx";
import { Search } from "./Search.tsx";
import { ThemeToggle } from "./ThemeToggle.tsx";

/** Level 1: which application this map is of, and where it came from. */
export function TopBar() {
  const map = useMap();
  const project = map.project;
  const graph = map.graph;
  if (!project || !graph || !map.index) return null;
  const application = map.index.nodesOfType("application")[0] ?? null;
  const github = githubPath(project.repository);
  const summary = project.summary;

  return (
    <header className="topbar">
      <div className="tb-left">
        <button type="button" className="brand" onClick={map.startOver} title="Analyze another repository">
          <LogoMark size={18} />
          <span>WorkFlow</span>
        </button>
        <span className="tb-slash" aria-hidden="true">
          /
        </span>
        <button
          type="button"
          className="app-id"
          title="Application summary"
          onClick={() => (application ? map.selectNode(application.id) : undefined)}
          disabled={!application}
        >
          <TypeIcon type="application" size={15} />
          <span className="app-name">{graph.name}</span>
        </button>
        {project.sample ? (
          <span className="badge" title="This map was written by hand to show the format. It was not produced by analyzing a repository.">
            Example map · not analyzed
          </span>
        ) : github ? (
          <a className="repo-link mono" href={`https://github.com/${github}`} target="_blank" rel="noreferrer">
            {github}
            <ExternalLinkIcon size={12} />
          </a>
        ) : project.repository && project.repository !== graph.name ? (
          <span className="repo-link mono">{project.repository}</span>
        ) : null}
      </div>

      <Search />

      <div className="tb-right">
        {summary ? (
          <span
            className="tb-stat"
            title={summary.warnings.length > 0 ? summary.warnings.join("\n") : undefined}
          >
            {summary.filesAnalyzed} files analyzed
            {summary.filesSkipped > 0 ? <span className="tb-warn"> · {summary.filesSkipped} skipped</span> : null}
          </span>
        ) : null}
        <ThemeToggle />
        <button type="button" className="btn btn-small" onClick={map.startOver} data-testid="new-analysis">
          New analysis
        </button>
      </div>
    </header>
  );
}

function githubPath(repository: string | null): string | null {
  if (!repository) return null;
  const match = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i.exec(repository.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}
