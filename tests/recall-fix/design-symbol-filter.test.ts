import { describe, expect, it } from "vitest";
import { link } from "../../src/linker/link.js";
import {
  COMMIT_A,
  SHA_A,
  SHA_B,
  TASK_1,
  file,
  index,
  neutral,
  owned,
  sym,
  testFile,
  words,
} from "./link-helpers.js";

/** alpha 2-4 and beta 6-8, both exported and owned by commit A. */
function codeFile() {
  return file("src/a.ts", {
    symbols: [sym("alpha", 2, 4), sym("beta", 6, 8)],
    blame: [owned(SHA_A, 1, 9)],
  });
}

function linkWith(designTexts: ReadonlyMap<string, string> | undefined, extraFiles = [codeFile()]) {
  const idx = index(extraFiles, [COMMIT_A]);
  return link([neutral("spec/R1.1", 7)], idx, [], [TASK_1], designTexts === undefined ? {} : { designTexts });
}

describe("design symbol filter", () => {
  it("keeps the named symbol and drops the unnamed one", () => {
    const map = linkWith(new Map([["spec", "The task builds `alpha` only."]]));
    const entry = map.requirements[0];
    expect(entry?.codeLinks.map((l) => l.symbol)).toEqual(["alpha"]);
    expect(entry?.codeLinks[0]?.method).toBe("commit");
  });

  it("links a dropped exported symbol to nothing, and it is no zombie because a task commit wrote it", () => {
    const map = linkWith(new Map([["spec", "The task builds `alpha` only."]]));
    for (const r of map.requirements) {
      expect(r.codeLinks.map((l) => l.symbol)).not.toContain("beta");
    }
    expect(map.zombies).toEqual([]);
    expect(map.counts.zombies).toBe(0);
  });

  it("keeps an exported symbol that no task commit wrote a zombie", () => {
    const other = file("src/c.ts", {
      symbols: [sym("gamma", 2, 4, "function", true, "src/c.ts")],
      blame: [owned(SHA_B, 1, 5)],
    });
    const map = linkWith(new Map([["spec", "The task builds `alpha` only."]]), [codeFile(), other]);
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["alpha"]);
    expect(map.zombies.map((z) => z.symbol)).toEqual(["gamma"]);
    expect(map.counts.zombies).toBe(1);
  });

  it("keeps all symbols when no design text is given", () => {
    for (const map of [linkWith(undefined), linkWith(new Map()), linkWith(new Map([["other", "alpha"]]))]) {
      expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["alpha", "beta"]);
      expect(map.zombies).toEqual([]);
    }
  });

  it("keeps all symbols when none is named", () => {
    const map = linkWith(new Map([["spec", "Nothing about the symbols here."]]));
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["alpha", "beta"]);
  });

  it("does not match a substring or another case", () => {
    const map = linkWith(new Map([["spec", "alphabet and BETA"]]));
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["alpha", "beta"]);
  });

  it("does not filter test cases", () => {
    const tests = testFile(
      "tests/a.test.ts",
      [
        { title: "first works", line: 3 },
        { title: "second works", line: 5 },
      ],
      { blame: [owned(SHA_A, 1, 9)] },
    );
    const map = linkWith(new Map([["spec", "The task builds `alpha` only."]]), [codeFile(), tests]);
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["alpha"]);
    expect(map.requirements[0]?.testLinks.map((l) => l.title)).toEqual(["first works", "second works"]);
  });

  it("leaves tag links and overlap links untouched", () => {
    const tagged = file("src/t.ts", {
      symbols: [sym("tagged", 2, 4, "function", true, "src/t.ts")],
      comments: [{ line: 1, text: "// spec/R1.2" }],
    });
    const overlapping = file("src/b.ts", {
      symbols: [sym("recordStockAdjustment", 1, 3, "function", true, "src/b.ts")],
    });
    const reqs = [
      neutral("spec/R1.1", 7),
      neutral("spec/R1.2", 8),
      words("spec/R1.3", "stock ledger", "record adjustment", 9),
    ];
    const idx = index([codeFile(), tagged, overlapping], [COMMIT_A]);
    const designTexts = new Map([["spec", "The task builds `alpha` only."]]);
    const map = link(reqs, idx, [], [TASK_1], { designTexts });
    const byId = new Map(map.requirements.map((r) => [r.id, r]));
    expect(byId.get("spec/R1.1")?.codeLinks.map((l) => l.symbol)).toEqual(["alpha"]);
    expect(byId.get("spec/R1.2")?.codeLinks.map((l) => [l.symbol, l.method])).toEqual([["tagged", "tag"]]);
    expect(byId.get("spec/R1.3")?.codeLinks.map((l) => [l.symbol, l.method])).toEqual([
      ["recordStockAdjustment", "overlap"],
    ]);
  });
});
