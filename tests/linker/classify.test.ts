import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol } from "../../src/indexer/index.js";
import {
  classifyRequirement,
  findZombies,
  isZombieCandidate,
  symbolKey,
} from "../../src/linker/classify.js";
import type { CodeLink, TestLink } from "../../src/linker/types.js";

const codeLink: CodeLink = { symbol: "foo", file: "src/a.ts", startLine: 1, method: "tag", score: 1 };
const testLink: TestLink = { title: "t", file: "tests/a.test.ts", line: 1, method: "tag", score: 1 };

function sym(
  name: string,
  startLine: number,
  kind: CodeSymbol["kind"] = "function",
  exported = true,
): CodeSymbol {
  return { name, kind, exported, startLine, endLine: startLine + 1, file: "src/a.ts" };
}

function file(path: string, symbols: CodeSymbol[], isTest = false): FileIndex {
  return {
    path,
    language: "typescript",
    isTest,
    lineCount: 100,
    symbols,
    comments: [],
    testCases: [],
    history: { commits: [], commitCount: 0, authors: [] },
  };
}

describe("classifyRequirement", () => {
  it("is ghost without code links, even with test links", () => {
    expect(classifyRequirement([], [])).toBe("ghost");
    expect(classifyRequirement([], [{ ...testLink, method: "overlap" }])).toBe("ghost");
  });

  it("is unproven with code and no test", () => {
    expect(classifyRequirement([codeLink], [])).toBe("unproven");
  });

  it("is proven with code and a test", () => {
    expect(classifyRequirement([codeLink], [testLink])).toBe("proven");
  });
});

describe("isZombieCandidate", () => {
  it("accepts exported symbols of the six kinds in non-test files", () => {
    const kinds: CodeSymbol["kind"][] = ["function", "class", "const", "enum", "interface", "type"];
    for (const kind of kinds) {
      expect(isZombieCandidate(sym("x", 1, kind), { isTest: false })).toBe(true);
    }
  });

  it("rejects methods, non-exported symbols and test files", () => {
    expect(isZombieCandidate(sym("A.m", 1, "method"), { isTest: false })).toBe(false);
    expect(isZombieCandidate(sym("x", 1, "function", false), { isTest: false })).toBe(false);
    expect(isZombieCandidate(sym("x", 1), { isTest: true })).toBe(false);
  });
});

describe("findZombies", () => {
  it("skips linked symbols, methods, non-exported symbols and test files, and sorts", () => {
    const index: CodeIndex = {
      root: "/r",
      files: [
        file("src/b.ts", [sym("beta", 3)]),
        file("src/a.ts", [
          sym("zeta", 10, "class"),
          sym("alpha", 3),
          sym("linked", 20),
          sym("hidden", 30, "function", false),
          sym("Zeta.run", 11, "method"),
        ]),
        file("tests/a.test.ts", [sym("helper", 1)], true),
      ],
      diagnostics: [],
    };
    const linked = new Set([symbolKey("src/a.ts", 20, "linked")]);
    expect(findZombies(index, linked)).toEqual([
      { symbol: "alpha", kind: "function", file: "src/a.ts", line: 3 },
      { symbol: "zeta", kind: "class", file: "src/a.ts", line: 10 },
      { symbol: "beta", kind: "function", file: "src/b.ts", line: 3 },
    ]);
  });

  it("returns nothing for an empty index", () => {
    expect(findZombies({ root: "/r", files: [], diagnostics: [] }, new Set())).toEqual([]);
  });
});

describe("symbolKey", () => {
  it("separates file, line and name", () => {
    expect(symbolKey("a", 1, "b")).not.toBe(symbolKey("a", 2, "b"));
    expect(symbolKey("a", 1, "b")).not.toBe(symbolKey("a1", 1, "b"));
  });
});
