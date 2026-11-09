# Implementation Plan

Each task is small enough for one call. Tests live in `tests/parser/`. Run tests with `npx vitest --run` and type check with `npx tsc --noEmit`.

- [ ] 1. Project scaffold
  - Create `package.json` (ESM, `"type": "module"`, MIT, scripts `test` = `vitest --run` and `typecheck` = `tsc --noEmit`), `tsconfig.json` (strict, ESM, target ES2022, `src` and `tests` included), and `vitest.config.ts`.
  - Add `typescript`, `vitest`, `fast-check` and `@types/node` as dev dependencies with exact pinned versions (no `^` or `~`), looked up at install time.
  - Add `tests/parser/scaffold.test.ts` with one trivially passing test, and a `.gitignore` for `node_modules` and `dist` that does not ignore `.kiro/`.
  - Done when `npx vitest --run` and `npx tsc --noEmit` both pass.
  - _Requirements: enabler for all of ears-parser/R1 to ears-parser/R6; no behaviour yet_

- [ ] 2. Types and the EARS statement parser
  - Create `src/parser/types.ts` and `src/parser/statement-parser.ts` following design.md (split at SHALL, system after the last "the", clause cut, THEN handling, pattern choice, whitespace normalisation).
  - Add `tests/parser/statement-parser.test.ts` with example-based tests: each of the five patterns, a complex form, upper, lower and mixed case keywords, the Kiro form `WHEN ... THEN the system SHALL ...`, and whitespace collapsing.
  - _Requirements: ears-parser/R2.1, ears-parser/R2.2, ears-parser/R2.3, ears-parser/R2.4, ears-parser/R2.5, ears-parser/R2.6, ears-parser/R2.7, ears-parser/R2.8, ears-parser/R3.1, ears-parser/R3.2, ears-parser/R3.4_

- [ ] 3. Stable ID assignment and diagnostics
  - Create `src/parser/requirement-parser.ts` with `parseRequirementsText`: heading and numbered-criterion scan, fenced code skipping, ID `<spec>/R<N>.<M>`, 1-based line and file on each object, duplicate-id handling, and the diagnostics `missing-shall`, `missing-system`, `empty-response` and `unnumbered-statement`.
  - Guard the whole scan so it never throws.
  - Add `tests/parser/requirement-parser.test.ts` with example tests: IDs from a sample file, ID unchanged after editing a statement's text, duplicates, each diagnostic with file and line, and empty input.
  - _Requirements: ears-parser/R3.3, ears-parser/R4.1, ears-parser/R4.2, ears-parser/R4.3, ears-parser/R4.4, ears-parser/R4.5, ears-parser/R5.1, ears-parser/R5.2, ears-parser/R5.3, ears-parser/R5.4, ears-parser/R5.5, ears-parser/R5.6_

- [ ] 4. Printer and property-based tests
  - Create `src/parser/requirement-printer.ts` (`printRequirement`) with the canonical form from design.md, and `src/parser/index.ts` exports.
  - Add `tests/parser/requirement-printer.test.ts` with example tests for each pattern.
  - Add `tests/parser/requirement-properties.test.ts` using fast-check: (a) round trip, parse then print then parse gives an equal object apart from id, file and line, using generated fields that avoid keywords, "the", commas and line breaks; (b) ID stability when unrelated prose lines are inserted or shuffled between statements; (c) `parseRequirementsText` never throws on arbitrary strings, and every diagnostic has a code, a message, a file and a line of at least 1.
  - _Requirements: ears-parser/R6.1, ears-parser/R6.2, ears-parser/R6.3, ears-parser/R6.4, ears-parser/R6.5, ears-parser/R4.3, ears-parser/R4.5, ears-parser/R5.5, ears-parser/R5.6_

- [ ] 5. Project-root discovery and self-parse test
  - Create `src/parser/project-reader.ts` with `parseProject(projectRoot)`: find `.kiro/specs/*/requirements.md`, sort by spec folder name with code-unit comparison, read each file, use project-relative `/` paths, return `unreadable-file` diagnostics instead of throwing, and return an empty result when `.kiro/specs` is missing. Export it from `src/parser/index.ts`.
  - Add `tests/parser/project-reader.test.ts`: a temporary project with several specs created out of order (expect sorted output), a missing `.kiro/specs`, and an unreadable entry.
  - Add a self-parse test that runs `parseProject` on this repo's root and checks that `ears-parser/R2.3` exists, that all 6 requirements are present, and that there are zero diagnostics for `.kiro/specs/ears-parser/requirements.md`.
  - _Requirements: ears-parser/R1.1, ears-parser/R1.2, ears-parser/R1.3, ears-parser/R1.4, ears-parser/R5.5_
