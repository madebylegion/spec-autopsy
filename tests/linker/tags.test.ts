import { describe, expect, it } from "vitest";
import type { FileIndex, Symbol as CodeSymbol, TestCase } from "../../src/indexer/index.js";
import { findTags, tagsInFile, TAG_PATTERN } from "../../src/linker/tags.js";

function sym(name: string, startLine: number, endLine: number, kind: CodeSymbol["kind"] = "function"): CodeSymbol {
  return { name, kind, exported: true, startLine, endLine, file: "src/a.ts" };
}

function file(partial: Partial<FileIndex>): FileIndex {
  return {
    path: "src/a.ts",
    language: "typescript",
    isTest: false,
    lineCount: 100,
    symbols: [],
    comments: [],
    testCases: [],
    history: { commits: [], commitCount: 0, authors: [] },
    ...partial,
  };
}

function testFile(testCases: TestCase[], comments: FileIndex["comments"]): FileIndex {
  return file({ path: "tests/a.test.ts", isTest: true, testCases, comments });
}

describe("findTags", () => {
  it("finds tags with line offsets", () => {
    expect(findTags("a linker/R1.1\nb\nspec-x/R12.34 end")).toEqual([
      { id: "linker/R1.1", lineOffset: 0 },
      { id: "spec-x/R12.34", lineOffset: 2 },
    ]);
  });

  it("is case sensitive", () => {
    expect(findTags("Linker/R1.1 linker/r1.1 linker/R1")).toEqual([]);
  });

  it("requires a left boundary", () => {
    expect(findTags("Xlinker/R1.1")).toEqual([]);
    expect(findTags("-linker/R1.1")).toEqual([]);
    expect(findTags("(linker/R1.1)")).toEqual([{ id: "linker/R1.1", lineOffset: 0 }]);
  });

  it("can be called repeatedly (no shared regex state)", () => {
    expect(TAG_PATTERN.global).toBe(true);
    expect(findTags("linker/R1.1")).toHaveLength(1);
    expect(findTags("linker/R1.1")).toHaveLength(1);
  });
});

describe("tagsInFile: non-test files", () => {
  it("attaches a tag inside a symbol range", () => {
    const f = file({
      symbols: [sym("foo", 3, 8)],
      comments: [{ line: 5, text: "// linker/R1.1" }],
    });
    const hits = tagsInFile(f);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "linker/R1.1", file: "src/a.ts", line: 5 });
    expect(hits[0]?.target).toEqual({ kind: "symbol", symbol: sym("foo", 3, 8) });
  });

  it("picks the innermost symbol (method inside class)", () => {
    const cls = sym("A", 1, 20, "class");
    const method = sym("A.m", 5, 10, "method");
    const f = file({
      symbols: [cls, method],
      comments: [{ line: 7, text: "// linker/R1.1" }],
    });
    expect(tagsInFile(f)[0]?.target).toEqual({ kind: "symbol", symbol: method });
  });

  it("attaches a JSDoc right above a declaration", () => {
    const f = file({
      symbols: [sym("foo", 2, 5)],
      comments: [{ line: 1, text: "/** linker/R2.1 */" }],
    });
    expect(tagsInFile(f)[0]?.target).toEqual({ kind: "symbol", symbol: sym("foo", 2, 5) });
  });

  it("attaches a JSDoc above a method to the enclosing class", () => {
    const cls = sym("A", 1, 20, "class");
    const method = sym("A.m", 6, 10, "method");
    const f = file({
      symbols: [cls, method],
      comments: [{ line: 5, text: "/** linker/R1.1 */" }],
    });
    expect(tagsInFile(f)[0]?.target).toEqual({ kind: "symbol", symbol: cls });
  });

  it("attaches to nothing when the symbol is more than 3 lines below", () => {
    const near = file({
      symbols: [sym("foo", 4, 6)],
      comments: [{ line: 1, text: "// linker/R1.1" }],
    });
    expect(tagsInFile(near)[0]?.target).not.toBeNull();
    const far = file({
      symbols: [sym("foo", 5, 6)],
      comments: [{ line: 1, text: "// linker/R1.1" }],
    });
    const hits = tagsInFile(far);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.target).toBeNull();
  });

  it("does not attach to a symbol above the comment", () => {
    const f = file({
      symbols: [sym("foo", 1, 3)],
      comments: [{ line: 5, text: "// linker/R1.1" }],
    });
    expect(tagsInFile(f)[0]?.target).toBeNull();
  });

  it("counts lines in multi-line block comments", () => {
    const text = "/*\n * a\n * linker/R1.3\n */";
    const attached = file({
      symbols: [sym("foo", 16, 20)],
      comments: [{ line: 10, text }],
    });
    const hits = tagsInFile(attached);
    expect(hits[0]?.line).toBe(12);
    // comment ends on line 13, so a symbol starting on line 16 is still in reach
    expect(hits[0]?.target).toEqual({ kind: "symbol", symbol: sym("foo", 16, 20) });

    const tooFar = file({
      symbols: [sym("foo", 17, 20)],
      comments: [{ line: 10, text }],
    });
    expect(tagsInFile(tooFar)[0]?.target).toBeNull();
  });

  it("finds several tags in one comment on their own lines", () => {
    const f = file({
      symbols: [sym("foo", 4, 9)],
      comments: [{ line: 1, text: "/*\n linker/R1.1\n linker/R1.2\n */" }],
    });
    const hits = tagsInFile(f);
    expect(hits.map((h) => [h.id, h.line])).toEqual([
      ["linker/R1.1", 2],
      ["linker/R1.2", 3],
    ]);
  });

  it("does not treat a bad left boundary as a tag", () => {
    const f = file({
      symbols: [sym("foo", 1, 5)],
      comments: [{ line: 2, text: "// Xlinker/R1.1" }],
    });
    expect(tagsInFile(f)).toEqual([]);
  });

  it("does not attach to test cases of a non-test file", () => {
    const f = file({
      comments: [{ line: 1, text: "// linker/R1.1" }],
      testCases: [{ title: "x", line: 2 }],
    });
    expect(tagsInFile(f)[0]?.target).toBeNull();
  });
});

describe("tagsInFile: test files", () => {
  it("attaches a comment on the same line as a test case", () => {
    const tc = { title: "works", line: 4 };
    const f = testFile([tc], [{ line: 4, text: "// linker/R1.1" }]);
    expect(tagsInFile(f)[0]?.target).toEqual({ kind: "test", testCase: tc });
  });

  it("attaches a comment 3 lines before a test case, not 4", () => {
    const tc = { title: "works", line: 8 };
    const hit = tagsInFile(testFile([tc], [{ line: 5, text: "// linker/R1.1" }]))[0];
    expect(hit?.target).toEqual({ kind: "test", testCase: tc });
    const miss = tagsInFile(testFile([tc], [{ line: 4, text: "// linker/R1.1" }]))[0];
    expect(miss?.target).toBeNull();
  });

  it("attaches a tag in a title to its own test case", () => {
    const tc = { title: "linker/R2.2 does the thing", line: 9 };
    const hits = tagsInFile(testFile([tc], []));
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ id: "linker/R2.2", file: "tests/a.test.ts", line: 9 });
    expect(hits[0]?.target).toEqual({ kind: "test", testCase: tc });
  });

  it("never attaches to symbols of a test file", () => {
    const f = file({
      path: "tests/a.test.ts",
      isTest: true,
      symbols: [sym("helper", 1, 10)],
      comments: [{ line: 3, text: "// linker/R1.1" }],
    });
    const hits = tagsInFile(f);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.target).toBeNull();
  });

  it("returns unknown ids as plain hits", () => {
    const tc = { title: "works", line: 2 };
    const hits = tagsInFile(testFile([tc], [{ line: 1, text: "// nosuch/R9.9" }]));
    expect(hits[0]).toMatchObject({ id: "nosuch/R9.9" });
    expect(hits[0]?.target).toEqual({ kind: "test", testCase: tc });
  });
});
