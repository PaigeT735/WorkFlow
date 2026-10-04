# WorkFlow

AI-powered application execution mapping and debugging.

## Architecture

Application
→ Bronto telemetry
→ WorkFlow backend
→ Grok reasoning
→ Interactive application map

## Structure

- `frontend/` — visual application map
- `backend/` — Bronto + Grok integration
- `backend/src/bronto.ts` — Bronto MCP integration
- `backend/src/grok.ts` — Grok integration
- `backend/src/analyzer.ts` — telemetry analysis (emits the graph JSON below)
- `backend/src/server.ts` — backend server

The map is the product. Pages, calls, auth, services, databases, and external services are depths of one canvas, not separate screens.

## Run the frontend

```bash
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (http://localhost:5173). The first screen is the map of the sample app, Harbor.

```bash
npm run typecheck
npm run build
```

`npm run dev` and `npm run build` regenerate `frontend/public/graph.json` from `frontend/src/graph/sampleGraph.ts` and check that the sample still lays out.

API keys stay in the repo-root `.env` for the backend. The frontend never reads them and never calls Grok directly.

## Graph document

`loadApplicationGraph()` in `frontend/src/graph/loadGraph.ts` is the only reader.

- Default: `GET /graph.json` (the Harbor sample).
- Later: set `VITE_GRAPH_URL` to the analyzer, for example `/api/graph`. The canvas does not change.

The Vite dev server proxies `/api` to `http://127.0.0.1:8787`. The TypeScript types in `frontend/src/graph/types.ts` are the contract. `schemaVersion` is `1`.

```json
{
  "schemaVersion": 1,
  "id": "harbor",
  "name": "Harbor",
  "description": "optional",
  "nodes": [],
  "edges": [],
  "flows": [],
  "sources": {
    "src/services/project.ts": "file text used by View Source"
  }
}
```

### Nodes

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable id, no whitespace |
| `type` | yes | `page`, `component`, `interaction`, `api`, `auth`, `service`, `function`, `database`, `table`, `external`, `error`, `file` |
| `layer` | yes | Must match the type. See the table below |
| `parentId` | yes | Container id, or `null` |
| `label` | yes | Name drawn on the node |
| `summary` | no | Second line: route, file, role |
| `detail` | no | One sentence for the side panel |
| `source` | no | `{ "file", "startLine", "endLine" }`, lines 1-based and inclusive |
| `metadata` | no | `route`, `method`, `path`, `authRequired`, `errorMessage`, `statusCode` |

If `parentId` is set, also emit a `contains` edge from the parent to the child. The map nests the child and does not draw that edge.

| Type | Layer |
| --- | --- |
| `page`, `component` | `surface` |
| `interaction`, `api`, `auth`, `error` | `behavior` |
| `service`, `function`, `file` | `backend` |
| `database`, `table` | `data` |
| `external` | `external` |

### Edges

```json
{
  "id": "e-ix-create-calls-api-projects-create",
  "source": "ix-create",
  "target": "api-projects-create",
  "kind": "calls",
  "label": "calls"
}
```

`kind` is one of `contains`, `navigates_to`, `calls`, `authenticates`, `handles`, `queries`, `reads`, `writes`, `sends_payment_to`, `depends_on`, `raises`, `defined_in`.

`label` is the words on the edge (`navigates to`, `authentication required`, `sends payment to`, …).

`expand` defaults to true. Chain expansion follows the edge. Set `expand` to false for a real link into a shared node when following it would pull unrelated callers onto the map. The edge is still drawn when both ends are visible, and it still appears in the side panel.

`skeleton` marks a page-to-page overview edge (Login authenticates Dashboard). It is hidden once a more specific edge between the same nodes is on screen.

### Flows

```json
{
  "id": "flow-create-project",
  "label": "Create a project",
  "description": "optional",
  "nodeIds": ["page-projects", "ix-create", "api-projects-create"],
  "edgeIds": ["e-ix-create-calls-api-projects-create"]
}
```

`nodeIds` are in story order. `edgeIds` may be empty; the map then highlights every non-contains edge whose ends are both in the flow.

### Source excerpts

`sources` is optional and keyed by the same repo-relative path as `source.file`. View Source slices `[startLine, endLine]`. Without an excerpt the panel still shows the path and range.

## Grok

Contextual actions post graph context to the backend. The browser does not call Grok and does not send API keys.

`POST /api/grok/explain`

```json
{
  "action": "explain_api",
  "promptLabel": "Explain this API",
  "node": {},
  "context": {
    "graphId": "harbor",
    "graphName": "Harbor",
    "neighborhood": { "nodes": [], "edges": [] },
    "path": { "nodeIds": [], "edgeIds": [] },
    "flow": null
  }
}
```

`action` is `explain_page`, `explain_api`, `explain_interaction`, `explain_flow`, `why_failing`, `what_depends`, or `explain_node`.

`node` is the selected graph node, or `null` when the selection is a flow.

`neighborhood` is the selection plus the nodes and edges on its highlighted path.

`flow` is the selected flow, or `null`.

`200` response:

```json
{ "explanation": "Short explanation of this node in the map." }
```

If the backend is down, the proxy fails, or the response is not that JSON, the side panel says the analysis backend is not running. The map stays usable.

Actions by node type:

| Selection | Action |
| --- | --- |
| Page | What happens when users interact with this page? |
| API | Explain this API |
| Error | Why is this failing? |
| Database or table | What depends on this? |
| Interaction | Explain this interaction |
| Flow | Explain this flow |
| Anything else | Explain this |

## Sample

Harbor is a small team workspace: Landing, Login, Dashboard, Projects, Profile, Settings, and Checkout. Create Project runs through `POST /api/projects`, Require auth, ProjectController, ProjectService.create(), and the `projects` table. Login creates a session and opens the dashboard. Checkout sends payment to Stripe. GitHub, OpenAI, and Amazon S3 are the other external services.
