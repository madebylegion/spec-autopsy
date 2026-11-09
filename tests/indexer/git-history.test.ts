import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { readGitHistory } from "../../src/indexer/git-history.js";
import { indexRepo } from "../../src/indexer/index.js";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, "../fixtures/ts-basic");

const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-history-"));
  created.push(dir);
  return dir;
}

// Git prints a UTC offset as "Z" or "+00:00" depending on version, so dates
// are compared by instant, not by their textual form.
function instant(date: string | undefined): string {
  return new Date(date ?? "").toISOString();
}

async function git(
  cwd: string,
  args: string[],
  date?: string,
): Promise<void> {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (date !== undefined) {
    env.GIT_AUTHOR_DATE = date;
    env.GIT_COMMITTER_DATE = date;
  }
  await run("git", args, { cwd, env });
}

async function commit(cwd: string, name: string, message: string, date: string): Promise<void> {
  await git(cwd, ["config", "user.name", name]);
  await git(cwd, ["config", "user.email", `${name.toLowerCase()}@example.com`]);
  await git(cwd, ["config", "commit.gpgsign", "false"]);
  await git(cwd, ["add", "-A"]);
  await git(cwd, ["commit", "-m", message], date);
}

afterAll(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("readGitHistory", () => {
  let repo: string | undefined;

  async function makeRepo(): Promise<string> {
    if (repo !== undefined) return repo;
    const dir = tempDir();
    cpSync(fixture, dir, { recursive: true });
    await git(dir, ["init"]);
    await commit(dir, "Alice", "first", "2020-01-01T00:00:00 +0000");
    appendFileSync(join(dir, "src/math.ts"), "\n// touched\n");
    await commit(dir, "Bob", "second", "2020-01-02T00:00:00 +0000");
    repo = dir;
    return dir;
  }

  it("lists commits newest first with sha, author, ISO date and subject", async () => {
    const dir = await makeRepo();
    const history = await readGitHistory(dir, "src/math.ts");
    expect(history.commits).toHaveLength(2);
    expect(history.commits[0]?.subject).toBe("second");
    expect(history.commits[0]?.author).toBe("Bob");
    expect(instant(history.commits[0]?.date)).toBe("2020-01-02T00:00:00.000Z");
    expect(history.commits[1]?.subject).toBe("first");
    expect(history.commits[1]?.author).toBe("Alice");
    expect(instant(history.commits[1]?.date)).toBe("2020-01-01T00:00:00.000Z");
    for (const c of history.commits) {
      expect(c.sha).toMatch(/^[0-9a-f]{40}$/);
    }
  }, 30000);

  it("counts all commits and lists sorted distinct authors", async () => {
    const dir = await makeRepo();
    const math = await readGitHistory(dir, "src/math.ts");
    expect(math.commitCount).toBe(2);
    expect(math.authors).toEqual(["Alice", "Bob"]);
    const other = await readGitHistory(dir, "src/other.ts");
    expect(other.commitCount).toBe(1);
    expect(other.authors).toEqual(["Alice"]);
    expect(other.commits).toHaveLength(1);
  }, 30000);

  it("gives an empty history for an uncommitted file", async () => {
    const dir = await makeRepo();
    writeFileSync(join(dir, "src/uncommitted.ts"), "export const x = 1;\n");
    const history = await readGitHistory(dir, "src/uncommitted.ts");
    expect(history).toEqual({ commits: [], commitCount: 0, authors: [] });
    const index = await indexRepo(dir);
    expect(index.diagnostics).toEqual([]);
    const file = index.files.find((f) => f.path === "src/uncommitted.ts");
    expect(file?.history).toEqual({ commits: [], commitCount: 0, authors: [] });
  }, 30000);

  it("gives an empty history and no diagnostic outside a git repository", async () => {
    const dir = tempDir();
    cpSync(fixture, dir, { recursive: true });
    const history = await readGitHistory(dir, "src/math.ts");
    expect(history).toEqual({ commits: [], commitCount: 0, authors: [] });
    const index = await indexRepo(dir);
    expect(index.diagnostics).toEqual([]);
    expect(index.files.length).toBeGreaterThan(0);
    for (const f of index.files) {
      expect(f.history).toEqual({ commits: [], commitCount: 0, authors: [] });
    }
  }, 30000);

  it("passes file names with odd characters as plain arguments", async () => {
    const dir = await makeRepo();
    const history = await readGitHistory(dir, "src/$(echo hi); rm -rf x.ts");
    expect(history).toEqual({ commits: [], commitCount: 0, authors: [] });
  }, 30000);
});
