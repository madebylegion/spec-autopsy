# Requirements Document

## Introduction

SpecAutopsy runs on its own `.kiro` folder (`./demo.sh`). Four requirements of `morgue-pass-2` are reported as ghosts: R10.2, R10.4, R10.5 and R11.4. They are rules about an artifact, not about a function: "no `gradient(` in style.css", "no new font", "the view model stays pure (no node: import)", "existing tokens keep their values". The tests that check them read `style.css`, `src/ui/public/` or `src/ui/view-model.ts` as text, and the author tagged each test with its requirement ID (`// morgue-pass-2/R11.4` above the `it(`).

The report shows those tagged tests as test links with method `tag` and score 1, yet the status is `ghost`. The cause is in `classifyRequirement` (`src/linker/classify.ts`): no code link means ghost, whatever the test links are. For a constraint on an artifact there is no function to link, and the test the author tagged by ID is the proof. These are false ghosts, and the cause class is: **a requirement with an explicit test tag and no code link**.

This feature changes the classification of that one case and nothing else. A test link by `overlap` is a word-match guess and is not an author's claim, so it changes nothing. The core stays deterministic: no LLM, no network, no randomness, no new dependency, the report schema stays at version 1. Dependencies keep flowing one way: indexer, then linker, then report.

Requirement IDs follow the convention of the EARS parser: `constraint-reqs/R<N>.<M>`, where M is the number written on the criterion line.

## Glossary

- **Tag test link**: an entry of `testLinks` of a requirement whose method is `tag`, made by a requirement tag in a comment above a test case or in a test title.
- **Guess test link**: a test link whose method is `overlap`. A test link made by a task commit has method `commit` and is not a tag test link either.
- **Code link**: an entry of `codeLinks` by any method (`commit`, `tag`, `overlap`, `test-call`).
- **Constraint requirement**: a requirement about an artifact (CSS, configuration, the imports of a file) that has no function to link.
- **Held-out fixture**: `tests/fixtures/heldout`. **Blind fixtures**: `tests/fixtures/blind3` and `tests/fixtures/blind4`. None of them is opened or edited by this feature.

## Requirements

### Requirement 1: A tagged test proves a requirement that has no code link

**User Story:** As a maintainer, I want a requirement that a test tagged by ID checks to count as proven when it has no code to link, so that a constraint on an artifact is not reported as a ghost.

#### Acceptance Criteria

1. WHEN a requirement has no code link and at least one tag test link, THEN `classifyRequirement` SHALL return `proven`.
2. WHEN a requirement has no code link and either no test link or only test links whose method is not `tag` (`overlap` or `commit`), THEN `classifyRequirement` SHALL return `ghost`.
3. WHEN a requirement has at least one code link, THEN `classifyRequirement` SHALL return what it returned before this feature: `unproven` without a test link and `proven` with one, whatever the methods of the links.
4. The signature, the parameters and the return type of `classifyRequirement` SHALL stay the same, and no other function of `src/linker/classify.ts` SHALL change.
5. The linker SHALL keep the order of steps of `link`: classification stays in the last step, after the `test-call` step, so that a requirement that gets a `test-call` code link is classified with it; the test-only-task rule (`testOnlyCommit`) SHALL stay as it is.
6. WHEN a requirement is classified `proven` by criterion 1, THEN the linker SHALL NOT set `nearMiss` or `contradiction` on it, and `counts.proven` of the body map SHALL include it.

### Requirement 2: The report says why a requirement with no code link is proven

**User Story:** As a reader of the report, I want a proven requirement with no code link to say so, so that an empty list of code links is explained and not a bug.

#### Acceptance Criteria

1. The report module SHALL export a pure function `provenEvidence(entry)` in `src/report/evidence.ts` that returns an array of non-empty strings for a requirement entry.
2. WHEN the entry has no code link and at least one tag test link, THEN the first string of `provenEvidence` SHALL be `no code link; proven by tagged test <file>:<line>`, where `<file>` and `<line>` are those of the first tag test link in the order of `testLinks`.
3. WHEN the entry has no code link and no tag test link, THEN `provenEvidence` SHALL still return at least one non-empty string: `no code link; proven by test-only task commit <sha7>` when `testOnlyCommit` is set, otherwise `no code link; proven by test <file>:<line>` for the first test link, otherwise `no code link`.
4. WHEN the entry has code links, THEN `provenEvidence` SHALL return `proven by test <file>:<line>` for its first test link, or `proven` when it has none.
5. `provenEvidence` SHALL NOT throw for any entry, including an entry with empty `codeLinks` or empty `testLinks`.
6. `buildReport` SHALL NOT create a finding for a proven requirement, the report shape and `schemaVersion` 1 SHALL stay the same, and `ghostConfidence`, `unprovenConfidence` and `zombieConfidence` SHALL stay unchanged.
7. `validateReport` SHALL accept a report whose proven requirement has empty `codeLinks` and a test link with method `tag`; IF it rejects such a report, THEN it SHALL be changed to accept it and nothing else.

### Requirement 3: Guard rails

**User Story:** As a maintainer, I want the change kept small and measured, so that no other finding moves by accident.

#### Acceptance Criteria

1. The linker and the report SHALL stay pure and deterministic: no file, git, clock, network or random value is read inside `link`, `classifyRequirement` or `provenEvidence`.
2. THRESHOLD, NEAR_MISS, `overlapScore`, `overlaps`, `explicitOwners`, `tags.ts` and every step of `link` other than the call of `classifyRequirement` SHALL stay unchanged.
3. The feature SHALL add no dependency and SHALL NOT edit `package.json`, any `expected.json`, `tests/fixtures/heldout`, `tests/fixtures/blind3`, `tests/fixtures/blind4` or the assertions of an existing test.
4. IF an existing test fails because of the new rule, THEN design.md ("Existing tests that may fail") and the final summary SHALL name that test and the reason, and the implementer SHALL stop for the human to decide.
5. WHEN the rule is done, THEN the planted fixture SHALL still give exactly the 14 findings of `expected.json` and exactly 4 ghosts, and its overall precision and recall SHALL stay at least 0.8.
6. Every new exported function SHALL carry a requirement tag, so that the self-autopsy does not report it as a zombie.

### Requirement 4: Tests

**User Story:** As a maintainer, I want the rule pinned by unit tests, properties and one planted case, so that it is measured and not guessed.

#### Acceptance Criteria

1. The repository SHALL contain `tests/linker/constraint-reqs.test.ts` with unit tests for: a tag test link and no code link (`proven`); only guess test links and no code link (`ghost`); a tag test link plus a code link (`proven`); no code link and no test link (`ghost`); a code link and no test link (`unproven`); the evidence line of `provenEvidence`; and `validateReport` accepting a proven entry with empty `codeLinks`.
2. The same file SHALL contain a test of `link` on a hand-written index: a test file whose tag comment sits above a test case, with no code in the index, gives a `proven` requirement with no code link and no zombie, while the same index with an `overlap`-only test link gives a `ghost`.
3. The same file SHALL contain fast-check properties: the status is never `ghost` when a tag test link exists, and the status is the same as under the old rule whenever a code link exists.
4. The planted fixture SHALL gain new files only: one new spec requirement that is a constraint on a text file, one tagged test that reads that text file, and no code; the planted `expected.json` SHALL need no entry because the new requirement is proven, and a new test SHALL assert that the findings still equal `expected.json`.
5. The tests that check the requirements of this spec SHALL carry the tag of the requirement they check, so that the self-autopsy shows them as proven and not as ghosts.

### Requirement 5: Acceptance

**User Story:** As a maintainer, I want the whole project checked at the end, so that the demo and the build keep working.

#### Acceptance Criteria

1. WHEN the work is done, THEN `npx vitest --run` and `npx tsc --noEmit` SHALL pass, apart from any existing test named in design.md as a deliberate consequence of criterion 4 of requirement 3.
2. WHEN `npm run autopsy` runs on this repository after the change, THEN it SHALL finish without error and morgue-pass-2/R10.2, morgue-pass-2/R10.4, morgue-pass-2/R10.5 and morgue-pass-2/R11.4 SHALL no longer be ghosts.
3. WHEN the last task is done, THEN the final summary SHALL state the ghost count of the self-autopsy before and after, the planted and held-out precision and recall as printed, and every existing test that failed with its reason.
