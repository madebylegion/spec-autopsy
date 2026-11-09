import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Tree } from "web-tree-sitter";
import { extractComments, extractTestCases } from "./comments.js";
import { isShallow, readBlame, readKiroCommits, readTestOnlyCommits } from "./git-blame.js";
import { readGitHistory } from "./git-history.js";
import { getParser, languageForExtension } from "./grammar-loader.js";
import { extractPy } from "./py-extractor.js";
import { extractTs } from "./ts-extractor.js";
import type {
  BlameRange,
  CodeIndex,
  CommentEntry,
  FileIndex,
  GitHistory,
  IndexDiagnostic,
  KiroCommit,
  Symbol as CodeSymbol,
  TestCase,
} from "./types.js";
import { walkRepo } from "./walker.js";

export type {
  BlameRange,
  CodeIndex,
  CommentEntry,
  FileIndex,
  GitCommit,
  GitHistory,
  IndexDiagnostic,
  KiroCommit,
  Symbol,
  SymbolKind,
  TestCase,
} from "./types.js";

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Number of lines of a text; an empty text has 0 lines, a final newline adds none. */
function countLines(text: string): number {
  if (text === "") return 0;
  const parts = text.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts.length;
}

function clampSymbols(symbols: CodeSymbol[], lineCount: number): CodeSymbol[] {
  const max = Math.max(lineCount, 1);
  return symbols
    .map((s) => {
      const startLine = Math.min(Math.max(s.startLine, 1), max);
      const endLine = Math.min(Math.max(s.endLine, startLine), max);
      return {
        name: s.name,
        kind: s.kind,
        exported: s.exported,
        startLine,
        endLine,
        file: s.file,
      };
    })
    .sort((a, b) => a.startLine - b.startLine || compareCodeUnits(a.name, b.name));
}

function emptyHistory(): GitHistory {
  return { commits: [], commitCount: 0, authors: [] };
}

function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot <= 0 ? "" : name.slice(dot);
}

/**
 * Builds the code index of a repository. Deterministic and total: it never
 * throws; every problem becomes a diagnostic.
 */
export async function indexRepo(root: string): Promise<CodeIndex> {
  const diagnostics: IndexDiagnostic[] = [];
  const files: FileIndex[] = [];

  let walked: Awaited<ReturnType<typeof walkRepo>>;
  try {
    walked = await walkRepo(root);
  } catch (error) {
    return {
      root,
      files: [],
      diagnostics: [
        { code: "unreadable-directory", message: describeError(error), file: "." },
      ],
    };
  }
  diagnostics.push(...walked.diagnostics);

  // Task commits: only in a full (not shallow) repository with a `kiro:` commit.
  let kiroCommits: KiroCommit[] | undefined;
  try {
    if (!(await isShallow(root))) {
      const found = await readKiroCommits(root);
      if (found.length > 0) kiroCommits = found;
    }
  } catch {
    kiroCommits = undefined;
  }

  // Task commits that change test files only.
  let testOnlyCommits: string[] | undefined;
  if (kiroCommits !== undefined) {
    try {
      const found = await readTestOnlyCommits(
        root,
        kiroCommits.map((c) => c.sha),
      );
      if (found.length > 0) testOnlyCommits = found;
    } catch {
      testOnlyCommits = undefined;
    }
  }

  for (const entry of walked.files) {
    const language = languageForExtension(extensionOf(entry.path));
    if (language === undefined) continue;

    let text: string;
    try {
      text = await readFile(join(root, entry.path), "utf8");
    } catch (error) {
      diagnostics.push({
        code: "unreadable-file",
        message: `Cannot read file: ${describeError(error)}`,
        file: entry.path,
      });
      continue;
    }

    const lineCount = countLines(text);
    let symbols: CodeSymbol[] = [];
    let comments: CommentEntry[] = [];
    let testCases: TestCase[] = [];

    let parser;
    try {
      parser = await getParser(language);
    } catch (error) {
      diagnostics.push({
        code: "grammar-unavailable",
        message: `Grammar ${language} unavailable: ${describeError(error)}`,
        file: entry.path,
      });
    }

    if (parser !== undefined) {
      let tree: Tree | null = null;
      try {
        tree = parser.parse(text);
        if (tree === null) {
          diagnostics.push({
            code: "parse-failed",
            message: "The parser returned no syntax tree",
            file: entry.path,
          });
        } else {
          const extractedSymbols =
            language === "python" ? extractPy(tree, entry.path) : extractTs(tree, entry.path);
          const extractedComments = extractComments(tree, language);
          const extractedTests = extractTestCases(tree, language, entry.isTest);
          symbols = extractedSymbols;
          comments = extractedComments;
          testCases = extractedTests;
        }
      } catch (error) {
        symbols = [];
        comments = [];
        testCases = [];
        diagnostics.push({
          code: "parse-failed",
          message: `Parsing or extraction failed: ${describeError(error)}`,
          file: entry.path,
        });
      } finally {
        try {
          tree?.delete();
        } catch {
          // freeing WASM memory is best effort
        }
      }
    }

    let history = emptyHistory();
    try {
      history = await readGitHistory(root, entry.path);
    } catch {
      history = emptyHistory();
    }

    let blame: BlameRange[] | undefined;
    if (kiroCommits !== undefined) {
      try {
        const ranges = await readBlame(root, entry.path);
        if (ranges !== undefined && ranges.length > 0) blame = ranges;
      } catch {
        blame = undefined;
      }
    }

    const file: FileIndex = {
      path: entry.path,
      language,
      isTest: entry.isTest,
      lineCount,
      symbols: clampSymbols(symbols, lineCount),
      comments,
      testCases,
      history,
    };
    if (blame !== undefined) file.blame = blame;
    files.push(file);
  }

  files.sort((a, b) => compareCodeUnits(a.path, b.path));
  diagnostics.sort(
    (a, b) =>
      compareCodeUnits(a.file, b.file) ||
      compareCodeUnits(a.code, b.code) ||
      compareCodeUnits(a.message, b.message),
  );
  const result: CodeIndex = { root, files, diagnostics };
  if (kiroCommits !== undefined) result.kiroCommits = kiroCommits;
  if (testOnlyCommits !== undefined) result.testOnlyCommits = testOnlyCommits;
  return result;
}
