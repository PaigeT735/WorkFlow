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
  const trimmed = input.trim();
  if (trimmed.length > 300 || /[\r\n\0]/.test(trimmed) || /\s/.test(trimmed)) {
    throw new RepositoryError(400, "The repository URL is not valid.");
  }
  if (trimmed.includes("@") || trimmed.includes("file://") || trimmed.toLowerCase().startsWith("git@")) {
    throw new RepositoryError(400, "Repository URLs cannot include credentials or another protocol.");
  }
  const match = GITHUB_REPO.exec(trimmed);
  const owner = match?.[1];
  const repo = match?.[2];
  if (!owner || !repo || owner === "." || owner === ".." || repo === "." || repo === "..") {
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
      [
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "protocol.file.allow=never",
        "-c",
        "submodule.recurse=false",
        "clone",
        "--depth",
        "1",
        "--single-branch",
        "--no-tags",
        "--no-recurse-submodules",
        "--config",
        "core.hooksPath=/dev/null",
        url,
        targetDir,
      ],
      {
        stdio: ["ignore", "ignore", "pipe"],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GIT_ASKPASS: "echo",
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "protocol.file.allow",
          GIT_CONFIG_VALUE_0: "never",
        },
      },
    );
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
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
