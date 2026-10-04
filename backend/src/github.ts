import { mkdir, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const GITHUB_REPO = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/;

export class RepositoryError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "RepositoryError";
    this.status = status;
  }
}

export function parseGitHubRepo(input: string): { owner: string; repo: string; url: string } {
  const match = GITHUB_REPO.exec(input.trim());
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo) {
    throw new RepositoryError(
      400,
      "Use a public GitHub repository URL such as https://github.com/owner/repo.",
    );
  }
  return { owner, repo, url: `https://github.com/${owner}/${repo}.git` };
}

export async function cloneRepository(targetDir: string, repository: string): Promise<void> {
  const parsed = parseGitHubRepo(repository);
  await mkdir(path.dirname(targetDir), { recursive: true });
  const token = process.env.GITHUB_TOKEN?.trim();
  const url = token
    ? `https://x-access-token:${token}@github.com/${parsed.owner}/${parsed.repo}.git`
    : parsed.url;
  await runGit(url, targetDir, token);
}

function runGit(url: string, targetDir: string, token: string | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      ["clone", "--depth", "1", "--single-branch", "--no-tags", url, targetDir],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, 45_000);
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new RepositoryError(500, `git clone failed to start: ${redact(error.message, token)}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      const detail = redact(stderr.trim() || `git exited ${code ?? "unknown"}`, token);
      const missing = /not found|repository not found|403|401/i.test(detail);
      reject(new RepositoryError(missing ? 404 : 502, `Could not clone the repository. ${detail}`));
    });
  });
}

export async function removeClone(targetDir: string): Promise<void> {
  await rm(targetDir, { recursive: true, force: true });
}

function redact(text: string, token: string | undefined): string {
  let out = text.replace(/x-access-token:[^@\s]+/g, "x-access-token:[REDACTED]");
  if (token) out = out.split(token).join("[REDACTED]");
  return out.slice(0, 500);
}

export function localPathAllowed(repository: string): boolean {
  if (process.env.WORKFLOW_ALLOW_LOCAL !== "1") return false;
  return path.isAbsolute(repository) || repository.startsWith("file://");
}

export function fileUrlToPath(repository: string): string {
  if (repository.startsWith("file://")) return fileURLToPath(repository);
  return repository;
}
