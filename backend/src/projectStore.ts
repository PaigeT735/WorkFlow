import { randomBytes } from "node:crypto";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ApplicationGraph } from "./graphTypes.js";
import { cloneRepository, fileUrlToPath, localPathAllowed, parseGitHubRepo, removeClone, RepositoryError } from "./github.js";
import { inspectRepository, type AnalysisReport } from "./analyzer/inspect.js";

const TTL_MS = 6 * 60 * 60 * 1000;

export interface StoredProject {
  id: string;
  name: string;
  repository: string;
  root: string;
  owned: boolean;
  createdAt: number;
  report: AnalysisReport;
}

const projects = new Map<string, StoredProject>();

export function projectRootDir(): string {
  return path.join(os.tmpdir(), "workflow-projects");
}

export function getProject(id: string): StoredProject | undefined {
  const project = projects.get(id);
  if (!project) return undefined;
  if (Date.now() - project.createdAt > TTL_MS) {
    void forget(project);
    return undefined;
  }
  return project;
}

export function graphOf(id: string): ApplicationGraph | undefined {
  return getProject(id)?.report.graph;
}

export async function analyzeTarget(repository: string): Promise<StoredProject> {
  const trimmed = repository.trim();
  if (!trimmed) throw new RepositoryError(400, "A repository URL is required.");

  await mkdir(projectRootDir(), { recursive: true });
  const id = randomBytes(8).toString("hex");
  let root = "";
  let owned = false;
  let label = trimmed;

  if (localPathAllowed(trimmed) || (!trimmed.startsWith("http") && process.env.WORKFLOW_ALLOW_LOCAL === "1")) {
    root = fileUrlToPath(trimmed);
    const info = await stat(root).catch(() => null);
    if (!info?.isDirectory()) throw new RepositoryError(400, "Local analysis needs a directory, and WORKFLOW_ALLOW_LOCAL=1.");
    label = path.basename(root);
  } else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const parsed = parseGitHubRepo(trimmed);
    label = parsed.repo;
    root = path.join(projectRootDir(), id, "repo");
    owned = true;
    try {
      await cloneRepository(root, trimmed);
    } catch (error) {
      await removeClone(path.join(projectRootDir(), id));
      throw error;
    }
  } else {
    throw new RepositoryError(
      400,
      "Use a public https://github.com/owner/repo URL. Local paths are only accepted when WORKFLOW_ALLOW_LOCAL=1.",
    );
  }

  try {
    const report = await inspectRepository(root);
    if (report.filesAnalyzed === 0) {
      if (owned) await removeClone(path.join(projectRootDir(), id));
      throw new RepositoryError(422, "The repository has no supported source files to analyze.");
    }
    const project: StoredProject = {
      id,
      name: report.graph.name || label,
      repository: owned ? `https://github.com/${parseGitHubRepo(trimmed).owner}/${parseGitHubRepo(trimmed).repo}` : label,
      root,
      owned,
      createdAt: Date.now(),
      report,
    };
    projects.set(id, project);
    return project;
  } catch (error) {
    if (owned) await removeClone(path.join(projectRootDir(), id));
    throw error;
  }
}

export async function sweepExpired(): Promise<void> {
  const now = Date.now();
  for (const project of projects.values()) {
    if (now - project.createdAt > TTL_MS) await forget(project);
  }
  const dir = projectRootDir();
  const entries = await readdir(dir).catch(() => []);
  for (const entry of entries) {
    if (projects.has(entry)) continue;
    const abs = path.join(dir, entry);
    const info = await stat(abs).catch(() => null);
    if (info && now - info.mtimeMs > TTL_MS) await rm(abs, { recursive: true, force: true });
  }
}

export async function discardProject(id: string): Promise<void> {
  const project = projects.get(id);
  if (project) await forget(project);
}

async function forget(project: StoredProject): Promise<void> {
  projects.delete(project.id);
  if (project.owned) await removeClone(path.join(projectRootDir(), project.id));
}
