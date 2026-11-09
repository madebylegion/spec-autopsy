import { describe, expect, it } from "vitest";
import { getParser, languageForExtension } from "../../src/indexer/grammar-loader.js";
import type { LanguageName } from "../../src/indexer/grammar-loader.js";

const SNIPPETS: ReadonlyArray<readonly [LanguageName, string]> = [
  ["typescript", "const x: number = 1;"],
  ["tsx", "const el = <div>hi</div>;"],
  ["javascript", "const x = 1;"],
  ["python", "x = 1"],
];

describe("grammar loader", () => {
  for (const [language, snippet] of SNIPPETS) {
    it(`loads ${language} and parses a snippet without errors`, async () => {
      const parser = await getParser(language);
      const tree = parser.parse(snippet);
      expect(tree).not.toBeNull();
      expect(tree!.rootNode.hasError).toBe(false);
      tree!.delete();
    });
  }

  it("returns the same Parser instance on a second call", async () => {
    const a = await getParser("typescript");
    const b = await getParser("typescript");
    expect(b).toBe(a);
  });

  it("maps extensions to grammars", () => {
    expect(languageForExtension(".ts")).toBe("typescript");
    expect(languageForExtension(".tsx")).toBe("tsx");
    expect(languageForExtension(".js")).toBe("javascript");
    expect(languageForExtension(".jsx")).toBe("javascript");
    expect(languageForExtension(".mjs")).toBe("javascript");
    expect(languageForExtension(".cjs")).toBe("javascript");
    expect(languageForExtension(".py")).toBe("python");
    expect(languageForExtension(".md")).toBeUndefined();
    expect(languageForExtension("")).toBeUndefined();
    expect(languageForExtension("toString")).toBeUndefined();
  });
});
