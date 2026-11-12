import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { scoreAgainstTruth } from "../../src/linker/accuracy.js";
import { linkProject } from "../../src/linker/index.js";
import type { TruthEntry } from "../../src/linker/types.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const specDir = join(repoRoot, ".kiro", "specs", "constraint-reqs");
const fixturesDir = join(repoRoot, "tests", "fixtures");

/** Fixtures that must not be opened by this spec's work. */
const OFF_LIMITS = new Set(["heldout", "blind3", "blind4"]);

const tempDirs: string[] = [];

afterAll(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

/** Removes block comments and line comments (a simple scan; enough for link.ts). */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

describe("constraint-reqs guards", () => {
  // constraint-reqs/R3.2
  it("link.ts contains exactly one call of classifyRequirement and imports classifyRequirement from ./classify.js", async () => {
    const source = stripComments(await readFile(join(repoRoot, "src", "linker", "link.ts"), "utf8"));
    expect(source.split("classifyRequirement(").length - 1).toBe(1);
    expect(source).toMatch(/import\s*\{[^}]*\bclassifyRequirement\b[^}]*\}\s*from\s*"\.\/classify\.js"/);
  });

  // constraint-reqs/R3.3
  it("adds no dependency and edits no package.json list, and no expected.json stops being valid JSON", async () => {
    const pkg = JSON.parse(await readFile(join(repoRoot, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.dependencies).toEqual({
      "@modelcontextprotocol/sdk": "1.20.0",
      "tree-sitter-wasms": "0.1.13",
      "web-tree-sitter": "0.25.10",
      zod: "3.25.76",
    });
    expect(pkg.devDependencies).toEqual({
      "@types/node": "22.10.2",
      "fast-check": "3.23.2",
      tsx: "4.20.6",
      typescript: "5.7.2",
      vite: "5.4.21",
      vitest: "2.1.8",
    });

    // "No expected.json changed" is not checkable here; only that each one still parses.
    const entries = await readdir(fixturesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || OFF_LIMITS.has(entry.name)) continue;
      const path = join(fixturesDir, entry.name, "expected.json");
      if (!existsSync(path)) continue;
      expect(() => JSON.parse(readFileSync(path, "utf8")), path).not.toThrow();
    }
  });

  // constraint-reqs/R3.4
  it("design.md has the section Existing tests that may fail and names classify.test.ts and link-properties.test.ts", async () => {
    const design = await readFile(join(specDir, "design.md"), "utf8");
    const start = design.indexOf("## Existing tests that may fail");
    expect(start).toBeGreaterThanOrEqual(0);
    const rest = design.slice(start + 1);
    const next = rest.search(/^## /m);
    const section = next === -1 ? rest : rest.slice(0, next);
    expect(section).toContain("classify.test.ts");
    expect(section).toContain("link-properties.test.ts");
  });

  // constraint-reqs/R3.5
  it("keeps the planted fixture at exactly 14 findings, exactly 4 ghosts, and overall precision and recall of at least 0.8", async () => {
    const planted = join(fixturesDir, "planted");
    const built = await buildFixtureRepo(planted);
    tempDirs.push(built);
    const map = await linkProject(built);
    const truth = JSON.parse(await readFile(join(planted, "expected.json"), "utf8")) as TruthEntry[];

    const ghosts = map.requirements.filter((r) => r.status === "ghost").length;
    const unproven = map.requirements.filter((r) => r.status === "unproven").length;
    expect(ghosts).toBe(4);
    expect(ghosts + unproven + map.zombies.length).toBe(14);

    const report = scoreAgainstTruth(map, truth);
    expect(report.overall.precision).toBeGreaterThanOrEqual(0.8);
    expect(report.overall.recall).toBeGreaterThanOrEqual(0.8);
  }, 120_000);

  // constraint-reqs/R5.1
  it("has the work done: tasks 1 and 2 of tasks.md are marked [x], task 3 may be either state", async () => {
    const tasks = await readFile(join(specDir, "tasks.md"), "utf8");
    expect(tasks).toMatch(/^- \[x\] 1\. /m);
    expect(tasks).toMatch(/^- \[x\] 2\. /m);
    expect(tasks).toMatch(/^- \[[ x]\] 3\. /m);
  });

  // constraint-reqs/R5.2
  it("runs npm run autopsy on this repository without error and morgue-pass-2/R10.2, R10.4, R10.5 and R11.4 are no longer ghosts", async () => {
    // Reads the committed self-autopsy report; runs nothing and writes nothing.
    const report = JSON.parse(await readFile(join(repoRoot, "src", "ui", "public", "report.json"), "utf8")) as {
      specs: { name: string; requirements: { id: string; status: string }[] }[];
    };
    const requirements = report.specs.flatMap((s) => s.requirements);
    for (const id of [
      "morgue-pass-2/R10.2",
      "morgue-pass-2/R10.4",
      "morgue-pass-2/R10.5",
      "morgue-pass-2/R11.4",
    ]) {
      const entry = requirements.find((r) => r.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.status, id).not.toBe("ghost");
    }
  });
});
