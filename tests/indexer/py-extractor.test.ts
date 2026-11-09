import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getParser } from "../../src/indexer/grammar-loader.js";
import { extractPy } from "../../src/indexer/py-extractor.js";
import type { Symbol as CodeSymbol } from "../../src/indexer/types.js";

async function symbolsOf(source: string, file = "x.py"): Promise<CodeSymbol[]> {
  const parser = await getParser("python");
  const tree = parser.parse(source);
  if (tree === null) throw new Error("parse returned null");
  try {
    return extractPy(tree, file);
  } finally {
    tree.delete();
  }
}

function summary(symbols: CodeSymbol[]): Array<[string, string, boolean, number, number]> {
  return symbols.map((s) => [s.name, s.kind, s.exported, s.startLine, s.endLine]);
}

const FIXTURE = fileURLToPath(
  new URL("../fixtures/py-basic/app/core.py", import.meta.url),
);
const TEST_FIXTURE = fileURLToPath(
  new URL("../fixtures/py-basic/tests/test_core.py", import.meta.url),
);

describe("py extractor on the py-basic fixture", () => {
  it("extracts kinds, names, export flags and exact lines", async () => {
    const source = readFileSync(FIXTURE, "utf8");
    const symbols = await symbolsOf(source, "app/core.py");
    expect(summary(symbols)).toEqual([
      ["public_func", "function", true, 6, 7],
      ["fetch", "function", false, 10, 11],
      ["decorated", "function", false, 14, 17],
      ["_helper", "function", false, 20, 21],
      ["Service", "class", true, 24, 36],
      ["Service.__init__", "method", true, 25, 26],
      ["Service.run", "method", true, 28, 29],
      ["Service._internal", "method", false, 31, 32],
      ["Service.make", "method", true, 34, 36],
    ]);
    for (const s of symbols) expect(s.file).toBe("app/core.py");
  });

  it("extracts def test_ functions from the test fixture", async () => {
    const source = readFileSync(TEST_FIXTURE, "utf8");
    expect(summary(await symbolsOf(source, "tests/test_core.py"))).toEqual([
      ["test_public", "function", true, 4, 5],
      ["test_other", "function", true, 8, 9],
    ]);
  });

  it("gives every symbol the six documented fields in order", async () => {
    const symbols = await symbolsOf("def a():\n    pass\n");
    expect(Object.keys(symbols[0]!)).toEqual([
      "name",
      "kind",
      "exported",
      "startLine",
      "endLine",
      "file",
    ]);
  });
});

describe("py extractor inline cases", () => {
  it("treats async functions as functions", async () => {
    expect(summary(await symbolsOf("async def go():\n    pass\n"))).toEqual([
      ["go", "function", true, 1, 2],
    ]);
  });

  it("includes decorator lines for functions and classes", async () => {
    const src = [
      "@a",
      "@b",
      "def f():",
      "    pass",
      "",
      "@dataclass",
      "class C:",
      "    @property",
      "    def p(self):",
      "        return 1",
    ].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([
      ["f", "function", true, 1, 4],
      ["C", "class", true, 6, 10],
      ["C.p", "method", true, 8, 10],
    ]);
  });

  it("applies the underscore rule without __all__", async () => {
    const src = ["def a(): pass", "def _b(): pass", "class _C:", "    def m(self): pass"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([
      ["a", "function", true, 1, 1],
      ["_b", "function", false, 2, 2],
      ["_C", "class", false, 3, 4],
      ["_C.m", "method", false, 4, 4],
    ]);
  });

  it("filters by __all__ when it is a list of strings", async () => {
    const src = ['__all__ = ["a"]', "def a(): pass", "def b(): pass"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([
      ["a", "function", true, 2, 2],
      ["b", "function", false, 3, 3],
    ]);
  });

  it("an empty __all__ list exports nothing", async () => {
    const src = ["__all__ = []", "def a(): pass"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([["a", "function", false, 2, 2]]);
  });

  it("keeps a name with an underscore unexported even when listed in __all__", async () => {
    const src = ['__all__ = ["_a"]', "def _a(): pass"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([["_a", "function", false, 2, 2]]);
  });

  it("ignores __all__ when it is not a list of string literals", async () => {
    const withName = ["__all__ = [a]", "def a(): pass", "def _b(): pass"].join("\n");
    expect(summary(await symbolsOf(withName))).toEqual([
      ["a", "function", true, 2, 2],
      ["_b", "function", false, 3, 3],
    ]);
    const tuple = ['__all__ = ("a",)', "def a(): pass", "def b(): pass"].join("\n");
    expect(summary(await symbolsOf(tuple))).toEqual([
      ["a", "function", true, 2, 2],
      ["b", "function", true, 3, 3],
    ]);
    const call = ["__all__ = make()", "def a(): pass"].join("\n");
    expect(summary(await symbolsOf(call))).toEqual([["a", "function", true, 2, 2]]);
  });

  it("method visibility: single underscore false, dunder follows the class", async () => {
    const src = [
      "class K:",
      "    def __init__(self): pass",
      "    def _p(self): pass",
      "    def q(self): pass",
    ].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([
      ["K", "class", true, 1, 4],
      ["K.__init__", "method", true, 2, 2],
      ["K._p", "method", false, 3, 3],
      ["K.q", "method", true, 4, 4],
    ]);
  });

  it("ignores nested functions and non-definition statements", async () => {
    const src = ["x = 1", "def outer():", "    def inner(): pass", "    return inner"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([["outer", "function", true, 2, 4]]);
  });

  it("returns no symbols for empty or invalid source", async () => {
    expect(await symbolsOf("")).toEqual([]);
    await expect(symbolsOf("def (((")).resolves.toBeDefined();
  });
});
