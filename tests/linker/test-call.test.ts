import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol, TestCase } from "../../src/indexer/types.js";
import { link } from "../../src/linker/link.js";
import type { BodyMap, RequirementEntry } from "../../src/linker/types.js";
import type { Requirement, TaskEntry } from "../../src/parser/index.js";

const HISTORY = { commits: [], commitCount: 0, authors: [] };

function sym(file: string, name: string, startLine: number, over: Partial<CodeSymbol> = {}): CodeSymbol {
  return { name, kind: "function", exported: true, startLine, endLine: startLine + 1, file, ...over };
}

function codeFile(path: string, symbols: CodeSymbol[], over: Partial<FileIndex> = {}): FileIndex {
  return {
    path,
    language: "typescript",
    isTest: false,
    lineCount: 40,
    symbols,
    comments: [],
    testCases: [],
    history: HISTORY,
    ...over,
  };
}

function testFile(path: string, testCases: TestCase[]): FileIndex {
  return codeFile(path, [], { isTest: true, testCases });
}

function req(id: string, system: string, response: string): Requirement {
  return {
    id,
    pattern: "ubiquitous",
    system,
    response,
    file: ".kiro/specs/s/requirements.md",
    line: 3,
  };
}

function indexOf(files: FileIndex[], over: Partial<CodeIndex> = {}): CodeIndex {
  return { root: "/repo", files, diagnostics: [], ...over };
}

function entryOf(map: BodyMap, id: string): RequirementEntry {
  const found = map.requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

// Tokens: engine, rotate, ledger, page. The test title below shares three of its four.
const A = req("s/R1.1", "engine", "rotate ledger pages");
// Tokens: scheduler, queue, background, job. Shares nothing with A, the title or the symbols.
const B = req("s/R2.1", "scheduler", "queue background jobs");
// Tokens: cache, flusher, flush, entry. Overlaps the symbol name flushCache fully.
const C = req("s/R3.1", "cache flusher", "flush cache entries");

const TITLE = "rotates ledger pages nightly";

function aTest(calls: string[] | undefined): FileIndex {
  const testCase: TestCase =
    calls === undefined
      ? { title: TITLE, line: 3 }
      : { title: TITLE, line: 3, endLine: 5, calls };
  return testFile("tests/a.test.ts", [testCase]);
}

describe("link: test-call", () => {
  it("proves a ghost whose linked test calls an exported function, and the function is no zombie", () => {
    const files = [codeFile("src/a.ts", [sym("src/a.ts", "flushCache", 1)]), aTest(["flushCache"])];
    const map = link([A], indexOf(files));
    const entry = entryOf(map, "s/R1.1");
    expect(entry.status).toBe("proven");
    expect(entry.codeLinks).toEqual([
      { symbol: "flushCache", file: "src/a.ts", startLine: 1, method: "test-call", score: 1 },
    ]);
    expect(entry.testLinks.map((t) => t.method)).toEqual(["overlap"]);
    expect(map.zombies).toEqual([]);

    // Control: the same index without call data is a ghost and leaves a zombie.
    const control = link([A], indexOf([codeFile("src/a.ts", [sym("src/a.ts", "flushCache", 1)]), aTest(undefined)]));
    expect(entryOf(control, "s/R1.1").status).toBe("ghost");
    expect(control.zombies.map((z) => z.symbol)).toEqual(["flushCache"]);
  });

  it("does not take a symbol that a tag gave to another requirement", () => {
    const files = [
      codeFile("src/a.ts", [sym("src/a.ts", "flushCache", 2)], {
        comments: [{ line: 1, text: "// s/R2.1" }],
      }),
      aTest(["flushCache"]),
    ];
    const map = link([A, B], indexOf(files));
    const a = entryOf(map, "s/R1.1");
    expect(a.status).toBe("ghost");
    expect(a.codeLinks).toEqual([]);
    const b = entryOf(map, "s/R2.1");
    expect(b.codeLinks.map((l) => [l.symbol, l.method])).toEqual([["flushCache", "tag"]]);
    expect(map.zombies).toEqual([]);
  });

  it("does not take a symbol that a commit gave to another requirement", () => {
    const sha = "abc1234abc1234abc1234abc1234abc1234abc12";
    const task: TaskEntry = {
      spec: "s",
      number: 1,
      title: "Flush the cache",
      file: ".kiro/specs/s/tasks.md",
      line: 1,
      requirements: [{ id: "s/R2.1", line: 2 }],
    };
    const files = [
      codeFile("src/a.ts", [sym("src/a.ts", "flushCache", 2)], {
        blame: [{ startLine: 1, endLine: 40, sha }],
      }),
      aTest(["flushCache"]),
    ];
    const index = indexOf(files, { kiroCommits: [{ sha, subject: "kiro: s task 1 Flush the cache" }] });
    const map = link([A, B], index, [], [task]);
    expect(entryOf(map, "s/R1.1").status).toBe("ghost");
    expect(entryOf(map, "s/R2.1").codeLinks.map((l) => [l.symbol, l.method])).toEqual([
      ["flushCache", "commit"],
    ]);
  });

  it("takes a symbol that is only overlap-linked to another requirement", () => {
    const files = [codeFile("src/a.ts", [sym("src/a.ts", "flushCache", 1)]), aTest(["flushCache"])];
    const map = link([A, C], indexOf(files));
    expect(entryOf(map, "s/R3.1").codeLinks.map((l) => l.method)).toEqual(["overlap"]);
    const a = entryOf(map, "s/R1.1");
    expect(a.status).toBe("proven");
    expect(a.codeLinks.map((l) => [l.symbol, l.method, l.score])).toEqual([
      ["flushCache", "test-call", 1],
    ]);
  });

  it("adds nothing to a requirement that already has a code link", () => {
    const files = [
      codeFile(
        "src/a.ts",
        [sym("src/a.ts", "otherThing", 2), sym("src/a.ts", "flushCache", 10)],
        { comments: [{ line: 1, text: "// s/R1.1" }] },
      ),
      aTest(["flushCache"]),
    ];
    const map = link([A], indexOf(files));
    const a = entryOf(map, "s/R1.1");
    expect(a.codeLinks.map((l) => [l.symbol, l.method])).toEqual([["otherThing", "tag"]]);
    expect(map.zombies.map((z) => z.symbol)).toEqual(["flushCache"]);
  });

  it("does not take a non-exported symbol or a method", () => {
    const files = [
      codeFile("src/a.ts", [
        sym("src/a.ts", "hidden", 1, { exported: false }),
        sym("src/a.ts", "Box.run", 5, { kind: "method" }),
      ]),
      aTest(["hidden", "Box.run", "run"]),
    ];
    const map = link([A], indexOf(files));
    const a = entryOf(map, "s/R1.1");
    expect(a.status).toBe("ghost");
    expect(a.codeLinks).toEqual([]);
  });

  it("changes nothing for a test case without calls", () => {
    const files = [codeFile("src/a.ts", [sym("src/a.ts", "flushCache", 1)]), aTest(undefined)];
    const map = link([A], indexOf(files));
    expect(entryOf(map, "s/R1.1").status).toBe("ghost");
    expect(map.zombies.map((z) => z.symbol)).toEqual(["flushCache"]);
  });

  it("does not depend on the order of the requirements", () => {
    const A2 = req("s/R1.2", "engine", "rotate ledger pages");
    const files = [
      codeFile(
        "src/a.ts",
        [sym("src/a.ts", "flushCache", 2), sym("src/a.ts", "rotateAll", 10)],
        { comments: [{ line: 1, text: "// s/R2.1" }] },
      ),
      aTest(["flushCache", "rotateAll"]),
    ];
    const forward = link([A, A2, B], indexOf(files));
    const backward = link([B, A2, A], indexOf(files));
    const byId = (m: BodyMap): RequirementEntry[] =>
      [...m.requirements].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    expect(byId(backward)).toEqual(byId(forward));
    expect(backward.zombies).toEqual(forward.zombies);
    for (const id of ["s/R1.1", "s/R1.2"]) {
      const entry = entryOf(forward, id);
      expect(entry.codeLinks.map((l) => [l.symbol, l.method])).toEqual([["rotateAll", "test-call"]]);
      expect(entry.status).toBe("proven");
    }
  });
});
