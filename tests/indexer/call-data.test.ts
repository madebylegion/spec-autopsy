import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Tree } from "web-tree-sitter";
import { extractTestCases } from "../../src/indexer/comments.js";
import { getParser, type LanguageName } from "../../src/indexer/grammar-loader.js";
import { indexRepo } from "../../src/indexer/index.js";
import { extractPy } from "../../src/indexer/py-extractor.js";
import { extractTs } from "../../src/indexer/ts-extractor.js";
import type { Symbol as CodeSymbol, TestCase } from "../../src/indexer/types.js";

async function withTree<T>(
  language: LanguageName,
  source: string,
  use: (tree: Tree) => T,
): Promise<T> {
  const parser = await getParser(language);
  const tree = parser.parse(source);
  if (tree === null) throw new Error("parse returned null");
  try {
    return use(tree);
  } finally {
    tree.delete();
  }
}

function testCasesOf(
  language: LanguageName,
  source: string,
  withDetails: boolean | undefined,
): Promise<TestCase[]> {
  return withTree(language, source, (tree) =>
    withDetails === undefined
      ? extractTestCases(tree, language, true)
      : extractTestCases(tree, language, true, withDetails),
  );
}

function tsSymbols(source: string, withDetails: boolean | undefined): Promise<CodeSymbol[]> {
  return withTree("typescript", source, (tree) =>
    withDetails === undefined ? extractTs(tree, "m.ts") : extractTs(tree, "m.ts", withDetails),
  );
}

function pySymbols(source: string, withDetails: boolean | undefined): Promise<CodeSymbol[]> {
  return withTree("python", source, (tree) =>
    withDetails === undefined ? extractPy(tree, "m.py") : extractPy(tree, "m.py", withDetails),
  );
}

function refsOf(symbols: CodeSymbol[], name: string): string[] | undefined {
  return symbols.find((s) => s.name === name)?.references;
}

describe("extractTestCases: endLine and calls", () => {
  it("records the end line and the called names of a TypeScript it", async () => {
    const source = [
      'import { add } from "./m";',
      'it("adds", () => {',
      "  const r = add(1, 2);",
      "  expect(r).toBe(3);",
      "});",
    ].join("\n");
    expect(await testCasesOf("typescript", source, true)).toEqual([
      { title: "adds", line: 2, endLine: 5, calls: ["r", "add", "expect"] },
    ]);
  });

  it("records the end line and the called names of a Python def test_*", async () => {
    const source = [
      "def test_adds():",
      "    result = add(1, 2)",
      "    assert result == 3",
    ].join("\n");
    expect(await testCasesOf("python", source, true)).toEqual([
      { title: "test_adds", line: 1, endLine: 3, calls: ["result", "add"] },
    ]);
  });

  it("keeps the names of a nested it out of the describe and leaves out it, test and describe", async () => {
    const source = [
      'describe("group", () => {',
      '  it("first", () => {',
      "    run();",
      "  });",
      "  setup();",
      "});",
    ].join("\n");
    const cases = await testCasesOf("typescript", source, true);
    expect(cases).toEqual([
      { title: "group", line: 1, endLine: 6, calls: ["setup"] },
      { title: "first", line: 2, endLine: 4, calls: ["run"] },
    ]);
  });

  it("leaves out the names of a nested Python test function", async () => {
    const source = [
      "def test_outer():",
      "    outer_call()",
      "    def test_inner():",
      "        inner_call()",
    ].join("\n");
    const cases = await testCasesOf("python", source, true);
    expect(cases.find((c) => c.title === "test_outer")?.calls).toEqual(["outer_call"]);
    expect(cases.find((c) => c.title === "test_inner")?.calls).toEqual(["inner_call"]);
  });

  it("returns the old shape without the option", async () => {
    const source = 'it("adds", () => {\n  add(1, 2);\n});\n';
    const expected = [{ title: "adds", line: 1 }];
    expect(await testCasesOf("typescript", source, undefined)).toEqual(expected);
    expect(await testCasesOf("typescript", source, false)).toEqual(expected);
    const cases = await testCasesOf("typescript", source, undefined);
    expect("calls" in (cases[0] ?? {})).toBe(false);
    expect("endLine" in (cases[0] ?? {})).toBe(false);
  });
});

describe("extractTs and extractPy: references", () => {
  const tsSource = [
    'import { helper } from "./h";',
    "export function main(x: number): number {",
    "  return helper(x) + LIMIT;",
    "}",
    "export class Box {",
    "  size(): number {",
    "    return compute();",
    "  }",
    "}",
    "export const make = () => build();",
    "export const LIMIT = 5;",
  ].join("\n");

  it("records the names a TypeScript function uses, without its own name", async () => {
    const symbols = await tsSymbols(tsSource, true);
    expect(refsOf(symbols, "main")).toEqual(["x", "helper", "LIMIT"]);
  });

  it("records the names of a class and leaves the method names out", async () => {
    const symbols = await tsSymbols(tsSource, true);
    expect(refsOf(symbols, "Box")).toEqual(["compute"]);
    expect(refsOf(symbols, "Box.size")).toEqual(["compute"]);
  });

  it("records the names of an arrow const and of a plain const", async () => {
    const symbols = await tsSymbols(tsSource, true);
    expect(refsOf(symbols, "make")).toEqual(["build"]);
    expect(refsOf(symbols, "LIMIT")).toEqual([]);
  });

  it("records the names a Python function and a method use", async () => {
    const source = [
      "def top(a):",
      "    return helper(a)",
      "",
      "class K:",
      "    def m(self):",
      "        return util()",
    ].join("\n");
    const symbols = await pySymbols(source, true);
    expect(refsOf(symbols, "top")).toEqual(["a", "helper"]);
    expect(refsOf(symbols, "K")).toEqual(["self", "util"]);
    expect(refsOf(symbols, "K.m")).toEqual(["self", "util"]);
  });

  it("records the names a Python constant uses, without its own name", async () => {
    const symbols = await pySymbols("TOTAL = base + 1\n", true);
    expect(refsOf(symbols, "TOTAL")).toEqual(["base"]);
  });

  it("returns symbols without references when the option is absent", async () => {
    for (const symbols of [
      await tsSymbols(tsSource, undefined),
      await pySymbols("def f():\n    return g()\n", undefined),
    ]) {
      expect(symbols.length).toBeGreaterThan(0);
      for (const symbol of symbols) expect("references" in symbol).toBe(false);
    }
  });
});

describe("indexRepo: call data", () => {
  const dirs: string[] = [];

  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });

  function write(root: string, rel: string, text: string): void {
    const target = join(root, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
  }

  it("sets the fields and keeps references after clamping", async () => {
    const root = mkdtempSync(join(tmpdir(), "call-data-"));
    dirs.push(root);
    write(
      root,
      "src/lib.ts",
      "export function main() {\n  return helper();\n}\nexport function helper() {\n  return 1;\n}\n",
    );
    write(root, "src/mod.py", "def run():\n    return other()\n");
    write(
      root,
      "tests/lib.test.ts",
      'import { main } from "../src/lib";\nit("runs main", () => { main(); });\n',
    );
    const index = await indexRepo(root);

    const lib = index.files.find((f) => f.path === "src/lib.ts");
    expect(lib?.symbols.find((s) => s.name === "main")?.references).toEqual(["helper"]);
    expect(lib?.symbols.find((s) => s.name === "helper")?.references).toEqual([]);

    const mod = index.files.find((f) => f.path === "src/mod.py");
    expect(mod?.symbols.find((s) => s.name === "run")?.references).toEqual(["other"]);

    const spec = index.files.find((f) => f.path === "tests/lib.test.ts");
    expect(spec?.testCases).toEqual([
      { title: "runs main", line: 2, endLine: 2, calls: ["main"] },
    ]);
  }, 60_000);
});
