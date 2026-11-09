import type { CodeIndex, FileIndex, KiroCommit } from "../indexer/index.js";
import type { Diagnostic, Requirement, TaskEntry } from "../parser/index.js";
import { classifyRequirement, findZombies, symbolKey } from "./classify.js";
import { commitHits, resolveTaskCommits, unknownTaskRequirements } from "./commit-links.js";
import { filterHitsByDesign } from "./design-filter.js";
import {
  NEAR_MISS,
  overlapScore,
  overlaps,
  requirementTokens,
  symbolTokens,
  tokenise,
} from "./overlap.js";
import { tagsInFile } from "./tags.js";
import type {
  BodyMap,
  BodyMapDiagnostic,
  CodeLink,
  LastCommit,
  LinkExtras,
  NearMiss,
  RequirementEntry,
  TestLink,
  Zombie,
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

/** One candidate for a near miss: the other side of the pair. */
interface Candidate {
  score: number;
  file: string;
  line: number;
  name: string;
}

/** True when `a` beats `b`: higher score, then lowest file, line, name by code unit. */
function beats(a: Candidate, b: Candidate): boolean {
  if (a.score !== b.score) return a.score > b.score;
  return (
    (compareCodeUnits(a.file, b.file) || a.line - b.line || compareCodeUnits(a.name, b.name)) < 0
  );
}

/**
 * The best near miss of a ghost: the non-test symbol whose name shares the
 * most words with the requirement. A ghost has no links, so no pair is linked.
 */
function ghostNearMiss(req: Requirement, index: CodeIndex): NearMiss | undefined {
  const reqTokens = requirementTokens(req);
  let best: Candidate | null = null;
  for (const file of index.files) {
    if (file.isTest) continue;
    for (const symbol of file.symbols) {
      const candidate: Candidate = {
        score: overlapScore(reqTokens, symbolTokens(symbol.name)),
        file: file.path,
        line: symbol.startLine,
        name: symbol.name,
      };
      if (best === null || beats(candidate, best)) best = candidate;
    }
  }
  if (best === null || best.score < NEAR_MISS) return undefined;
  return { requirementId: null, symbol: best.name, file: best.file, line: best.line, score: best.score };
}

/**
 * The best near miss of a zombie: the requirement whose words overlap its
 * name the most. A zombie is linked to nothing, so no pair is linked.
 */
function zombieNearMiss(zombie: Zombie, works: readonly Work[]): NearMiss | undefined {
  const tokens = symbolTokens(zombie.symbol);
  let best: Candidate | null = null;
  for (const work of works) {
    const candidate: Candidate = {
      score: overlapScore(requirementTokens(work.req), tokens),
      file: work.req.file,
      line: work.req.line,
      name: work.req.id,
    };
    if (best === null || beats(candidate, best)) best = candidate;
  }
  if (best === null || best.score < NEAR_MISS) return undefined;
  return { requirementId: best.name, symbol: null, file: best.file, line: best.line, score: best.score };
}

/**
 * Rule 4: the checked task with the lowest number that lists `id` and that a
 * resolved task commit names; among commits of that task the first in
 * `commits` order. Undefined when there is none.
 */
function contradictionOf(
  id: string,
  checked: ReadonlySet<string> | undefined,
  commits: readonly KiroCommit[] | undefined,
  resolved: ReadonlyMap<string, TaskEntry>,
): { task: number; commit: string } | undefined {
  if (checked === undefined || commits === undefined) return undefined;
  let best: { task: number; commit: string } | undefined;
  for (const commit of commits) {
    const task = resolved.get(commit.sha);
    if (task === undefined) continue;
    if (!checked.has(`${task.spec}#${task.number}`)) continue;
    if (!task.requirements.some((ref) => ref.id === id)) continue;
    if (best === undefined || task.number < best.task) {
      best = { task: task.number, commit: commit.sha };
    }
  }
  return best;
}

/**
 * Joins requirements, the code index and the tests into a body map.
 * Pure and deterministic: commit links first (design symbol filter), then
 * tags, then token overlap for requirements without an explicit link on that
 * side, then classification (test-only tasks, defect descriptions, doubtful
 * ghosts). `extras` carries data read elsewhere; without it the result is the
 * one `link` gave before those rules.
 */
export function link(
  requirements: readonly Requirement[],
  index: CodeIndex,
  parserDiagnostics: readonly Diagnostic[] = [],
  tasks: readonly TaskEntry[] = [],
  extras: LinkExtras = {},
): BodyMap {
  const works: Work[] = requirements.map((req) => ({
    req,
    code: new Map<string, CodeLink>(),
    tests: new Map<string, TestLink>(),
    explicitCode: false,
    explicitTest: false,
  }));

  // Tags and commit links attach to the first requirement that has the id.
  const firstById = new Map<string, Work>();
  for (const work of works) {
    if (!firstById.has(work.req.id)) firstById.set(work.req.id, work);
  }

  // Rule 3: a defect description stays known to ids but is not part of the verdict.
  const active = works.filter((work) => work.req.defectDescription !== true);

  const linkerDiagnostics: BodyMapDiagnostic[] = [];
  const linkedSymbols = new Set<string>();
  const testOnlyShas: ReadonlySet<string> = new Set(index.testOnlyCommits ?? []);
  const testOnlyOf = new Map<Work, string>();

  // 0. Commit links: commit, then task, then requirement ids, then the lines it owns.
  linkerDiagnostics.push(...unknownTaskRequirements(tasks, new Set(firstById.keys())));
  const resolved = resolveTaskCommits(index.kiroCommits, tasks);
  const hits = filterHitsByDesign(commitHits(index, resolved), extras.designTexts);
  for (const hit of hits) {
    for (const ref of hit.task.requirements) {
      const work = firstById.get(ref.id);
      if (work === undefined) continue;
      if (hit.kind === "symbol") {
        const key = symbolKey(hit.file, hit.symbol.startLine, hit.symbol.name);
        work.explicitCode = true;
        linkedSymbols.add(key);
        if (!work.code.has(key)) {
          work.code.set(key, {
            symbol: hit.symbol.name,
            file: hit.file,
            startLine: hit.symbol.startLine,
            method: "commit",
            score: 1,
            commit: hit.sha,
          });
        }
      } else {
        const key = testKey(hit.file, hit.testCase.line, hit.testCase.title);
        work.explicitTest = true;
        if (testOnlyShas.has(hit.sha) && !testOnlyOf.has(work)) testOnlyOf.set(work, hit.sha);
        if (!work.tests.has(key)) {
          work.tests.set(key, {
            title: hit.testCase.title,
            file: hit.file,
            line: hit.testCase.line,
            method: "commit",
            score: 1,
            commit: hit.sha,
          });
        }
      }
    }
  }

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
  for (const work of active) {
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

  for (const work of works) {
    if (work.req.defectDescription !== true) continue;
    linkerDiagnostics.push({
      source: "linker",
      code: "defect-description",
      message: `${work.req.id}: describes the current defect, not a behavior to build; left out of the verdict.`,
      file: work.req.file,
      line: work.req.line,
    });
  }

  const entries: RequirementEntry[] = active.map((work) => {
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
    const entry: RequirementEntry = {
      id: work.req.id,
      status: classifyRequirement(codeLinks, testLinks),
      file: work.req.file,
      line: work.req.line,
      codeLinks,
      testLinks,
      lastCommit: lastCommitOf(codeLinks, filesByPath),
    };
    const testOnlySha = testOnlyOf.get(work);
    if (codeLinks.length === 0 && testOnlySha !== undefined) {
      // Rule 2: built by a test-only task, so there is no code to link.
      entry.status = "proven";
      entry.testOnlyCommit = testOnlySha;
      linkerDiagnostics.push({
        source: "linker",
        code: "test-only-task",
        message: `${work.req.id}: implemented by test-only task commit ${testOnlySha.slice(0, 7)}`,
        file: work.req.file,
        line: work.req.line,
      });
    }
    if (entry.status === "ghost") {
      const nearMiss = ghostNearMiss(work.req, index);
      if (nearMiss !== undefined) entry.nearMiss = nearMiss;
      const contradiction = contradictionOf(
        work.req.id,
        extras.checkedTasks,
        index.kiroCommits,
        resolved,
      );
      if (contradiction !== undefined) entry.contradiction = contradiction;
    }
    return entry;
  });

  const zombies = findZombies(index, linkedSymbols).map((zombie): Zombie => {
    const nearMiss = zombieNearMiss(zombie, active);
    return nearMiss === undefined ? zombie : { ...zombie, nearMiss };
  });

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
