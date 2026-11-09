import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseProject } from "../../src/parser/index.js";

function reqText(n: number): string {
  return `### Requirement ${n}: Thing\n\n#### Acceptance Criteria\n\n1. The parser SHALL do thing ${n}.\n`;
}

async function writeSpec(root: string, name: string, text: string): Promise<void> {
  const dir = join(root, ".kiro", "specs", name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "requirements.md"), text, "utf8");
}

describe("parseProject", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "specautopsy-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("processes specs in sorted order with project-relative paths", async () => {
    await writeSpec(root, "zeta", reqText(1));
    await writeSpec(root, "alpha", reqText(2));
    await writeSpec(root, "Beta", reqText(3));
    await writeSpec(root, "mid", reqText(4));

    const result = await parseProject(root);

    expect(result.diagnostics).toEqual([]);
    expect(result.requirements.map((r) => r.id)).toEqual([
      "Beta/R3.1",
      "alpha/R2.1",
      "mid/R4.1",
      "zeta/R1.1",
    ]);
    expect(result.requirements.map((r) => r.file)).toEqual([
      ".kiro/specs/Beta/requirements.md",
      ".kiro/specs/alpha/requirements.md",
      ".kiro/specs/mid/requirements.md",
      ".kiro/specs/zeta/requirements.md",
    ]);
    expect(result.requirements[0]?.line).toBe(5);
  });

  it("returns an empty result when .kiro/specs is missing", async () => {
    const result = await parseProject(root);
    expect(result).toEqual({ requirements: [], diagnostics: [] });
  });

  it("returns an empty result when the project root does not exist", async () => {
    const result = await parseProject(join(root, "does-not-exist"));
    expect(result).toEqual({ requirements: [], diagnostics: [] });
  });

  it("reports an unreadable entry and continues with the other files", async () => {
    await writeSpec(root, "alpha", reqText(1));
    // requirements.md is a directory, so reading it fails with EISDIR.
    await mkdir(join(root, ".kiro", "specs", "broken", "requirements.md"), { recursive: true });
    await writeSpec(root, "zeta", reqText(2));

    const result = await parseProject(root);

    expect(result.requirements.map((r) => r.id)).toEqual(["alpha/R1.1", "zeta/R2.1"]);
    expect(result.diagnostics).toHaveLength(1);
    const diagnostic = result.diagnostics[0];
    expect(diagnostic?.code).toBe("unreadable-file");
    expect(diagnostic?.file).toBe(".kiro/specs/broken/requirements.md");
    expect(diagnostic?.line).toBe(1);
    expect(diagnostic?.message.length).toBeGreaterThan(0);
  });

  it("ignores folders without requirements.md and stray files", async () => {
    await mkdir(join(root, ".kiro", "specs", "empty"), { recursive: true });
    await writeFile(join(root, ".kiro", "specs", "notes.txt"), "hi", "utf8");
    await writeSpec(root, "alpha", reqText(1));

    const result = await parseProject(root);

    expect(result.diagnostics).toEqual([]);
    expect(result.requirements.map((r) => r.id)).toEqual(["alpha/R1.1"]);
  });
});

describe("self-parse", () => {
  it("parses this repo's ears-parser spec with no diagnostics", async () => {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const file = ".kiro/specs/ears-parser/requirements.md";

    const result = await parseProject(repoRoot);

    const own = result.requirements.filter((r) => r.file === file);
    expect(own.map((r) => r.id)).toContain("ears-parser/R2.3");
    for (let n = 1; n <= 6; n++) {
      expect(own.some((r) => r.id.startsWith(`ears-parser/R${n}.`))).toBe(true);
    }
    expect(result.diagnostics.filter((d) => d.file === file)).toEqual([]);
  });
});
