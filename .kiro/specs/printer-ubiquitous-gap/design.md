# Design Document

## Overview

This is a test-only bugfix. The generator `fieldsArb` in `tests/parser/requirement-properties.test.ts` builds each field with `fc.option`, which returns nothing about 1 time in 6. All four optional fields are absent together in about (1/6)^4, roughly 0.08% of draws. The no-clause branch of `printRequirement` is therefore never exercised by the round-trip property.

No file under `src/` changes.

## Root cause

The generator treats the four optional fields as independent. Independence makes the all-absent case very rare, so the ubiquitous shape sits outside the generated space for practical purposes.

## Fix

Choose the shape first, then the fields. Replace `fieldsArb` with a weighted union of two arms:

- `ubiquitousArb`: `state`, `feature`, `trigger` and `condition` are all `undefined`; `system` and `response` come from `fieldArb`.
- `clauseArb`: the existing `fc.record` of independent optional fields, unchanged. It can still produce a ubiquitous record by chance, which only raises the share.

```ts
const fieldsArb: fc.Arbitrary<Fields> = fc.oneof(
  { weight: 1, arbitrary: ubiquitousArb },
  { weight: 2, arbitrary: clauseArb },
);
```

Weights 1 and 2 give a ubiquitous share of about one third, above the required one in four. `statementText` already prints no clause and the head `The` when all four fields are absent, so it needs no change. The round-trip property already compares the parsed object with the reprinted one, so it covers the new shape. One extra assertion is added there: when all four fields are absent, the first parse has pattern `ubiquitous`.

`ID stability` also uses `fieldsArb`, so it gains ubiquitous statements too.

## Guard property

A property `ubiquitous share` in the same file guards the generator:

- Draw 400 values with `fc.sample(fieldsArb, { numRuns: 400, seed: 1 })`. A fixed seed keeps the run deterministic.
- Count values where state, feature, trigger and condition are all `undefined`.
- Fail if the count is below 400 / 8 = 50.

The threshold (1 in 8) sits below the generator target (1 in 4, expected about 1 in 3) on purpose. The target leaves room so that the guard does not flake, while the guard still fails for the old generator, whose expected count is under 1 in 400.

## Example test

`tests/parser/requirement-printer.test.ts` already has `prints a ubiquitous requirement`, which checks the printed text only. No test there parses the printed text back, so add `prints and re-parses a ubiquitous requirement`: build a ubiquitous `Requirement`, print it, parse `### Requirement 1: T` plus `1. <printed>` with `parseRequirementsText`, and expect pattern `ubiquitous`, the same system and response, and no state, feature, trigger or condition.

## Verification

- `npx vitest --run` and `npx tsc --noEmit` pass.
- Mutation check, done by hand and reverted: break only the no-clause branch of `printRequirement` in a scratch copy and confirm the property tests now fail with a counterexample. `git diff --stat src/` must show no change after the check.
- Confirm that the guard fails if `fieldsArb` is swapped back to the old generator, then restore the new one.

## Requirement coverage

| Requirement | Covered by |
| --- | --- |
| printer-ubiquitous-gap/R2.1, R2.2 | weighted `fieldsArb` |
| printer-ubiquitous-gap/R2.3 | property `ubiquitous share` |
| printer-ubiquitous-gap/R2.4, R2.5 | round-trip property with the pattern assertion |
| printer-ubiquitous-gap/R2.6 | new example test |
| printer-ubiquitous-gap/R3.1 to R3.5 | clause arm unchanged, no change under `src/` |
