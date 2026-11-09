import type { CodeIndex, FileIndex } from "../indexer/index.js";
import type { Diagnostic, Requirement } from "../parser/index.js";
import { classifyRequirement, findZombies, symbolKey } from "./classify.js";
import { overlapScore, overlaps, requirementTokens, symbolTokens, tokenise } from "./overlap.js";
import { tagsInFile } from "./tags.js";
import type {
  BodyMap,
  BodyMapDiagnostic,
  CodeLink,
  LastCommit,
  RequirementEntry,
  TestLink,
} from "./types.js";

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Working state of one requirement while linking. */
interface Work {
  req: Requirement;
  code: Map<string, CodeLink>;
  tests: Map<string, TestLink>;
  explicitCode: boolean;
  explicitTest: boolean;
}

function testKey(file: string, line: number, title: string): string {
  return `${file}\u0000${line}\u0000${title}`;
}

function dateRank(date: string): number {
  const t = Date.parse(date);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Newest first-history commit among the implementing files; ties go to the lowest path. */
function lastCommitOf(codeLinks: readonly CodeLink[], files: Map<string, FileIndex>): LastCommit | null {
  const paths = [...new Set(codeLinks.map((l) => l.file))].sort(compareCodeUnits);
  let best: { rank: number; commit: LastCommit } | null = null;
  for (const path of paths) {
    const first = files.get(path)?.history.commits[0];
    if (first === undefined) continue;
    const rank = dateRank(first.date);
    if (best === null || rank > best.rank) {
      best = {
        rank,
        commit: { date: first.date, subject: first.subject, author: first.author },
      };
    }
  }
  return best === null ? null : best.commit;
}

function compareLines(a: number | null, b: number | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a - b;
}

function compareDiagnostics(a: BodyMapDiagnostic, b: BodyMapDiagnostic): number {
  return (
    compareCodeUnits(a.file, b.file) ||
    compareLines(a.line, b.line) ||
    compareCodeUnits(a.code, b.code) ||
    compareCodeUnits(a.message, b.message) ||
    compareCodeUnits(a.source, b.source)
  );
}

/**
 * Joins requirements, the code index and the tests into a body map.
 * Pure and deterministic: tags first, then token overlap for requirements
 * without an explicit link on that side, then classification.
 */
export function link(
  requirements: readonly Requirement[],
  index: CodeIndex,
  parserDiagnostics: readonly Diagnostic[] = [],
): BodyMap {
  const works: Work[] = requirements.map((req) => ({
    req,
    code: new Map<string, CodeLink>(),
    tests: new Map<string, TestLink>(),
    explicitCode: false,
    explicitTest: false,
  }));

  // Tags attach to the first requirement that has the id.
  const firstById = new Map<string, Work>();
  for (const work of works) {
    if (!firstById.has(work.req.id)) firstById.set(work.req.id, work);
  }

  const linkerDiagnostics: BodyMapDiagnostic[] = [];
  const linkedSymbols = new Set<string>();

  // 1. Explicit tags.
  for (const file of index.files) {
    for (const hit of tagsInFile(file)) {
      const work = firstById.get(hit.id);
      if (work === undefined) {
        linkerDiagnostics.push({
          source: "linker",
          code: "unknown-requirement-tag",
          message: `Tag ${hit.id} names no known requirement.`,
          file: hit.file,
          line: hit.line,
        });
        continue;
      }
      if (hit.target === null) continue;
      if (hit.target.kind === "symbol") {
        const symbol = hit.target.symbol;
        const key = symbolKey(hit.file, symbol.startLine, symbol.name);
        work.explicitCode = true;
        linkedSymbols.add(key);
        if (!work.code.has(key)) {
          work.code.set(key, {
            symbol: symbol.name,
            file: hit.file,
            startLine: symbol.startLine,
            method: "tag",
            score: 1,
          });
        }
      } else {
        const testCase = hit.target.testCase;
        const key = testKey(hit.file, testCase.line, testCase.title);
        work.explicitTest = true;
        if (!work.tests.has(key)) {
          work.tests.set(key, {
            title: testCase.title,
            file: hit.file,
            line: testCase.line,
            method: "tag",
            score: 1,
          });
        }
      }
    }
  }

  // 2. Token overlap, per side, only where there is no explicit link.
  for (const work of works) {
    const reqTokens = requirementTokens(work.req);
    if (!work.explicitCode) {
      for (const file of index.files) {
        if (file.isTest) continue;
        for (const symbol of file.symbols) {
          const tokens = symbolTokens(symbol.name);
          if (!overlaps(reqTokens, tokens)) continue;
          const key = symbolKey(file.path, symbol.startLine, symbol.name);
          linkedSymbols.add(key);
          work.code.set(key, {
            symbol: symbol.name,
            file: file.path,
            startLine: symbol.startLine,
            method: "overlap",
            score: overlapScore(reqTokens, tokens),
          });
        }
      }
    }
    if (!work.explicitTest) {
      for (const file of index.files) {
        if (!file.isTest) continue;
        for (const testCase of file.testCases) {
          const tokens = tokenise(testCase.title);
          if (!overlaps(reqTokens, tokens)) continue;
          work.tests.set(testKey(file.path, testCase.line, testCase.title), {
            title: testCase.title,
            file: file.path,
            line: testCase.line,
            method: "overlap",
            score: overlapScore(reqTokens, tokens),
          });
        }
      }
    }
  }

  // 3. Classify and assemble.
  const filesByPath = new Map<string, FileIndex>();
  for (const file of index.files) {
    if (!filesByPath.has(file.path)) filesByPath.set(file.path, file);
  }

  const entries: RequirementEntry[] = works.map((work) => {
    const codeLinks = [...work.code.values()].sort(
      (a, b) =>
        compareCodeUnits(a.file, b.file) ||
        a.startLine - b.startLine ||
        compareCodeUnits(a.symbol, b.symbol),
    );
    const testLinks = [...work.tests.values()].sort(
      (a, b) =>
        compareCodeUnits(a.file, b.file) || a.line - b.line || compareCodeUnits(a.title, b.title),
    );
    return {
      id: work.req.id,
      status: classifyRequirement(codeLinks, testLinks),
      file: work.req.file,
      line: work.req.line,
      codeLinks,
      testLinks,
      lastCommit: lastCommitOf(codeLinks, filesByPath),
    };
  });

  const zombies = findZombies(index, linkedSymbols);

  const diagnostics: BodyMapDiagnostic[] = [
    ...parserDiagnostics.map(
      (d): BodyMapDiagnostic => ({
        source: "parser",
        code: d.code,
        message: d.message,
        file: d.file,
        line: d.line,
      }),
    ),
    ...index.diagnostics.map(
      (d): BodyMapDiagnostic => ({
        source: "indexer",
        code: d.code,
        message: d.message,
        file: d.file,
        line: null,
      }),
    ),
    ...linkerDiagnostics,
  ];
  diagnostics.sort(compareDiagnostics);

  let ghost = 0;
  let unproven = 0;
  let proven = 0;
  for (const entry of entries) {
    if (entry.status === "ghost") ghost++;
    else if (entry.status === "unproven") unproven++;
    else proven++;
  }

  return {
    root: index.root,
    requirements: entries,
    zombies,
    diagnostics,
    counts: {
      requirements: entries.length,
      ghost,
      unproven,
      proven,
      zombies: zombies.length,
    },
  };
}
