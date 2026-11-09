import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const run = promisify(execFile);
const created: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bfr-test-"));
  created.push(dir);
  return dir;
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run("git", args, { cwd });
  return stdout;
}

function write(dir: string, rel: string, text: string): void {
  const full = join(dir, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

function makeFixture(): string {
  const dir = tempDir();
  write(dir, "a.txt", "l1\nl2\nl3\nl4\nl5\n");
  write(dir, "b.txt", "b1\nb2\n");
  write(dir, "sub/c.txt", "c1\n");
  write(
    dir,
    "commits.json",
    JSON.stringify([
      { message: "first", files: [{ path: "a.txt", lines: [[1, 2]] }, "b.txt"] },
      { message: "second", files: [{ path: "a.txt", lines: [[3, 5]] }] },
    ]),
  );
  return dir;
}

afterAll(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("buildFixtureRepo", () => {
  it("replays commit messages in order after the initial commit", async () => {
    const repo = await buildFixtureRepo(makeFixture());
    created.push(repo);
    const log = (await git(repo, ["log", "--format=%s"])).split("\n").filter((l) => l !== "");
    expect(log).toEqual(["second", "first", "chore: initial files"]);
  }, 30000);

  it("commits only the listed line ranges at each commit", async () => {
    const repo = await buildFixtureRepo(makeFixture());
    created.push(repo);
    expect(await git(repo, ["show", "HEAD~1:a.txt"])).toBe("l1\nl2\n");
    expect(await git(repo, ["show", "HEAD:a.txt"])).toBe("l1\nl2\nl3\nl4\nl5\n");
    expect(await git(repo, ["show", "HEAD~1:b.txt"])).toBe("b1\nb2\n");
    expect(readFileSync(join(repo, "a.txt"), "utf8")).toBe("l1\nl2\nl3\nl4\nl5\n");
  }, 30000);

  it("puts the unlisted files in the initial commit and leaves commits.json out", async () => {
    const repo = await buildFixtureRepo(makeFixture());
    created.push(repo);
    const initial = (await git(repo, ["ls-tree", "-r", "--name-only", "HEAD~2"]))
      .split("\n")
      .filter((l) => l !== "");
    expect(initial).toEqual(["sub/c.txt"]);
    expect(existsSync(join(repo, "commits.json"))).toBe(false);
    expect(await git(repo, ["status", "--porcelain"])).toBe("");
  }, 30000);

  it("uses increasing commit dates", async () => {
    const repo = await buildFixtureRepo(makeFixture());
    created.push(repo);
    const dates = (await git(repo, ["log", "--reverse", "--format=%aI"]))
      .split("\n")
      .filter((l) => l !== "")
      .map((d) => new Date(d).getTime());
    expect(dates).toHaveLength(3);
    expect(dates[0]!).toBeLessThan(dates[1]!);
    expect(dates[1]!).toBeLessThan(dates[2]!);
  }, 30000);

  it("copies a directory without commits.json and without git", async () => {
    const dir = tempDir();
    write(dir, "x.txt", "x\n");
    const copy = await buildFixtureRepo(dir);
    created.push(copy);
    expect(readFileSync(join(copy, "x.txt"), "utf8")).toBe("x\n");
    expect(existsSync(join(copy, ".git"))).toBe(false);
  }, 30000);
});
