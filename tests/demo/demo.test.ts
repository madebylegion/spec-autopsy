import { execFile } from "node:child_process";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

interface Result {
  code: number;
  stdout: string;
  stderr: string;
}

function run(file: string, args: string[], cwd: string, timeout: number): Promise<Result> {
  return new Promise((done) => {
    execFile(file, args, { cwd, timeout, encoding: "utf8" }, (error, stdout, stderr) => {
      const code =
        error === null ? 0 : typeof error.code === "number" ? error.code : 1;
      done({ code, stdout, stderr });
    });
  });
}

async function gitStatus(): Promise<string> {
  const r = await run("git", ["status", "--porcelain"], repo, 20_000);
  return r.stdout;
}

function headline(stdout: string): string {
  const i = stdout.indexOf("done in");
  return i === -1 ? stdout : stdout.slice(0, i);
}

describe("demo.sh", () => {
  it("runs the self-autopsy quickly, repeatably, without touching tracked files", async () => {
    const before = await gitStatus();

    const start = Date.now();
    const first = await run("bash", ["demo.sh"], repo, 20_000);
    const elapsed = (Date.now() - start) / 1000;

    expect(first.code).toBe(0);
    expect(first.stdout).toContain("SpecAutopsy self-autopsy");
    expect(first.stdout).toContain("Requirements:");
    expect(first.stdout).toContain("done in");
    expect(elapsed).toBeLessThan(10);

    const second = await run("bash", ["demo.sh"], repo, 20_000);
    expect(second.code).toBe(0);
    expect(headline(second.stdout)).toBe(headline(first.stdout));

    expect(await gitStatus()).toBe(before);
  }, 60_000);

  it("exits 2 with a hint when node_modules is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "demo-sh-"));
    try {
      await copyFile(join(repo, "demo.sh"), join(dir, "demo.sh"));
      const r = await run("bash", ["demo.sh"], dir, 20_000);
      expect(r.code).toBe(2);
      expect(r.stderr).toContain('demo.sh: run "npm ci" first');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
