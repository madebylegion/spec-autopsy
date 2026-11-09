import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol } from "../../src/indexer/index.js";
import { link } from "../../src/linker/link.js";
import type { Requirement } from "../../src/parser/index.js";

const WORDS = ["stock", "order", "record", "adjust", "alert", "ship", "label", "audit", "the", "shall"];
const word = fc.constantFrom(...WORDS);
const phrase = fc.array(word, { minLength: 0, maxLength: 4 }).map((w) => w.join(" "));

const requirementsArb: fc.Arbitrary<Requirement[]> = fc
  .array(fc.record({ system: phrase, response: phrase }), { minLength: 0, maxLength: 6 })
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

const tagComment = fc.record({
  line: fc.integer({ min: 1, max: 20 }),
  text: fc.constantFrom(
    "// spec/R1.1",
    "/** spec/R1.2 */",
    "// spec/R9.9",
    "// plain comment",
    "/* spec/R1.3\n spec/R1.4 */",
  ),
});

const symbolArb = (path: string): fc.Arbitrary<CodeSymbol> =>
  fc
    .record({
      name: nameArb,
      kind: fc.constantFrom<CodeSymbol["kind"]>("function", "class", "method", "const", "type"),
      exported: fc.boolean(),
      startLine: fc.integer({ min: 1, max: 20 }),
      extra: fc.integer({ min: 0, max: 10 }),
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

const fileArb = (path: string, isTest: boolean): fc.Arbitrary<FileIndex> =>
  fc
    .record({
      symbols: fc.array(symbolArb(path), { maxLength: 5 }),
      comments: fc.array(tagComment, { maxLength: 4 }),
      titles: fc.array(fc.record({ title: phrase, line: fc.integer({ min: 1, max: 20 }) }), {
        maxLength: 4,
      }),
      date: fc.constantFrom("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z", "not a date"),
    })
    .map(
      (f): FileIndex => ({
        path,
        language: path.endsWith(".py") ? "python" : "typescript",
        isTest,
        lineCount: 40,
        symbols: [...f.symbols].sort((a, b) => a.startLine - b.startLine || (a.name < b.name ? -1 : 1)),
        comments: f.comments,
        testCases: isTest ? f.titles : [],
        history: {
          commits: [{ sha: "abc", author: "a", date: f.date, subject: "s" }],
          commitCount: 1,
          authors: ["a"],
        },
      }),
    );

const indexArb: fc.Arbitrary<CodeIndex> = fc
  .tuple(fileArb("src/a.ts", false), fileArb("src/b.py", false), fileArb("tests/a.test.ts", true))
  .map(([a, b, t]): CodeIndex => ({ root: "/repo", files: [a, b, t], diagnostics: [] }));

describe("link properties", () => {
  it("never throws, lists each requirement once with one status, and keeps counts consistent", () => {
    fc.assert(
      fc.property(requirementsArb, indexArb, (requirements, index) => {
        const map = link(requirements, index);
        expect(map.requirements.map((r) => r.id)).toEqual(requirements.map((r) => r.id));
        let ghost = 0;
        let unproven = 0;
        let proven = 0;
        for (const entry of map.requirements) {
          expect(["ghost", "unproven", "proven"]).toContain(entry.status);
          if (entry.status === "ghost") {
            ghost++;
            expect(entry.codeLinks).toHaveLength(0);
          } else if (entry.status === "unproven") {
            unproven++;
            expect(entry.codeLinks.length).toBeGreaterThan(0);
            expect(entry.testLinks).toHaveLength(0);
          } else {
            proven++;
            expect(entry.codeLinks.length).toBeGreaterThan(0);
            expect(entry.testLinks.length).toBeGreaterThan(0);
          }
        }
        expect(map.counts).toEqual({
          requirements: requirements.length,
          ghost,
          unproven,
          proven,
          zombies: map.zombies.length,
        });
      }),
      { numRuns: 100 },
    );
  });

  it("is deterministic: two runs give deep-equal maps and identical JSON", () => {
    fc.assert(
      fc.property(requirementsArb, indexArb, (requirements, index) => {
        const first = link(requirements, index);
        const second = link(requirements, index);
        expect(second).toEqual(first);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      }),
      { numRuns: 100 },
    );
  });
});
