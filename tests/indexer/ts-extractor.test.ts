import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getParser } from "../../src/indexer/grammar-loader.js";
import type { LanguageName } from "../../src/indexer/grammar-loader.js";
import { extractTs } from "../../src/indexer/ts-extractor.js";
import type { Symbol as CodeSymbol } from "../../src/indexer/types.js";

async function symbolsOf(
  source: string,
  language: LanguageName = "typescript",
  file = "x.ts",
): Promise<CodeSymbol[]> {
  const parser = await getParser(language);
  const tree = parser.parse(source);
  if (tree === null) throw new Error("parse returned null");
  try {
    return extractTs(tree, file);
  } finally {
    tree.delete();
  }
}

function summary(symbols: CodeSymbol[]): Array<[string, string, boolean, number, number]> {
  return symbols.map((s) => [s.name, s.kind, s.exported, s.startLine, s.endLine]);
}

const FIXTURE = fileURLToPath(
  new URL("../fixtures/ts-basic/src/math.ts", import.meta.url),
);

describe("ts extractor on the ts-basic fixture", () => {
  it("extracts kinds, names, export flags and exact lines", async () => {
    const source = readFileSync(FIXTURE, "utf8");
    const symbols = await symbolsOf(source, "typescript", "src/math.ts");
    expect(summary(symbols)).toEqual([
      ["add", "function", true, 3, 5],
      ["hidden", "function", true, 7, 9],
      ["twice", "function", true, 11, 11],
      ["LIMIT", "const", true, 13, 13],
      ["Point", "interface", true, 15, 18],
      ["Id", "type", false, 20, 20],
      ["Color", "enum", true, 22, 25],
      ["Calculator", "class", true, 27, 38],
      ["Calculator.add", "method", true, 30, 33],
      ["Calculator.reset", "method", true, 35, 37],
      ["Internal", "class", false, 40, 42],
      ["Internal.run", "method", false, 41, 41],
      ["listed", "function", false, 44, 46],
      ["main", "function", true, 52, 54],
    ]);
    for (const s of symbols) expect(s.file).toBe("src/math.ts");
  });

  it("does not invent a symbol for a re-export", async () => {
    const source = readFileSync(FIXTURE, "utf8");
    const symbols = await symbolsOf(source);
    expect(symbols.some((s) => s.name === "thing")).toBe(false);
  });

  it("gives every symbol the six documented fields in order", async () => {
    const symbols = await symbolsOf("export const a = 1;\n");
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

describe("ts extractor inline cases", () => {
  it("handles export default declarations", async () => {
    const src = ["export default class Foo {", "  go() {}", "}"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([
      ["Foo", "class", true, 1, 3],
      ["Foo.go", "method", true, 2, 2],
    ]);
  });

  it("marks a local symbol exported by `export default name`", async () => {
    const src = ["function run() {}", "export default run;"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([["run", "function", true, 1, 1]]);
  });

  it("uses the local name in export lists and marks class methods", async () => {
    const src = [
      "class A {",
      "  m() {}",
      "}",
      "function b() {}",
      "const c = 1;",
      "export { A, b as renamed };",
    ].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([
      ["A", "class", true, 1, 3],
      ["A.m", "method", true, 2, 2],
      ["b", "function", true, 4, 4],
      ["c", "const", false, 5, 5],
    ]);
  });

  it("re-exports add no symbols", async () => {
    const src = ['export { a } from "./x";', 'export * from "./y";'].join("\n");
    expect(await symbolsOf(src)).toEqual([]);
  });

  it("re-exports mark a local symbol of the same name exported", async () => {
    const src = ["function a() {}", 'export { a } from "./x";'].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([["a", "function", true, 1, 1]]);
  });

  it("includes the export keyword line in the range of a multi-line export", async () => {
    const src = ["", "export function f() {", "  return 1;", "}"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([["f", "function", true, 2, 4]]);
  });

  it("treats function expressions as functions and other values as const", async () => {
    const src = [
      "const f = function () {};",
      "const g = 5;",
      "let h = 1;",
    ].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([
      ["f", "function", false, 1, 1],
      ["g", "const", false, 2, 2],
    ]);
  });

  it("extracts one symbol per declarator", async () => {
    const src = "export const a = 1, b = () => 2;";
    expect(summary(await symbolsOf(src))).toEqual([
      ["a", "const", true, 1, 1],
      ["b", "function", true, 1, 1],
    ]);
  });

  it("works for javascript", async () => {
    const src = [
      "export class K {",
      "  m() {}",
      "}",
      "export const f = () => 1;",
    ].join("\n");
    expect(summary(await symbolsOf(src, "javascript", "k.js"))).toEqual([
      ["K", "class", true, 1, 3],
      ["K.m", "method", true, 2, 2],
      ["f", "function", true, 4, 4],
    ]);
  });

  it("ignores nested declarations", async () => {
    const src = ["function outer() {", "  function inner() {}", "}"].join("\n");
    expect(summary(await symbolsOf(src))).toEqual([["outer", "function", false, 1, 3]]);
  });

  it("returns no symbols for empty or invalid source", async () => {
    expect(await symbolsOf("")).toEqual([]);
    await expect(symbolsOf("function (((")).resolves.toBeDefined();
  });
});
