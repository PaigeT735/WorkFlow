import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { TYPE_LABEL } from "../graph/labels.ts";
import { searchGraph, type SearchHit } from "../graph/search.ts";
import { useMap } from "../state/mapStore.tsx";
import { requestZoom } from "./zoom.ts";

const DEPTH_LABEL = {
  overview: "Overview",
  page: "Page detail",
  chain: "Call chain",
} as const;

export function Toolbar() {
  const map = useMap();
  const searchRef = useRef<HTMLInputElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const issueRef = useRef<HTMLDivElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [issuesOpen, setIssuesOpen] = useState(false);
  const [activeHit, setActiveHit] = useState(0);
  const listId = useId();

  const hits =
    map.index && map.searchOpen ? searchGraph(map.index, map.search) : [];
  const errors = map.index?.nodesOfType("error") ?? [];

  useEffect(() => {
    setActiveHit(0);
  }, [map.search]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const typing =
        target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
        map.setSearchOpen(true);
        return;
      }
      if (event.key === "/" && !typing) {
        event.preventDefault();
        searchRef.current?.focus();
        map.setSearchOpen(true);
        return;
      }
      if (event.key === "Escape") {
        if (map.searchOpen) {
          map.setSearchOpen(false);
          searchRef.current?.blur();
          return;
        }
        if (map.sourceOpen) {
          map.closeSource();
          return;
        }
        if (filterOpen) {
          setFilterOpen(false);
          return;
        }
        if (issuesOpen) {
          setIssuesOpen(false);
          return;
        }
        map.clearSelection();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filterOpen, issuesOpen, map]);

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (filterOpen && filterRef.current && !filterRef.current.contains(target)) {
        setFilterOpen(false);
      }
      if (issuesOpen && issueRef.current && !issueRef.current.contains(target)) {
        setIssuesOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [filterOpen, issuesOpen]);

  function choose(hit: SearchHit) {
    map.selectNode(hit.nodeId, hit.openSource ? { openSource: true } : undefined);
  }

  function onSearchKey(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveHit((index) => Math.min(index + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveHit((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      const hit = hits[activeHit];
      if (hit) choose(hit);
    }
  }

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="product">WorkFlow</span>
        <span className="app-name">{map.graph?.name}</span>
      </div>

      <div className="tool-group" role="group" aria-label="Map navigation">
        <button type="button" className="tool" data-testid="toolbar-back" disabled={!map.canBack} onClick={map.back}>
          Back
        </button>
        <button type="button" className="tool" data-testid="toolbar-zoom-out" onClick={() => requestZoom("out")} aria-label="Zoom out">
          −
        </button>
        <button type="button" className="tool" data-testid="toolbar-zoom-in" onClick={() => requestZoom("in")} aria-label="Zoom in">
          +
        </button>
        <button type="button" className="tool" data-testid="toolbar-fit" onClick={map.fit}>
          Fit
        </button>
      </div>

      <div className="search">
        <input
          ref={searchRef}
          data-testid="search-input"
          className="search-input"
          placeholder="Search the map"
          aria-label="Search the map"
          aria-controls={listId}
          aria-expanded={map.searchOpen && hits.length > 0}
          role="combobox"
          value={map.search}
          onChange={(event) => map.setSearch(event.target.value)}
          onFocus={() => map.setSearchOpen(true)}
          onKeyDown={onSearchKey}
        />
        {map.searchOpen && map.search.trim() !== "" ? (
          <div className="search-results" id={listId} role="listbox" data-testid="search-results">
            {hits.length === 0 ? (
              <p className="search-empty">Nothing matches.</p>
            ) : (
              hits.map((hit, index) => (
                <button
                  key={hit.id}
                  type="button"
                  role="option"
                  aria-selected={index === activeHit}
                  className={index === activeHit ? "search-hit is-active" : "search-hit"}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveHit(index)}
                  onClick={() => choose(hit)}
                >
                  <span className="hit-top">
                    <span className="hit-label">{hit.label}</span>
                    <span className="hit-type">{TYPE_LABEL[hit.type]}</span>
                  </span>
                  <span className="hit-used">
                    Used by: {hit.usedBy.length > 0 ? hit.usedBy.join(", ") : "—"}
                  </span>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <span className="density" data-testid="density-label">
        {DEPTH_LABEL[map.depth]}
      </span>

      <div className="tool-group" ref={filterRef}>
        <button
          type="button"
          className="tool"
          data-testid="toolbar-filter"
          aria-expanded={filterOpen}
          aria-pressed={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
        >
          Filter
        </button>
        {filterOpen ? (
          <div className="popover" role="menu">
            <FilterRow label="Pages" checked={map.filters.pages} onChange={(value) => map.setFilter("pages", value)} />
            <FilterRow label="APIs" checked={map.filters.apis} onChange={(value) => map.setFilter("apis", value)} />
            <FilterRow label="Backend" checked={map.filters.backend} onChange={(value) => map.setFilter("backend", value)} />
            <FilterRow label="Databases" checked={map.filters.databases} onChange={(value) => map.setFilter("databases", value)} />
            <FilterRow label="External services" checked={map.filters.external} onChange={(value) => map.setFilter("external", value)} />
            <FilterRow label="Auth" checked={map.filters.auth} onChange={(value) => map.setFilter("auth", value)} />
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="tool"
        data-testid="toolbar-flows"
        aria-pressed={map.showFlows}
        onClick={map.toggleFlows}
      >
        Flows
      </button>

      <div className="tool-group" ref={issueRef}>
        <button
          type="button"
          className="tool"
          data-testid="toolbar-issues"
          aria-pressed={map.showIssues || issuesOpen}
          onClick={() => {
            map.toggleIssues();
            setIssuesOpen((open) => !open);
          }}
        >
          Issues
          <span className="count">{errors.length}</span>
        </button>
        {issuesOpen ? (
          <div className="popover issues" data-testid="issues-list">
            {errors.map((error) => (
              <button
                key={error.id}
                type="button"
                className="issue-row"
                onClick={() => {
                  map.selectNode(error.id);
                  setIssuesOpen(false);
                }}
              >
                <span>{error.label}</span>
                <span className="hit-type">{error.summary ?? "Error"}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <button type="button" className="tool" data-testid="toolbar-reset" onClick={map.reset}>
        Reset
      </button>
    </header>
  );
}

function FilterRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="filter-row">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}
