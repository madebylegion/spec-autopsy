import { describe, expect, it } from "vitest";
import type { BodyMap, CodeLink, RequirementEntry } from "../../src/linker/index.js";
import { buildReport, unprovenConfidence, validateReport } from "../../src/report/index.js";
import { sampleMap, sampleTexts } from "../helpers/report-sample.js";

function testCallLink(): CodeLink {
  return { symbol: "doB", file: "src/b.ts", startLine: 2, method: "test-call", score: 1 };
}

function mapWithTestCall(): BodyMap {
  const map = sampleMap();
  const requirements = map.requirements.map((r) =>
    r.id === "beta/R1.2" ? { ...r, codeLinks: [testCallLink()] } : r,
  );
  return { ...map, requirements };
}

function unprovenEntry(codeLinks: CodeLink[]): RequirementEntry {
  return {
    id: "beta/R1.2",
    status: "unproven",
    file: ".kiro/specs/beta/requirements.md",
    line: 9,
    codeLinks,
    testLinks: [],
    lastCommit: null,
  };
}

describe("report: test-call links", () => {
  it("validateReport accepts the method test-call", () => {
    const report = buildReport(mapWithTestCall(), sampleTexts(), { version: "0.0.0-test" });
    const result = validateReport(JSON.parse(JSON.stringify(report)));
    expect(result.ok).toBe(true);
  });

  it("validateReport still rejects an unknown method", () => {
    const report = buildReport(mapWithTestCall(), sampleTexts(), { version: "0.0.0-test" });
    const copy = JSON.parse(JSON.stringify(report)) as {
      specs: Array<{ requirements: Array<{ codeLinks: Array<{ method: string }> }> }>;
    };
    const target = copy.specs
      .flatMap((s) => s.requirements)
      .find((r) => r.codeLinks.some((l) => l.method === "test-call"));
    expect(target).toBeDefined();
    target!.codeLinks[0]!.method = "guess";
    expect(validateReport(copy).ok).toBe(false);
  });

  it("names test-call in the evidence line of linked code", () => {
    const report = buildReport(mapWithTestCall(), sampleTexts(), { version: "0.0.0-test" });
    const finding = report.findings.find(
      (f) => f.type === "unproven" && f.requirementId === "beta/R1.2",
    );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toContain("linked code: src/b.ts#doB (test-call)");
    expect(finding?.evidence.some((line) => line.includes("overlap"))).toBe(false);
  });

  it("gives medium confidence when the only code links are test-call", () => {
    expect(unprovenConfidence(unprovenEntry([testCallLink()])).level).toBe("medium");
  });

  it("gives high confidence when a tag link is present next to a test-call link", () => {
    const tag: CodeLink = { symbol: "t", file: "src/t.ts", startLine: 1, method: "tag", score: 1 };
    expect(unprovenConfidence(unprovenEntry([tag, testCallLink()])).level).toBe("high");
  });
});
