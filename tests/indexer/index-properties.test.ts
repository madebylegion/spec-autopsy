import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { indexRepo } from "../../src/indexer/index.js";
import type { CodeIndex } from "../../src/indexer/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(here, "../fixtures");

const snippets = [
  "export function f(a) { return a; }",
  "const g = () => 1;",
  "class A { m() {} }",
  "interface I { x: number }",
  "type T = string;",
  "enum E { X }",
  "export { f };",
  "def foo():",
  "    return 1",
  "@decorator",
  "class B:",
  "    def m(self): pass",
  "__all__ = ['foo']",
  "# comment",
  "// comment",
  "/* block */",
  "test('title', () => {});",
  "{{{ ((( \"unterminated",
  "",
];

const lineArb = fc.oneof(fc.constantFrom(...snippets), fc.fullUnicodeString({ maxLength: 40 }));
const textArb = fc
  .tuple(fc.array(lineArb, { maxLength: 12 }), fc.constantFrom("\n", "\r\n"), fc.boolean())
  .map(([lines, eol, trailing]) => lines.join(eol) + (trailing ? eol : ""));

async function indexTexts(tsText: string, pyText: string): Promise<CodeIndex> {
  const dir = mkdtempSync(join(tmpdir(), "index-prop-"));
  try {
    writeFileSync(join(dir, "a.ts"), tsText);
    writeFileSync(join(dir, "b.py"), pyText);
    return await indexRepo(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("indexRepo properties", () => {
  it("never throws on arbitrary text and every diagnostic is well formed", async () => {
    await fc.assert(
      fc.asyncProperty(textArb, textArb, async (tsText, pyText) => {
        const index = await indexTexts(tsText, pyText);
        for (const d of index.diagnostics) {
          expect(typeof d.code).toBe("string");
          expect(d.code.length).toBeGreaterThan(0);
          expect(typeof d.message).toBe("string");
          expect(d.message.length).toBeGreaterThan(0);
          expect(typeof d.file).toBe("string");
          expect(d.file.length).toBeGreaterThan(0);
        }
      }),
      { numRuns: 25 },
    );
  }, 120000);

  it("keeps every symbol line range within 1..lineCount", async () => {
    await fc.assert(
      fc.asyncProperty(textArb, textArb, async (tsText, pyText) => {
        const index = await indexTexts(tsText, pyText);
        for (const file of index.files) {
          for (const s of file.symbols) {
            expect(s.startLine).toBeGreaterThanOrEqual(1);
            expect(s.startLine).toBeLessThanOrEqual(s.endLine);
            expect(s.endLine).toBeLessThanOrEqual(file.lineCount);
          }
        }
      }),
      { numRuns: 25 },
    );
  }, 120000);

  it("gives deep-equal, identically serialised output for the same fixture twice", async () => {
    const first = await indexRepo(fixturesDir);
    const second = await indexRepo(fixturesDir);
    expect(first.files.length).toBeGreaterThan(0);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  }, 60000);

  it("sorts files by path and symbols by start line then name", async () => {
    const index = await indexRepo(fixturesDir);
    const paths = index.files.map((f) => f.path);
    expect(paths).toEqual([...paths].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    for (const file of index.files) {
      for (let i = 1; i < file.symbols.length; i++) {
        const prev = file.symbols[i - 1];
        const cur = file.symbols[i];
        if (prev === undefined || cur === undefined) continue;
        expect(prev.startLine <= cur.startLine).toBe(true);
        if (prev.startLine === cur.startLine) expect(prev.name <= cur.name).toBe(true);
      }
    }
  }, 60000);
});
