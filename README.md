# WorkFlow

Give WorkFlow a repository and it reconstructs how the application works, then shows that on one map.

GitHub repository → analyzer → application graph JSON → existing map → contextual Grok explanation.

Runtime telemetry (Bronto) is prepared for later. It is not attached, and the analyzer never invents runtime counts.

## Run locally

From the repo root, put keys in `.env` (names are in `.env.example`). The backend loads `backend/.env` and then the repo-root `.env`. The frontend never reads them.

```bash
cd backend
npm install
npm run dev
```

The API listens on http://127.0.0.1:8787 (`PORT` overrides it).

```bash
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. The map starts on the Harbor sample. Paste `https://github.com/owner/repo` into Analyze to replace it. Sample switches back. Vite proxies `/api` to the backend.

```bash
cd backend && npm test && npm run build
cd frontend && npm test && npm run build
```

`npm run bronto:test` (from `backend/`) is the Bronto connection check. It prints tool names only.

To analyze a directory on this machine, start the backend with `WORKFLOW_ALLOW_LOCAL=1`. The fixture used by the tests is `backend/test/fixtures/sample-saas`.

## Analyze a GitHub repo

```bash
curl -s -X POST http://127.0.0.1:8787/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"repository":"https://github.com/owner/repo"}'
```

The response includes `projectId` and `graphUrl`. The map loads `GET /api/projects/:id/graph`. View Source for an analyzed project calls `GET /api/source`. Harbor keeps its built-in excerpts.

Clones are shallow, public, and stored under the system temp directory (`workflow-projects/<id>/repo`) for about six hours so source view keeps working. They are not committed. A `GITHUB_TOKEN` in the server environment can be added later for private clones; it is never sent to the browser or written into the graph.

## Architecture

```
GitHub (or a local directory)
  → backend/src/analyzer.ts
  → application graph JSON
  → frontend map (unchanged canvas)
  → POST /api/grok/explain
```

Later, without changing this shape:

```
Static analyzer → expected graph ← runtime telemetry ← Bronto
```

Nodes may carry `runtime: { observed, requestCount?, errorCount?, avgDuration?, lastSeen? }` only after a real telemetry pass. Nothing in this milestone sets it.

## Graph schema

`schemaVersion` is `1`. The TypeScript contracts are `frontend/src/graph/types.ts` and `backend/src/graphTypes.ts`. `loadApplicationGraph()` in `frontend/src/graph/loadGraph.ts` is the only reader. Analyzer output is fetched from `GET /api/projects/:id/graph`. Harbor remains `GET /graph.json`.

```json
{
  "schemaVersion": 1,
  "id": "sample-saas",
  "name": "sample-saas",
  "description": "optional",
  "nodes": [],
  "edges": [],
  "flows": []
}
```

`sources` is optional. Harbor embeds excerpts. Analyzed graphs omit them; View Source reads the file from `GET /api/source`.

### Nodes

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Stable id, no whitespace |
| `type` | yes | `application`, `page`, `component`, `interaction`, `api`, `auth`, `service`, `function`, `database`, `table`, `external`, `error`, `file` |
| `layer` | yes | Must match the type |
| `parentId` | yes | Container id, or `null`. Pages stay `null` so the overview can show them |
| `label` | yes | Name drawn on the node |
| `summary` | no | Second line |
| `detail` | no | One sentence in the side panel |
| `source` | no | `{ "file", "startLine", "endLine" }`, 1-based and inclusive |
| `metadata` | no | `route`, `method`, `path`, `authRequired`, `errorMessage`, `statusCode` |
| `runtime` | no | Bronto evidence only. Never fabricated |

| Type | Layer |
| --- | --- |
| `application`, `page`, `component` | `surface` |
| `interaction`, `api`, `auth`, `error` | `behavior` |
| `service`, `function`, `file` | `backend` |
| `database`, `table` | `data` |
| `external` | `external` |

If `parentId` is set, also emit a `contains` edge from the parent. The map nests children of pages and databases. The application node `contains` each page, but pages keep `parentId: null` so the first screen stays the page overview.

### Edges

`kind` is `contains`, `navigates_to`, `calls`, `authenticates`, `handles`, `queries`, `reads`, `writes`, `sends_payment_to`, `depends_on`, `raises`, or `defined_in`.

The words on the edge are `label`. These brief names map onto those kinds:

| Brief | Stored kind | Typical label |
| --- | --- | --- |
| contains, renders | `contains` | contains |
| navigates | `navigates_to` | navigates to |
| triggers | `calls` | triggers |
| calls | `calls` | calls |
| authenticates | `authenticates` | authentication required |
| handled_by | `handles` | handles |
| queries | `queries` | queries |
| writes | `writes` | writes |
| uses | `depends_on` | depends on |
| integrates_with | `depends_on` or `sends_payment_to` | integrates with, or sends payment to |
| throws | `raises` | raises |

`expand` defaults to true. Set it to false on a link that should stay in the side panel without pulling an unrelated chain onto the map. `defined_in` edges use that. `skeleton` marks a page-to-page overview edge.

### Flows

`nodeIds` are in story order. `edgeIds` may be empty. The Create Project flow from the fixture is:

Application → Dashboard → Create Project → POST /api/projects → Require auth → ProjectController.create → ProjectService → ProjectService.create() → projects

## HTTP API

All error bodies are `{ "error": "..." }`.

### `POST /api/analyze`

```json
{ "repository": "https://github.com/owner/repo" }
```

`https://github.com/<owner>/<repo>` only (optional `.git`). With `WORKFLOW_ALLOW_LOCAL=1`, an absolute directory path is also accepted. The clone is unauthenticated unless `GITHUB_TOKEN` is set on the server.

```json
{
  "projectId": "ab12cd34ef56ab78",
  "name": "sample-saas",
  "repository": "https://github.com/owner/repo",
  "graphUrl": "/api/projects/ab12cd34ef56ab78/graph",
  "summary": {
    "filesAnalyzed": 7,
    "filesSkipped": 1,
    "nodeCount": 13,
    "edgeCount": 13,
    "warnings": ["Skipped src/broken.tsx because it did not parse."]
  }
}
```

Invalid URLs, missing repos, clone failures, empty repos, and oversized inputs return 4xx or 502. One malformed file is skipped and listed in `warnings`. It does not fail the analysis.

### `GET /api/projects/:id/graph`

The graph document above. Unknown or expired ids return 404. Projects live in memory and expire about six hours after analysis.

### `GET /api/source?project=<id>&path=<repo-relative>`

```json
{ "path": "src/server/ProjectService.ts", "content": "..." }
```

The path must stay inside the analyzed root after symlink resolution. `..`, absolute paths, and sensitive names (`.env`, `.env.*`, `credentials.*`, `secrets.*`, `*.pem`, `*.key`, and similar) are refused. Those files are also skipped during analysis, and env var values are never copied into the graph.

### `POST /api/grok/explain`

The browser sends graph context only. The server builds the prompt and, when `projectId` is set, reads the selected node's file range itself.

```json
{
  "action": "explain_interaction",
  "promptLabel": "Explain this interaction",
  "projectId": "optional",
  "node": {},
  "context": {
    "graphId": "sample-saas",
    "graphName": "sample-saas",
    "neighborhood": { "nodes": [], "edges": [] },
    "path": { "nodeIds": [], "edgeIds": [] },
    "flow": null
  }
}
```

`action` is `explain_page`, `explain_api`, `explain_interaction`, `explain_flow`, `explain_node`, `why_failing`, `what_depends`, or `what_calls`.

`200` is `{ "explanation": "..." }`. A missing `GROK_API_KEY`, or a failure from the xAI API, returns `{ "error": "..." }` and the side panel shows that message. The model defaults to `grok-4` and can be changed with `GROK_MODEL`. Calls go to `https://api.x.ai/v1/chat/completions`. The key is never logged, committed, or returned.

The prompt lists the selected node, connected nodes, `A -> B (label)` relationships, and the source excerpt. The system instruction tells the model to use only that evidence, separate observation from inference, name real nodes and files, and not repeat secrets.

### `GET /api/bronto/status`

`{ "connected": true, "tools": ["name"] }` or `{ "connected": false, "error": "..." }`. Tool names only. Credentials are not printed.

## Analyzer coverage

`analyzeRepository(directory)` in `backend/src/analyzer.ts` walks the tree (skipping `node_modules`, build output, and secret files) and parses TypeScript and JavaScript with the TypeScript compiler API. It records:

- An application node from `package.json` or the directory name
- React Router `<Route path element>` and `component={Page}`, route objects, Next.js `app/` and `pages/` files, and `pages/*.tsx`
- Components a page actually renders
- Button and form actions (`onClick`, `onSubmit`) with a readable label
- `fetch`, axios-style calls, and other client calls whose first argument is a path
- Express and Fastify `method(path, ...handlers)`, including one `router` mount prefix, and Next.js route files
- `requireAuth`-style middleware on those routes
- `SomethingService.method()` calls from the handler
- PostgreSQL (`pg`), Prisma, Drizzle, Sequelize, TypeORM, MongoDB, MySQL, SQLite, and Supabase, with a table only when a SQL string, Prisma model, or similar call names it
- Stripe, OpenAI, S3, GitHub, Resend, Firebase, Clerk, NextAuth, and SendGrid from imports or env var **names**

Every kept node that comes from a syntax node has a file and line range. A file that does not parse is skipped.

## Fixture

`backend/test/fixtures/sample-saas` is the Create Project demo: Dashboard renders Create Project Button, which `POST`s `/api/projects`, through `requireAuth`, `ProjectController.create`, `ProjectService.create()`, an `INSERT INTO projects`, and Stripe. `src/broken.tsx` is intentionally unparseable.

## Secrets

Do not commit `.env`, key files, or cloned repositories. Analysis and Grok prompts drop `.env` files and redact token-shaped strings. `backend/src/bronto.ts` redacts `BRONTO_API_KEY` from connection errors.
