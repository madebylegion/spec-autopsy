import { describe, expect, it } from "vitest";
import type { BodyMap, CodeLink } from "../../src/linker/index.js";
import { buildReport, validateReport } from "../../src/report/index.js";
import { sampleMap, sampleTexts } from "../helpers/report-sample.js";

const SHA = "0123456789abcdef0123456789abcdef01234567";

function modifiedLink(): CodeLink {
  return {
    symbol: "doB",
    file: "src/b.ts",
    startLine: 2,
    method: "commit",
    score: 1,
    commit: SHA,
    modified: true,
  };
}

function plainLink(): CodeLink {
  return { symbol: "doB", file: "src/b.ts", startLine: 2, method: "commit", score: 1, commit: SHA };
}

function mapWith(link: CodeLink): BodyMap {
  const map = sampleMap();
  const requirements = map.requirements.map((r) =>
    r.id === "beta/R1.2" ? { ...r, codeLinks: [link] } : r,
  );
  return { ...map, requirements };
}

function jsonOf(map: BodyMap): {
  specs: Array<{ requirements: Array<{ id: string; codeLinks: Array<Record<string, unknown>> }> }>;
} {
  const report = buildReport(map, sampleTexts(), { version: "0.0.0-test" });
  return JSON.parse(JSON.stringify(report)) as ReturnType<typeof jsonOf>;
}

describe("report: modified-symbol links", () => {
  it("words a modified link as modified by task commit <sha7>", () => {
    const report = buildReport(mapWith(modifiedLink()), sampleTexts(), { version: "0.0.0-test" });
    const finding = report.findings.find(
      (f) => f.type === "unproven" && f.requirementId === "beta/R1.2",
    );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toContain(
      `linked code: src/b.ts#doB (modified by task commit ${SHA.slice(0, 7)})`,
    );
  });

  it("keeps the wording of a start-line commit link", () => {
    const report = buildReport(mapWith(plainLink()), sampleTexts(), { version: "0.0.0-test" });
    const finding = report.findings.find(
      (f) => f.type === "unproven" && f.requirementId === "beta/R1.2",
    );
    expect(finding?.evidence).toContain(`linked code: src/b.ts#doB (commit ${SHA.slice(0, 7)})`);
    expect(finding?.evidence.some((line) => line.includes("modified"))).toBe(false);
  });

  it("carries modified: true into the report and validateReport accepts it", () => {
    const copy = jsonOf(mapWith(modifiedLink()));
    const target = copy.specs.flatMap((s) => s.requirements).find((r) => r.id === "beta/R1.2");
    expect(target?.codeLinks[0]?.["modified"]).toBe(true);
    expect(validateReport(copy).ok).toBe(true);
  });

  it("accepts a report whose links have no modified field", () => {
    expect(validateReport(jsonOf(mapWith(plainLink()))).ok).toBe(true);
  });

  it("rejects a modified field that is not true", () => {
    for (const bad of [false, "yes", 1, null]) {
      const copy = jsonOf(mapWith(modifiedLink()));
      const target = copy.specs.flatMap((s) => s.requirements).find((r) => r.id === "beta/R1.2");
      target!.codeLinks[0]!["modified"] = bad;
      expect(validateReport(copy).ok).toBe(false);
    }
  });
});
