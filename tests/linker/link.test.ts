import { describe, expect, it } from "vitest";
import type {
  CodeIndex,
  FileIndex,
  GitHistory,
  IndexDiagnostic,
  Symbol as CodeSymbol,
  TestCase,
} from "../../src/indexer/index.js";
import { link } from "../../src/linker/link.js";
import type { Diagnostic, Requirement } from "../../src/parser/index.js";

function req(id: string, system: string, response: string, line = 1): Requirement {
  return {
    id,
    pattern: "ubiquitous",
    system,
    response,
    file: ".kiro/specs/x/requirements.md",
    line,
  };
}

/** A requirement whose words overlap with none of the symbols and titles below. */
function neutral(id: string, line = 1): Requirement {
  return req(id, "engine", "idle quietly", line);
}

function sym(
  name: string,
  startLine: number,
  endLine: number,
  kind: CodeSymbol["kind"] = "function",
  exported = true,
): CodeSymbol {
  return { name, kind, exported, startLine, endLine, file: "src/a.ts" };
}

function file(path: string, partial: Partial<FileIndex> = {}): FileIndex {
  return {
    path,
    language: "typescript",
    isTest: false,
    lineCount: 100,
    symbols: [],
    comments: [],
    testCases: [],
    history: { commits: [], commitCount: 0, authors: [] },
    ...partial,
  };
}

function testFile(path: string, testCases: TestCase[], comments: FileIndex["comments"] = []): FileIndex {
  return file(path, { isTest: true, testCases, comments });
}

function index(files: FileIndex[], diagnostics: IndexDiagnostic[] = []): CodeIndex {
  return { root: "/repo", files, diagnostics };
}

function history(date: string, subject: string, author: string): GitHistory {
  return { commits: [{ sha: "abc", author, date, subject }], commitCount: 1, authors: [author] };
}

function statusInputs(): { requirements: Requirement[]; index: CodeIndex } {
  return {
    requirements: [neutral("spec/R1.1", 3), neutral("spec/R1.2", 4), neutral("spec/R1.3", 5)],
    index: index([
      file("src/a.ts", {
        symbols: [sym("alpha", 2, 4), sym("beta", 6, 8)],
        comments: [
          { line: 1, text: "// spec/R1.1" },
          { line: 5, text: "// spec/R1.2" },
        ],
      }),
      testFile("tests/a.test.ts", [{ title: "first works", line: 3 }], [{ line: 1, text: "// spec/R1.2" }]),
    ]),
  };
}

describe("link: classification", () => {
  it("gives ghost, unproven and proven", () => {
    const { requirements, index: idx } = statusInputs();
    const map = link(requirements, idx);
    expect(map.requirements.map((r) => [r.id, r.status])).toEqual([
      ["spec/R1.1", "unproven"],
      ["spec/R1.2", "proven"],
      ["spec/R1.3", "ghost"],
    ]);
    expect(map.requirements[0]?.codeLinks).toEqual([
      { symbol: "alpha", file: "src/a.ts", startLine: 2, method: "tag", score: 1 },
    ]);
    expect(map.requirements[1]?.testLinks).toEqual([
      { title: "first works", file: "tests/a.test.ts", line: 3, method: "tag", score: 1 },
    ]);
    expect(map.requirements[2]?.codeLinks).toEqual([]);
    expect(map.zombies).toEqual([]);
  });

  it("carries the requirement's own file and line", () => {
    const { requirements, index: idx } = statusInputs();
    const map = link(requirements, idx);
    expect(map.requirements.map((r) => [r.file, r.line])).toEqual([
      [".kiro/specs/x/requirements.md", 3],
      [".kiro/specs/x/requirements.md", 4],
      [".kiro/specs/x/requirements.md", 5],
    ]);
  });

  it("keeps requirement order and gives counts that agree with the lists", () => {
    const { requirements, index: idx } = statusInputs();
    const map = link(requirements, idx);
    expect(map.root).toBe("/repo");
    expect(map.requirements.map((r) => r.id)).toEqual(["spec/R1.1", "spec/R1.2", "spec/R1.3"]);
    expect(map.counts).toEqual({ requirements: 3, ghost: 1, unproven: 1, proven: 1, zombies: 0 });
    const count = (s: string): number => map.requirements.filter((r) => r.status === s).length;
    expect(map.counts.ghost).toBe(count("ghost"));
    expect(map.counts.unproven).toBe(count("unproven"));
    expect(map.counts.proven).toBe(count("proven"));
    expect(map.counts.zombies).toBe(map.zombies.length);
  });

  it("gives an empty body map for empty inputs", () => {
    const map = link([], index([]));
    expect(map).toEqual({
      root: "/repo",
      requirements: [],
      zombies: [],
      diagnostics: [],
      counts: { requirements: 0, ghost: 0, unproven: 0, proven: 0, zombies: 0 },
    });
  });

  it("is deterministic: equal inputs give equal maps and identical JSON", () => {
    const a = link(statusInputs().requirements, statusInputs().index);
    const b = link(statusInputs().requirements, statusInputs().index);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("link: overlap", () => {
  it("skips overlap on the code side when a tag link exists (decoy B)", () => {
    const requirements = [req("spec/R1.1", "ledger", "record stock adjustment reason")];
    const idx = index([
      file("src/a.ts", {
        symbols: [sym("store", 2, 3), sym("recordStockAdjustmentReasons", 5, 6)],
        comments: [{ line: 1, text: "// spec/R1.1" }],
      }),
    ]);
    const map = link(requirements, idx);
    expect(map.requirements[0]?.codeLinks).toEqual([
      { symbol: "store", file: "src/a.ts", startLine: 2, method: "tag", score: 1 },
    ]);
    expect(map.zombies.map((z) => z.symbol)).toEqual(["recordStockAdjustmentReasons"]);
  });

  it("links every passing candidate, not only the best", () => {
    const requirements = [req("spec/R1.1", "parser", "read requirement files")];
    const idx = index([
      file("src/a.ts", {
        symbols: [sym("readRequirementFiles", 1, 3), sym("parseRequirementFile", 5, 7), sym("unrelated", 9, 10)],
      }),
    ]);
    const map = link(requirements, idx);
    const links = map.requirements[0]?.codeLinks ?? [];
    expect(links.map((l) => [l.symbol, l.method])).toEqual([
      ["readRequirementFiles", "overlap"],
      ["parseRequirementFile", "overlap"],
    ]);
    expect(links[0]?.score).toBe(1);
    expect(links[1]?.score).toBeCloseTo(2 / 3, 10);
    expect(map.requirements[0]?.status).toBe("unproven");
    expect(map.zombies.map((z) => z.symbol)).toEqual(["unrelated"]);
  });

  it("decides the test side independently of the code side", () => {
    const requirements = [req("spec/R1.1", "gateway", "notify customer declined payment")];
    const idx = index([
      file("src/a.ts", {
        symbols: [sym("handler", 2, 3)],
        comments: [{ line: 1, text: "// spec/R1.1" }],
      }),
      testFile("tests/a.test.ts", [{ title: "payment declined notify customer", line: 4 }]),
    ]);
    const entry = link(requirements, idx).requirements[0];
    expect(entry?.codeLinks.map((l) => l.method)).toEqual(["tag"]);
    expect(entry?.testLinks.map((l) => l.method)).toEqual(["overlap"]);
    expect(entry?.status).toBe("proven");
  });

  it("links method symbols by overlap but never reports a method as zombie", () => {
    const requirements = [req("spec/R1.1", "calculator", "add totals")];
    const idx = index([
      file("src/a.ts", {
        symbols: [
          sym("Calculator", 1, 10, "class"),
          sym("Calculator.addTotals", 2, 4, "method"),
          sym("Calculator.unrelatedThing", 6, 8, "method"),
        ],
      }),
    ]);
    const map = link(requirements, idx);
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["Calculator.addTotals"]);
    expect(map.requirements[0]?.status).toBe("unproven");
    expect(map.zombies.map((z) => z.symbol)).toEqual(["Calculator"]);
  });

  it("never reports non-exported or test-file symbols as zombies", () => {
    const idx = index([
      file("src/a.ts", { symbols: [sym("hidden", 1, 2, "function", false)] }),
      file("tests/helper.test.ts", { isTest: true, symbols: [sym("helper", 1, 2)] }),
    ]);
    expect(link([], idx).zombies).toEqual([]);
  });

  it("does not link test-file symbols by overlap", () => {
    const requirements = [req("spec/R1.1", "sorter", "sort items")];
    const idx = index([file("tests/a.test.ts", { isTest: true, symbols: [sym("sortItems", 1, 2)] })]);
    expect(link(requirements, idx).requirements[0]?.status).toBe("ghost");
  });
});

describe("link: tags and diagnostics", () => {
  it("gives one diagnostic and no link for an unknown tag", () => {
    const idx = index([
      file("src/a.ts", {
        symbols: [sym("thing", 2, 3)],
        comments: [{ line: 1, text: "// nope/R9.9" }],
      }),
    ]);
    const map = link([neutral("spec/R1.1")], idx);
    expect(map.diagnostics).toEqual([
      {
        source: "linker",
        code: "unknown-requirement-tag",
        message: expect.stringContaining("nope/R9.9"),
        file: "src/a.ts",
        line: 1,
      },
    ]);
    expect(map.requirements[0]?.codeLinks).toEqual([]);
    expect(map.requirements[0]?.status).toBe("ghost");
  });

  it("merges parser, indexer and linker diagnostics, sorted with null lines first", () => {
    const parserDiagnostics: Diagnostic[] = [
      { code: "missing-shall", message: "m", file: "x.md", line: 4 },
      { code: "duplicate-id", message: "d", file: "a.ts", line: 3 },
    ];
    const idx = index(
      [file("a.ts", { symbols: [sym("thing", 2, 3)], comments: [{ line: 1, text: "// zzz/R1.1" }] })],
      [{ code: "parse-failed", message: "p", file: "a.ts" }],
    );
    const map = link([], idx, parserDiagnostics);
    expect(map.diagnostics).toEqual([
      { source: "indexer", code: "parse-failed", message: "p", file: "a.ts", line: null },
      { source: "linker", code: "unknown-requirement-tag", message: expect.any(String), file: "a.ts", line: 1 },
      { source: "parser", code: "duplicate-id", message: "d", file: "a.ts", line: 3 },
      { source: "parser", code: "missing-shall", message: "m", file: "x.md", line: 4 },
    ]);
  });

  it("attaches tags to the first of two requirements with the same id", () => {
    const requirements = [neutral("spec/R1.1", 3), neutral("spec/R1.1", 9)];
    const idx = index([
      file("src/a.ts", {
        symbols: [sym("thing", 2, 3)],
        comments: [{ line: 1, text: "// spec/R1.1" }],
      }),
    ]);
    const map = link(requirements, idx);
    expect(map.requirements).toHaveLength(2);
    expect(map.requirements.map((r) => [r.line, r.status])).toEqual([
      [3, "unproven"],
      [9, "ghost"],
    ]);
    expect(map.counts.requirements).toBe(2);
  });
});

describe("link: sorting", () => {
  it("sorts links by file and zombies by file, line, symbol", () => {
    const requirements = [req("spec/R1.1", "sorter", "sort items")];
    const idx = index([
      file("src/b.ts", { symbols: [sym("omega", 1, 2), sym("sortItems", 5, 6)] }),
      file("src/a.ts", {
        symbols: [sym("sortItems", 2, 3), sym("late", 20, 21), sym("early", 8, 9)],
      }),
    ]);
    const map = link(requirements, idx);
    expect(map.requirements[0]?.codeLinks.map((l) => [l.file, l.startLine])).toEqual([
      ["src/a.ts", 2],
      ["src/b.ts", 5],
    ]);
    expect(map.zombies.map((z) => [z.file, z.line, z.symbol])).toEqual([
      ["src/a.ts", 8, "early"],
      ["src/a.ts", 20, "late"],
      ["src/b.ts", 1, "omega"],
    ]);
  });
});

describe("link: lastCommit", () => {
  const tagged = (path: string, hist: GitHistory): FileIndex =>
    file(path, {
      symbols: [sym("thing", 2, 3)],
      comments: [{ line: 1, text: "// spec/R1.1" }],
      history: hist,
    });

  it("picks the newest first commit among the implementing files", () => {
    const idx = index([
      tagged("src/a.ts", history("2024-01-01T00:00:00Z", "old", "ann")),
      tagged("src/b.ts", history("2025-01-01T00:00:00Z", "new", "bob")),
    ]);
    const map = link([neutral("spec/R1.1"), neutral("spec/R1.2")], idx);
    expect(map.requirements[0]?.lastCommit).toEqual({
      date: "2025-01-01T00:00:00Z",
      subject: "new",
      author: "bob",
    });
    expect(map.requirements[1]?.lastCommit).toBeNull();
  });

  it("breaks ties by the lowest file path", () => {
    const idx = index([
      tagged("src/b.ts", history("2025-01-01T00:00:00Z", "from b", "bob")),
      tagged("src/a.ts", history("2025-01-01T00:00:00Z", "from a", "ann")),
    ]);
    expect(link([neutral("spec/R1.1")], idx).requirements[0]?.lastCommit?.subject).toBe("from a");
  });

  it("is null without history", () => {
    const idx = index([tagged("src/a.ts", { commits: [], commitCount: 0, authors: [] })]);
    const entry = link([neutral("spec/R1.1")], idx).requirements[0];
    expect(entry?.status).toBe("unproven");
    expect(entry?.lastCommit).toBeNull();
  });
});
