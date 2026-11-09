# Implementation Plan

Test-only fix. Tests live in `tests/parser/`. Run tests with `npx vitest --run` and type check with `npx tsc --noEmit`. Do not change anything under `src/`.

- [x] 1. Generate ubiquitous requirements and guard the share
  - In `tests/parser/requirement-properties.test.ts`, split the generator into `ubiquitousArb` (state, feature, trigger and condition all `undefined`) and `clauseArb` (the existing record), and make `fieldsArb` a weighted `fc.oneof` of the two (weights 1 and 2) following design.md.
  - In the round-trip property, assert that the first parse has pattern `ubiquitous` when all four optional fields are absent.
  - Add a property `ubiquitous share`: sample 400 values from `fieldsArb` with a fixed seed, and fail if fewer than 1 in 8 (50) have no state, feature, trigger or condition.
  - In `tests/parser/requirement-printer.test.ts`, add the example test `prints and re-parses a ubiquitous requirement` (print, then parse back, expect pattern `ubiquitous`, same system and response). The existing `prints a ubiquitous requirement` only checks the printed text, so this one is not a duplicate.
  - Done when `npx vitest --run` and `npx tsc --noEmit` pass, and a scratch mutant of the no-clause branch of `printRequirement` makes a property test fail (revert the mutant afterwards; `src/parser/requirement-printer.ts` stays unchanged).
  - _Requirements: printer-ubiquitous-gap/R2.1, printer-ubiquitous-gap/R2.2, printer-ubiquitous-gap/R2.3, printer-ubiquitous-gap/R2.4, printer-ubiquitous-gap/R2.5, printer-ubiquitous-gap/R2.6, printer-ubiquitous-gap/R3.1, printer-ubiquitous-gap/R3.2, printer-ubiquitous-gap/R3.3, printer-ubiquitous-gap/R3.4, printer-ubiquitous-gap/R3.5_
