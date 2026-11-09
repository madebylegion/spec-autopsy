import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkProject } from "../../src/linker/index.js";
import { parseProject, printRequirement } from "../../src/parser/index.js";
import { buildReport, validateReport } from "../../src/report/index.js";
import type { Finding, Report } from "../../src/report/index.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const planted = join(here, "..", "fixtures", "planted");

interface Expected {
  class: "ghost" | "unproven" | "zombie";
  key: string;
}

function keyOf(f: Finding): string {
  if (f.type === "zombie") return `${f.file}#${f.title}`;
  return f.requirementId ?? "";
}

describe("planted fixture report", () => {
  let dir = "";
  let report: Report;
  let expected: Expected[];

  beforeAll(async () => {
    dir = await buildFixtureRepo(planted);
    const map = await linkProject(dir);
    const parsed = await parseProject(dir);
    const texts = new Map(parsed.requirements.map((r) => [r.id, printRequirement(r)]));
    report = buildReport(map, texts, { version: "0.0.0-test" });
    expected = JSON.parse(await readFile(join(planted, "expected.json"), "utf8")) as Expected[];
  }, 60_000);

  afterAll(async () => {
    if (dir !== "") await rm(dir, { recursive: true, force: true });
  });

  it("has the 14 planted findings, by class and key", () => {
    expect(expected.length).toBe(14);
    const got = report.findings.map((f) => `${f.type} ${keyOf(f)}`).sort();
    const want = expected.map((e) => `${e.class} ${e.key}`).sort();
    expect(got).toEqual(want);
  });

  it("gives every finding evidence, a line and a requirement ID (zombies excepted)", () => {
    for (const f of report.findings) {
      expect(f.file.length).toBeGreaterThan(0);
      expect(Number.isInteger(f.line)).toBe(true);
      expect(f.line).toBeGreaterThanOrEqual(1);
      expect(f.evidence.length).toBeGreaterThanOrEqual(1);
      for (const sentence of f.evidence) expect(sentence.length).toBeGreaterThan(0);
      if (f.type === "zombie") expect(f.requirementId).toBeNull();
      else expect(f.requirementId).toMatch(/^[a-z-]+\/R\d+\.\d+$/);
    }
  });

  it("passes validateReport", () => {
    expect(validateReport(JSON.parse(JSON.stringify(report))).ok).toBe(true);
  });

  it("contains no absolute path", () => {
    const json = JSON.stringify(report);
    expect(json).not.toContain(dir);
    expect(json).not.toMatch(/"(\/|[A-Za-z]:\\)/);
    expect(report.project.name).not.toMatch(/[\\/]/);
  });
});
