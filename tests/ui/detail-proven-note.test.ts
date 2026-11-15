// proven-evidence-ui tasks 2.1 to 2.3: the Code links fallback for a proven requirement.
import { describe, expect, it } from "vitest";
import type { Report, ReportRequirement } from "../../src/report/types.js";
import { detailFor } from "../../src/ui/view-model.js";

function reportWith(req: ReportRequirement): Report {
  return {
    schemaVersion: 1,
    tool: { name: "spec-autopsy", version: "0.1.0" },
    project: { name: "demo" },
    summary: { requirements: 1, ghost: 0, unproven: 0, proven: 0, zombies: 0, bySpec: {} },
    specs: [{ name: "spec", requirements: [req] }],
    findings: [],
    diagnostics: [],
  };
}

function req(over: Partial<ReportRequirement>): ReportRequirement {
  return {
    id: "spec/R1.1",
    text: "The thing SHALL work.",
    status: "proven",
    file: ".kiro/specs/spec/requirements.md",
    line: 5,
    lastCommit: null,
    codeLinks: [],
    testLinks: [{ title: "works", file: "tests/a.test.ts", line: 42, method: "tag", score: 1 }],
    ...over,
  };
}

describe("detailFor provenNote", () => {
  it("proven with no code link: the first provenEvidence line", () => {
    const d = detailFor(reportWith(req({})), "spec/R1.1");
    expect(d?.provenNote).toBe("no code link; proven by tagged test tests/a.test.ts:42");
  });

  it("proven with a code link: no note, links unchanged", () => {
    const code = { symbol: "f", file: "src/f.ts", startLine: 3, method: "tag" as const, score: 1 };
    const d = detailFor(reportWith(req({ codeLinks: [code] })), "spec/R1.1");
    expect(d?.provenNote).toBeNull();
    expect(d?.codeLinks).toHaveLength(1);
  });

  it("unproven with no code link: no note (panel keeps 'No code linked.')", () => {
    const d = detailFor(reportWith(req({ status: "unproven", testLinks: [] })), "spec/R1.1");
    expect(d?.provenNote).toBeNull();
  });
});
