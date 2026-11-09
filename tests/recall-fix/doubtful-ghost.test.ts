import { describe, expect, it } from "vitest";
import type { BodyMap, RequirementEntry } from "../../src/linker/index.js";
import { link } from "../../src/linker/link.js";
import { buildReport, ghostConfidence, validateReport } from "../../src/report/index.js";
import { ghostEvidence } from "../../src/report/evidence.js";
import { COMMIT_A, SHA_A, TASK_1, index, neutral } from "./link-helpers.js";

function entry(id: string, extra: Partial<RequirementEntry> = {}): RequirementEntry {
  return {
    id,
    status: "ghost",
    file: ".kiro/specs/spec/requirements.md",
    line: 7,
    codeLinks: [],
    testLinks: [],
    lastCommit: null,
    ...extra,
  };
}

function mapOf(requirements: RequirementEntry[]): BodyMap {
  return {
    root: "/repo",
    requirements,
    zombies: [],
    diagnostics: [],
    counts: {
      requirements: requirements.length,
      ghost: requirements.filter((r) => r.status === "ghost").length,
      unproven: requirements.filter((r) => r.status === "unproven").length,
      proven: requirements.filter((r) => r.status === "proven").length,
      zombies: 0,
    },
  };
}

const DOUBT = { task: 2, commit: SHA_A };

describe("doubtful ghost confidence and evidence", () => {
  it("gives a ghost with a contradiction level low", () => {
    const e = entry("spec/R1.1", { contradiction: DOUBT });
    const conf = ghostConfidence(e, mapOf([e]));
    expect(conf.level).toBe("low");
    expect(conf.score).toBe(0.3);
  });

  it("names the task and the commit in the evidence", () => {
    const e = entry("spec/R1.1", { contradiction: DOUBT });
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol or test links to spec/R1.1 by tag, commit or word overlap");
    expect(ev).toContain(
      "task 2 of spec is checked [x] and its commit aaaaaaa is resolved, yet nothing links to spec/R1.1",
    );
  });

  it("keeps today's confidence and evidence for a ghost without a contradiction", () => {
    const plain = entry("spec/R1.1");
    expect(ghostConfidence(plain, mapOf([plain])).level).toBe("medium");
    expect(ghostEvidence(plain)).toEqual(["no symbol or test links to spec/R1.1 by tag, commit or word overlap"]);

    const commitLinked = entry("spec/R1.2", {
      status: "proven",
      codeLinks: [{ symbol: "f", file: "src/a.ts", startLine: 1, method: "commit", score: 1, commit: SHA_A }],
      testLinks: [{ title: "t", file: "tests/a.test.ts", line: 1, method: "commit", score: 1, commit: SHA_A }],
    });
    expect(ghostConfidence(plain, mapOf([plain, commitLinked])).level).toBe("high");
  });

  it("keeps a ghost with a near miss low, with and without a contradiction", () => {
    const nearMiss = { requirementId: null, symbol: "almost", file: "src/a.ts", line: 3, score: 0.45 };
    const e = entry("spec/R1.1", { nearMiss });
    expect(ghostConfidence(e, mapOf([e])).level).toBe("low");
    const both = entry("spec/R1.1", { nearMiss, contradiction: DOUBT });
    expect(ghostConfidence(both, mapOf([both])).level).toBe("low");
    const ev = ghostEvidence(both);
    expect(ev[1]).toBe("closest name: src/a.ts#almost shares words (score 0.45)");
    expect(ev).toHaveLength(3);
  });

  it("builds a report with a doubtful ghost that passes validateReport", () => {
    const e = entry("spec/R1.1", { contradiction: DOUBT });
    const report = buildReport(mapOf([e]), new Map([["spec/R1.1", "The engine SHALL idle quietly."]]), {
      version: "1.0.0",
    });
    const finding = report.findings[0];
    expect(finding?.type).toBe("ghost");
    expect(finding?.confidence.level).toBe("low");
    expect(finding?.evidence.some((line) => line.includes("task 2 of spec is checked [x]"))).toBe(true);
    const result = validateReport(JSON.parse(JSON.stringify(report)));
    expect(result.ok).toBe(true);
  });
});

describe("link sets contradiction on a ghost", () => {
  it("sets it for a checked task whose commit resolves", () => {
    const map = link(
      [neutral("spec/R1.1", 7)],
      index([], [COMMIT_A]),
      [],
      [TASK_1],
      { checkedTasks: new Set(["spec#1"]) },
    );
    const e = map.requirements[0];
    expect(e?.status).toBe("ghost");
    expect(e?.contradiction).toEqual({ task: 1, commit: SHA_A });
    const report = buildReport(map, new Map(), { version: "1.0.0" });
    expect(report.findings[0]?.confidence.level).toBe("low");
    expect(validateReport(JSON.parse(JSON.stringify(report))).ok).toBe(true);
  });

  it("does not set it for an unchecked task", () => {
    const map = link(
      [neutral("spec/R1.1", 7)],
      index([], [COMMIT_A]),
      [],
      [TASK_1],
      { checkedTasks: new Set<string>() },
    );
    const e = map.requirements[0];
    expect(e?.status).toBe("ghost");
    expect("contradiction" in (e ?? {})).toBe(false);
    const report = buildReport(map, new Map(), { version: "1.0.0" });
    expect(report.findings[0]?.confidence.level).toBe("medium");
  });
});
