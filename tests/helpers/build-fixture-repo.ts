import { execFile } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

/** One entry of a commit: a whole file, or only some 1-based inclusive line ranges of it. */
export type FixtureCommitFile = string | { path: string; lines: [number, number][] };
export interface FixtureCommit { message: string; files: FixtureCommitFile[] }

const BASE_TIME = Date.UTC(2026, 0, 1, 0, 0, 0);

function listFiles(root: string, rel = ""): string[] {
  const out: string[] = [];
  const entries = readdirSync(join(root, rel), { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name === ".git") continue;
    const next = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) out.push(...listFiles(root, next));
    else if (entry.isFile()) out.push(next);
  }
  return out;
}

function splitLines(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text === "") return { lines: [], trailingNewline: false };
  const lines = text.split("\n");
  const trailingNewline = lines[lines.length - 1] === "";
  if (trailingNewline) lines.pop();
  return { lines, trailingNewline };
}

async function git(cwd: string, args: string[], date?: string): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (date !== undefined) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  await run(
    "git",
    [
      "-c", "user.name=Fixture Author",
      "-c", "user.email=fixture@example.com",
      "-c", "commit.gpgsign=false",
      ...args,
    ],
    { cwd, env },
  );
}

function dateOf(index: number): string {
  return new Date(BASE_TIME + index * 60_000).toISOString();
}

/**
 * Builds a git repository from a fixture directory in a temp directory and
 * returns its path. Without `commits.json` the directory is copied without
 * git. The caller removes the temp directory.
 */
export async function buildFixtureRepo(fixtureDir: string): Promise<string> {
  const target = mkdtempSync(join(tmpdir(), "fixture-repo-"));
  const planPath = join(fixtureDir, "commits.json");

  if (!existsSync(planPath)) {
    cpSync(fixtureDir, target, { recursive: true });
    return target;
  }

  const plan = JSON.parse(readFileSync(planPath, "utf8")) as FixtureCommit[];
  const listed = new Set<string>();
  for (const commit of plan) {
    for (const f of commit.files) listed.add(typeof f === "string" ? f : f.path);
  }
  const unlisted = listFiles(fixtureDir).filter((p) => p !== "commits.json" && !listed.has(p));

  await git(target, ["init", "-q"]);

  let tick = 0;
  if (unlisted.length > 0) {
    for (const rel of unlisted) {
      const dest = join(target, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, readFileSync(join(fixtureDir, rel)));
    }
    await git(target, ["add", "-A"]);
    await git(target, ["commit", "-q", "--allow-empty", "-m", "chore: initial files"], dateOf(tick));
    tick += 1;
  }

  // Lines committed so far per file (1-based numbers).
  const committed = new Map<string, Set<number>>();
  for (const commit of plan) {
    for (const f of commit.files) {
      const rel = typeof f === "string" ? f : f.path;
      const source = splitLines(readFileSync(join(fixtureDir, rel), "utf8"));
      const set = committed.get(rel) ?? new Set<number>();
      if (typeof f === "string") {
        for (let n = 1; n <= source.lines.length; n++) set.add(n);
      } else {
        for (const [from, to] of f.lines) {
          for (let n = from; n <= to && n <= source.lines.length; n++) {
            if (n >= 1) set.add(n);
          }
        }
      }
      committed.set(rel, set);
      const kept = source.lines.filter((_, i) => set.has(i + 1));
      const body = kept.join("\n") + (kept.length > 0 && source.trailingNewline ? "\n" : "");
      const dest = join(target, rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, body);
    }
    await git(target, ["add", "-A"]);
    await git(target, ["commit", "-q", "--allow-empty", "-m", commit.message], dateOf(tick));
    tick += 1;
  }
  return target;
}
