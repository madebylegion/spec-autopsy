import type { FileIndex, Symbol as CodeSymbol, TestCase } from "../indexer/index.js";
import type { TagHit } from "./types.js";

/** Case-sensitive requirement tag, not directly preceded by a letter, digit or hyphen. */
export const TAG_PATTERN = /(?<![A-Za-z0-9-])[a-z0-9][a-z0-9-]*\/R\d+\.\d+/g;

/** Number of look-ahead lines after the end of a comment. */
const LOOK_AHEAD = 3;

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function countBreaks(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) n++;
  }
  return n;
}

/** All tags of a text with the number of line breaks before each one. */
export function findTags(text: string): { id: string; lineOffset: number }[] {
  const out: { id: string; lineOffset: number }[] = [];
  for (const match of text.matchAll(TAG_PATTERN)) {
    const index = match.index ?? 0;
    out.push({ id: match[0], lineOffset: countBreaks(text.slice(0, index)) });
  }
  return out;
}

function bySymbolOrder(a: CodeSymbol, b: CodeSymbol): number {
  return a.startLine - b.startLine || compareCodeUnits(a.name, b.name);
}

function innermostSymbol(symbols: CodeSymbol[], line: number): CodeSymbol | undefined {
  let best: CodeSymbol | undefined;
  for (const s of symbols) {
    if (s.startLine > line || s.endLine < line) continue;
    if (best === undefined) {
      best = s;
      continue;
    }
    const sizeS = s.endLine - s.startLine;
    const sizeB = best.endLine - best.startLine;
    if (
      sizeS < sizeB ||
      (sizeS === sizeB &&
        (s.startLine < best.startLine ||
          (s.startLine === best.startLine && compareCodeUnits(s.name, best.name) < 0)))
    ) {
      best = s;
    }
  }
  return best;
}

function symbolForTag(
  symbols: CodeSymbol[],
  tagLine: number,
  commentEnd: number,
): CodeSymbol | undefined {
  const inside = innermostSymbol(symbols, tagLine);
  if (inside !== undefined) return inside;
  return [...symbols]
    .sort(bySymbolOrder)
    .find((s) => s.startLine > commentEnd && s.startLine <= commentEnd + LOOK_AHEAD);
}

function byTestOrder(a: TestCase, b: TestCase): number {
  return a.line - b.line || compareCodeUnits(a.title, b.title);
}

function testCaseForTag(
  testCases: TestCase[],
  tagLine: number,
  commentEnd: number,
): TestCase | undefined {
  const sorted = [...testCases].sort(byTestOrder);
  const same = sorted.find((t) => t.line === tagLine);
  if (same !== undefined) return same;
  return sorted.find((t) => t.line > commentEnd && t.line <= commentEnd + LOOK_AHEAD);
}

/**
 * Every tag of a file with the symbol or test case it attaches to.
 * Pure. Tests only attach to test cases, non-test files only to symbols.
 */
export function tagsInFile(file: FileIndex): TagHit[] {
  const hits: TagHit[] = [];

  for (const comment of file.comments) {
    const commentEnd = comment.line + countBreaks(comment.text);
    for (const tag of findTags(comment.text)) {
      const line = comment.line + tag.lineOffset;
      if (file.isTest) {
        const testCase = testCaseForTag(file.testCases, line, commentEnd);
        hits.push({
          id: tag.id,
          file: file.path,
          line,
          target: testCase === undefined ? null : { kind: "test", testCase },
        });
      } else {
        const symbol = symbolForTag(file.symbols, line, commentEnd);
        hits.push({
          id: tag.id,
          file: file.path,
          line,
          target: symbol === undefined ? null : { kind: "symbol", symbol },
        });
      }
    }
  }

  if (file.isTest) {
    for (const testCase of file.testCases) {
      for (const tag of findTags(testCase.title)) {
        hits.push({
          id: tag.id,
          file: file.path,
          line: testCase.line,
          target: { kind: "test", testCase },
        });
      }
    }
  }

  return hits;
}
