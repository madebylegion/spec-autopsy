import type {
  BlameRange,
  CodeIndex,
  KiroCommit,
  Symbol as CodeSymbol,
  TestCase,
} from "../indexer/index.js";
import { matchTaskCommitSubject } from "../parser/index.js";
import type { TaskEntry } from "../parser/index.js";
import type { BodyMapDiagnostic } from "./types.js";

/** A symbol or test case whose first line was written by a resolved task commit. */
export type CommitHit =
  | { kind: "symbol"; file: string; symbol: CodeSymbol; sha: string; task: TaskEntry }
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
 * Every non-test symbol and every test case whose start line is owned by a
 * resolved task commit, in index order. Pure.
 */
export function commitHits(
  index: CodeIndex,
  resolved: ReadonlyMap<string, TaskEntry>,
): CommitHit[] {
  const hits: CommitHit[] = [];
  if (resolved.size === 0) return hits;
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
        const sha = ownerAt(file.blame, symbol.startLine);
        const task = sha === undefined ? undefined : resolved.get(sha);
        if (sha !== undefined && task !== undefined) {
          hits.push({ kind: "symbol", file: file.path, symbol, sha, task });
        }
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
