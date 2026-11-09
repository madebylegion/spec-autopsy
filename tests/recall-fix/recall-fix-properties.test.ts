import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CodeIndex } from "../../src/indexer/index.js";
import { link } from "../../src/linker/link.js";
import type { BodyMap, LinkExtras } from "../../src/linker/types.js";
import type { Requirement, TaskEntry } from "../../src/parser/index.js";
import { SHA_A, SHA_B, file, index, neutral, owned, sym, task, testFile, words } from "./link-helpers.js";

function fixtureIndex(): CodeIndex {
  const code = file("src/a.ts", {
    symbols: [sym("alpha", 1, 3), sym("beta", 4, 6), sym("gamma", 7, 9), sym("delta", 10, 12)],
    blame: [owned(SHA_A, 1, 6), owned(SHA_B, 7, 12)],
  });
  const other = file("src/b.ts", {
    symbols: [sym("recordStockAdjustment", 1, 3, "function", true, "src/b.ts")],
  });
  const tests = testFile(
    "tests/a.test.ts",
    [
      { title: "first works", line: 3 },
      { title: "second works", line: 8 },
    ],
    { blame: [owned(SHA_A, 1, 5), owned(SHA_B, 6, 10)] },
  );
  return index(
    [code, other, tests],
    [
      { sha: SHA_A, subject: "kiro: spec task 1 Do it" },
      { sha: SHA_B, subject: "kiro: spec task 2 Do more" },
    ],
  );
}

const ALL_REQUIREMENTS: Requirement[] = [
  neutral("spec/R1.1", 1),
  neutral("spec/R1.2", 2),
  words("spec/R1.3", "stock ledger", "record adjustment", 3),
  neutral("spec/R1.4", 4),
];

const ALL_TASKS: TaskEntry[] = [
  task("spec", 1, "Do it", [["spec/R1.1", 2], ["spec/R1.4", 3]], 1),
  task("spec", 2, "Do more", [["spec/R1.2", 6], ["spec/R9.9", 7]], 5),
];

const subsetOf = <T>(items: readonly T[]): fc.Arbitrary<T[]> =>
  fc.subarray([...items]);

const designWord = fc.constantFrom("alpha", "beta", "gamma", "delta", "alphabet", "BETA", "`gamma`", "nothing");
const designText = fc.array(designWord, { maxLength: 6 }).map((w) => w.join(" "));

const extrasArb: fc.Arbitrary<LinkExtras> = fc
  .record({
    withDesign: fc.boolean(),
    text: designText,
    withCheck: fc.boolean(),
    checked: fc.subarray(["spec#1", "spec#2", "spec#3"]),
  })
  .map((r): LinkExtras => {
    const extras: LinkExtras = {};
    if (r.withDesign) extras.designTexts = new Map([["spec", r.text]]);
    if (r.withCheck) extras.checkedTasks = new Set(r.checked);
    return extras;
  });

function linkKeys(map: BodyMap, id: string): { code: string[]; tests: string[] } {
  const entry = map.requirements.find((r) => r.id === id);
  return {
    code: (entry?.codeLinks ?? []).map((l) => `${l.file}|${l.startLine}|${l.symbol}|${l.method}`),
    tests: (entry?.testLinks ?? []).map((l) => `${l.file}|${l.line}|${l.title}|${l.method}`),
  };
}

describe("recall-fix properties", () => {
  it("links with design texts are a subset of the links without, for code and test links", () => {
    fc.assert(
      fc.property(subsetOf(ALL_REQUIREMENTS), subsetOf(ALL_TASKS), designText, (reqs, tasks, text) => {
        const idx = fixtureIndex();
        const without = link(reqs, idx, [], tasks);
        const withDesign = link(reqs, idx, [], tasks, { designTexts: new Map([["spec", text]]) });
        for (const r of reqs) {
          const a = linkKeys(withDesign, r.id);
          const b = linkKeys(without, r.id);
          for (const key of a.code) expect(b.code).toContain(key);
          for (const key of a.tests) expect(b.tests).toContain(key);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("gives the same result without extras, with empty extras and with empty collections", () => {
    fc.assert(
      fc.property(subsetOf(ALL_REQUIREMENTS), subsetOf(ALL_TASKS), (reqs, tasks) => {
        const idx = fixtureIndex();
        const plain = link(reqs, idx, [], tasks);
        const empty = link(reqs, idx, [], tasks, {});
        const collections = link(reqs, idx, [], tasks, {
          designTexts: new Map(),
          checkedTasks: new Set(),
        });
        expect(empty).toEqual(plain);
        expect(collections).toEqual(plain);
        expect(JSON.stringify(empty)).toBe(JSON.stringify(plain));
        expect(JSON.stringify(collections)).toBe(JSON.stringify(plain));
      }),
      { numRuns: 100 },
    );
  });

  it("gives deep-equal results with the same JSON on two runs", () => {
    fc.assert(
      fc.property(subsetOf(ALL_REQUIREMENTS), subsetOf(ALL_TASKS), extrasArb, (reqs, tasks, extras) => {
        const first = link(reqs, fixtureIndex(), [], tasks, extras);
        const second = link(reqs, fixtureIndex(), [], tasks, extras);
        expect(second).toEqual(first);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));
      }),
      { numRuns: 100 },
    );
  });
});
