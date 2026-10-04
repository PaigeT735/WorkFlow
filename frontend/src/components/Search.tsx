import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { TYPE_LABEL } from "../graph/labels.ts";
import { isCodeLabel } from "../graph/lanes.ts";
import { searchGraph, type SearchHit } from "../graph/search.ts";
import { useMap } from "../state/mapStore.tsx";
import { SearchIcon, TypeIcon } from "./icons.tsx";

/** Find a node by name, route, path or file, then focus it on the map. */
export function Search() {
  const map = useMap();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();

  const hits = useMemo(() => (map.index && query.trim() ? searchGraph(map.index, query) : []), [map.index, query]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") || (event.key === "/" && !typing)) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function choose(hit: SearchHit) {
    map.selectNode(hit.nodeId, hit.openSource ? { openSource: true } : undefined);
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((value) => Math.min(value + 1, Math.max(hits.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((value) => Math.max(value - 1, 0));
    } else if (event.key === "Enter") {
      const hit = hits[active];
      if (hit) choose(hit);
    } else if (event.key === "Escape") {
      event.stopPropagation();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  }

  const showResults = open && query.trim() !== "";

  return (
    <div className="search">
      <SearchIcon size={14} className="search-icon" />
      <input
        ref={inputRef}
        data-testid="search-input"
        className="search-input"
        placeholder="Search pages, endpoints, functions, files…"
        aria-label="Search the map"
        role="combobox"
        aria-controls={listId}
        aria-expanded={showResults && hits.length > 0}
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      <kbd className="search-kbd" aria-hidden="true">
        ⌘K
      </kbd>
      {showResults ? (
        <div className="search-results" id={listId} role="listbox" data-testid="search-results">
          {hits.length === 0 ? (
            <p className="search-empty">Nothing on this map matches “{query.trim()}”.</p>
          ) : (
            hits.map((hit, position) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={position === active}
                className={position === active ? "search-hit is-active" : "search-hit"}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(position)}
                onClick={() => choose(hit)}
              >
                <span className="rel-icon" data-type={hit.type}>
                  <TypeIcon type={hit.type} size={14} />
                </span>
                <span className="hit-main">
                  <span className={isCodeLabel({ type: hit.type }) ? "hit-label mono" : "hit-label"}>{hit.label}</span>
                  {hit.detail && hit.detail !== hit.label ? <span className="hit-detail mono">{hit.detail}</span> : null}
                </span>
                <span className="hit-type">{hit.openSource ? "File" : TYPE_LABEL[hit.type]}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
