import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import { isSensitivePath } from "../sourceAccess.js";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".next",
  "out",
  "vendor",
  ".turbo",
  "tmp",
  ".cache",
]);

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

export const LIMITS = {
  maxSourceFiles: 1500,
  maxFileChars: 400_000,
  maxPages: 40,
  maxComponents: 80,
  maxInteractions: 100,
  maxApis: 60,
};

export interface SourceText {
  path: string;
  text: string;
  source: ts.SourceFile;
}

export interface ScanResult {
  files: SourceText[];
  warnings: string[];
}

export async function scanRepository(root: string): Promise<ScanResult> {
  const rootReal = await realpath(root);
  const warnings: string[] = [];
  const files: SourceText[] = [];
  let stopped = false;

  async function walk(dir: string): Promise<void> {
    if (stopped) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (stopped) return;
      if (entry.name.startsWith(".git")) continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(rootReal, abs).split(path.sep).join("/");
      if (isSensitivePath(rel)) {
        warnings.push(`Skipped sensitive file ${rel}.`);
        continue;
      }

      let info;
      try {
        info = await lstat(abs);
      } catch {
        warnings.push(`Skipped unreadable path ${rel}.`);
        continue;
      }

      if (info.isSymbolicLink()) {
        try {
          const target = await realpath(abs);
          const targetRel = path.relative(rootReal, target);
          if (targetRel.startsWith("..") || path.isAbsolute(targetRel)) {
            warnings.push(`Skipped symlink that leaves the repository: ${rel}.`);
            continue;
          }
        } catch {
          warnings.push(`Skipped broken symlink ${rel}.`);
          continue;
        }
      }

      if (info.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(abs);
        continue;
      }
      if (!info.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXT.has(ext) || entry.name.endsWith(".d.ts")) continue;
      if (files.length >= LIMITS.maxSourceFiles) {
        warnings.push(`Stopped after ${LIMITS.maxSourceFiles} source files.`);
        stopped = true;
        return;
      }
      if (info.size > LIMITS.maxFileChars) {
        warnings.push(`Skipped ${rel} because it is larger than ${LIMITS.maxFileChars} characters.`);
        continue;
      }

      let text: string;
      try {
        text = await readFile(abs, "utf8");
      } catch (error) {
        warnings.push(`Skipped ${rel}: ${error instanceof Error ? error.message : "unreadable"}.`);
        continue;
      }
      if (text.includes("\0")) {
        warnings.push(`Skipped binary file ${rel}.`);
        continue;
      }

      try {
        const source = ts.createSourceFile(
          rel,
          text,
          ts.ScriptTarget.Latest,
          true,
          scriptKind(ext),
        );
        const diagnostics =
          (source as { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics ?? [];
        if (diagnostics.length > 0) {
          warnings.push(`Skipped ${rel} because it did not parse.`);
          continue;
        }
        files.push({ path: rel, text, source });
      } catch (error) {
        warnings.push(
          `Skipped ${rel}: ${error instanceof Error ? error.message : "parse failed"}.`,
        );
      }
    }
  }

  await walk(rootReal);
  return { files, warnings };
}

function scriptKind(ext: string): ts.ScriptKind {
  if (ext === ".tsx") return ts.ScriptKind.TSX;
  if (ext === ".jsx") return ts.ScriptKind.JSX;
  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

export function spanOf(source: ts.SourceFile, node: ts.Node): { file: string; startLine: number; endLine: number } {
  const start = source.getLineAndCharacterOfPosition(node.getStart(source));
  const end = source.getLineAndCharacterOfPosition(Math.max(node.getStart(source), node.getEnd() - 1));
  return {
    file: source.fileName.split(path.sep).join("/"),
    startLine: start.line + 1,
    endLine: end.line + 1,
  };
}
