import { describe, expect, it } from "vitest";
import { scoreAgainstTruth } from "../../src/linker/accuracy.js";
import type { BodyMap, RequirementEntry, TruthEntry, Zombie } from "../../src/linker/types.js";

function entry(id: string, status: RequirementEntry["status"]): RequirementEntry {
  return {
    id,
    status,
    file: ".kiro/specs/x/requirements.md",
    line: 1,
    codeLinks: [],
    testLinks: [],
    lastCommit: null,
  };
}

function zombie(file: string, symbol: string): Zombie {
  return { symbol, kind: "function", file, line: 1 };
}

function bodyMap(requirements: RequirementEntry[], zombies: Zombie[]): BodyMap {
  return {
    root: "/repo",
    requirements,
    zombies,
    diagnostics: [],
    counts: {
      requirements: requirements.length,
      ghost: requirements.filter((r) => r.status === "ghost").length,
      unproven: requirements.filter((r) => r.status === "unproven").length,
      proven: requirements.filter((r) => r.status === "proven").length,
      zombies: zombies.length,
    },
  };
}

describe("scoreAgainstTruth", () => {
  const truth: TruthEntry[] = [
    { class: "ghost", key: "x/R1.1" },
    { class: "unproven", key: "x/R1.2" },
    { class: "zombie", key: "src/a.ts#foo" },
  ];

  it("scores a perfect match as 1 and 1", () => {
    const map = bodyMap(
      [entry("x/R1.1", "ghost"), entry("x/R1.2", "unproven"), entry("x/R1.3", "proven")],
      [zombie("src/a.ts", "foo")],
    );
    const report = scoreAgainstTruth(map, truth);
    for (const cls of [report.ghost, report.zombie, report.unproven, report.overall]) {
      expect(cls.precision).toBe(1);
      expect(cls.recall).toBe(1);
    }
    expect(report.overall).toMatchObject({ found: 3, planted: 3, truePositives: 3 });
  });

  it("lowers precision for one false positive", () => {
    const map = bodyMap(
      [entry("x/R1.1", "ghost"), entry("x/R1.4", "ghost"), entry("x/R1.2", "unproven")],
      [zombie("src/a.ts", "foo")],
    );
    const report = scoreAgainstTruth(map, truth);
    expect(report.ghost).toEqual({
      found: 2,
      planted: 1,
      truePositives: 1,
      precision: 0.5,
      recall: 1,
    });
    expect(report.overall.precision).toBeCloseTo(3 / 4);
    expect(report.overall.recall).toBe(1);
  });

  it("lowers recall for one miss", () => {
    const map = bodyMap([entry("x/R1.1", "ghost"), entry("x/R1.2", "proven")], [zombie("src/a.ts", "foo")]);
    const report = scoreAgainstTruth(map, truth);
    expect(report.unproven).toEqual({
      found: 0,
      planted: 1,
      truePositives: 0,
      precision: 1,
      recall: 0,
    });
    expect(report.overall.precision).toBe(1);
    expect(report.overall.recall).toBeCloseTo(2 / 3);
  });

  it("gives 1 for empty truth and empty findings", () => {
    const report = scoreAgainstTruth(bodyMap([entry("x/R1.1", "proven")], []), []);
    for (const cls of [report.ghost, report.zombie, report.unproven, report.overall]) {
      expect(cls).toEqual({ found: 0, planted: 0, truePositives: 0, precision: 1, recall: 1 });
    }
  });

  it("gives precision 0 and recall 1 for findings against empty truth", () => {
    const report = scoreAgainstTruth(bodyMap([entry("x/R1.1", "ghost")], []), []);
    expect(report.ghost.precision).toBe(0);
    expect(report.ghost.recall).toBe(1);
  });

  it("treats duplicate truth entries as one", () => {
    const dup: TruthEntry[] = [
      { class: "ghost", key: "x/R1.1" },
      { class: "ghost", key: "x/R1.1" },
    ];
    const report = scoreAgainstTruth(bodyMap([entry("x/R1.1", "ghost")], []), dup);
    expect(report.ghost).toEqual({ found: 1, planted: 1, truePositives: 1, precision: 1, recall: 1 });
  });

  it("keeps classes apart: a ghost key in the unproven truth does not count", () => {
    const report = scoreAgainstTruth(bodyMap([entry("x/R1.1", "ghost")], []), [
      { class: "unproven", key: "x/R1.1" },
    ]);
    expect(report.ghost.truePositives).toBe(0);
    expect(report.unproven.truePositives).toBe(0);
  });

  it("keys zombies by file#symbol", () => {
    const report = scoreAgainstTruth(bodyMap([], [zombie("src/b.ts", "foo")]), [
      { class: "zombie", key: "src/a.ts#foo" },
    ]);
    expect(report.zombie.truePositives).toBe(0);
    expect(report.zombie.found).toBe(1);
  });

  it("sums the classes for overall", () => {
    const map = bodyMap(
      [entry("x/R1.1", "ghost"), entry("x/R9.9", "unproven")],
      [zombie("src/a.ts", "foo"), zombie("src/a.ts", "bar")],
    );
    const report = scoreAgainstTruth(map, truth);
    expect(report.overall.found).toBe(report.ghost.found + report.zombie.found + report.unproven.found);
    expect(report.overall.planted).toBe(
      report.ghost.planted + report.zombie.planted + report.unproven.planted,
    );
    expect(report.overall.truePositives).toBe(
      report.ghost.truePositives + report.zombie.truePositives + report.unproven.truePositives,
    );
    expect(report.overall).toMatchObject({ found: 4, planted: 3, truePositives: 2 });
  });
});
