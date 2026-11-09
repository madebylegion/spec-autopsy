import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isTestPath, walkRepo } from "../../src/indexer/walker.js";

const created: string[] = [];

function makeTree(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "walker-"));
  created.push(root);
  for (const rel of files) {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, "x\n");
  }
  return root;
}

afterEach(() => {
  for (const dir of created.splice(0)) {
    try {
      chmodSync(join(dir, "locked"), 0o755);
    } catch {
      // no locked directory in this tree
    }
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("isTestPath", () => {
  it("marks paths with a tests, test or __tests__ segment", () => {
    expect(isTestPath("tests/a.ts")).toBe(true);
    expect(isTestPath("src/test/a.ts")).toBe(true);
    expect(isTestPath("src/__tests__/deep/a.py")).toBe(true);
  });

  it("marks *.test.* and *.spec.* names", () => {
    expect(isTestPath("src/a.test.ts")).toBe(true);
    expect(isTestPath("src/a.spec.js")).toBe(true);
    expect(isTestPath("src/a.test.tsx")).toBe(true);
  });

  it("marks test_*.py and *_test.py names", () => {
    expect(isTestPath("pkg/test_core.py")).toBe(true);
    expect(isTestPath("pkg/core_test.py")).toBe(true);
  });

  it("marks everything else false", () => {
    expect(isTestPath("src/a.ts")).toBe(false);
    expect(isTestPath("src/testing/a.ts")).toBe(false);
    expect(isTestPath("src/contest.ts")).toBe(false);
    expect(isTestPath("pkg/test_core.js")).toBe(false);
    expect(isTestPath("pkg/mytest.py")).toBe(false);
    expect(isTestPath("src/latest/a.py")).toBe(false);
  });
});

describe("walkRepo", () => {
  it("skips the listed directories, filters extensions and sorts by code unit", async () => {
    const root = makeTree([
      "z.txt",
      "b.py",
      "a/x.ts",
      "a.ts",
      "c.jsx",
      "d.tsx",
      "README.md",
      "node_modules/m.js",
      ".git/h.js",
      "dist/d.js",
      "build/b.js",
      "coverage/c.js",
      "__pycache__/p.py",
      ".venv/v.py",
      ".kiro/k.ts",
      "sub/node_modules/n.js",
      "sub/deep/f.cjs",
      "sub/deep/e.mjs",
      "tests/t.ts",
    ]);
    const result = await walkRepo(root);
    expect(result.diagnostics).toEqual([]);
    expect(result.files.map((f) => f.path)).toEqual([
      "a.ts",
      "a/x.ts",
      "b.py",
      "c.jsx",
      "d.tsx",
      "sub/deep/e.mjs",
      "sub/deep/f.cjs",
      "tests/t.ts",
    ]);
  });

  it("sets isTest from the path and uses / separators", async () => {
    const root = makeTree(["src/a.ts", "src/a.spec.ts", "tests/b.ts", "pkg/test_x.py"]);
    const result = await walkRepo(root);
    expect(result.files).toEqual([
      { path: "pkg/test_x.py", isTest: true },
      { path: "src/a.spec.ts", isTest: true },
      { path: "src/a.ts", isTest: false },
      { path: "tests/b.ts", isTest: true },
    ]);
    for (const f of result.files) expect(f.path.includes("\\")).toBe(false);
  });

  it("walks the ts-basic fixture", async () => {
    const fixture = fileURLToPath(new URL("../fixtures/ts-basic", import.meta.url));
    const result = await walkRepo(fixture);
    expect(result.files).toEqual([
      { path: "src/math.ts", isTest: false },
      { path: "src/other.ts", isTest: false },
      { path: "tests/math.test.ts", isTest: true },
    ]);
  });

  it("reports an unreadable root as a diagnostic and does not throw", async () => {
    const root = makeTree(["a.ts"]);
    const missing = join(root, "does-not-exist");
    const result = await walkRepo(missing);
    expect(result.files).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]?.code).toBe("unreadable-directory");
    expect(result.diagnostics[0]?.file).toBe(".");
    expect(result.diagnostics[0]?.message).not.toContain(root);
  });

  const isRoot = typeof process.getuid === "function" && process.getuid() === 0;
  it.skipIf(isRoot)("reports an unreadable subdirectory and continues", async () => {
    const root = makeTree(["a.ts", "locked/inner.ts", "z.ts"]);
    chmodSync(join(root, "locked"), 0o000);
    const result = await walkRepo(root);
    expect(result.files.map((f) => f.path)).toEqual(["a.ts", "z.ts"]);
    expect(result.diagnostics).toEqual([
      {
        code: "unreadable-directory",
        message: expect.any(String),
        file: "locked",
      },
    ]);
  });
});
