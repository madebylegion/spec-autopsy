import { execFile } from "node:child_process";
import type { GitCommit, GitHistory } from "./types.js";

const MAX_BUFFER = 64 * 1024 * 1024;

function emptyHistory(): GitHistory {
  return { commits: [], commitCount: 0, authors: [] };
}

/** Runs git without a shell; resolves to stdout, or undefined on any failure. */
function runGit(root: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      execFile(
        "git",
        args,
        { cwd: root, maxBuffer: MAX_BUFFER, encoding: "utf8", windowsHide: true },
        (error, stdout) => {
          resolve(error ? undefined : stdout);
        },
      );
    } catch {
      resolve(undefined);
    }
  });
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Reads the git history of one file (project-relative path). Any failure
 * (no git, not a repository, no commits) gives the empty history. Never throws.
 */
export async function readGitHistory(root: string, relPath: string): Promise<GitHistory> {
  try {
    const recent = await runGit(root, [
      "log",
      "-n",
      "5",
      "--format=%H%x1f%an%x1f%aI%x1f%s",
      "--",
      relPath,
    ]);
    if (recent === undefined) return emptyHistory();
    const commits: GitCommit[] = [];
    for (const line of recent.split("\n")) {
      if (line === "") continue;
      const parts = line.split("\x1f");
      if (parts.length < 4) continue;
      commits.push({
        sha: parts[0] ?? "",
        author: parts[1] ?? "",
        date: parts[2] ?? "",
        subject: parts.slice(3).join("\x1f"),
      });
    }
    if (commits.length === 0) return emptyHistory();

    const all = await runGit(root, ["log", "--format=%an", "--", relPath]);
    if (all === undefined) return emptyHistory();
    const names = all.split("\n").filter((n) => n !== "");
    const authors = [...new Set(names)].sort(compareCodeUnits);
    return { commits, commitCount: names.length, authors };
  } catch {
    return emptyHistory();
  }
}
