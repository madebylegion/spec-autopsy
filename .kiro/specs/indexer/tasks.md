# Implementation Plan

Each task is small enough for one call. Tests live in `tests/indexer/`; fixtures in `tests/fixtures/`. Run tests with `npx vitest --run` and type check with `npx tsc --noEmit`. Do not commit a nested `.git`.

- [x] 1. Dependencies, grammar loader and types
  - Add `web-tree-sitter` `0.25.10` and `tree-sitter-wasms` `0.1.13` to `dependencies` in `package.json` with exact pins (no `^` or `~`), then ask the human to run `npm install`.
  - Create `src/indexer/types.ts` as in design.md and `src/indexer/grammar-loader.ts` (`languageForExtension`, lazy shared `getParser`, grammar path via `createRequire(import.meta.url).resolve("tree-sitter-wasms/out/tree-sitter-<lang>.wasm")`).
  - Add `tests/indexer/grammar-loader.test.ts`: load typescript, tsx, javascript and python, parse a one-line snippet each and check `rootNode.hasError` is false; check the same Parser instance is returned on a second call; check the extension mapping.
  - _Requirements: indexer/R2.1, indexer/R2.2, indexer/R2.3, indexer/R2.4, indexer/R2.7, indexer/R2.9_

- [x] 2. TypeScript and JavaScript symbol extractor
  - Create `src/indexer/ts-extractor.ts` following design.md.
  - Create fixture `tests/fixtures/ts-basic/` (plain files): `src/math.ts` with exported and non-exported functions, an arrow-function const, a plain const, an interface, a type alias, an enum, a class with methods, and an `export { a }` list; no `.git`.
  - Add `tests/indexer/ts-extractor.test.ts` with example tests: kinds, `Class.method` names, `export`, `export default`, export lists, re-exports adding no symbols, and exact 1-based start and end lines.
  - _Requirements: indexer/R3.1, indexer/R3.2, indexer/R3.3, indexer/R3.4, indexer/R3.5, indexer/R3.6, indexer/R3.7, indexer/R3.8, indexer/R3.9_

- [ ] 3. Python symbol extractor
  - Create `src/indexer/py-extractor.ts` following design.md.
  - Create fixture `tests/fixtures/py-basic/` (plain files): `app/core.py` with functions (one async, one decorated, one private `_helper`), a class with methods, and `__all__`; plus `tests/test_core.py` with `def test_*` functions.
  - Add `tests/indexer/py-extractor.test.ts` with example tests: kinds, `Class.method`, decorator lines in the range, `__all__` filtering, underscore rule, `__all__` that is not a list of strings being ignored.
  - _Requirements: indexer/R4.1, indexer/R4.2, indexer/R4.3, indexer/R4.4, indexer/R4.5, indexer/R4.6, indexer/R4.7, indexer/R4.8_

- [ ] 4. File walker, isTest rule, comments and test cases
  - Create `src/indexer/walker.ts` (`walkRepo`, `isTestPath`, skip list, sorted, `/` paths, `unreadable-directory` diagnostics) and `src/indexer/comments.ts` (`extractComments`, `extractTestCases`).
  - Add a test file `tests/fixtures/ts-basic/tests/math.test.ts` with `describe`, `it` and `test` titles, plus one `it.each` and one `it(variable, ...)` that must be ignored.
  - Add `tests/indexer/walker.test.ts` and `tests/indexer/comments.test.ts`: skipped directories, extension filter, sorted order, every `isTest` rule, `//`, block and `#` comments, no comments from inside strings, titles and lines for TS and Python, empty test cases for non-test files, an unreadable directory.
  - _Requirements: indexer/R1.1, indexer/R1.2, indexer/R1.3, indexer/R1.4, indexer/R1.5, indexer/R1.6, indexer/R1.7, indexer/R1.8, indexer/R5.1, indexer/R5.2, indexer/R5.3, indexer/R5.4, indexer/R5.5, indexer/R5.6, indexer/R5.7, indexer/R5.8_

- [ ] 5. Git history, `indexRepo`, properties and self-index test
  - Create `src/indexer/git-history.ts` (`execFile`, no shell, empty history on any failure) and `src/indexer/index.ts` exporting `indexRepo` and the types; assemble, sort and clamp as in design.md; read errors become `unreadable-file`, parse errors `parse-failed`, missing grammars `grammar-unavailable`.
  - Add `tests/indexer/git-history.test.ts`: copy `ts-basic` into a temp directory, `git init`, set local `user.name` and `user.email`, commit twice with fixed `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` through `execFile`; check history order, fields, count and sorted authors; check a non-git directory and an uncommitted file give an empty history and no diagnostic.
  - Add `tests/indexer/index-properties.test.ts` using fast-check: (a) `indexRepo` never throws on arbitrary text written to `.ts` and `.py` files in a temp directory, and every diagnostic has code, message and file; (b) every symbol satisfies `1 <= startLine <= endLine <= lineCount`; (c) indexing the same fixture twice gives deep-equal output and identical `JSON.stringify`.
  - Add `tests/indexer/self-index.test.ts`: run `indexRepo` on this repository's root restricted to, or filtered for, `src/parser`, and check that `src/parser/statement-parser.ts` is present, that known symbols such as `parseRequirementsText` are exported functions, and that there are no diagnostics for those files.
  - _Requirements: indexer/R2.5, indexer/R2.6, indexer/R2.8, indexer/R2.9, indexer/R6.1, indexer/R6.2, indexer/R6.3, indexer/R6.4, indexer/R6.5, indexer/R6.6, indexer/R6.7, indexer/R7.1, indexer/R7.2, indexer/R7.3, indexer/R7.4, indexer/R7.5, indexer/R7.6, indexer/R7.7_
