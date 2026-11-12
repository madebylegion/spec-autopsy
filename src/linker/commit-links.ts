import type {
  BlameRange,
  CodeIndex,
  KiroCommit,
  Symbol as CodeSymbol,
  TestCase,
} from "../indexer/index.js";
import { matchTaskCommitSubject } from "../parser/index.js";
import type { TaskEntry } from "../parser/index.js";
import { isNamedInDesign } from "./design-filter.js";
import type { BodyMapDiagnostic } from "./types.js";

/**
 * A symbol or test case that a resolved task commit wrote (its first line is
 * owned by the commit) or, for a symbol with `modified: true`, changed inside
 * (rule 6: it owns a line of the symbol other than the first, and the design
 * of the task's spec names the symbol).
 */
export type CommitHit =
  | { kind: "symbol"; file: string; symbol: CodeSymbol; sha: string; task: TaskEntry; modified?: true }
  | { kind: "test"; file: string; testCase: TestCase; sha: string; task: TaskEntry };

/**
 * Maps the SHA of every task commit that resolves to exactly one task onto
 * that task. Commits that match no task, several tasks or no subject form
 * are left out. Pure.
 */
export function resolveTaskCommits(
  commits: readonly KiroCommit[] | undefined,
  tasks: readonly TaskEntry[],
): Map<string, TaskEntry> {
  const resolved = new Map<string, TaskEntry>();
  if (commits === undefined || tasks.length === 0) return resolved;
  for (const commit of commits) {
    const subject = matchTaskCommitSubject(commit.subject);
    if (subject === null) continue;
    let candidates: TaskEntry[];
    if (subject.spec !== null) {
      candidates = tasks.filter((t) => t.spec === subject.spec && t.number === subject.number);
    } else {
      const title = subject.title.trim().toLowerCase();
      candidates = tasks.filter(
        (t) => t.number === subject.number && t.title.trim().toLowerCase() === title,
      );
    }
    const only = candidates.length === 1 ? candidates[0] : undefined;
    if (only !== undefined) resolved.set(commit.sha, only);
  }
  return resolved;
}

/** The SHA whose blame range contains `line`, or undefined. Tolerates missing data. */
export function ownerAt(blame: readonly BlameRange[] | undefined, line: number): string | undefined {
  if (blame === undefined) return undefined;
  for (const range of blame) {
    if (line >= range.startLine && line <= range.endLine) return range.sha;
  }
  return undefined;
}

/**
 * Every distinct SHA whose blame range intersects the lines `start` to `end`
 * (inclusive), in blame order. Tolerates missing data.
 */
function ownersInRange(
  blame: readonly BlameRange[] | undefined,
  start: number,
  end: number,
): string[] {
  const out: string[] = [];
  if (blame === undefined) return out;
  for (const range of blame) {
    if (range.startLine <= end && range.endLine >= start && !out.includes(range.sha)) {
      out.push(range.sha);
    }
  }
  return out;
}

/**
 * Every non-test symbol and every test case whose start line is owned by a
 * resolved task commit, in index order. Pure.
 *
 * Rule 6 (modified symbols): a non-test symbol is also a hit, marked
 * `modified: true`, for every other resolved task commit that owns at least
 * one line of [startLine, endLine] in the blame, when `designTexts` has a text
 * for the commit's spec and that text names the symbol (`isNamedInDesign`).
 * Without a design text there is no modified hit. The hits of one symbol
 * follow the order of the commits in `index.kiroCommits`.
 */
export function commitHits(
  index: CodeIndex,
  resolved: ReadonlyMap<string, TaskEntry>,
  designTexts?: ReadonlyMap<string, string>,
): CommitHit[] {
  const hits: CommitHit[] = [];
  if (resolved.size === 0) return hits;
  const rank = new Map<string, number>();
  for (const commit of index.kiroCommits ?? []) {
    if (!rank.has(commit.sha)) rank.set(commit.sha, rank.size);
  }
  const rankOf = (sha: string): number => rank.get(sha) ?? Number.MAX_SAFE_INTEGER;
  for (const file of index.files) {
    if (file.blame === undefined) continue;
    if (file.isTest) {
      for (const testCase of file.testCases) {
        const sha = ownerAt(file.blame, testCase.line);
        const task = sha === undefined ? undefined : resolved.get(sha);
        if (sha !== undefined && task !== undefined) {
          hits.push({ kind: "test", file: file.path, testCase, sha, task });
        }
      }
    } else {
      for (const symbol of file.symbols) {
        const startSha = ownerAt(file.blame, symbol.startLine);
        const own: CommitHit[] = [];
        const startTask = startSha === undefined ? undefined : resolved.get(startSha);
        if (startSha !== undefined && startTask !== undefined) {
          own.push({ kind: "symbol", file: file.path, symbol, sha: startSha, task: startTask });
        }
        if (designTexts !== undefined && designTexts.size > 0) {
          const end = Math.max(symbol.startLine, symbol.endLine);
          for (const sha of ownersInRange(file.blame, symbol.startLine, end)) {
            if (sha === startSha) continue;
            const task = resolved.get(sha);
            if (task === undefined) continue;
            const text = designTexts.get(task.spec);
            if (text === undefined || !isNamedInDesign(text, symbol.name)) continue;
            own.push({ kind: "symbol", file: file.path, symbol, sha, task, modified: true });
          }
        }
        if (own.length > 1) own.sort((a, b) => rankOf(a.sha) - rankOf(b.sha));
        hits.push(...own);
      }
    }
  }
  return hits;
}

/** One diagnostic per task and requirement ID that names no known requirement. */
export function unknownTaskRequirements(
  tasks: readonly TaskEntry[],
  knownIds: ReadonlySet<string>,
): BodyMapDiagnostic[] {
  const out: BodyMapDiagnostic[] = [];
  for (const task of tasks) {
    for (const ref of task.requirements) {
      if (knownIds.has(ref.id)) continue;
      out.push({
        source: "linker",
        code: "unknown-task-requirement",
        message: `Task ${task.number} of ${task.spec} lists ${ref.id}, which names no known requirement.`,
        file: task.file,
        line: ref.line,
      });
    }
  }
  return out;
}
