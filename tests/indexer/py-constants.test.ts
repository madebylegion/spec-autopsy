import { describe, expect, it } from "vitest";
import { extractComments } from "../../src/indexer/comments.js";
import { getParser } from "../../src/indexer/grammar-loader.js";
import { extractPy } from "../../src/indexer/py-extractor.js";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol } from "../../src/indexer/types.js";
import { link } from "../../src/linker/link.js";
import type { Requirement } from "../../src/parser/index.js";

const FILE = "src/m.py";

async function symbolsOf(source: string): Promise<CodeSymbol[]> {
  const parser = await getParser("python");
  const tree = parser.parse(source);
  if (tree === null) throw new Error("parse returned null");
  try {
    return extractPy(tree, FILE);
  } finally {
    tree.delete();
  }
}

async function fileIndexOf(path: string, source: string): Promise<FileIndex> {
  const parser = await getParser("python");
  const tree = parser.parse(source);
  if (tree === null) throw new Error("parse returned null");
  try {
    return {
      path,
      language: "python",
      isTest: false,
      lineCount: source.split("\n").length,
      symbols: extractPy(tree, path),
      comments: extractComments(tree, "python"),
      testCases: [],
      history: { commits: [], commitCount: 0, authors: [] },
    };
  } finally {
    tree.delete();
  }
}

describe("extractPy: module-level constants", () => {
  it("gives a const with the statement range for NAME = 3 and NAME: int = 3", async () => {
    const symbols = await symbolsOf("NAME = 3\nOTHER: int = 4\n");
    expect(symbols).toEqual([
      { name: "NAME", kind: "const", exported: true, startLine: 1, endLine: 1, file: FILE },
      { name: "OTHER", kind: "const", exported: true, startLine: 2, endLine: 2, file: FILE },
    ]);
  });

  it("does not export a name that starts with an underscore", async () => {
    const symbols = await symbolsOf("_PRIVATE = 1\n");
    expect(symbols).toEqual([
      { name: "_PRIVATE", kind: "const", exported: false, startLine: 1, endLine: 1, file: FILE },
    ]);
  });

  it("lets __all__ decide the export and gives no symbol for __all__ itself", async () => {
    const symbols = await symbolsOf('__all__ = ["PUBLIC"]\nPUBLIC = 1\nOTHER = 2\n');
    expect(symbols.map((s) => [s.name, s.exported])).toEqual([
      ["PUBLIC", true],
      ["OTHER", false],
    ]);
    expect(symbols.some((s) => s.name === "__all__")).toBe(false);
  });

  it("gives no symbol for a dunder name", async () => {
    expect(await symbolsOf('__version__ = "1"\n')).toEqual([]);
  });

  it("gives no symbol for tuple, attribute and subscript targets or a bare annotation", async () => {
    const source = ["a, b = 1, 2", "obj.attr = 1", 'd["k"] = 1', "X: int", ""].join("\n");
    expect(await symbolsOf(source)).toEqual([]);
  });

  it("gives no symbol for an assignment inside def, class and if", async () => {
    const source = [
      "def f():",
      "    INNER = 1",
      "    return INNER",
      "",
      "class C:",
      "    ATTR = 2",
      "",
      "if True:",
      "    COND = 3",
      "",
    ].join("\n");
    const symbols = await symbolsOf(source);
    expect(symbols.map((s) => [s.name, s.kind])).toEqual([
      ["f", "function"],
      ["C", "class"],
    ]);
  });

  it("takes the leftmost target of a chain", async () => {
    const symbols = await symbolsOf("A = B = 1\n");
    expect(symbols.map((s) => s.name)).toEqual(["A"]);
  });

  it("covers every line of a multi-line value", async () => {
    const symbols = await symbolsOf("ITEMS = [\n    1,\n    2,\n]\n");
    expect(symbols).toEqual([
      { name: "ITEMS", kind: "const", exported: true, startLine: 1, endLine: 4, file: FILE },
    ]);
  });

  it("leaves function, class and method symbols unchanged", async () => {
    const source = [
      "def run():",
      "    return 1",
      "",
      "class Box:",
      "    def open(self):",
      "        return 2",
      "",
    ].join("\n");
    expect(await symbolsOf(source)).toEqual([
      { name: "run", kind: "function", exported: true, startLine: 1, endLine: 2, file: FILE },
      { name: "Box", kind: "class", exported: true, startLine: 4, endLine: 6, file: FILE },
      { name: "Box.open", kind: "method", exported: true, startLine: 5, endLine: 6, file: FILE },
    ]);
  });
});

describe("link: a tag above a Python constant", () => {
  const requirement: Requirement = {
    id: "spec/R1.1",
    pattern: "ubiquitous",
    system: "engine",
    response: "idle quietly",
    file: ".kiro/specs/spec/requirements.md",
    line: 3,
  };

  function indexOf(files: FileIndex[]): CodeIndex {
    return { root: "/repo", files, diagnostics: [] };
  }

  it("is no ghost with the constant, and would be one without it", async () => {
    const withConstant = await fileIndexOf("src/c.py", "# spec/R1.1\nCEILING = 12\n");
    const mapWith = link([requirement], indexOf([withConstant]));
    const entry = mapWith.requirements[0];
    expect(entry?.status).toBe("unproven");
    expect(entry?.codeLinks.map((l) => [l.symbol, l.method])).toEqual([["CEILING", "tag"]]);

    const withoutConstant = await fileIndexOf("src/c.py", "# spec/R1.1\n");
    const mapWithout = link([requirement], indexOf([withoutConstant]));
    expect(mapWithout.requirements[0]?.status).toBe("ghost");
  });
});
