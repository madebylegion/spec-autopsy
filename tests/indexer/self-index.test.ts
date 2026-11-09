import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { indexRepo } from "../../src/indexer/index.js";
import type { CodeIndex } from "../../src/indexer/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("self-index of src/parser", () => {
  let index: CodeIndex;

  beforeAll(async () => {
    index = await indexRepo(repoRoot);
  }, 120000);

  it("contains the parser source files", () => {
    const paths = index.files.map((f) => f.path);
    expect(paths).toContain("src/parser/statement-parser.ts");
    expect(paths).toContain("src/parser/requirement-parser.ts");
  });

  it("lists parseRequirementsText as an exported function", () => {
    const file = index.files.find((f) => f.path === "src/parser/requirement-parser.ts");
    expect(file).toBeDefined();
    const symbol = file?.symbols.find((s) => s.name === "parseRequirementsText");
    expect(symbol).toBeDefined();
    expect(symbol?.kind).toBe("function");
    expect(symbol?.exported).toBe(true);
    expect(symbol?.file).toBe("src/parser/requirement-parser.ts");
  });

  it("has no diagnostics for the parser files", () => {
    const parserDiagnostics = index.diagnostics.filter((d) => d.file.startsWith("src/parser/"));
    expect(parserDiagnostics).toEqual([]);
  });

  it("is not a test file and has no test cases for parser sources", () => {
    const file = index.files.find((f) => f.path === "src/parser/statement-parser.ts");
    expect(file?.isTest).toBe(false);
    expect(file?.testCases).toEqual([]);
    expect(file?.language).toBe("typescript");
  });
});
