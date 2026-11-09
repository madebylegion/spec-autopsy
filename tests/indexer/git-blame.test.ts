import { execFile } from "node:child_process";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { isShallow, readBlame, readKiroCommits } from "../../src/indexer/git-blame.js";
import { indexRepo } from "../../src/indexer/index.js";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "git-blame-"));
  created.push(dir);
  return dir;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run(
    "git",
    ["-c", "user.name=T", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args],
    { cwd },
  );
  return stdout;
}

function write(dir: string, rel: string, text: string): void {
  const full = join(dir, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

async function commit(dir: string, message: string): Promise<string> {
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-q", "-m", message]);
  return (await git(dir, ["rev-parse", "HEAD"])).trim();
}

async function newRepo(): Promise<string> {
  const dir = tempDir();
  await git(dir, ["init", "-q"]);
  return dir;
}

const FOUR = "export const a = 1;\nexport const b = 2;\nexport const c = 3;\nexport const d = 4;\n";
const THREE = "export const e = 5;\nexport const f = 6;\nexport const g = 7;\n";

afterAll(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("readKiroCommits", () => {
  it("lists only kiro: subjects, newest first", async () => {
    const dir = await newRepo();
    write(dir, "src/a.ts", FOUR);
    const s1 = await commit(dir, "kiro: stock task 1 First");
    write(dir, "src/a.ts", FOUR + THREE);
    await commit(dir, "chore: something");
    write(dir, "src/b.ts", FOUR);
    const s3 = await commit(dir, "KIRO: task 2 Second");
    expect(await readKiroCommits(dir)).toEqual([
      { sha: s3, subject: "KIRO: task 2 Second" },
      { sha: s1, subject: "kiro: stock task 1 First" },
    ]);
    const index = await indexRepo(dir);
    expect(index.kiroCommits).toEqual([
      { sha: s3, subject: "KIRO: task 2 Second" },
      { sha: s1, subject: "kiro: stock task 1 First" },
    ]);
  }, 30000);

  it("gives an empty list outside a repository", async () => {
    expect(await readKiroCommits(tempDir())).toEqual([]);
  }, 30000);
});

describe("readBlame", () => {
  it("gives sorted, non-overlapping ranges covering all lines of a two-commit file", async () => {
    const dir = await newRepo();
    write(dir, "src/a.ts", FOUR);
    const s1 = await commit(dir, "kiro: task 1 One");
    write(dir, "src/a.ts", FOUR + THREE);
    const s2 = await commit(dir, "kiro: task 2 Two");
    const expected = [
      { startLine: 1, endLine: 4, sha: s1 },
      { startLine: 5, endLine: 7, sha: s2 },
    ];
    expect(await readBlame(dir, "src/a.ts")).toEqual(expected);
    const index = await indexRepo(dir);
    expect(index.files.find((f) => f.path === "src/a.ts")?.blame).toEqual(expected);
  }, 30000);

  it("gives a rewritten line to the later commit", async () => {
    const dir = await newRepo();
    write(dir, "src/a.ts", FOUR + THREE);
    const s1 = await commit(dir, "kiro: task 1 One");
    write(dir, "src/b.ts", "export const z = 0;\n");
    await commit(dir, "kiro: task 2 Two");
    write(dir, "src/a.ts", FOUR.replace("b = 2", "b = 22") + THREE);
    const s3 = await commit(dir, "kiro: task 3 Three");
    expect(await readBlame(dir, "src/a.ts")).toEqual([
      { startLine: 1, endLine: 1, sha: s1 },
      { startLine: 2, endLine: 2, sha: s3 },
      { startLine: 3, endLine: 7, sha: s1 },
    ]);
  }, 30000);

  it("gives no range to an uncommitted line", async () => {
    const dir = await newRepo();
    write(dir, "src/a.ts", FOUR);
    const s1 = await commit(dir, "kiro: task 1 One");
    appendFileSync(join(dir, "src/a.ts"), "export const late = 9;\n");
    expect(await readBlame(dir, "src/a.ts")).toEqual([{ startLine: 1, endLine: 4, sha: s1 }]);
  }, 30000);

  it("gives undefined for an untracked file", async () => {
    const dir = await newRepo();
    write(dir, "src/a.ts", FOUR);
    await commit(dir, "kiro: task 1 One");
    write(dir, "src/new.ts", FOUR);
    expect(await readBlame(dir, "src/new.ts")).toBeUndefined();
  }, 30000);

  it("uses paths relative to a fixture folder inside a larger repository", async () => {
    const dir = await newRepo();
    write(dir, "top.ts", FOUR);
    write(dir, "fx/src/a.ts", FOUR);
    const s1 = await commit(dir, "kiro: task 1 One");
    const sub = join(dir, "fx");
    expect(await readBlame(sub, "src/a.ts")).toEqual([{ startLine: 1, endLine: 4, sha: s1 }]);
    const index = await indexRepo(sub);
    expect(index.files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(index.files[0]?.blame).toEqual([{ startLine: 1, endLine: 4, sha: s1 }]);
  }, 30000);
});

describe("indexRepo without usable commit data", () => {
  it("sets neither field when there is no kiro commit", async () => {
    const dir = await newRepo();
    write(dir, "src/a.ts", FOUR);
    await commit(dir, "chore: plain");
    const index = await indexRepo(dir);
    expect("kiroCommits" in index).toBe(false);
    for (const f of index.files) expect("blame" in f).toBe(false);
  }, 30000);

  it("sets neither field in a directory without git", async () => {
    const dir = tempDir();
    write(dir, "src/a.ts", FOUR);
    const index = await indexRepo(dir);
    expect(index.files).toHaveLength(1);
    expect("kiroCommits" in index).toBe(false);
    for (const f of index.files) expect("blame" in f).toBe(false);
  }, 30000);

  it("sets neither field in a shallow clone", async () => {
    const dir = await newRepo();
    write(dir, "src/a.ts", FOUR);
    await commit(dir, "chore: first");
    write(dir, "src/a.ts", FOUR + THREE);
    await commit(dir, "kiro: task 1 One");
    const holder = tempDir();
    const clone = join(holder, "clone");
    await git(holder, ["clone", "-q", "--depth", "1", `file://${dir}`, clone]);
    expect(await isShallow(clone)).toBe(true);
    expect(await isShallow(dir)).toBe(false);
    const index = await indexRepo(clone);
    expect(index.files.length).toBeGreaterThan(0);
    expect("kiroCommits" in index).toBe(false);
    for (const f of index.files) expect("blame" in f).toBe(false);
  }, 30000);

  it("does not throw on this repository's own root", async () => {
    const index = await indexRepo(resolve(here, "../.."));
    expect(index.files.length).toBeGreaterThan(0);
  }, 120000);
});
