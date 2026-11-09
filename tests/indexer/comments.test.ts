import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractComments, extractTestCases } from "../../src/indexer/comments.js";
import { getParser, type LanguageName } from "../../src/indexer/grammar-loader.js";

async function parse(language: LanguageName, source: string) {
  const parser = await getParser(language);
  const tree = parser.parse(source);
  if (tree === null) throw new Error("parse returned null");
  return tree;
}

async function commentsOf(language: LanguageName, source: string) {
  const tree = await parse(language, source);
  try {
    return extractComments(tree, language);
  } finally {
    tree.delete();
  }
}

async function testCasesOf(language: LanguageName, source: string, isTest: boolean) {
  const tree = await parse(language, source);
  try {
    return extractTestCases(tree, language, isTest);
  } finally {
    tree.delete();
  }
}

describe("extractComments", () => {
  it("records // and block comments with start lines, not strings", async () => {
    const source = [
      "// first",
      'const s = "// not a comment";',
      "/* block",
      " still */",
      "const t = `/* nope */`; // trailing",
    ].join("\n");
    expect(await commentsOf("typescript", source)).toEqual([
      { line: 1, text: "// first" },
      { line: 3, text: "/* block\n still */" },
      { line: 5, text: "// trailing" },
    ]);
  });

  it("records # comments in Python, not strings", async () => {
    const source = ['# top', 'x = "# not"', "def f():  # trailing", "    pass"].join("\n");
    expect(await commentsOf("python", source)).toEqual([
      { line: 1, text: "# top" },
      { line: 3, text: "# trailing" },
    ]);
  });

  it("gives an empty list when there are no comments", async () => {
    expect(await commentsOf("javascript", "const a = 1;\n")).toEqual([]);
    expect(await commentsOf("python", "a = 1\n")).toEqual([]);
    expect(await commentsOf("typescript", "")).toEqual([]);
  });
});

describe("extractTestCases", () => {
  it("reads titles and lines from the ts-basic test fixture", async () => {
    const path = fileURLToPath(
      new URL("../fixtures/ts-basic/tests/math.test.ts", import.meta.url),
    );
    const source = readFileSync(path, "utf8");
    expect(await testCasesOf("typescript", source, true)).toEqual([
      { title: "math suite", line: 11 },
      { title: "adds numbers", line: 12 },
      { title: "subtracts numbers", line: 13 },
      { title: "template title", line: 16 },
    ]);
  });

  it("ignores it.each, test.skip, variables and templates with substitutions", async () => {
    const source = [
      "it.each([1])('a', () => {});",
      "test.skip('b', () => {});",
      "const v = 'c';",
      "it(v, () => {});",
      "it(`d ${v}`, () => {});",
      "it();",
      "it('kept', () => {});",
    ].join("\n");
    expect(await testCasesOf("javascript", source, true)).toEqual([
      { title: "kept", line: 7 },
    ]);
  });

  it("gives no test cases for a file that is not a test file", async () => {
    expect(await testCasesOf("typescript", "it('x', () => {});", false)).toEqual([]);
    expect(await testCasesOf("python", "def test_x():\n    pass\n", false)).toEqual([]);
  });

  it("reads test_ functions and methods in Python with the def line", async () => {
    const source = [
      "def helper():",
      "    pass",
      "",
      "@decorator",
      "def test_one():",
      "    pass",
      "",
      "class TestThing:",
      "    def test_method(self):",
      "        pass",
      "",
      "    def not_a_test(self):",
      "        pass",
      "",
      "async def test_async():",
      "    pass",
    ].join("\n");
    expect(await testCasesOf("python", source, true)).toEqual([
      { title: "test_one", line: 5 },
      { title: "test_method", line: 9 },
      { title: "test_async", line: 15 },
    ]);
  });

  it("reads the py-basic test fixture", async () => {
    const path = fileURLToPath(
      new URL("../fixtures/py-basic/tests/test_core.py", import.meta.url),
    );
    const source = readFileSync(path, "utf8");
    expect(await testCasesOf("python", source, true)).toEqual([
      { title: "test_public", line: 4 },
      { title: "test_other", line: 8 },
    ]);
  });
});
