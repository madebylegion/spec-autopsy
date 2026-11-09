# Bugfix Requirements Document

## Introduction

A mutation check found a gap in the round-trip property test of the EARS parser (spec `ears-parser`, requirement `ears-parser/R6`). The fast-check generator in `tests/parser/requirement-properties.test.ts` draws each of the four optional fields (state, feature, trigger, condition) independently, and each one is absent only about 1 time in 6. A ubiquitous requirement needs all four absent, which happens in roughly 1 run in 1,300, so in practice the generator never produces one.

A scratch mutant of `src/parser/requirement-printer.ts` that broke only the no-clause branch (`The <system> SHALL <response>`) passed all 44 of 44 property tests. A mutant that broke the clause branch was caught with a shrunk counterexample. The printer can therefore regress on ubiquitous requirements without any test failing.

This is a test gap, not a defect in the printer. The fix changes tests only. `src/parser/requirement-printer.ts` is not changed.

A ubiquitous requirement is a statement with no WHEN, WHILE, IF or WHERE clause, printed as `The <system> SHALL <response>`. Its parsed form has pattern `ubiquitous` and no state, feature, trigger or condition.

## Glossary

- **Round-trip property**: the test that parses a statement, prints it, parses it again, and expects an equal object apart from id, file and line.
- **Generator**: the fast-check arbitrary `fieldsArb` that supplies the fields for the round-trip property and for the ID-stability property.
- **Ubiquitous share**: the fraction of generated requirements whose state, feature, trigger and condition are all absent.
- **Mutation check**: deliberately breaking one branch of the code under test to see whether any test fails.

## Requirements

### Requirement 1: Current behavior (the defect)

**User Story:** As a maintainer, I want the gap described exactly, so that the fix targets the real cause.

#### Acceptance Criteria

1. WHEN the round-trip property generates requirements, THEN the generator currently SHALL produce a ubiquitous requirement in roughly 1 run in 1,300, which is effectively never in 200 runs.
2. WHEN the no-clause branch of `printRequirement` is broken and the property tests run, THEN the property tests currently SHALL pass 44 of 44, so the regression goes unseen.
3. WHEN the clause branch of `printRequirement` is broken and the property tests run, THEN the property tests currently SHALL fail with a shrunk counterexample, which shows the properties work where the generator reaches.
4. WHEN a ubiquitous requirement is printed, THEN the example test `prints a ubiquitous requirement` currently SHALL check the printed text only, and no test SHALL parse the printed text back.

### Requirement 2: Expected behavior (the fix)

**User Story:** As a maintainer, I want the generator to cover ubiquitous requirements, so that a break in the no-clause branch fails a test.

#### Acceptance Criteria

1. WHEN the round-trip property generates requirements, THEN the generator SHALL produce ubiquitous requirements, that is pattern `ubiquitous` with no state, feature, trigger or condition.
2. WHEN 400 requirements are generated, THEN the generator SHALL make at least one in four of them ubiquitous.
3. WHEN fewer than 1 in 8 of 400 generated requirements are ubiquitous, THEN the property `ubiquitous share` SHALL fail.
4. WHEN a ubiquitous requirement is generated, THEN the round-trip property SHALL check that the first parse has pattern `ubiquitous` and that parse, print, parse gives an equal object apart from id, file and line.
5. WHEN the no-clause branch of `printRequirement` is broken, THEN the property tests SHALL fail with a counterexample.
6. WHEN the example test `prints and re-parses a ubiquitous requirement` is not already present in `tests/parser/requirement-printer.test.ts` under another name, THEN the test file SHALL contain it, and it SHALL print a ubiquitous requirement, parse the printed text, and expect the same system and response with pattern `ubiquitous`.

### Requirement 3: Unchanged behavior (regression guard)

**User Story:** As a maintainer, I want the fix to leave everything else alone, so that it cannot hide a new problem.

#### Acceptance Criteria

1. WHEN the existing property tests (round trip, ID stability, totality) run after the fix, THEN they SHALL keep passing.
2. WHEN the existing example tests run after the fix, THEN they SHALL keep passing.
3. WHEN requirements with one or more clauses are generated, THEN the generator SHALL keep producing them, with the same field rules (lowercase words, no keywords, no "the", no "shall", no "then", no commas, no line breaks).
4. The fix SHALL change test files only, and `src/parser/requirement-printer.ts` SHALL stay byte-for-byte unchanged.
5. WHEN the fix runs, THEN the generator SHALL stay deterministic for a given seed, with no network calls and no new dependency.
