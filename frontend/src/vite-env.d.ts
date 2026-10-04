/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * When set, the map loads graph JSON from this URL instead of /graph.json.
   * Point it at the analyzer later, for example `/api/graph`.
   */
  readonly VITE_GRAPH_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
