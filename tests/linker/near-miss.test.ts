import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol } from "../../src/indexer/index.js";
import { link } from "../../src/linker/link.js";
import { NEAR_MISS, THRESHOLD } from "../../src/linker/overlap.js";
import type { Requirement } from "../../src/parser/index.js";

const SPEC_FILE = ".kiro/specs/x/requirements.md";

/**
 * Tokens of this requirement: portal, renew, permit, expiry, notice, daily (6).
 * "renewPermitFeeCalcTotal" has 5 tokens and shares renew and permit:
 * 2 / min(6, 5) = 0.4, which is a near miss and not a link.
 */
function req(id: string, line: number): Requirement {
  return {
    id,
    pattern: "ubiquitous",
    system: "portal",
    response: "renew permit expiry notices daily",
    file: SPEC_FILE,
    line,
  };
}

function sym(name: string, startLine: number, path = "src/a.ts"): CodeSymbol {
  return { name, kind: "function", exported: true, startLine, endLine: startLine + 2, file: path };
}

function file(path: string, symbols: CodeSymbol[]): FileIndex {
  return {
    path,
    language: "typescript",
    isTest: false,
    lineCount: 100,
    symbols,
    comments: [],
    testCases: [],
    history: { commits: [], commitCount: 0, authors: [] },
  };
}

function index(files: FileIndex[]): CodeIndex {
  return { root: "/repo", files, diagnostics: [] };
}

describe("near miss", () => {
  it("has a threshold below the link threshold", () => {
    expect(NEAR_MISS).toBe(0.4);
    expect(NEAR_MISS).toBeLessThan(THRESHOLD);
  });

  it("records the closest symbol on a ghost", () => {
    const map = link([req("spec/R1.1", 3)], index([file("src/a.ts", [sym("renewPermitFeeCalcTotal", 7)])]));
    const entry = map.requirements[0];
    expect(entry?.status).toBe("ghost");
    expect(entry?.nearMiss).toEqual({
      requirementId: null,
      symbol: "renewPermitFeeCalcTotal",
      file: "src/a.ts",
      line: 7,
      score: 0.4,
    });
  });

  it("records the closest requirement on a zombie", () => {
    const map = link([req("spec/R1.1", 3)], index([file("src/a.ts", [sym("renewPermitFeeCalcTotal", 7)])]));
    expect(map.zombies).toHaveLength(1);
    expect(map.zombies[0]?.nearMiss).toEqual({
      requirementId: "spec/R1.1",
      symbol: null,
      file: SPEC_FILE,
      line: 3,
      score: 0.4,
    });
  });

  it("leaves the field out below 0.4", () => {
    // 6 tokens, 2 shared: 2 / 6 = 0.33.
    const map = link(
      [req("spec/R1.1", 3)],
      index([file("src/a.ts", [sym("renewPermitFeeCalcTotalAmount", 7)])]),
    );
    expect("nearMiss" in (map.requirements[0] ?? {})).toBe(false);
    expect(map.zombies).toHaveLength(1);
    expect("nearMiss" in (map.zombies[0] ?? {})).toBe(false);
  });

  it("does not set the field on a requirement that is not a ghost", () => {
    // Overlap links this symbol (3 shared of 3), so the requirement is unproven.
    const map = link([req("spec/R1.1", 3)], index([file("src/a.ts", [sym("renewPermitExpiry", 7)])]));
    expect(map.requirements[0]?.status).toBe("unproven");
    expect("nearMiss" in (map.requirements[0] ?? {})).toBe(false);
    expect(map.zombies).toHaveLength(0);
  });

  it("prefers a higher score over an earlier file", () => {
    const map = link(
      [req("spec/R1.1", 3)],
      index([
        file("src/a.ts", [sym("renewPermitFeeCalcTotalAmount", 1)]),
        file("src/z.ts", [sym("renewPermitFeeCalcTotal", 9, "src/z.ts")]),
      ]),
    );
    expect(map.requirements[0]?.nearMiss?.file).toBe("src/z.ts");
  });

  it("breaks ghost ties by file, then line, then name", () => {
    const byFile = link(
      [req("spec/R1.1", 3)],
      index([
        file("src/b.ts", [sym("renewPermitFeeCalcTotal", 1, "src/b.ts")]),
        file("src/a.ts", [sym("renewPermitFeeCalcSum", 10), sym("renewPermitFeeCalcCost", 3)]),
      ]),
    );
    expect(byFile.requirements[0]?.nearMiss).toMatchObject({
      file: "src/a.ts",
      line: 3,
      symbol: "renewPermitFeeCalcCost",
    });

    const byName = link(
      [req("spec/R1.1", 3)],
      index([file("src/a.ts", [sym("renewPermitFeeCalcSum", 5), sym("renewPermitFeeCalcCost", 5)])]),
    );
    expect(byName.requirements[0]?.nearMiss?.symbol).toBe("renewPermitFeeCalcCost");
  });

  it("breaks zombie ties by requirement file, then line", () => {
    const map = link(
      [req("spec/R1.2", 9), req("spec/R1.1", 3)],
      index([file("src/a.ts", [sym("renewPermitFeeCalcTotal", 7)])]),
    );
    expect(map.zombies[0]?.nearMiss).toMatchObject({ requirementId: "spec/R1.1", line: 3 });
  });

  it("is deterministic", () => {
    const run = (): string =>
      JSON.stringify(
        link(
          [req("spec/R1.2", 9), req("spec/R1.1", 3)],
          index([
            file("src/b.ts", [sym("renewPermitFeeCalcTotal", 1, "src/b.ts")]),
            file("src/a.ts", [sym("renewPermitFeeCalcSum", 10), sym("renewPermitFeeCalcCost", 3)]),
          ]),
        ),
      );
    expect(run()).toBe(run());
  });
});
