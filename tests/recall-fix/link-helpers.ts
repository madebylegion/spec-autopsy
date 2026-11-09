import type {
  BlameRange,
  CodeIndex,
  FileIndex,
  KiroCommit,
  Symbol as CodeSymbol,
  TestCase,
} from "../../src/indexer/index.js";
import type { Requirement, TaskEntry } from "../../src/parser/index.js";

export const SHA_A = "a".repeat(40);
export const SHA_B = "b".repeat(40);
export const SHA_C = "c".repeat(40);

/** A requirement whose words share nothing with the symbol and test names used in these tests. */
export function neutral(id: string, line = 1, extra: Partial<Requirement> = {}): Requirement {
  return {
    id,
    pattern: "ubiquitous",
    system: "engine",
    response: "idle quietly",
    file: ".kiro/specs/spec/requirements.md",
    line,
    ...extra,
  };
}

export function words(id: string, system: string, response: string, line = 1): Requirement {
  return { id, pattern: "ubiquitous", system, response, file: ".kiro/specs/spec/requirements.md", line };
}

export function task(
  spec: string,
  number: number,
  title: string,
  requirements: [string, number][],
  line = 1,
): TaskEntry {
  return {
    spec,
    number,
    title,
    file: `.kiro/specs/${spec}/tasks.md`,
    line,
    requirements: requirements.map(([id, l]) => ({ id, line: l })),
  };
}

export function sym(
  name: string,
  startLine: number,
  endLine: number,
  kind: CodeSymbol["kind"] = "function",
  exported = true,
  path = "src/a.ts",
): CodeSymbol {
  return { name, kind, exported, startLine, endLine, file: path };
}

export function file(path: string, partial: Partial<FileIndex> = {}): FileIndex {
  return {
    path,
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

export function testFile(path: string, testCases: TestCase[], partial: Partial<FileIndex> = {}): FileIndex {
  return file(path, { isTest: true, testCases, ...partial });
}

export function index(
  files: FileIndex[],
  kiroCommits?: KiroCommit[],
  testOnlyCommits?: string[],
): CodeIndex {
  const idx: CodeIndex = { root: "/repo", files, diagnostics: [] };
  if (kiroCommits !== undefined) idx.kiroCommits = kiroCommits;
  if (testOnlyCommits !== undefined) idx.testOnlyCommits = testOnlyCommits;
  return idx;
}

export function owned(sha: string, startLine: number, endLine: number): BlameRange {
  return { startLine, endLine, sha };
}

export const COMMIT_A: KiroCommit = { sha: SHA_A, subject: "kiro: spec task 1 Do it" };
export const TASK_1 = task("spec", 1, "Do it", [["spec/R1.1", 7]], 3);
