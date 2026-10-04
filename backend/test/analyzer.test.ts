import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { inspectRepository } from "../src/analyzer/inspect.ts";
import { analyzeRepository } from "../src/analyzer.ts";
import { buildGrokPrompt, explain } from "../src/grok.ts";
import { analyzeTarget } from "../src/projectStore.ts";
import { readRepoFile, SourceAccessError } from "../src/sourceAccess.ts";
import { createServer } from "../src/server.ts";
import type { ApplicationGraph, GraphNode } from "../src/graphTypes.ts";

const fixture = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/sample-saas");
const report = await inspectRepository(fixture);
const graph = report.graph;

function node(type: GraphNode["type"], label: string | RegExp): GraphNode {
  const found = graph.nodes.find((item) => item.type === type && (typeof label === "string" ? item.label === label : label.test(item.label)));
  assert.ok(found, `missing ${type} ${String(label)}`);
  return found;
}

function linked(from: GraphNode, to: GraphNode, kind: string): void {
  const edge = graph.edges.find((item) => item.source === from.id && item.target === to.id && item.kind === kind);
  assert.ok(edge, `${from.label} should ${kind} ${to.label}`);
}

test("page detection", () => {
  assert.ok(report.warnings.some((warning) => warning.includes("src/broken.tsx")));
  const app = node("application", "sample-saas");
  const page = node("page", "Dashboard");
  assert.equal(page.metadata?.route, "/dashboard");
  linked(app, page, "contains");
  assert.equal(page.parentId, null);
});

test("component detection", () => {
  const page = node("page", "Dashboard");
  const component = node("component", /Create Project Button/);
  assert.equal(component.parentId, page.id);
  linked(page, component, "contains");
  assert.match(component.source?.file ?? "", /CreateProjectButton\.tsx$/);
});

test("button interaction", () => {
  const page = node("page", "Dashboard");
  const interaction = node("interaction", "Create Project");
  const component = node("component", /Create Project Button/);
  assert.equal(interaction.parentId, page.id);
  linked(component, interaction, "calls");
  assert.equal(graph.edges.find((edge) => edge.source === component.id && edge.target === interaction.id)?.label, "triggers");
});

test("frontend API call", () => {
  const interaction = node("interaction", "Create Project");
  const api = node("api", "POST /api/projects");
  linked(interaction, api, "calls");
  assert.equal(api.metadata?.method, "POST");
  assert.equal(api.metadata?.path, "/api/projects");
  assert.match(interaction.detail ?? "", /POST \/api\/projects/);
});

test("backend route", () => {
  const api = node("api", "POST /api/projects");
  assert.equal(api.source?.file, "src/server/index.ts");
  assert.equal(api.metadata?.path, "/api/projects");
});

test("controller and service relationship", () => {
  const api = node("api", "POST /api/projects");
  const controller = node("function", "ProjectController.create");
  const service = node("service", "ProjectService");
  const method = node("function", "ProjectService.create()");
  linked(api, controller, "handles");
  linked(controller, service, "calls");
  linked(service, method, "calls");
});

test("database relationship", () => {
  const method = node("function", "ProjectService.create()");
  const database = node("database", "PostgreSQL");
  const table = node("table", "projects");
  linked(method, table, "writes");
  linked(database, table, "contains");
  assert.equal(table.parentId, database.id);
});

test("auth detection", () => {
  const api = node("api", "POST /api/projects");
  const auth = node("auth", "Require auth");
  linked(api, auth, "authenticates");
  assert.equal(api.metadata?.authRequired, true);
  assert.equal(auth.source?.file, "src/server/requireAuth.ts");
});

test("external service detection", () => {
  const method = node("function", "ProjectService.create()");
  const stripe = node("external", "Stripe");
  linked(method, stripe, "sends_payment_to");
  assert.equal(graph.edges.find((edge) => edge.target === stripe.id)?.label, "sends payment to");
});

test("source file references", async () => {
  const interesting = [
    node("interaction", "Create Project"),
    node("function", "ProjectController.create"),
    node("function", "ProjectService.create()"),
    node("api", "POST /api/projects"),
  ];
  for (const item of interesting) {
    assert.ok(item.source, `${item.label} has no source`);
    const text = await readFile(path.join(fixture, item.source.file), "utf8");
    const lines = text.split("\n").slice(item.source.startLine - 1, item.source.endLine);
    assert.ok(lines.length > 0, `${item.label} range is empty`);
    assert.ok(item.source.startLine >= 1 && item.source.endLine >= item.source.startLine);
  }
  const button = await readFile(path.join(fixture, "src/components/CreateProjectButton.tsx"), "utf8");
  const interaction = node("interaction", "Create Project");
  const excerpt = button.split("\n").slice(interaction.source!.startLine - 1, interaction.source!.endLine).join("\n");
  assert.match(excerpt, /Create Project/);
  const service = node("function", "ProjectService.create()");
  const serviceText = await readFile(path.join(fixture, service.source!.file), "utf8");
  const serviceExcerpt = serviceText.split("\n").slice(service.source!.startLine - 1, service.source!.endLine).join("\n");
  assert.match(serviceExcerpt, /INSERT INTO projects/);

  const dir = await mkdtemp(path.join(tmpdir(), "workflow-secret-"));
  await writeFile(path.join(dir, "note.ts"), "export const name = 'visible';\n");
  await writeFile(path.join(dir, ".env"), "GROK_API_KEY=super-secret-do-not-leak\n");
  try {
    const secretGraph = await analyzeRepository(dir);
    assert.equal(JSON.stringify(secretGraph).includes("super-secret-do-not-leak"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("path traversal protection", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "workflow-src-"));
  await writeFile(path.join(dir, "ok.ts"), "export const value = 1;\n");
  await writeFile(path.join(dir, ".env"), "TOKEN=hidden\n");
  await symlink("/etc/passwd", path.join(dir, "escape"));
  try {
    const ok = await readRepoFile(dir, "ok.ts");
    assert.match(ok.content, /export const value/);
    await assert.rejects(readRepoFile(dir, "../.env"), SourceAccessError);
    await assert.rejects(readRepoFile(dir, "/etc/passwd"), SourceAccessError);
    await assert.rejects(readRepoFile(dir, "escape"), SourceAccessError);
    await assert.rejects(readRepoFile(dir, ".env"), SourceAccessError);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const previous = process.env.WORKFLOW_ALLOW_LOCAL;
  process.env.WORKFLOW_ALLOW_LOCAL = "1";
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const project = await analyzeTarget(fixture);
    const blocked = await fetch(
      `http://127.0.0.1:${port}/api/source?project=${project.id}&path=${encodeURIComponent("../../.env")}`,
    );
    assert.equal(blocked.status, 403);
    const opened = await fetch(
      `http://127.0.0.1:${port}/api/source?project=${project.id}&path=${encodeURIComponent("src/server/ProjectService.ts")}`,
    );
    assert.equal(opened.status, 200);
    const body = (await opened.json()) as { content?: string };
    assert.match(body.content ?? "", /INSERT INTO projects/);
  } finally {
    if (previous === undefined) delete process.env.WORKFLOW_ALLOW_LOCAL;
    else process.env.WORKFLOW_ALLOW_LOCAL = previous;
    server.close();
  }
});

test("Grok context construction, mocked call, and missing key", async () => {
  const selected = node("interaction", "Create Project");
  const api = node("api", "POST /api/projects");
  const prompt = buildGrokPrompt({
    action: "explain_interaction",
    promptLabel: "Explain this interaction",
    graphName: graph.name,
    node: selected,
    nodes: [selected, api],
    edges: graph.edges.filter((edge) => edge.source === selected.id && edge.target === api.id),
    flowLabel: "Create Project",
    sourceExcerpt: 'const key = "sk-abcdefghijklmnop";\nfetch("/api/projects")',
  });
  assert.match(prompt.system, /Do not invent/);
  assert.match(prompt.user, /Create Project/);
  assert.match(prompt.user, /POST \/api\/projects/);
  assert.match(prompt.user, /Create Project -> POST \/api\/projects/);
  assert.match(prompt.user, /fetch\("\/api\/projects"\)/);
  assert.equal(prompt.user.includes("sk-abcdefghijklmnop"), false);
  assert.match(prompt.user, /\[REDACTED\]/);

  let called = false;
  await assert.rejects(
    explain(
      { action: "explain_node", promptLabel: "Explain this", node: selected, context: { graphName: "sample-saas" } },
      {
        apiKey: null,
        fetchImpl: () => {
          called = true;
          return Promise.reject(new Error("should not be called"));
        },
      },
    ),
    /GROK_API_KEY is not set/,
  );
  assert.equal(called, false);

  const fakeKey = "unit-test-key";
  const result = await explain(
    {
      action: "explain_flow",
      promptLabel: "Explain this flow",
      node: selected,
      context: {
        graphName: graph.name,
        neighborhood: { nodes: [selected, api], edges: graph.edges.filter((edge) => edge.source === selected.id) },
      },
    },
    {
      apiKey: fakeKey,
      model: "grok-test",
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("Authorization"), `Bearer ${fakeKey}`);
        const body = JSON.parse(String(init?.body)) as { messages: { content: string }[] };
        assert.match(body.messages.map((message) => message.content).join("\n"), /Create Project -> POST \/api\/projects/);
        return new Response(JSON.stringify({ choices: [{ message: { content: "Observed: Create Project calls POST /api/projects." } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  );
  assert.match(result.explanation, /POST \/api\/projects/);

  const saved = process.env.GROK_API_KEY;
  delete process.env.GROK_API_KEY;
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/grok/explain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "explain_node",
        promptLabel: "Explain this",
        node: selected,
        context: { graphName: graph.name, neighborhood: { nodes: [selected], edges: [] } },
      }),
    });
    assert.equal(response.status, 503);
    const body = (await response.json()) as { error?: string };
    assert.match(body.error ?? "", /GROK_API_KEY is not set/);
  } finally {
    if (saved === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = saved;
    server.close();
  }
});

void graph satisfies ApplicationGraph;
