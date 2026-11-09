import { runGit } from "./run-git.js";
import type { BlameRange, KiroCommit } from "./types.js";
import { isTestPath } from "./walker.js";

/** True when the repository is a shallow clone. Any failure gives false. */
export async function isShallow(root: string): Promise<boolean> {
  try {
    const out = await runGit(root, ["rev-parse", "--is-shallow-repository"]);
    return out !== undefined && out.trim() === "true";
  } catch {
    return false;
  }
}

/**
 * Commits whose subject starts with `kiro:` (ignoring case), in `git log`
 * order (newest first). Any failure gives an empty list. Never throws.
 */
export async function readKiroCommits(root: string): Promise<KiroCommit[]> {
  try {
    const out = await runGit(root, ["log", "--format=%H%x1f%s"]);
    if (out === undefined) return [];
    const commits: KiroCommit[] = [];
    for (const line of out.split("\n")) {
      if (line === "") continue;
      const cut = line.indexOf("\x1f");
      if (cut < 0) continue;
      const sha = line.slice(0, cut);
      const subject = line.slice(cut + 1);
      if (/^kiro:/i.test(subject)) commits.push({ sha, subject });
    }
    return commits;
  } catch {
    return [];
  }
}

/**
 * The given commit SHAs that change at least one file and only test files
 * (by `isTestPath`), in the order of `shas`. One `git log --name-only` call.
 * Any failure gives an empty list. Never throws.
 */
export async function readTestOnlyCommits(root: string, shas: readonly string[]): Promise<string[]> {
  try {
    if (shas.length === 0) return [];
    const out = await runGit(root, [
      "-c",
      "core.quotepath=false",
      "log",
      "--name-only",
      "--format=%x1e%H",
    ]);
    if (out === undefined) return [];
    const testOnly = new Set<string>();
    for (const chunk of out.split("\x1e")) {
      if (chunk === "") continue;
      const lines = chunk.split("\n");
      const sha = (lines[0] ?? "").trim();
      if (sha === "") continue;
      const files = lines.slice(1).filter((l) => l.trim() !== "");
      if (files.length > 0 && files.every((f) => isTestPath(f))) testOnly.add(sha);
    }
    return shas.filter((sha) => testOnly.has(sha));
  } catch {
    return [];
  }
}

const HEADER = /^([0-9a-f]{40,64}) \d+ (\d+)(?: \d+)?$/;
const UNCOMMITTED = /^0+$/;

/**
 * Blame ranges of one file (project-relative path) against the working tree,
 * sorted, non-overlapping, adjacent ranges of one commit merged. Uncommitted
 * lines get no range. Any failure gives undefined. Never throws.
 */
export async function readBlame(root: string, relPath: string): Promise<BlameRange[] | undefined> {
  try {
    const out = await runGit(root, ["blame", "--porcelain", "--", relPath]);
    if (out === undefined) return undefined;
    const ranges: BlameRange[] = [];
    for (const line of out.split("\n")) {
      if (line.startsWith("\t")) continue;
      const m = HEADER.exec(line);
      if (m === null) continue;
      const sha = m[1] ?? "";
      const finalLine = Number(m[2]);
      if (UNCOMMITTED.test(sha) || !Number.isInteger(finalLine) || finalLine < 1) continue;
      const last = ranges[ranges.length - 1];
      if (last !== undefined && last.sha === sha && last.endLine === finalLine - 1) {
        last.endLine = finalLine;
      } else {
        ranges.push({ startLine: finalLine, endLine: finalLine, sha });
      }
    }
    ranges.sort((a, b) => a.startLine - b.startLine);
    return ranges;
  } catch {
    return undefined;
  }
}
