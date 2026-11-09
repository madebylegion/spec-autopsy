# Design Document

## Overview

`indexRepo(root)` walks the repository, parses each source file with web-tree-sitter, extracts symbols, comments and test cases with one extractor per language family, reads git history, and returns one `CodeIndex`. The indexer is the second organ: it may import from `src/parser` but never from the linker, report, mcp or ui.

Flow: walker (sorted file list, `isTest`) -> read file -> grammar loader -> extractor (TS/JS or Python) -> git history -> assemble, sort, return.

## Types (`src/indexer/types.ts`)

```ts
export type SymbolKind =
  | "function" | "class" | "method" | "interface" | "type" | "enum" | "const";

export interface Symbol {
  name: string;          // "Class.method" for methods
  kind: SymbolKind;
  exported: boolean;
  startLine: number;     // 1-based, inclusive
  endLine: number;       // 1-based, inclusive
  file: string;          // project-relative, "/" separators
}

export interface CommentEntry { line: number; text: string }
export interface TestCase { title: string; line: number }

export interface GitCommit {
  sha: string;
  author: string;
  date: string;          // ISO 8601
  subject: string;
}

export interface GitHistory {
  commits: GitCommit[];  // newest first, at most 5
  commitCount: number;   // total commits touching the file
  authors: string[];     // distinct, sorted
}

export interface FileIndex {
  path: string;
  language: "typescript" | "tsx" | "javascript" | "python";
  isTest: boolean;
  lineCount: number;
  symbols: Symbol[];
  comments: CommentEntry[];
  testCases: TestCase[];
  history: GitHistory;
}

export interface IndexDiagnostic { code: string; message: string; file: string }

export interface CodeIndex {
  root: string;
  files: FileIndex[];
  diagnostics: IndexDiagnostic[];
}
```

Diagnostic codes: `unreadable-directory`, `unreadable-file`, `parse-failed`, `grammar-unavailable`. Key order in every object is the order written above; builders construct objects literally in that order so JSON output is stable.

## Module layout (`src/indexer/`)

- `types.ts`: the types above.
- `grammar-loader.ts`: `languageForExtension(ext)`; `getParser(language)`, async, lazy, caches one `Parser` per language. Calls `Parser.init()` once (cached promise). Resolves the grammar with `createRequire(import.meta.url).resolve("tree-sitter-wasms/out/tree-sitter-<lang>.wasm")`, then `Language.load`, `new Parser()`, `parser.setLanguage`. Failures are cached and surface as `grammar-unavailable`.
- `ts-extractor.ts`: `extractTs(tree, file)` returns symbols for TS, TSX and JS. Walks `root.namedChildren`; unwraps `export_statement` (setting exported, taking line range from the export node); handles `function_declaration`, `generator_function_declaration`, `class_declaration`, `abstract_class_declaration`, `interface_declaration`, `type_alias_declaration`, `enum_declaration`, `lexical_declaration` (const only, one symbol per declarator, function kind when the value is `arrow_function` or `function_expression`/`function`); class bodies yield methods. A second pass over `export { ... }` clauses without a `source` marks local symbols exported.
- `py-extractor.ts`: `extractPy(tree, file)`. Top-level `function_definition`, `class_definition` and `decorated_definition` (range taken from the decorated node, so decorators are included). `__all__` is read from a top-level assignment whose right side is a list of plain strings.
- `comments.ts`: `extractComments(tree, language)` over `comment` nodes (TS/JS) and Python `comment` nodes; `extractTestCases(tree, language, isTest)` for `call_expression` (`it`, `test`, `describe` with a plain identifier callee and a string or substitution-free template first argument) and Python `def test_*`. Sorted by line.
- `git-history.ts`: `readGitHistory(root, relPath)` using `execFile("git", ["log","-n","5","--format=%H%x1f%an%x1f%aI%x1f%s","--",relPath], {cwd: root})`, and `execFile("git", ["log","--format=%an","--",relPath])` for count and authors. Any error resolves to the empty history.
- `walker.ts`: `walkRepo(root)` returns `{ files: {path, isTest}[], diagnostics }`; sorted with code-unit comparison, skip list as a constant, `isTest` rule as an exported pure function `isTestPath(path)`.
- `index.ts`: `indexRepo(root)` and re-exports of the types.

## Error model

`indexRepo` never throws. Every per-file step runs inside its own guard; a failure becomes an `IndexDiagnostic` and the file is either omitted (unreadable) or kept with empty symbols, comments and test cases (parse or extraction failure). Missing git is not an error: history is empty. Tree-sitter error nodes are tolerated; extractors skip nodes they do not recognise. Trees are deleted after use to free WASM memory.

## Determinism

Files sort by path, symbols by `startLine` then `name`, diagnostics by file, code, message, all by code-unit comparison (never `localeCompare`). Output contains no run timestamps, no absolute paths other than `root` as passed in, and no random values. Line numbers are clamped to `1..lineCount` as a last guard (R7.7).

## Testing

Fixtures under `tests/fixtures/ts-basic` and `tests/fixtures/py-basic` are plain files. Git tests copy a fixture to a temp directory, run `git init`, set local `user.name` and `user.email`, and commit through `execFile` with fixed `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE`. fast-check properties: never throws on random content in `.ts` and `.py` files, symbol line ranges valid, two runs deep-equal.
