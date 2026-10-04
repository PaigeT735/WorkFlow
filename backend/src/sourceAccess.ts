import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";

const MAX_SOURCE_CHARS = 250_000;

export class SourceAccessError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "SourceAccessError";
    this.status = status;
  }
}

/** True for env files, keys, and other material that must never be read back. */
export function isSensitivePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? normalized;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (/^credentials\./i.test(base) || /^secrets\./i.test(base)) return true;
  if (/\.(pem|key|p12|pfx)$/i.test(base)) return true;
  if (base === "id_rsa" || base === "id_dsa" || base === ".npmrc" || base === ".pypirc") return true;
  return false;
}

/**
 * Read a repo-relative file. Rejects absolute paths, `..`, symlink escapes,
 * and sensitive filenames. `root` must already be the real project directory.
 */
export async function readRepoFile(
  root: string,
  requested: string,
): Promise<{ path: string; content: string }> {
  if (typeof requested !== "string" || requested.trim() === "") {
    throw new SourceAccessError(400, "A path query parameter is required.");
  }
  if (requested.includes("\0")) {
    throw new SourceAccessError(400, "The path is not valid.");
  }
  if (path.isAbsolute(requested) || /^[A-Za-z]:[\\/]/.test(requested)) {
    throw new SourceAccessError(400, "Absolute paths are not allowed.");
  }

  const rootReal = await realpath(root);
  const relative = requested.replace(/\\/g, "/").replace(/^\.\//, "");
  if (isSensitivePath(relative)) {
    throw new SourceAccessError(403, "That file is not available for source view.");
  }

  const abs = path.resolve(rootReal, relative);
  const rel = path.relative(rootReal, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new SourceAccessError(403, "The path escapes the analyzed repository.");
  }

  let current = rootReal;
  for (const part of rel.split(path.sep)) {
    if (part === "" || part === ".") continue;
    current = path.join(current, part);
    let info;
    try {
      info = await lstat(current);
    } catch {
      throw new SourceAccessError(404, "File not found in the analyzed repository.");
    }
    if (info.isSymbolicLink()) {
      const target = await realpath(current);
      const targetRel = path.relative(rootReal, target);
      if (targetRel.startsWith("..") || path.isAbsolute(targetRel)) {
        throw new SourceAccessError(403, "The path escapes the analyzed repository.");
      }
    }
  }

  const content = await readFile(abs, "utf8");
  if (content.length > MAX_SOURCE_CHARS) {
    throw new SourceAccessError(413, "That file is too large to preview.");
  }
  return { path: rel.split(path.sep).join("/"), content };
}
