import { describe, expect, it } from "vitest";
import type { RequirementEntry } from "../../src/linker/index.js";
import { ghostEvidence } from "../../src/report/evidence.js";
import { buildReport, validateReport } from "../../src/report/index.js";

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

describe("ghostEvidence with test links", () => {
  // ghost-test-evidence/R1.1
  it("ghost with zero test links shows 'no symbol or test links' and 'nothing links'", () => {
    const e = entry("spec/R1.1", {
      contradiction: { task: 2, commit: "a".repeat(40) },
    });
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol or test links to spec/R1.1 by tag, commit or word overlap");
    expect(ev[1]).toContain("yet nothing links to spec/R1.1");
  });

  // ghost-test-evidence/R1.2
  it("ghost with one test link shows '1 test link only' and 'no symbol links'", () => {
    const e = entry("spec/R1.2", {
      testLinks: [{ title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 }],
      contradiction: { task: 2, commit: "a".repeat(40) },
    });
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol links to spec/R1.2; 1 test link only (tests do not prove code)");
    expect(ev[1]).toContain("yet no symbol links to spec/R1.2");
  });

  // ghost-test-evidence/R1.3
  it("ghost with six test links shows '6 test links only' and 'no symbol links'", () => {
    const e = entry("spec/R1.3", {
      testLinks: [
        { title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 2, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 3, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 4, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 5, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 6, method: "overlap", score: 1 },
      ],
      contradiction: { task: 2, commit: "a".repeat(40) },
    });
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol links to spec/R1.3; 6 test links only (tests do not prove code)");
    expect(ev[1]).toContain("yet no symbol links to spec/R1.3");
  });

  // ghost-test-evidence/R1.2
  it("ghost with one test link and no contradiction shows correct first line only", () => {
    const e = entry("spec/R1.4", {
      testLinks: [{ title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 }],
    });
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol links to spec/R1.4; 1 test link only (tests do not prove code)");
    expect(ev).toHaveLength(1);
  });

  // ghost-test-evidence/R1.1
  it("ghost with zero test links and no contradiction shows correct first line only", () => {
    const e = entry("spec/R1.5");
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol or test links to spec/R1.5 by tag, commit or word overlap");
    expect(ev).toHaveLength(1);
  });

  // ghost-test-evidence/R1.4
  it("contradiction line ending changes based on test link count", () => {
    const zeroLinks = entry("spec/R2.1", {
      contradiction: { task: 1, commit: "b".repeat(40) },
    });
    const oneLink = entry("spec/R2.2", {
      testLinks: [{ title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 }],
      contradiction: { task: 1, commit: "b".repeat(40) },
    });
    const evZero = ghostEvidence(zeroLinks);
    const evOne = ghostEvidence(oneLink);
    expect(evZero.some((line) => line.endsWith("yet nothing links to spec/R2.1"))).toBe(true);
    expect(evOne.some((line) => line.endsWith("yet no symbol links to spec/R2.2"))).toBe(true);
  });

  // ghost-test-evidence/R1.5
  it("multiple test links show correct plural count", () => {
    const e = entry("spec/R3.1", {
      testLinks: [
        { title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 2, method: "overlap", score: 1 },
      ],
    });
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol links to spec/R3.1; 2 test links only (tests do not prove code)");
  });

  // ghost-test-evidence/R1.6
  it("closest-name line is unchanged when test links exist", () => {
    const e = entry("spec/R4.1", {
      testLinks: [{ title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 }],
      nearMiss: { requirementId: null, symbol: "almost", file: "src/a.ts", line: 3, score: 0.45 },
    });
    const ev = ghostEvidence(e);
    expect(ev[0]).toBe("no symbol links to spec/R4.1; 1 test link only (tests do not prove code)");
    expect(ev[1]).toBe("closest name: src/a.ts#almost shares words (score 0.45)");
    expect(ev).toHaveLength(2);
  });

  // ghost-test-evidence/R1.7
  it("buildReport with 6-test-link ghost passes validateReport and has correct first line", () => {
    const e = entry("spec/R5.1", {
      testLinks: [
        { title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 2, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 3, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 4, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 5, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 6, method: "overlap", score: 1 },
      ],
    });
    const bodyMap = {
      root: "/repo",
      requirements: [e],
      zombies: [],
      diagnostics: [],
      counts: { requirements: 1, ghost: 1, unproven: 0, proven: 0, zombies: 0 },
    };
    const report = buildReport(bodyMap, new Map([["spec/R5.1", "The engine SHALL idle quietly."]]), {
      version: "1.0.0",
    });
    const result = validateReport(JSON.parse(JSON.stringify(report)));
    expect(result.ok).toBe(true);
    const finding = report.findings[0];
    expect(finding?.evidence[0]).toBe("no symbol links to spec/R5.1; 6 test links only (tests do not prove code)");
  });

  // ghost-test-evidence/R1.8
  it("package.json dependencies remain unchanged", () => {
    const pkg = require("../../package.json");
    const deps = Object.keys(pkg.dependencies ?? {});
    expect(deps).toContain("@modelcontextprotocol/sdk");
    expect(deps).toContain("tree-sitter-wasms");
    expect(deps).toContain("web-tree-sitter");
    expect(deps).toContain("zod");
    expect(deps).toHaveLength(4);
  });

  // ghost-test-evidence/R1.9
  it("6-link first line does not contain 'no symbol or test links'", () => {
    const e = entry("spec/R6.1", {
      testLinks: [
        { title: "t", file: "tests/a.test.ts", line: 1, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 2, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 3, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 4, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 5, method: "overlap", score: 1 },
        { title: "t", file: "tests/a.test.ts", line: 6, method: "overlap", score: 1 },
      ],
    });
    const ev = ghostEvidence(e);
    expect(ev[0]).not.toContain("no symbol or test links");
    expect(ev[0]).toBe("no symbol links to spec/R6.1; 6 test links only (tests do not prove code)");
  });
});
