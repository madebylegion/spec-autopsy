import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  BlameRange,
  CodeIndex,
  FileIndex,
  Symbol as CodeSymbol,
} from "../../src/indexer/types.js";
import { commitHits, resolveTaskCommits } from "../../src/linker/commit-links.js";
import { link } from "../../src/linker/link.js";
import type { BodyMap, RequirementEntry } from "../../src/linker/types.js";
import type { Requirement, TaskEntry } from "../../src/parser/index.js";

const HISTORY = { commits: [], commitCount: 0, authors: [] };
const BASE = "1111111111111111111111111111111111111111"; // not a task commit
const SHA_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const SHA_C = "cccccccccccccccccccccccccccccccccccccccc";

const SYMBOL = "rotateLedgerPages";

function sym(name: string, startLine: number, endLine: number, file = "src/a.ts"): CodeSymbol {
  return { name, kind: "function", exported: true, startLine, endLine, file };
}

function codeFile(
  symbols: CodeSymbol[],
  blame: BlameRange[] | undefined,
  over: Partial<FileIndex> = {},
): FileIndex {
  return {
    path: "src/a.ts",
    language: "typescript",
    isTest: false,
    lineCount: 80,
    symbols,
    comments: [],
    testCases: [],
    history: HISTORY,
    ...(blame === undefined ? {} : { blame }),
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

function task(number: number, id: string, spec = "s"): TaskEntry {
  return {
    spec,
    number,
    title: `Task ${number}`,
    file: `.kiro/specs/${spec}/tasks.md`,
    line: number,
    requirements: [{ id, line: 2 }],
  };
}

function subjectOf(number: number): string {
  return `kiro: s task ${number} Task ${number}`;
}

function indexOf(files: FileIndex[], kiroCommits: Array<{ sha: string; number: number }>): CodeIndex {
  return {
    root: "/repo",
    files,
    diagnostics: [],
    kiroCommits: kiroCommits.map((c) => ({ sha: c.sha, subject: subjectOf(c.number) })),
  };
}

function entryOf(map: BodyMap, id: string): RequirementEntry {
  const found = map.requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

// Shares no word with the symbol name rotateLedgerPages.
const R1 = req("s/R1.1", "scheduler", "queue background jobs");
const R2 = req("s/R1.2", "planner", "plan tomorrow slots");
// Fully overlaps the symbol name.
const OVERLAPPING = req("s/R9.1", "engine", "rotate ledger pages");

const DESIGN_NAMES = new Map([["s", `The task edits \`${SYMBOL}\` in place.`]]);

/** Commit B owns lines 15 to 17, which lie inside the symbol (10 to 30); BASE owns the rest. */
function middleBlame(): BlameRange[] {
  return [
    { startLine: 1, endLine: 14, sha: BASE },
    { startLine: 15, endLine: 17, sha: SHA_B },
    { startLine: 18, endLine: 80, sha: BASE },
  ];
}

function oneFileIndex(blame: BlameRange[], commits = [{ sha: SHA_B, number: 1 }]): CodeIndex {
  return indexOf([codeFile([sym(SYMBOL, 10, 30)], blame)], commits);
}

describe("link: modified symbols (rule 6)", () => {
  it("links a symbol modified in the middle and named in design.md, marked modified", () => {
    const map = link([R1], oneFileIndex(middleBlame()), [], [task(1, "s/R1.1")], {
      designTexts: DESIGN_NAMES,
    });
    expect(entryOf(map, "s/R1.1").codeLinks).toEqual([
      {
        symbol: SYMBOL,
        file: "src/a.ts",
        startLine: 10,
        method: "commit",
        score: 1,
        commit: SHA_B,
        modified: true,
      },
    ]);
    expect(entryOf(map, "s/R1.1").status).not.toBe("ghost");
    expect(map.zombies).toEqual([]);
  });

  it("counts a commit that owns only the last line of the symbol", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 29, sha: BASE },
      { startLine: 30, endLine: 30, sha: SHA_B },
      { startLine: 31, endLine: 80, sha: BASE },
    ];
    const map = link([R1], oneFileIndex(blame), [], [task(1, "s/R1.1")], { designTexts: DESIGN_NAMES });
    expect(entryOf(map, "s/R1.1").codeLinks.map((l) => l.modified)).toEqual([true]);
  });

  it("gives nothing for a commit that owns lines outside the symbol only", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 9, sha: BASE },
      { startLine: 10, endLine: 30, sha: BASE },
      { startLine: 31, endLine: 40, sha: SHA_B },
      { startLine: 41, endLine: 80, sha: BASE },
    ];
    const map = link([R1], oneFileIndex(blame), [], [task(1, "s/R1.1")], { designTexts: DESIGN_NAMES });
    expect(entryOf(map, "s/R1.1").codeLinks).toEqual([]);
    expect(entryOf(map, "s/R1.1").status).toBe("ghost");
  });

  it("does not link the same symbol when design.md does not name it", () => {
    const designTexts = new Map([["s", "The task edits `somethingElse` only."]]);
    const map = link([R1], oneFileIndex(middleBlame()), [], [task(1, "s/R1.1")], { designTexts });
    expect(entryOf(map, "s/R1.1").codeLinks).toEqual([]);
    expect(entryOf(map, "s/R1.1").status).toBe("ghost");
  });

  it("does not match a longer name that only contains the symbol name", () => {
    const designTexts = new Map([["s", `The task edits \`${SYMBOL}Extra\` only.`]]);
    const map = link([R1], oneFileIndex(middleBlame()), [], [task(1, "s/R1.1")], { designTexts });
    expect(entryOf(map, "s/R1.1").codeLinks).toEqual([]);
  });

  it("gives no modified hit when the spec has no design text", () => {
    const tasks = [task(1, "s/R1.1")];
    for (const extras of [
      {},
      { designTexts: new Map<string, string>() },
      { designTexts: new Map([["other-spec", `\`${SYMBOL}\``]]) },
      { designTexts: new Map([["s", ""]]) },
    ]) {
      const map = link([R1], oneFileIndex(middleBlame()), [], tasks, extras);
      expect(entryOf(map, "s/R1.1").codeLinks).toEqual([]);
    }
  });

  it("leaves a symbol whose start line the commit owns exactly as before, without the flag", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 9, sha: BASE },
      { startLine: 10, endLine: 12, sha: SHA_B },
      { startLine: 13, endLine: 80, sha: BASE },
    ];
    for (const extras of [{}, { designTexts: DESIGN_NAMES }]) {
      const map = link([R1], oneFileIndex(blame), [], [task(1, "s/R1.1")], extras);
      const links = entryOf(map, "s/R1.1").codeLinks;
      expect(links).toHaveLength(1);
      expect(links[0]).toEqual({
        symbol: SYMBOL,
        file: "src/a.ts",
        startLine: 10,
        method: "commit",
        score: 1,
        commit: SHA_B,
      });
      expect("modified" in (links[0] ?? {})).toBe(false);
    }
  });

  it("gives one hit per commit when two commits touched one symbol, in kiroCommits order", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 14, sha: BASE },
      { startLine: 15, endLine: 17, sha: SHA_B },
      { startLine: 18, endLine: 19, sha: BASE },
      { startLine: 20, endLine: 22, sha: SHA_C },
      { startLine: 23, endLine: 80, sha: BASE },
    ];
    const tasks = [task(1, "s/R1.1"), task(2, "s/R1.2")];
    // kiroCommits lists C before B, the reverse of the blame order.
    const index = oneFileIndex(blame, [
      { sha: SHA_C, number: 2 },
      { sha: SHA_B, number: 1 },
    ]);
    const hits = commitHits(index, resolveTaskCommits(index.kiroCommits, tasks), DESIGN_NAMES);
    expect(hits.map((h) => [h.sha, h.kind === "symbol" ? h.modified : undefined])).toEqual([
      [SHA_C, true],
      [SHA_B, true],
    ]);

    const map = link([R1, R2], index, [], tasks, { designTexts: DESIGN_NAMES });
    expect(entryOf(map, "s/R1.1").codeLinks.map((l) => [l.commit, l.modified])).toEqual([[SHA_B, true]]);
    expect(entryOf(map, "s/R1.2").codeLinks.map((l) => [l.commit, l.modified])).toEqual([[SHA_C, true]]);
  });

  it("merges the start-line hit and a modified hit of one symbol by commit order", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 9, sha: BASE },
      { startLine: 10, endLine: 12, sha: SHA_B }, // owns the start line
      { startLine: 13, endLine: 19, sha: BASE },
      { startLine: 20, endLine: 22, sha: SHA_C }, // modified inside
      { startLine: 23, endLine: 80, sha: BASE },
    ];
    const tasks = [task(1, "s/R1.1"), task(2, "s/R1.2")];
    const index = oneFileIndex(blame, [
      { sha: SHA_C, number: 2 },
      { sha: SHA_B, number: 1 },
    ]);
    const hits = commitHits(index, resolveTaskCommits(index.kiroCommits, tasks), DESIGN_NAMES);
    expect(hits.map((h) => [h.sha, h.kind === "symbol" ? h.modified : undefined])).toEqual([
      [SHA_C, true],
      [SHA_B, undefined],
    ]);
  });

  it("prefers the plain link when one requirement gets the symbol both ways", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 9, sha: BASE },
      { startLine: 10, endLine: 12, sha: SHA_B },
      { startLine: 13, endLine: 19, sha: BASE },
      { startLine: 20, endLine: 22, sha: SHA_C },
      { startLine: 23, endLine: 80, sha: BASE },
    ];
    // Both tasks list the same requirement; the modified commit comes first.
    const tasks = [task(1, "s/R1.1"), task(2, "s/R1.1")];
    const index = oneFileIndex(blame, [
      { sha: SHA_C, number: 2 },
      { sha: SHA_B, number: 1 },
    ]);
    const map = link([R1], index, [], tasks, { designTexts: DESIGN_NAMES });
    const links = entryOf(map, "s/R1.1").codeLinks;
    expect(links).toHaveLength(1);
    expect(links[0]?.commit).toBe(SHA_B);
    expect("modified" in (links[0] ?? {})).toBe(false);
  });

  it("makes the modified commit an explicit owner, so overlap does not give the symbol away", () => {
    const map = link([OVERLAPPING, R1], oneFileIndex(middleBlame()), [], [task(1, "s/R1.1")], {
      designTexts: DESIGN_NAMES,
    });
    expect(entryOf(map, "s/R1.1").codeLinks.map((l) => l.method)).toEqual(["commit"]);
    expect(entryOf(map, "s/R9.1").codeLinks).toEqual([]);
    expect(entryOf(map, "s/R9.1").status).toBe("ghost");
  });

  it("still applies the design filter to the other hits of the same commit", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 14, sha: BASE },
      { startLine: 15, endLine: 17, sha: SHA_B }, // inside the symbol
      { startLine: 18, endLine: 39, sha: BASE },
      { startLine: 40, endLine: 80, sha: SHA_B }, // owns the start line of the helper
    ];
    const index = indexOf(
      [codeFile([sym(SYMBOL, 10, 30), sym("unnamedHelper", 40, 44)], blame)],
      [{ sha: SHA_B, number: 1 }],
    );
    const map = link([R1], index, [], [task(1, "s/R1.1")], { designTexts: DESIGN_NAMES });
    expect(entryOf(map, "s/R1.1").codeLinks.map((l) => l.symbol)).toEqual([SYMBOL]);
    // Dropped by the filter, adopted, not a zombie.
    expect(map.zombies).toEqual([]);
  });

  it("never gives a test file a modified hit", () => {
    const testFile = codeFile([sym(SYMBOL, 10, 30, "tests/a.test.ts")], middleBlame(), {
      path: "tests/a.test.ts",
      isTest: true,
      testCases: [{ title: "does something", line: 50 }],
    });
    const index = indexOf([testFile], [{ sha: SHA_B, number: 1 }]);
    const tasks = [task(1, "s/R1.1")];
    expect(commitHits(index, resolveTaskCommits(index.kiroCommits, tasks), DESIGN_NAMES)).toEqual([]);
    const map = link([R1], index, [], tasks, { designTexts: DESIGN_NAMES });
    expect(entryOf(map, "s/R1.1").codeLinks).toEqual([]);
  });

  it("gives a symbol of a file without blame no modified hit", () => {
    const index = indexOf([codeFile([sym(SYMBOL, 10, 30)], undefined)], [{ sha: SHA_B, number: 1 }]);
    const tasks = [task(1, "s/R1.1")];
    expect(commitHits(index, resolveTaskCommits(index.kiroCommits, tasks), DESIGN_NAMES)).toEqual([]);
  });

  it("does not depend on the order of the requirements", () => {
    const index = oneFileIndex(middleBlame());
    const tasks = [task(1, "s/R1.1")];
    const extras = { designTexts: DESIGN_NAMES };
    const all = [R1, R2, OVERLAPPING];
    const forward = link(all, index, [], tasks, extras);
    const backward = link([...all].reverse(), index, [], tasks, extras);
    const byId = (map: BodyMap): RequirementEntry[] =>
      [...map.requirements].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    expect(byId(backward)).toEqual(byId(forward));
    expect(backward.zombies).toEqual(forward.zombies);
  });

  it("is deterministic: two runs give the same JSON", () => {
    const index = oneFileIndex(middleBlame());
    const tasks = [task(1, "s/R1.1")];
    const extras = { designTexts: DESIGN_NAMES };
    const a = link([R1, R2], index, [], tasks, extras);
    const b = link([R1, R2], index, [], tasks, extras);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("link: modified symbols, properties", () => {
  const rangeArb = fc
    .tuple(fc.integer({ min: 1, max: 60 }), fc.integer({ min: 0, max: 20 }))
    .map(([start, len]) => ({ start, end: start + len }));
  const blameArb = fc.array(
    fc.record({
      startLine: fc.integer({ min: 1, max: 70 }),
      len: fc.integer({ min: 0, max: 15 }),
      sha: fc.constantFrom(BASE, SHA_B, SHA_C),
    }),
    { maxLength: 6 },
  );

  it("without design texts, link gives the same result as with texts for another spec, and no modified link", () => {
    fc.assert(
      fc.property(rangeArb, blameArb, (range, rawBlame) => {
        const blame: BlameRange[] = rawBlame.map((r) => ({
          startLine: r.startLine,
          endLine: r.startLine + r.len,
          sha: r.sha,
        }));
        const index = indexOf(
          [codeFile([sym(SYMBOL, range.start, range.end)], blame)],
          [
            { sha: SHA_B, number: 1 },
            { sha: SHA_C, number: 2 },
          ],
        );
        const tasks = [task(1, "s/R1.1"), task(2, "s/R1.2")];
        const none = link([R1, R2], index, [], tasks);
        const empty = link([R1, R2], index, [], tasks, { designTexts: new Map() });
        const elsewhere = link([R1, R2], index, [], tasks, {
          designTexts: new Map([["other-spec", `\`${SYMBOL}\``]]),
        });
        expect(empty).toEqual(none);
        expect(elsewhere).toEqual(none);
        for (const entry of none.requirements) {
          for (const codeLink of entry.codeLinks) expect("modified" in codeLink).toBe(false);
        }
      }),
    );
  });

  it("with a design text, every plain link of the run without it is still there", () => {
    fc.assert(
      fc.property(rangeArb, blameArb, (range, rawBlame) => {
        const blame: BlameRange[] = rawBlame.map((r) => ({
          startLine: r.startLine,
          endLine: r.startLine + r.len,
          sha: r.sha,
        }));
        const index = indexOf(
          [codeFile([sym(SYMBOL, range.start, range.end)], blame)],
          [
            { sha: SHA_B, number: 1 },
            { sha: SHA_C, number: 2 },
          ],
        );
        const tasks = [task(1, "s/R1.1"), task(2, "s/R1.2")];
        const without = link([R1, R2], index, [], tasks);
        const withDesign = link([R1, R2], index, [], tasks, { designTexts: DESIGN_NAMES });
        for (const entry of without.requirements) {
          const after = entryOf(withDesign, entry.id);
          for (const codeLink of entry.codeLinks.filter((l) => l.method === "commit")) {
            expect(after.codeLinks).toContainEqual(codeLink);
          }
        }
        expect(JSON.stringify(withDesign)).toBe(
          JSON.stringify(link([R1, R2], index, [], tasks, { designTexts: DESIGN_NAMES })),
        );
      }),
    );
  });
});
