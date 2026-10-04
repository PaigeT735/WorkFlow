import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspectRepository } from "../src/analyzer/inspect.ts";
import { parseGitHubRepo, RepositoryError } from "../src/github.ts";
import { analyzeTarget, projectRootDir } from "../src/projectStore.ts";
import { createServer } from "../src/server.ts";
import type { ApplicationGraph, GraphNode } from "../src/graphTypes.ts";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function findNode(graph: ApplicationGraph, type: GraphNode["type"], label: string | RegExp): GraphNode | undefined {
  return graph.nodes.find(
    (node) => node.type === type && (typeof label === "string" ? node.label === label : label.test(node.label)),
  );
}

function requireNode(graph: ApplicationGraph, type: GraphNode["type"], label: string | RegExp): GraphNode {
  const node = findNode(graph, type, label);
  assert.ok(node, `missing ${type} ${String(label)}`);
  return node;
}

async function listen(): Promise<{ port: number; close: () => Promise<void> }> {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("wrapper call through an imported helper reaches the API", async () => {
  const report = await inspectRepository(path.join(fixtures, "wrapper-api"));
  const interaction = requireNode(report.graph, "interaction", "Create Project");
  const api = requireNode(report.graph, "api", "POST /api/projects");
  const edge = report.graph.edges.find((item) => item.source === interaction.id && item.target === api.id && item.kind === "calls");
  assert.ok(edge, "interaction should call the API");
  assert.equal(edge.metadata?.evidence.file, "src/api/createProject.ts");
  const text = await readFile(path.join(fixtures, "wrapper-api", edge.metadata.evidence.file), "utf8");
  const line = text.split("\n")[edge.metadata.evidence.startLine - 1] ?? "";
  assert.match(line, /api\.post\("\/api\/projects"\)/);
  assert.equal(api.metadata?.method, "POST");
  assert.equal(api.metadata?.path, "/api/projects");
});

test("one component on two routes is a single page", async () => {
  const report = await inspectRepository(path.join(fixtures, "duplicate-routes"));
  const editors = report.graph.nodes.filter((node) => node.type === "page" && node.label === "Editor");
  assert.equal(editors.length, 1);
  const editor = editors[0];
  assert.ok(editor);
  assert.match(editor.detail ?? "", /\/editor/);
  assert.match(editor.detail ?? "", /\/editor\/:param/);
  assert.equal(editor.source?.file, "src/Editor.tsx");
});

test("connect() wrapper points the page at the class, and a nested helper call is traced", async () => {
  const report = await inspectRepository(path.join(fixtures, "connect-home"));
  const pages = report.graph.nodes.filter((node) => node.type === "page");
  assert.equal(pages.length, 1);
  const home = pages[0];
  assert.ok(home);
  assert.equal(home.label, "Home");
  assert.equal(home.source?.file, "src/Home.js");
  const source = await readFile(path.join(fixtures, "connect-home", home.source?.file ?? ""), "utf8");
  const excerpt = source.split("\n").slice((home.source?.startLine ?? 1) - 1, home.source?.endLine).join("\n");
  assert.match(excerpt, /class Home/);
  const api = requireNode(report.graph, "api", "GET /articles");
  const edge = report.graph.edges.find((item) => item.source === home.id && item.target === api.id && item.kind === "calls");
  assert.ok(edge, "Home should call GET /articles");
  assert.equal(edge.metadata?.evidence.file, "src/agent.js");
});

test("multi-level router prefixes, auth middleware, and a persisting function", async () => {
  const report = await inspectRepository(path.join(fixtures, "routers"));
  const api = requireNode(report.graph, "api", "POST /api/users");
  assert.equal(api.metadata?.path, "/api/users");
  assert.equal(api.metadata?.authRequired, true);
  const auth = requireNode(report.graph, "auth", "Auth required");
  assert.ok(report.graph.edges.some((edge) => edge.source === api.id && edge.target === auth.id && edge.kind === "authenticates"));
  const createUser = requireNode(report.graph, "function", "createUser");
  assert.equal(createUser.source?.file, "src/users.ts");
  const table = requireNode(report.graph, "table", "user");
  assert.ok(report.graph.edges.some((edge) => edge.source === createUser.id && edge.target === table.id && edge.kind === "writes"));
});

test("a repository is detected from SQL evidence when the name does not end in Repository", async () => {
  const report = await inspectRepository(path.join(fixtures, "orders-repo"));
  const api = requireNode(report.graph, "api", "POST /orders");
  const service = requireNode(report.graph, "service", "orders");
  const table = requireNode(report.graph, "table", "orders");
  const database = requireNode(report.graph, "database", "PostgreSQL");
  assert.ok(report.graph.edges.some((edge) => edge.target === service.id && edge.kind === "calls"));
  assert.ok(report.graph.edges.some((edge) => edge.source === service.id && edge.kind === "calls"));
  assert.ok(report.graph.edges.some((edge) => edge.target === table.id && edge.kind === "writes"));
  assert.equal(table.parentId, database.id);
  assert.equal(api.metadata?.path, "/orders");
});

test("a client requests.get call is not invented as a backend route", async () => {
  const report = await inspectRepository(path.join(fixtures, "client-requests"));
  assert.equal(report.graph.nodes.some((node) => node.type === "api"), false);
});

test("node ids and edges are deterministic and every edge has evidence", async () => {
  const root = path.join(fixtures, "sample-saas");
  const first = await inspectRepository(root);
  const second = await inspectRepository(root);
  assert.deepEqual(
    first.graph.nodes.map((node) => node.id),
    second.graph.nodes.map((node) => node.id),
  );
  assert.deepEqual(first.graph.edges, second.graph.edges);
  for (const edge of first.graph.edges) {
    const evidence = edge.metadata?.evidence;
    assert.ok(evidence, `${edge.kind} ${edge.label} has no evidence`);
    assert.ok(evidence.startLine >= 1 && evidence.endLine >= evidence.startLine);
    const text = await readFile(path.join(root, evidence.file), "utf8");
    assert.ok(text.split("\n").length >= evidence.startLine, evidence.file);
  }
});

test("ingestion rejects malformed, credentialed, and non-GitHub URLs", () => {
  assert.throws(() => parseGitHubRepo("not a url"), RepositoryError);
  assert.throws(() => parseGitHubRepo("https://example.com/acme/app"), RepositoryError);
  assert.throws(() => parseGitHubRepo("https://github.com/acme/app/tree/main"), RepositoryError);
  assert.throws(() => parseGitHubRepo("git@github.com:acme/app.git"), RepositoryError);
  const secret = "super-secret-token";
  assert.throws(
    () => parseGitHubRepo(`https://x-access-token:${secret}@github.com/acme/widgets`),
    (error: unknown) => {
      assert.ok(error instanceof RepositoryError);
      assert.equal(error.status, 400);
      assert.equal(error.message.includes(secret), false);
      return true;
    },
  );
  const parsed = parseGitHubRepo("https://github.com/acme/widgets.git");
  assert.equal(parsed.owner, "acme");
  assert.equal(parsed.repo, "widgets");
});

test("HTTP health, malformed analyze, unknown project, and explain without a key", async () => {
  const saved = process.env.GROK_API_KEY;
  delete process.env.GROK_API_KEY;
  const server = await listen();
  try {
    const health = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    assert.equal(health.status, 200);
    const malformed = await fetch(`http://127.0.0.1:${server.port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    const missing = await fetch(`http://127.0.0.1:${server.port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(missing.status, 400);
    const badUrl = await fetch(`http://127.0.0.1:${server.port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: "https://example.com/not/github" }),
    });
    assert.equal(badUrl.status, 400);
    const unknown = await fetch(`http://127.0.0.1:${server.port}/api/projects/abc/graph`);
    assert.equal(unknown.status, 404);
    const explain = await fetch(`http://127.0.0.1:${server.port}/api/grok/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "explain_node", promptLabel: "Explain this", node: { id: "n", label: "N" } }),
    });
    assert.equal(explain.status, 503);
    const body = (await explain.json()) as { error?: string };
    assert.match(body.error ?? "", /GROK_API_KEY is not set/);
  } finally {
    if (saved === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = saved;
    await server.close();
  }
});

test("local analyze source matches the file, and an empty directory is not stored", async () => {
  const previous = process.env.WORKFLOW_ALLOW_LOCAL;
  process.env.WORKFLOW_ALLOW_LOCAL = "1";
  const server = await listen();
  const empty = await mkdtemp(path.join(tmpdir(), "workflow-empty-"));
  try {
    const fixture = path.join(fixtures, "sample-saas");
    const analyzed = await fetch(`http://127.0.0.1:${server.port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: fixture }),
    });
    assert.equal(analyzed.status, 200);
    const payload = (await analyzed.json()) as { projectId: string; graphUrl: string };
    const graphResponse = await fetch(`http://127.0.0.1:${server.port}${payload.graphUrl}`);
    assert.equal(graphResponse.status, 200);
    const graph = (await graphResponse.json()) as ApplicationGraph;
    const api = requireNode(graph, "api", "POST /api/projects");
    assert.equal(api.source?.file, "src/server/index.ts");
    const source = await fetch(
      `http://127.0.0.1:${server.port}/api/source?project=${payload.projectId}&path=${encodeURIComponent(api.source?.file ?? "")}`,
    );
    assert.equal(source.status, 200);
    const file = (await source.json()) as { content?: string };
    const disk = await readFile(path.join(fixture, "src/server/index.ts"), "utf8");
    assert.equal(file.content, disk);
    const missingFile = await fetch(
      `http://127.0.0.1:${server.port}/api/source?project=${payload.projectId}&path=${encodeURIComponent("src/missing.ts")}`,
    );
    assert.equal(missingFile.status, 404);

    const emptyResponse = await fetch(`http://127.0.0.1:${server.port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: empty }),
    });
    assert.equal(emptyResponse.status, 422);
  } finally {
    if (previous === undefined) delete process.env.WORKFLOW_ALLOW_LOCAL;
    else process.env.WORKFLOW_ALLOW_LOCAL = previous;
    await rm(empty, { recursive: true, force: true });
    await server.close();
  }
});

test("a failed clone does not leave a project directory", { timeout: 60_000 }, async () => {
  const root = projectRootDir();
  const before = new Set(await readdir(root).catch(() => []));
  const server = await listen();
  try {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository: "https://github.com/workflow-missing-eed2/no-such-repo" }),
    });
    assert.equal(response.status, 404);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /Could not clone/);
    const after = await readdir(root).catch(() => []);
    const leftover = after.filter((entry) => !before.has(entry));
    assert.deepEqual(leftover, []);
  } finally {
    await server.close();
  }
});
