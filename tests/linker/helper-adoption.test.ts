import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol, TestCase } from "../../src/indexer/types.js";
import { link } from "../../src/linker/link.js";
import type { BodyMap, RequirementEntry } from "../../src/linker/types.js";
import type { Requirement } from "../../src/parser/index.js";

const HISTORY = { commits: [], commitCount: 0, authors: [] };

function sym(
  file: string,
  name: string,
  startLine: number,
  references?: string[],
  over: Partial<CodeSymbol> = {},
): CodeSymbol {
  const base: CodeSymbol = {
    name,
    kind: "function",
    exported: true,
    startLine,
    endLine: startLine + 1,
    file,
    ...over,
  };
  return references === undefined ? base : { ...base, references };
}

function codeFile(path: string, symbols: CodeSymbol[], over: Partial<FileIndex> = {}): FileIndex {
  return {
    path,
    language: "typescript",
    isTest: false,
    lineCount: 60,
    symbols,
    comments: [],
    testCases: [],
    history: HISTORY,
    ...over,
  };
}

function testFile(path: string, testCases: TestCase[], symbols: CodeSymbol[] = []): FileIndex {
  return codeFile(path, symbols, { isTest: true, testCases });
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

function indexOf(files: FileIndex[]): CodeIndex {
  return { root: "/repo", files, diagnostics: [] };
}

function entryOf(map: BodyMap, id: string): RequirementEntry {
  const found = map.requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

function zombieNames(map: BodyMap): string[] {
  return map.zombies.map((z) => z.symbol).sort();
}

// Tokens: engine, rotate, ledger, page. No symbol name below shares a word with it.
const A = req("s/R1.1", "engine", "rotate ledger pages");
// Tokens: cache, flusher, flush, entry. Overlaps the name flushCache fully.
const C = req("s/R3.1", "cache flusher", "flush cache entries");

/** A file whose symbol `entryPoint` (line 2) is tagged to s/R1.1. */
function taggedFile(symbols: CodeSymbol[]): FileIndex {
  return codeFile("src/a.ts", symbols, { comments: [{ line: 1, text: "// s/R1.1" }] });
}

describe("link: helper adoption", () => {
  it("adopts a helper of a tag-linked function, with no code link and no status change", () => {
    const files = [
      taggedFile([sym("src/a.ts", "entryPoint", 2, ["padRows"]), sym("src/a.ts", "padRows", 10)]),
    ];
    const map = link([A], indexOf(files));
    expect(zombieNames(map)).toEqual([]);
    const entry = entryOf(map, "s/R1.1");
    expect(entry.status).toBe("unproven");
    expect(entry.codeLinks.map((l) => [l.symbol, l.method])).toEqual([["entryPoint", "tag"]]);

    // Control: without the reference the helper is a zombie.
    const control = link([A], indexOf([taggedFile([sym("src/a.ts", "entryPoint", 2), sym("src/a.ts", "padRows", 10)])]));
    expect(zombieNames(control)).toEqual(["padRows"]);
  });

  it("adopts a helper of a helper", () => {
    const files = [
      taggedFile([
        sym("src/a.ts", "entryPoint", 2, ["padRows"]),
        sym("src/a.ts", "padRows", 10, ["blankRow"]),
        sym("src/a.ts", "blankRow", 20),
      ]),
    ];
    expect(zombieNames(link([A], indexOf(files)))).toEqual([]);
  });

  it("ends the walk when two helpers call each other", () => {
    const files = [
      taggedFile([
        sym("src/a.ts", "entryPoint", 2, ["loopA"]),
        sym("src/a.ts", "loopA", 10, ["loopB"]),
        sym("src/a.ts", "loopB", 20, ["loopA"]),
      ]),
    ];
    expect(zombieNames(link([A], indexOf(files)))).toEqual([]);
  });

  it("adopts nothing for a reference from a symbol of a test file", () => {
    const files = [
      taggedFile([sym("src/a.ts", "entryPoint", 2), sym("src/a.ts", "padRows", 10)]),
      testFile("tests/a.test.ts", [], [sym("tests/a.test.ts", "makeFixture", 1, ["padRows"])]),
    ];
    expect(zombieNames(link([A], indexOf(files)))).toEqual(["padRows"]);
  });

  it("adopts nothing for a reference from a zombie that is not adopted", () => {
    const files = [
      taggedFile([
        sym("src/a.ts", "entryPoint", 2),
        sym("src/a.ts", "strayZombie", 10, ["padRows"]),
        sym("src/a.ts", "padRows", 20),
      ]),
    ];
    expect(zombieNames(link([A], indexOf(files)))).toEqual(["padRows", "strayZombie"]);
  });

  it("keeps a helper that nobody references as a zombie", () => {
    const files = [
      taggedFile([
        sym("src/a.ts", "entryPoint", 2, ["padRows"]),
        sym("src/a.ts", "padRows", 10),
        sym("src/a.ts", "orphanHelper", 20),
      ]),
    ];
    expect(zombieNames(link([A], indexOf(files)))).toEqual(["orphanHelper"]);
  });

  it("adopts a helper referenced by a test-call linked symbol", () => {
    const testCase: TestCase = {
      title: "rotates ledger pages nightly",
      line: 3,
      endLine: 5,
      calls: ["runner"],
    };
    const files = [
      codeFile("src/a.ts", [sym("src/a.ts", "runner", 1, ["padRows"]), sym("src/a.ts", "padRows", 10)]),
      testFile("tests/a.test.ts", [testCase]),
    ];
    const map = link([A], indexOf(files));
    const entry = entryOf(map, "s/R1.1");
    expect(entry.codeLinks.map((l) => [l.symbol, l.method])).toEqual([["runner", "test-call"]]);
    expect(zombieNames(map)).toEqual([]);
  });

  it("adopts a helper referenced by an overlap-linked symbol", () => {
    const files = [
      codeFile("src/a.ts", [sym("src/a.ts", "flushCache", 1, ["padRows"]), sym("src/a.ts", "padRows", 10)]),
    ];
    const map = link([C], indexOf(files));
    expect(entryOf(map, "s/R3.1").codeLinks.map((l) => [l.symbol, l.method])).toEqual([
      ["flushCache", "overlap"],
    ]);
    expect(zombieNames(map)).toEqual([]);
  });

  it("changes nothing for symbols without references", () => {
    const plain = [taggedFile([sym("src/a.ts", "entryPoint", 2), sym("src/a.ts", "padRows", 10)])];
    const empty = [
      taggedFile([sym("src/a.ts", "entryPoint", 2, []), sym("src/a.ts", "padRows", 10, [])]),
    ];
    const first = link([A], indexOf(plain));
    expect(link([A], indexOf(empty))).toEqual(first);
    expect(zombieNames(first)).toEqual(["padRows"]);
  });
});
