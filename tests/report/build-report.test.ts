import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/report/index.js";
import type { Finding } from "../../src/report/index.js";
import { SAMPLE_ROOT, sampleMap, sampleTexts } from "../helpers/report-sample.js";

const OPTIONS = { version: "1.2.3" };

function build(): ReturnType<typeof buildReport> {
  return buildReport(sampleMap(), sampleTexts(), OPTIONS);
}

function find(findings: Finding[], key: string): Finding {
  const found = findings.find((f) => (f.requirementId ?? f.title) === key);
  if (found === undefined) throw new Error(`no finding ${key}`);
  return found;
}

describe("buildReport shape", () => {
  it("has the top-level keys in order and schemaVersion 1", () => {
    const report = build();
    expect(Object.keys(report)).toEqual([
      "schemaVersion",
      "tool",
      "project",
      "summary",
      "specs",
      "findings",
      "diagnostics",
    ]);
    expect(report.schemaVersion).toBe(1);
  });

  it("sets tool and the project base name", () => {
    const report = build();
    expect(report.tool).toEqual({ name: "spec-autopsy", version: "1.2.3" });
    expect(report.project).toEqual({ name: "my-app" });
    const win = buildReport({ ...sampleMap(), root: "C:\\work\\win-app\\" }, sampleTexts(), OPTIONS);
    expect(win.project.name).toBe("win-app");
  });

  it("counts the summary and bySpec", () => {
    const { summary } = build();
    expect(summary).toEqual({
      requirements: 8,
      ghost: 3,
      unproven: 4,
      proven: 1,
      zombies: 3,
      bySpec: {
        alpha: { requirements: 3, ghost: 2, unproven: 1, proven: 0 },
        beta: { requirements: 5, ghost: 1, unproven: 3, proven: 1 },
      },
    });
    expect(Object.keys(summary.bySpec)).toEqual(["alpha", "beta"]);
  });

  it("lists specs by first appearance with requirements in body map order", () => {
    const { specs } = build();
    expect(specs.map((s) => s.name)).toEqual(["alpha", "beta"]);
    expect(specs[0]?.requirements.map((r) => r.id)).toEqual(["alpha/R1.1", "alpha/R1.2", "alpha/R1.3"]);
    expect(specs[1]?.requirements.map((r) => r.id)).toEqual([
      "beta/R1.1",
      "beta/R1.2",
      "beta/R1.3",
      "beta/R1.4",
      "beta/R1.5",
    ]);
    const first = specs[0]?.requirements[0];
    expect(first).toBeDefined();
    expect(Object.keys(first ?? {})).toEqual([
      "id",
      "text",
      "status",
      "file",
      "line",
      "lastCommit",
      "codeLinks",
      "testLinks",
    ]);
    expect(first?.text).toBe("The parser SHALL read files.");
  });

  it("keeps link method and commit exactly", () => {
    const { specs } = build();
    const map = sampleMap();
    const alpha2 = specs[0]?.requirements[1];
    expect(alpha2?.codeLinks).toEqual(map.requirements[2]?.codeLinks);
    expect(alpha2?.codeLinks[0]?.method).toBe("commit");
    expect(alpha2?.codeLinks[0]?.commit).toBe("abcdef1234567890abcdef1234567890abcdef12");
    expect(alpha2?.lastCommit).toEqual({ date: "2026-01-02T03:04:05Z", subject: "task 1", author: "Ada" });
    const beta4 = specs[1]?.requirements[3];
    expect(beta4?.testLinks[0]).toEqual({
      title: "renews",
      file: "tests/b.test.ts",
      line: 3,
      method: "commit",
      score: 1,
      commit: "fedcba9876543210fedcba9876543210fedcba98",
    });
    expect(beta4?.codeLinks[0]?.method).toBe("overlap");
    expect("commit" in (beta4?.codeLinks[0] ?? {})).toBe(false);
  });

  it("copies diagnostics", () => {
    expect(build().diagnostics).toEqual(sampleMap().diagnostics);
  });

  it("gives an empty requirement text when the text is missing", () => {
    const { specs } = build();
    expect(specs[1]?.requirements[4]?.text).toBe("");
  });
});

describe("buildReport findings", () => {
  it("orders ghosts, unproven, zombies, each in body map order", () => {
    const keys = build().findings.map((f) => `${f.type}:${f.requirementId ?? f.title}`);
    expect(keys).toEqual([
      "ghost:alpha/R1.1",
      "ghost:beta/R1.1",
      "ghost:alpha/R1.3",
      "unproven:alpha/R1.2",
      "unproven:beta/R1.2",
      "unproven:beta/R1.3",
      "unproven:beta/R1.5",
      "zombie:helper",
      "zombie:Widget",
      "zombie:Shape",
    ]);
  });

  it("gives every finding type, id rule, file, line, evidence and confidence", () => {
    for (const f of build().findings) {
      expect(Object.keys(f)).toEqual([
        "type",
        "requirementId",
        "title",
        "file",
        "line",
        "evidence",
        "confidence",
      ]);
      expect(["ghost", "unproven", "zombie"]).toContain(f.type);
      if (f.type === "zombie") expect(f.requirementId).toBeNull();
      else expect(typeof f.requirementId).toBe("string");
      expect(f.file.length).toBeGreaterThan(0);
      expect(Number.isInteger(f.line)).toBe(true);
      expect(f.line).toBeGreaterThanOrEqual(1);
      expect(f.evidence.length).toBeGreaterThanOrEqual(1);
      expect(f.evidence.every((e) => e.length > 0)).toBe(true);
      expect(f.confidence.score).toBeGreaterThanOrEqual(0);
      expect(f.confidence.score).toBeLessThanOrEqual(1);
    }
  });

  it("uses the requirement text, file and line for ghosts and unproven", () => {
    const { findings } = build();
    expect(find(findings, "alpha/R1.1")).toMatchObject({
      title: "The parser SHALL read files.",
      file: ".kiro/specs/alpha/requirements.md",
      line: 5,
    });
    expect(find(findings, "beta/R1.2")).toMatchObject({
      title: "The linker SHALL tag code.",
      file: ".kiro/specs/beta/requirements.md",
      line: 9,
    });
  });

  it("falls back to the id as title when the text is missing", () => {
    expect(find(build().findings, "beta/R1.5").title).toBe("beta/R1.5");
  });

  it("uses the symbol name, file and line for zombies", () => {
    expect(find(build().findings, "helper")).toMatchObject({
      title: "helper",
      file: "src/commit.ts",
      line: 20,
    });
  });

  it("gives the confidence level and score of each table row", () => {
    const { findings } = build();
    const rows: Array<[string, string, number]> = [
      ["alpha/R1.3", "low", 0.3], // ghost with a near miss
      ["alpha/R1.1", "high", 0.9], // ghost, spec has a commit link
      ["beta/R1.1", "medium", 0.6], // ghost, tags and overlap only
      ["alpha/R1.2", "high", 0.9], // unproven, commit link
      ["beta/R1.3", "high", 0.9], // unproven, tag link
      ["beta/R1.2", "medium", 0.6], // unproven, overlap only
      ["Shape", "low", 0.3], // zombie with a near miss
      ["helper", "high", 0.9], // zombie, commit link on its file
      ["Widget", "medium", 0.6], // zombie, nothing else
    ];
    for (const [key, level, score] of rows) {
      expect(find(findings, key).confidence, key).toEqual({ score, level });
    }
  });
});

describe("buildReport evidence", () => {
  it("states the cause of a ghost, then the near miss", () => {
    const { findings } = build();
    expect(find(findings, "alpha/R1.1").evidence).toEqual([
      "no symbol or test links to alpha/R1.1 by tag, commit or word overlap",
    ]);
    expect(find(findings, "alpha/R1.3").evidence).toEqual([
      "no symbol or test links to alpha/R1.3 by tag, commit or word overlap",
      "closest name: src/near.ts#almostA shares words (score 0.45)",
    ]);
  });

  it("names linked code of an unproven requirement with its method", () => {
    const { findings } = build();
    expect(find(findings, "alpha/R1.2").evidence).toEqual([
      "no test case links to this requirement",
      "linked code: src/commit.ts#parseA (commit abcdef1)",
    ]);
    expect(find(findings, "beta/R1.2").evidence[1]).toBe("linked code: src/b.ts#doB (overlap 0.75)");
    expect(find(findings, "beta/R1.3").evidence[1]).toBe("linked code: src/t.ts#tagged (tag)");
  });

  it("shows at most 5 linked symbols and then says how many more", () => {
    const evidence = find(build().findings, "beta/R1.5").evidence;
    expect(evidence).toHaveLength(7);
    expect(evidence[5]).toBe("linked code: src/many.ts#fn5 (overlap 0.55)");
    expect(evidence[6]).toBe("and 2 more");
  });

  it("states the cause of a zombie, then the near miss", () => {
    const { findings } = build();
    expect(find(findings, "helper").evidence).toEqual(["exported function never referenced by a requirement"]);
    expect(find(findings, "Widget").evidence).toEqual(["exported class never referenced by a requirement"]);
    expect(find(findings, "Shape").evidence).toEqual([
      "type Shape is never referenced by a requirement",
      "closest requirement: alpha/R1.1 shares words (score 0.42)",
    ]);
  });
});

describe("buildReport purity", () => {
  it("gives the same JSON string on two builds", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("contains no absolute path when the root is absolute", () => {
    const text = JSON.stringify(build());
    expect(text).not.toContain(SAMPLE_ROOT);
    expect(text).not.toContain("/home/user");
  });

  it("builds an empty report from an empty body map", () => {
    const report = buildReport(
      {
        root: SAMPLE_ROOT,
        requirements: [],
        zombies: [],
        diagnostics: [],
        counts: { requirements: 0, ghost: 0, unproven: 0, proven: 0, zombies: 0 },
      },
      new Map(),
      OPTIONS,
    );
    expect(report.specs).toEqual([]);
    expect(report.findings).toEqual([]);
    expect(report.summary.bySpec).toEqual({});
  });
});
