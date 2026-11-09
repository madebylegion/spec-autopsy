import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type {
  BlameRange,
  CodeIndex,
  FileIndex,
  KiroCommit,
  Symbol as CodeSymbol,
} from "../../src/indexer/index.js";
import { link } from "../../src/linker/link.js";
import type { Requirement, TaskEntry } from "../../src/parser/index.js";

const WORDS = ["stock", "order", "record", "adjust", "alert", "ship", "label", "audit", "the", "shall"];
const word = fc.constantFrom(...WORDS);
const phrase = fc.array(word, { minLength: 0, maxLength: 4 }).map((w) => w.join(" "));

const requirementsArb: fc.Arbitrary<Requirement[]> = fc
  .array(fc.record({ system: phrase, response: phrase }), { minLength: 0, maxLength: 5 })
  .map((parts) =>
    parts.map(
      (p, i): Requirement => ({
        id: `spec/R1.${i + 1}`,
        pattern: "ubiquitous",
        system: p.system,
        response: p.response,
        file: ".kiro/specs/spec/requirements.md",
        line: i + 1,
      }),
    ),
  );

const nameArb = fc
  .array(word, { minLength: 1, maxLength: 3 })
  .map((w) => w.map((x, i) => (i === 0 ? x : x[0]!.toUpperCase() + x.slice(1))).join(""));

const SHAS = ["1".repeat(40), "2".repeat(40), "3".repeat(40)];
const shaArb = fc.constantFrom(...SHAS);

const symbolArb = (path: string): fc.Arbitrary<CodeSymbol> =>
  fc
    .record({
      name: nameArb,
      kind: fc.constantFrom<CodeSymbol["kind"]>("function", "class", "method", "const", "type"),
      exported: fc.boolean(),
      startLine: fc.integer({ min: 1, max: 20 }),
      extra: fc.integer({ min: 0, max: 5 }),
    })
    .map(
      (s): CodeSymbol => ({
        name: s.name,
        kind: s.kind,
        exported: s.exported,
        startLine: s.startLine,
        endLine: s.startLine + s.extra,
        file: path,
      }),
    );

const blameArb: fc.Arbitrary<BlameRange[]> = fc
  .array(fc.record({ len: fc.integer({ min: 1, max: 6 }), sha: shaArb }), { maxLength: 5 })
  .map((parts) => {
    const out: BlameRange[] = [];
    let next = 1;
    for (const p of parts) {
      out.push({ startLine: next, endLine: next + p.len - 1, sha: p.sha });
      next += p.len;
    }
    return out;
  });

const fileArb = (path: string, isTest: boolean, withBlame: boolean): fc.Arbitrary<FileIndex> =>
  fc
    .record({
      symbols: fc.array(symbolArb(path), { maxLength: 4 }),
      comments: fc.array(
        fc.record({ line: fc.integer({ min: 1, max: 20 }), text: fc.constantFrom("// spec/R1.1", "// plain") }),
        { maxLength: 3 },
      ),
      titles: fc.array(fc.record({ title: phrase, line: fc.integer({ min: 1, max: 20 }) }), {
        maxLength: 3,
      }),
      blame: blameArb,
    })
    .map((f): FileIndex => {
      const out: FileIndex = {
        path,
        language: "typescript",
        isTest,
        lineCount: 40,
        symbols: [...f.symbols].sort((a, b) => a.startLine - b.startLine || (a.name < b.name ? -1 : 1)),
        comments: f.comments,
        testCases: isTest ? f.titles : [],
        history: { commits: [], commitCount: 0, authors: [] },
      };
      if (withBlame) out.blame = f.blame;
      return out;
    });

const indexArb = (withBlame: boolean): fc.Arbitrary<CodeIndex> =>
  fc
    .tuple(
      fileArb("src/a.ts", false, withBlame),
      fileArb("src/b.ts", false, withBlame),
      fileArb("tests/a.test.ts", true, withBlame),
    )
    .map(([a, b, t]): CodeIndex => ({ root: "/repo", files: [a, b, t], diagnostics: [] }));

const subjectArb = fc.constantFrom(
  "kiro: spec task 1 First",
  "kiro: spec task 2 Second",
  "kiro: task 3 Third",
  "kiro: spec task 9 Missing",
  "kiro: spec linker (requirements, design, tasks)",
  "chore: plain",
);

const kiroCommitsArb: fc.Arbitrary<KiroCommit[]> = fc.array(
  fc.record({ sha: shaArb, subject: subjectArb }),
  { maxLength: 4 },
);

const tasksArb: fc.Arbitrary<TaskEntry[]> = fc
  .tuple(
    fc.array(fc.constantFrom("spec/R1.1", "spec/R1.2", "spec/R1.3", "spec/R8.8"), { maxLength: 3 }),
    fc.array(fc.constantFrom("spec/R1.1", "spec/R1.2", "spec/R9.9"), { maxLength: 3 }),
    fc.array(fc.constantFrom("spec/R1.4", "spec/R1.5"), { maxLength: 2 }),
  )
  .map(([a, b, c]): TaskEntry[] => {
    const make = (number: number, title: string, ids: string[]): TaskEntry => ({
      spec: "spec",
      number,
      title,
      file: ".kiro/specs/spec/tasks.md",
      line: number * 3,
      requirements: [...new Set(ids)].map((id, i) => ({ id, line: number * 3 + 1 + i })),
    });
    return [make(1, "First", a), make(2, "Second", b), make(3, "Third", c)];
  });

describe("link without commit data (properties)", () => {
  it("equals the result on the same input without the optional fields", () => {
    fc.assert(
      fc.property(
        requirementsArb,
        indexArb(false),
        fc.boolean(),
        (requirements, index, emptyList) => {
          const baseline = link(requirements, index);
          const variant: CodeIndex = emptyList ? { ...index, kiroCommits: [] } : { ...index };
          const result = link(requirements, variant, [], []);
          expect(result).toEqual(baseline);
          expect(JSON.stringify(result)).toBe(JSON.stringify(baseline));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("ignores blame and tasks when there is no kiro commit", () => {
    fc.assert(
      fc.property(requirementsArb, indexArb(true), tasksArb, (requirements, index, tasks) => {
        const stripped: CodeIndex = {
          ...index,
          files: index.files.map((f): FileIndex => {
            const { blame: _blame, ...rest } = f;
            return rest;
          }),
        };
        const withTasks = link(requirements, index, [], tasks);
        const baseline = link(requirements, stripped);
        // Tasks may add unknown-task-requirement diagnostics; links, zombies and counts must not change.
        expect(withTasks.requirements).toEqual(baseline.requirements);
        expect(withTasks.zombies).toEqual(baseline.zombies);
        expect(withTasks.counts).toEqual(baseline.counts);
      }),
      { numRuns: 100 },
    );
  });
});

describe("link with commit data (properties)", () => {
  it("is deterministic: two runs give deep-equal body maps and identical JSON", () => {
    fc.assert(
      fc.property(
        requirementsArb,
        indexArb(true),
        kiroCommitsArb,
        tasksArb,
        (requirements, index, kiroCommits, tasks) => {
          const withCommits: CodeIndex = { ...index, kiroCommits };
          const first = link(requirements, withCommits, [], tasks);
          const second = link(requirements, withCommits, [], tasks);
          expect(second).toEqual(first);
          expect(JSON.stringify(second)).toBe(JSON.stringify(first));
        },
      ),
      { numRuns: 100 },
    );
  });

  it("only gives a commit field to commit links", () => {
    fc.assert(
      fc.property(
        requirementsArb,
        indexArb(true),
        kiroCommitsArb,
        tasksArb,
        (requirements, index, kiroCommits, tasks) => {
          const map = link(requirements, { ...index, kiroCommits }, [], tasks);
          for (const r of map.requirements) {
            for (const l of [...r.codeLinks, ...r.testLinks]) {
              expect("commit" in l).toBe(l.method === "commit");
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
