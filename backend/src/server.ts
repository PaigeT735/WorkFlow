import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import { connectToBronto } from "./bronto.js";
import { explain, GrokError, type ExplainRequest } from "./grok.js";
import { RepositoryError } from "./github.js";
import { analyzeTarget, discardProject, getProject, sweepExpired } from "./projectStore.js";
import { readRepoFile, SourceAccessError } from "./sourceAccess.js";

// Same load order as bronto.ts: backend/.env, then the repo-root .env.
loadEnv({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });
loadEnv({ path: fileURLToPath(new URL("../../.env", import.meta.url)), quiet: true });

const PORT = Number(process.env.PORT ?? 8787);
const MAX_BODY = 1_000_000;

export function createServer(): Server {
  return createHttpServer((req, res) => {
    void handle(req, res).catch((error: unknown) => {
      if (error instanceof RepositoryError) {
        send(res, error.status, { error: error.message });
        return;
      }
      const message = error instanceof Error ? error.message : "The server hit an unexpected error.";
      send(res, 500, { error: message.slice(0, 500) });
    });
  });
}

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const method = req.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/health") {
    send(res, 200, { ok: true });
    return;
  }

  if (method === "POST" && url.pathname === "/api/analyze") {
    const body = await readJson(req);
    const repository = body != null && typeof body === "object" && "repository" in body
      ? (body as { repository?: unknown }).repository
      : undefined;
    if (typeof repository !== "string") {
      send(res, 400, { error: "Body must be { \"repository\": \"https://github.com/owner/repo\" }." });
      return;
    }
    try {
      const project = await analyzeTarget(repository);
      if (project.report.filesAnalyzed === 0) {
        await discardProject(project.id);
        send(res, 422, { error: "The repository has no supported source files to analyze." });
        return;
      }
      send(res, 200, {
        projectId: project.id,
        name: project.name,
        repository: project.repository,
        graphUrl: `/api/projects/${project.id}/graph`,
        summary: {
          filesAnalyzed: project.report.filesAnalyzed,
          filesSkipped: project.report.filesSkipped,
          nodeCount: project.report.graph.nodes.length,
          edgeCount: project.report.graph.edges.length,
          warnings: project.report.warnings,
        },
      });
    } catch (error) {
      if (error instanceof RepositoryError) {
        send(res, error.status, { error: error.message });
        return;
      }
      send(res, 500, { error: "Analysis failed before a graph could be built." });
    }
    return;
  }

  const graphMatch = /^\/api\/projects\/([a-f0-9]+)\/graph$/.exec(url.pathname);
  if (method === "GET" && graphMatch?.[1]) {
    const project = getProject(graphMatch[1]);
    if (!project) {
      send(res, 404, { error: "Unknown project. Analyze the repository again." });
      return;
    }
    send(res, 200, project.report.graph);
    return;
  }

  if (method === "GET" && url.pathname === "/api/source") {
    const projectId = url.searchParams.get("project") ?? "";
    const filePath = url.searchParams.get("path") ?? "";
    const project = getProject(projectId);
    if (!project) {
      send(res, 404, { error: "Unknown project. Analyze the repository again." });
      return;
    }
    try {
      const file = await readRepoFile(project.root, filePath);
      send(res, 200, file);
    } catch (error) {
      if (error instanceof SourceAccessError) {
        send(res, error.status, { error: error.message });
        return;
      }
      send(res, 500, { error: "Could not read that file." });
    }
    return;
  }

  if (method === "POST" && url.pathname === "/api/grok/explain") {
    const body = await readJson(req);
    if (body == null || typeof body !== "object") {
      send(res, 400, { error: "Expected a JSON explanation request." });
      return;
    }
    try {
      const result = await explain(body as ExplainRequest);
      send(res, 200, { explanation: result.explanation });
    } catch (error) {
      if (error instanceof GrokError) {
        send(res, error.status, { error: error.message });
        return;
      }
      send(res, 502, { error: "Grok is unavailable." });
    }
    return;
  }

  if (method === "GET" && url.pathname === "/api/bronto/status") {
    try {
      const { client, tools } = await connectToBronto();
      const names = tools.map((tool) => tool.name);
      await client.close().catch(() => {});
      send(res, 200, { connected: true, tools: names });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bronto is unavailable.";
      send(res, 200, { connected: false, error: message });
    }
    return;
  }

  send(res, 404, { error: `No route for ${method} ${url.pathname}.` });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += buffer.length;
    if (size > MAX_BODY) {
      throw new RepositoryError(413, "Request body is too large.");
    }
    chunks.push(buffer);
  }
  if (chunks.length === 0) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RepositoryError(400, "Request body is not JSON.");
  }
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  const server = createServer();
  server.listen(PORT, "127.0.0.1", () => {
    console.log(`WorkFlow backend listening on http://127.0.0.1:${PORT}`);
    void sweepExpired();
  });
}
