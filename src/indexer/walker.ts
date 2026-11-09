import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { languageForExtension } from "./grammar-loader.js";
import type { IndexDiagnostic } from "./types.js";

export interface WalkedFile {
  path: string;
  isTest: boolean;
}

export interface WalkResult {
  files: WalkedFile[];
  diagnostics: IndexDiagnostic[];
}

export const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  "__pycache__",
  ".venv",
  ".kiro",
]);

const TEST_SEGMENTS: ReadonlySet<string> = new Set(["tests", "test", "__tests__"]);

/** Code-unit comparison (never localeCompare). */
function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The isTest rule for a project-relative path with `/` separators. */
export function isTestPath(path: string): boolean {
  const segments = path.split("/");
  if (segments.some((s) => TEST_SEGMENTS.has(s))) return true;
  const name = segments[segments.length - 1] ?? "";
  if (/^.+\.test\..+$/.test(name)) return true;
  if (/^.+\.spec\..+$/.test(name)) return true;
  if (/^test_.*\.py$/.test(name)) return true;
  if (/_test\.py$/.test(name)) return true;
  return false;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}

/**
 * Walks the root recursively and returns the source files (project-relative,
 * `/` separators, ascending code-unit order) plus diagnostics. Never throws.
 */
export async function walkRepo(root: string): Promise<WalkResult> {
  const files: WalkedFile[] = [];
  const diagnostics: IndexDiagnostic[] = [];

  async function visit(relDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(relDir === "" ? root : join(root, relDir), {
        withFileTypes: true,
      });
    } catch (error) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? String((error as { code: unknown }).code)
          : "unknown error";
      diagnostics.push({
        code: "unreadable-directory",
        message: `Cannot read directory (${code})`,
        file: relDir === "" ? "." : relDir,
      });
      return;
    }
    entries.sort((a, b) => compareCodeUnits(a.name, b.name));
    for (const entry of entries) {
      const rel = relDir === "" ? entry.name : `${relDir}/${entry.name}`;
      if (entry.isDirectory()) {
        if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
        await visit(rel);
      } else if (entry.isFile()) {
        if (languageForExtension(extensionOf(entry.name)) !== undefined) {
          files.push({ path: rel, isTest: isTestPath(rel) });
        }
      }
    }
  }

  await visit("");
  files.sort((a, b) => compareCodeUnits(a.path, b.path));
  diagnostics.sort(
    (a, b) =>
      compareCodeUnits(a.file, b.file) ||
      compareCodeUnits(a.code, b.code) ||
      compareCodeUnits(a.message, b.message),
  );
  return { files, diagnostics };
}
