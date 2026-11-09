import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { scoreAgainstTruth } from "../../src/linker/accuracy.js";
import { linkProject } from "../../src/linker/index.js";
import type { BodyMap, TruthEntry } from "../../src/linker/types.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const planted = join(here, "..", "fixtures", "planted");
const SPEC_FILE = ".kiro/specs/weighbridge-fix/requirements.md";

function findings(map: BodyMap): string[] {
  const out: string[] = [];
  for (const r of map.requirements) {
    if (r.status === "ghost" || r.status === "unproven") out.push(`${r.status} ${r.id}`);
  }
  for (const z of map.zombies) out.push(`zombie ${z.file}#${z.symbol}`);
  return out.sort();
}

describe("recall-fix rules on the planted fixture", () => {
  let built = "";
  let map: BodyMap;
  let truth: TruthEntry[] = [];

  beforeAll(async () => {
    built = await buildFixtureRepo(planted);
    map = await linkProject(built);
    truth = JSON.parse(await readFile(join(planted, "expected.json"), "utf8")) as TruthEntry[];
  }, 120_000);

  afterAll(async () => {
    if (built !== "") await rm(built, { recursive: true, force: true });
  });

  it("links without a failure or an unknown task requirement", () => {
    expect(map.diagnostics.filter((d) => d.code === "link-failed")).toEqual([]);
    expect(map.diagnostics.filter((d) => d.code === "unknown-task-requirement")).toEqual([]);
  });

  it("leaves the defect description weighbridge-fix/R1.1 out, with a diagnostic", () => {
    expect(map.requirements.find((r) => r.id === "weighbridge-fix/R1.1")).toBeUndefined();
    const diags = map.diagnostics.filter((d) => d.code === "defect-description");
    expect(diags).toHaveLength(1);
    expect(diags[0]?.message).toContain("weighbridge-fix/R1.1");
    expect(diags[0]?.file).toBe(SPEC_FILE);
    expect(diags[0]?.line).toBeGreaterThan(0);
  });

  it("proves R2.1 and R3.1 through the test-only task commit (which also ticks tasks.md)", () => {
    for (const id of ["weighbridge-fix/R2.1", "weighbridge-fix/R3.1"]) {
      const entry = map.requirements.find((r) => r.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.status, id).toBe("proven");
      expect(entry?.codeLinks, id).toEqual([]);
      expect(entry?.testOnlyCommit, id).toMatch(/^[0-9a-f]{40}$/);
      const sha7 = (entry?.testOnlyCommit ?? "").slice(0, 7);
      const diags = map.diagnostics.filter((d) => d.code === "test-only-task" && d.message.startsWith(`${id}:`));
      expect(diags, id).toHaveLength(1);
      expect(diags[0]?.message, id).toBe(`${id}: implemented by test-only task commit ${sha7}`);
      expect(diags[0]?.file, id).toBe(SPEC_FILE);
    }
  });

  it("proves R2.2 with exactly one code link, zeroBelowFloor", () => {
    const entry = map.requirements.find((r) => r.id === "weighbridge-fix/R2.2");
    expect(entry?.status).toBe("proven");
    expect(entry?.codeLinks.map((l) => [l.symbol, l.method, l.file])).toEqual([
      ["zeroBelowFloor", "commit", "src/weighbridge.ts"],
    ]);
    expect(entry?.testLinks.length).toBeGreaterThan(0);
    expect("testOnlyCommit" in (entry ?? {})).toBe(false);
  });

  it("links sieveStub to nothing and does not report it as a zombie", () => {
    for (const r of map.requirements) {
      expect(r.codeLinks.map((l) => l.symbol)).not.toContain("sieveStub");
    }
    expect(map.zombies.map((z) => z.symbol)).not.toContain("sieveStub");
  });

  it("links the exported unnamed helper tareOffset to nothing, and it is no zombie (task 2 wrote it)", () => {
    for (const r of map.requirements) {
      expect(r.codeLinks.map((l) => l.symbol)).not.toContain("tareOffset");
    }
    expect(map.zombies.map((z) => z.symbol)).not.toContain("tareOffset");
  });

  it("keeps calibrationStamp, written by a non-task commit, a zombie", () => {
    for (const r of map.requirements) {
      expect(r.codeLinks.map((l) => l.symbol)).not.toContain("calibrationStamp");
    }
    expect(map.zombies.map((z) => [z.file, z.symbol])).toContainEqual([
      "src/weighbridge.ts",
      "calibrationStamp",
    ]);
  });

  it("keeps the findings of expected.json", () => {
    expect(findings(map)).toEqual(truth.map((e) => `${e.class} ${e.key}`).sort());
  });

  it("keeps planted precision and recall at 0.8 or more", () => {
    const report = scoreAgainstTruth(map, truth);
    console.log(
      `recall-fix planted overall: precision=${report.overall.precision} recall=${report.overall.recall}`,
    );
    expect(report.overall.precision).toBeGreaterThanOrEqual(0.8);
    expect(report.overall.recall).toBeGreaterThanOrEqual(0.8);
  });
});
