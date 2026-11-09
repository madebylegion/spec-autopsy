import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/indexer/index.js";
import type { CodeIndex } from "../../src/indexer/index.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";
import type { FixtureCommit } from "../helpers/build-fixture-repo.js";

const created: string[] = [];

function write(root: string, rel: string, text: string): void {
  const full = join(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text);
}

/** Builds a git repository from the given files and commit plan; removed after the tests. */
async function makeRepo(files: Record<string, string>, plan: FixtureCommit[]): Promise<string> {
  const fixture = mkdtempSync(join(tmpdir(), "toc-fixture-"));
  created.push(fixture);
  for (const [rel, text] of Object.entries(files)) write(fixture, rel, text);
  write(fixture, "commits.json", JSON.stringify(plan));
  const repo = await buildFixtureRepo(fixture);
  created.push(repo);
  return repo;
}

function shaOf(index: CodeIndex, subject: string): string {
  const found = index.kiroCommits?.find((c) => c.subject === subject);
  if (found === undefined) throw new Error(`no kiro commit with subject ${subject}`);
  return found.sha;
}

const FILES = {
  "tests/a.test.ts": "export const a = 1;\n",
  "tests/b.test.ts": "export const b = 1;\n",
  "src/c.ts": "export const c = 1;\n",
  "src/d.ts": "export const d = 1;\n",
};

afterAll(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("indexRepo testOnlyCommits", () => {
  it("lists a kiro commit of test files only", async () => {
    const repo = await makeRepo(FILES, [
      { message: "kiro: only tests", files: ["tests/a.test.ts", "tests/b.test.ts"] },
      { message: "kiro: only source", files: ["src/c.ts"] },
    ]);
    const index = await indexRepo(repo);
    expect(index.testOnlyCommits).toEqual([shaOf(index, "kiro: only tests")]);
  }, 60_000);

  it("does not list a commit with one test and one source file", async () => {
    const repo = await makeRepo(FILES, [
      { message: "kiro: mixed", files: ["tests/a.test.ts", "src/c.ts"] },
      { message: "kiro: only tests", files: ["tests/b.test.ts"] },
    ]);
    const index = await indexRepo(repo);
    expect(index.testOnlyCommits).toEqual([shaOf(index, "kiro: only tests")]);
  }, 60_000);

  it("does not list a commit that changes no file", async () => {
    const repo = await makeRepo(FILES, [
      { message: "kiro: empty", files: [] },
      { message: "kiro: source", files: ["src/c.ts"] },
    ]);
    const index = await indexRepo(repo);
    expect(index.kiroCommits?.length).toBe(2);
    expect(index.testOnlyCommits).toBeUndefined();
  }, 60_000);

  it("does not list a commit that is not a kiro commit", async () => {
    const repo = await makeRepo(FILES, [
      { message: "chore: only tests", files: ["tests/a.test.ts"] },
      { message: "kiro: source", files: ["src/c.ts"] },
    ]);
    const index = await indexRepo(repo);
    expect(index.kiroCommits?.length).toBe(1);
    expect(index.testOnlyCommits).toBeUndefined();
  }, 60_000);

  it("leaves the field unset when there is no kiro commit", async () => {
    const repo = await makeRepo(FILES, [{ message: "chore: tests", files: ["tests/a.test.ts"] }]);
    const index = await indexRepo(repo);
    expect(index.kiroCommits).toBeUndefined();
    expect(index.testOnlyCommits).toBeUndefined();
    expect("testOnlyCommits" in index).toBe(false);
  }, 60_000);

  it("leaves the field unset for a directory without git and does not throw", async () => {
    const dir = mkdtempSync(join(tmpdir(), "toc-nogit-"));
    created.push(dir);
    write(dir, "src/x.ts", "export const x = 1;\n");
    write(dir, "tests/x.test.ts", "export const y = 1;\n");
    const index = await indexRepo(dir);
    expect(index.files.length).toBe(2);
    expect(index.testOnlyCommits).toBeUndefined();
  }, 60_000);

  it("indexes this repository's own root without throwing", async () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
    const index = await indexRepo(root);
    expect(index.files.length).toBeGreaterThan(0);
    if (index.testOnlyCommits !== undefined) {
      expect(index.testOnlyCommits.length).toBeGreaterThan(0);
    }
  }, 120_000);
});
