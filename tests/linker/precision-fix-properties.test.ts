import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol, TestCase } from "../../src/indexer/types.js";
import { link } from "../../src/linker/link.js";
import type { BodyMap } from "../../src/linker/types.js";
import type { Requirement } from "../../src/parser/index.js";

// No word below is a digit-only token, so rule 2 (numbers) changes nothing here.
const WORDS = ["stock", "order", "record", "adjust", "alert", "ship", "label", "audit", "the", "shall"];
const word = fc.constantFrom(...WORDS);
const phrase = fc.array(word, { minLength: 0, maxLength: 4 }).map((w) => w.join(" "));

// A small fixed pool of names, so that references and calls hit real symbols.
const NAMES = ["stockOrder", "recordAdjust", "alertShip", "labelAudit", "orderLabel", "shipRecord"];
const nameArb = fc.constantFrom(...NAMES);
const namesArb = fc.array(nameArb, { maxLength: 4 });

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

const tagComment = fc.record({
  line: fc.integer({ min: 1, max: 20 }),
  text: fc.constantFrom("// spec/R1.1", "/** spec/R1.2 */", "// spec/R9.9", "// plain comment"),
});

const symbolArb = (path: string): fc.Arbitrary<CodeSymbol> =>
  fc
    .record({
      name: nameArb,
      kind: fc.constantFrom<CodeSymbol["kind"]>("function", "class", "method", "const", "type"),
      exported: fc.boolean(),
      startLine: fc.integer({ min: 1, max: 20 }),
      extra: fc.integer({ min: 0, max: 10 }),
      references: namesArb,
    })
    .map(
      (s): CodeSymbol => ({
        name: s.name,
        kind: s.kind,
        exported: s.exported,
        startLine: s.startLine,
        endLine: s.startLine + s.extra,
        file: path,
        references: s.references,
      }),
    );

const fileArb = (path: string, isTest: boolean): fc.Arbitrary<FileIndex> =>
  fc
    .record({
      symbols: fc.array(symbolArb(path), { maxLength: 5 }),
      comments: fc.array(tagComment, { maxLength: 4 }),
      titles: fc.array(
        fc.record({ title: phrase, line: fc.integer({ min: 1, max: 20 }), calls: namesArb }),
        { maxLength: 4 },
      ),
    })
    .map(
      (f): FileIndex => ({
        path,
        language: path.endsWith(".py") ? "python" : "typescript",
        isTest,
        lineCount: 40,
        symbols: [...f.symbols].sort((a, b) => a.startLine - b.startLine || (a.name < b.name ? -1 : 1)),
        comments: f.comments,
        testCases: isTest
          ? f.titles.map((t): TestCase => ({ title: t.title, line: t.line, endLine: t.line + 2, calls: t.calls }))
          : [],
        history: { commits: [], commitCount: 0, authors: [] },
      }),
    );

/** The index with data (references, calls, endLine). */
const indexArb: fc.Arbitrary<CodeIndex> = fc
  .tuple(fileArb("src/a.ts", false), fileArb("src/b.py", false), fileArb("tests/a.test.ts", true))
  .map(([a, b, t]): CodeIndex => ({ root: "/repo", files: [a, b, t], diagnostics: [] }));

function mapFiles(
  index: CodeIndex,
  fn: (symbol: CodeSymbol) => CodeSymbol,
  fnTest: (testCase: TestCase) => TestCase,
): CodeIndex {
  return {
    ...index,
    files: index.files.map((file) => ({
      ...file,
      symbols: file.symbols.map(fn),
      testCases: file.testCases.map(fnTest),
    })),
  };
}

/** The same index as the old indexer made it: none of the new fields. */
function stripData(index: CodeIndex): CodeIndex {
  return mapFiles(
    index,
    (s) => ({ name: s.name, kind: s.kind, exported: s.exported, startLine: s.startLine, endLine: s.endLine, file: s.file }),
    (t) => ({ title: t.title, line: t.line }),
  );
}

/** The same index with the new fields present but empty. */
function emptyData(index: CodeIndex): CodeIndex {
  return mapFiles(
    index,
    (s) => ({ ...s, references: [] }),
    (t) => ({ title: t.title, line: t.line, endLine: t.line, calls: [] }),
  );
}

function jsonSet(items: readonly unknown[]): Set<string> {
  return new Set(items.map((i) => JSON.stringify(i)));
}

function zombieKeys(map: BodyMap): Set<string> {
  return new Set(map.zombies.map((z) => `${z.file}#${z.line}#${z.symbol}`));
}

describe("precision-fix properties", () => {
  it("with no calls and no references, link equals the run with empty data and has no test-call link", () => {
    fc.assert(
      fc.property(requirementsArb, indexArb, (requirements, withData) => {
        const bare = stripData(withData);
        const first = link(requirements, bare);
        const second = link(requirements, emptyData(withData));
        expect(second).toEqual(first);
        for (const entry of first.requirements) {
          for (const codeLink of entry.codeLinks) expect(codeLink.method).not.toBe("test-call");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("with the data present, every code link, test link and non-zombie of the run without data stays", () => {
    fc.assert(
      fc.property(requirementsArb, indexArb, (requirements, withData) => {
        const before = link(requirements, stripData(withData));
        const after = link(requirements, withData);
        expect(after.requirements.map((r) => r.id)).toEqual(before.requirements.map((r) => r.id));
        for (let i = 0; i < before.requirements.length; i++) {
          const b = before.requirements[i]!;
          const a = after.requirements[i]!;
          const afterCode = jsonSet(a.codeLinks);
          for (const l of b.codeLinks) expect(afterCode.has(JSON.stringify(l))).toBe(true);
          const afterTests = jsonSet(a.testLinks);
          for (const l of b.testLinks) expect(afterTests.has(JSON.stringify(l))).toBe(true);
        }
        // A zombie of the run with data was a zombie of the run without it.
        const zombiesBefore = zombieKeys(before);
        for (const key of zombieKeys(after)) expect(zombiesBefore.has(key)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("is deterministic: two runs deep-equal with identical JSON", () => {
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
