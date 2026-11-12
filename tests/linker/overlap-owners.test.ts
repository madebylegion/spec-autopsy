import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol } from "../../src/indexer/types.js";
import { link } from "../../src/linker/link.js";
import { overlaps, requirementTokens, symbolTokens } from "../../src/linker/overlap.js";
import type { BodyMap, RequirementEntry } from "../../src/linker/types.js";
import type { Requirement, TaskEntry } from "../../src/parser/index.js";

const HISTORY = { commits: [], commitCount: 0, authors: [] };
const SHA = "abc1234abc1234abc1234abc1234abc1234abc12";

function sym(file: string, name: string, startLine: number): CodeSymbol {
  return { name, kind: "function", exported: true, startLine, endLine: startLine + 1, file };
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

function taskFor(number: number, id: string): TaskEntry {
  return {
    spec: "s",
    number,
    title: `Task ${number}`,
    file: ".kiro/specs/s/tasks.md",
    line: number,
    requirements: [{ id, line: 2 }],
  };
}

// Tokens: scheduler, queue, background, job. Shares nothing with the symbol below.
const OWNER = req("s/R2.1", "scheduler", "queue background jobs");
const OWNER2 = req("s/R4.1", "planner", "plan tomorrow slots");
// Tokens: engine, rotate, ledger, page. Fully overlaps the symbol rotateLedgerPages.
const OTHER = req("s/R1.1", "engine", "rotate ledger pages");
// Tokens: ledger, rotate, page. Also fully overlaps the symbol.
const THIRD = req("s/R3.1", "ledger", "rotate pages");

const SYMBOL = "rotateLedgerPages";

/** One file with the symbol at line 2 and a tag comment on line 1 for `taggedId`, if any. */
function taggedFile(taggedId: string | undefined): FileIndex {
  return codeFile("src/a.ts", [sym("src/a.ts", SYMBOL, 2)], {
    comments: taggedId === undefined ? [] : [{ line: 1, text: `// ${taggedId}` }],
  });
}

function methodsOf(entry: RequirementEntry): Array<[string, string]> {
  return entry.codeLinks.map((l) => [l.symbol, l.method]);
}

describe("link: overlap respects explicit owners", () => {
  it("control: without an owner the symbol is overlap-linked to the overlapping requirement", () => {
    const map = link([OTHER, OWNER], indexOf([taggedFile(undefined)]));
    expect(methodsOf(entryOf(map, "s/R1.1"))).toEqual([[SYMBOL, "overlap"]]);
  });

  it("does not overlap-link a tag-owned symbol to another requirement; the owner keeps its tag link", () => {
    const map = link([OTHER, OWNER], indexOf([taggedFile("s/R2.1")]));
    const other = entryOf(map, "s/R1.1");
    expect(other.codeLinks).toEqual([]);
    expect(other.status).toBe("ghost");
    expect(methodsOf(entryOf(map, "s/R2.1"))).toEqual([[SYMBOL, "tag"]]);
    expect(map.zombies).toEqual([]);
  });

  it("does not overlap-link a commit-owned symbol to another requirement", () => {
    const file = codeFile("src/a.ts", [sym("src/a.ts", SYMBOL, 2)], {
      blame: [{ startLine: 1, endLine: 60, sha: SHA }],
    });
    const index = indexOf([file], { kiroCommits: [{ sha: SHA, subject: "kiro: s task 1 Task 1" }] });
    const map = link([OTHER, OWNER], index, [], [taskFor(1, "s/R2.1")]);
    const other = entryOf(map, "s/R1.1");
    expect(other.codeLinks).toEqual([]);
    expect(other.status).toBe("ghost");
    expect(methodsOf(entryOf(map, "s/R2.1"))).toEqual([[SYMBOL, "commit"]]);
  });

  it("lets two explicit owners both keep the symbol and gives a third overlapping requirement nothing", () => {
    const file = codeFile("src/a.ts", [sym("src/a.ts", SYMBOL, 2)], {
      comments: [{ line: 1, text: "// s/R2.1" }],
      blame: [{ startLine: 1, endLine: 60, sha: SHA }],
    });
    const index = indexOf([file], { kiroCommits: [{ sha: SHA, subject: "kiro: s task 1 Task 1" }] });
    const map = link([OTHER, OWNER, OWNER2, THIRD], index, [], [taskFor(1, "s/R4.1")]);
    expect(methodsOf(entryOf(map, "s/R2.1"))).toEqual([[SYMBOL, "tag"]]);
    expect(methodsOf(entryOf(map, "s/R4.1"))).toEqual([[SYMBOL, "commit"]]);
    expect(entryOf(map, "s/R1.1").codeLinks).toEqual([]);
    expect(entryOf(map, "s/R3.1").codeLinks).toEqual([]);
  });

  it("links a symbol with no explicit owner by overlap to several requirements, as before", () => {
    const map = link([OTHER, THIRD, OWNER], indexOf([taggedFile(undefined)]));
    expect(methodsOf(entryOf(map, "s/R1.1"))).toEqual([[SYMBOL, "overlap"]]);
    expect(methodsOf(entryOf(map, "s/R3.1"))).toEqual([[SYMBOL, "overlap"]]);
    expect(entryOf(map, "s/R2.1").codeLinks).toEqual([]);
  });

  it("gives the same result for every order of the requirements", () => {
    const all = [OTHER, OWNER, THIRD];
    const orders: Requirement[][] = [
      [all[0] as Requirement, all[1] as Requirement, all[2] as Requirement],
      [all[0] as Requirement, all[2] as Requirement, all[1] as Requirement],
      [all[1] as Requirement, all[0] as Requirement, all[2] as Requirement],
      [all[1] as Requirement, all[2] as Requirement, all[0] as Requirement],
      [all[2] as Requirement, all[0] as Requirement, all[1] as Requirement],
      [all[2] as Requirement, all[1] as Requirement, all[0] as Requirement],
    ];
    const byId = (map: BodyMap): string =>
      JSON.stringify(
        [...map.requirements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      );
    const results = orders.map((o) => link(o, indexOf([taggedFile("s/R2.1")])));
    const first = byId(results[0] as BodyMap);
    for (const r of results) {
      expect(byId(r)).toBe(first);
      expect(JSON.stringify(r.zombies)).toBe(JSON.stringify((results[0] as BodyMap).zombies));
    }
  });
});

const WORDS = ["ledger", "rotate", "page", "cache", "flush", "queue", "job", "engine"];
const wordList = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 4 });

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function reqOf(k: number, words: string[]): Requirement {
  return req(`s/R${k + 1}.1`, words[0] as string, words.slice(1).join(" ") || (words[0] as string));
}

/** Symbols at lines 2, 5, 8, ...; the line above each is free for a tag comment. */
function symbolsOf(names: string[][]): CodeSymbol[] {
  return names.map((words, i) => sym("src/a.ts", words.map(capital).join("").replace(/^./, (c) => c.toLowerCase()), 2 + 3 * i));
}

describe("link: overlap owners (properties)", () => {
  it("with no explicit links, a requirement links exactly the symbols that overlap it", () => {
    fc.assert(
      fc.property(
        fc.array(wordList, { minLength: 1, maxLength: 4 }),
        fc.array(wordList, { minLength: 1, maxLength: 4 }),
        (reqWords, symWords) => {
          const requirements = reqWords.map((w, k) => reqOf(k, w));
          const symbols = symbolsOf(symWords);
          const map = link(requirements, indexOf([codeFile("src/a.ts", symbols)]));
          for (const r of requirements) {
            const expected = symbols
              .filter((s) => overlaps(requirementTokens(r), symbolTokens(s.name)))
              .map((s) => s.startLine);
            const entry = entryOf(map, r.id);
            expect(entry.codeLinks.map((l) => l.startLine)).toEqual(expected);
            expect(entry.codeLinks.every((l) => l.method === "overlap")).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("a tagged symbol is never overlap-linked to another requirement, and two runs are equal", () => {
    fc.assert(
      fc.property(
        fc.array(wordList, { minLength: 2, maxLength: 4 }),
        fc.array(wordList, { minLength: 1, maxLength: 4 }),
        fc.nat(),
        (reqWords, symWords, pick) => {
          const requirements = reqWords.map((w, k) => reqOf(k, w));
          const symbols = symbolsOf(symWords);
          const target = symbols[pick % symbols.length] as CodeSymbol;
          const file = codeFile("src/a.ts", symbols, {
            comments: [{ line: target.startLine - 1, text: `// ${(requirements[0] as Requirement).id}` }],
          });
          const first = link(requirements, indexOf([file]));
          const second = link(requirements, indexOf([file]));
          expect(JSON.stringify(first)).toBe(JSON.stringify(second));
          expect(first).toEqual(second);
          const owner = entryOf(first, (requirements[0] as Requirement).id);
          expect(
            owner.codeLinks.some((l) => l.startLine === target.startLine && l.method === "tag"),
          ).toBe(true);
          for (const r of requirements.slice(1)) {
            if (r.id === (requirements[0] as Requirement).id) continue;
            const entry = entryOf(first, r.id);
            expect(entry.codeLinks.some((l) => l.startLine === target.startLine)).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
