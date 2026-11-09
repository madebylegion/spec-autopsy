import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseRequirementsText } from "../../src/parser/requirement-parser.js";
import { printRequirement } from "../../src/parser/requirement-printer.js";
import type { Requirement } from "../../src/parser/types.js";

const RESERVED = new Set(["while", "where", "when", "if", "the", "shall", "then"]);

// A lowercase word that is never a keyword, "the", "shall" or "then".
const wordArb = fc.stringMatching(/^[a-z]{1,8}$/).filter((w) => !RESERVED.has(w));
const fieldArb = fc.array(wordArb, { minLength: 1, maxLength: 4 }).map((ws) => ws.join(" "));
const optFieldArb = fc.option(fieldArb, { nil: undefined });

interface Fields {
  state: string | undefined;
  feature: string | undefined;
  trigger: string | undefined;
  condition: string | undefined;
  system: string;
  response: string;
}

const fieldsArb: fc.Arbitrary<Fields> = fc.record({
  state: optFieldArb,
  feature: optFieldArb,
  trigger: optFieldArb,
  condition: optFieldArb,
  system: fieldArb,
  response: fieldArb,
});

/** Build a statement independently of the printer, in canonical order. */
function statementText(f: Fields): string {
  const clauses: string[] = [];
  if (f.state !== undefined) clauses.push(`WHILE ${f.state}`);
  if (f.feature !== undefined) clauses.push(`WHERE ${f.feature}`);
  if (f.trigger !== undefined) clauses.push(`WHEN ${f.trigger}`);
  if (f.condition !== undefined) clauses.push(`IF ${f.condition}`);
  const head = clauses.length === 0 ? "The" : `${clauses.join(", ")}, THEN the`;
  return `${head} ${f.system} SHALL ${f.response}`;
}

function parseOne(statement: string): Requirement {
  const result = parseRequirementsText(`### Requirement 1: T\n\n1. ${statement}\n`, {
    specName: "demo",
    file: "demo.md",
  });
  expect(result.diagnostics).toEqual([]);
  expect(result.requirements).toHaveLength(1);
  return result.requirements[0] as Requirement;
}

function stripLocation(r: Requirement): Omit<Requirement, "id" | "file" | "line"> {
  const { id: _id, file: _file, line: _line, ...rest } = r;
  return rest;
}

describe("properties: round trip", () => {
  it("parse, print, parse gives an equal object apart from id, file and line", () => {
    fc.assert(
      fc.property(fieldsArb, (fields) => {
        const first = parseOne(statementText(fields));
        expect(first.system).toBe(fields.system);
        expect(first.response).toBe(fields.response);
        const second = parseOne(printRequirement(first));
        expect(stripLocation(second)).toEqual(stripLocation(first));
      }),
      { numRuns: 200 },
    );
  });
});

describe("properties: ID stability", () => {
  it("unrelated prose lines between statements do not change IDs or content", () => {
    const itemArb = fc.tuple(fieldsArb, fc.array(wordArb, { maxLength: 3 }));
    fc.assert(
      fc.property(fc.array(itemArb, { minLength: 1, maxLength: 6 }), (items) => {
        const base: string[] = ["### Requirement 1: T"];
        const noisy: string[] = ["### Requirement 1: T"];
        items.forEach(([fields, prose], i) => {
          const line = `${i + 1}. ${statementText(fields)}`;
          base.push(line);
          noisy.push(...prose.map((w) => `${w} some unrelated prose`), line);
        });
        const options = { specName: "demo", file: "demo.md" };
        const a = parseRequirementsText(base.join("\n"), options);
        const b = parseRequirementsText(noisy.join("\n"), options);
        expect(b.diagnostics).toEqual([]);
        expect(b.requirements.map((r) => r.id)).toEqual(a.requirements.map((r) => r.id));
        expect(b.requirements.map(stripLocation)).toEqual(a.requirements.map(stripLocation));
      }),
      { numRuns: 100 },
    );
  });
});

describe("properties: totality", () => {
  const CODES = new Set([
    "missing-shall",
    "missing-system",
    "empty-response",
    "unnumbered-statement",
    "duplicate-id",
    "unreadable-file",
  ]);

  const fragmentArb = fc.constantFrom(
    "### Requirement 1: T",
    "### Requirement 2",
    "1. The x SHALL y",
    "1. The x SHALL",
    "2. no obligation here",
    "3. SHALL do it",
    "WHEN something happens",
    "IF it breaks, THEN the x SHALL y",
    "```",
    "~~~",
    "",
    "   ",
  );
  const docArb = fc.oneof(
    fc.string({ maxLength: 300 }),
    fc.array(fc.oneof(fragmentArb, fc.string({ maxLength: 40 })), { maxLength: 20 }).map((l) => l.join("\n")),
  );

  it("never throws, and every diagnostic is well formed", () => {
    fc.assert(
      fc.property(docArb, (text) => {
        const result = parseRequirementsText(text, { specName: "demo", file: "demo.md" });
        for (const d of result.diagnostics) {
          expect(CODES.has(d.code)).toBe(true);
          expect(typeof d.message).toBe("string");
          expect(d.message.length).toBeGreaterThan(0);
          expect(d.file).toBe("demo.md");
          expect(Number.isInteger(d.line)).toBe(true);
          expect(d.line).toBeGreaterThanOrEqual(1);
        }
      }),
      { numRuns: 300 },
    );
  });
});
