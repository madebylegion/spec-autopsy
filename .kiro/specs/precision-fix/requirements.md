# Requirements Document

## Introduction

On the held-out fixture (`tests/fixtures/heldout`) the linker reports 16 findings, 8 of them right: precision 0.50 and recall 0.80. All 8 false findings were checked by hand. They fall into four cause classes, and each class is a general defect of the indexer or the linker, not a quirk of the fixture.

1. Python module-level constants are not indexed, so a requirement tag above `NAME = 3` attaches to nothing and the requirement is a false ghost.
2. A test that is linked to a requirement calls code that is not linked to it, so the requirement stays a false ghost and the called function becomes a false zombie.
3. A helper that linked code calls is reported as a zombie, although it is part of how a requirement is built.
4. `tokenise` drops every token shorter than 3 characters, so a number such as 25 is lost and a requirement misses its test by a hair.

A fifth cause class showed up after task 1, measured on the held-out fixture. Since Python constants are symbols, an exported constant that a tag explicitly links to one requirement is also linked by name overlap to other requirements that have no explicit code link. That turned a true ghost into a "proven" requirement, a lost true finding.

5. Token overlap (step 2 of `link`) takes a symbol that an explicit link (`tag` or `commit`) already gave to a different requirement.

A sixth cause class showed up on this repository's own self-autopsy (`npm run autopsy`): 20 new false ghosts. This very spec is fully built and tested, yet R1.2 to R1.6, R2.3, R2.4, R5.1 to R5.7 and others are reported as ghosts, each with commit-linked tests and no code link. The cause is that `commitHits` links a symbol to a task commit only when the symbol's start line is owned by that commit in the blame. A task that modifies an existing function (task 2 changed 3 lines inside `tokenise`, task 1 changed `extractPy`, task 4 changed `link`) owns none of the start lines, so its requirements get test links and no code link. Most real tasks modify existing code, so this is the commonest false ghost in practice.

6. A symbol that a task commit modified, without owning its start line, is not linked to that task.

This feature fixes the six causes with deterministic rules. No LLM, no network, no randomness, no new dependency, `link` stays pure, and the report schema stays at version 1. Dependencies keep flowing one way: indexer, then linker, then report.

The held-out fixture may be used to tune. The blind fixtures `tests/fixtures/blind3` and `tests/fixtures/blind4` are not opened and nothing is tuned on them. No rule contains a name taken from any fixture.

Requirement IDs follow the convention of the EARS parser: `precision-fix/R<N>.<M>`, where M is the number written on the criterion line.

## Glossary

- **Python constant**: a top-level Python assignment whose left side is a single plain identifier, with or without an annotation, such as `NAME = 3` or `NAME: int = 3`.
- **Zombie candidate**: an exported symbol of kind function, class, const, enum, interface or type in a non-test file, as decided by `isZombieCandidate`. Methods are never candidates.
- **Explicit link**: a code link whose method is `commit` or `tag`.
- **Explicit owner**: a requirement that has an explicit link to a symbol. A symbol may have several explicit owners.
- **Owner snapshot**: the map from symbol key to the set of its explicit owners, taken once after the commit and tag steps and before token overlap, shared by token overlap and `test-call`.
- **Call set**: the optional field `calls` of a test case, the identifier names its body uses.
- **References**: the optional field `references` of a symbol, the identifier names its body uses, definition names excluded.
- **Root symbol**: a symbol of a non-test file that is linked to at least one requirement by any method, `test-call` included.
- **Adopted helper**: a zombie candidate that a root symbol references, directly or through other adopted helpers. It is linked to nothing and is not a zombie.
- **Held-out fixture**: `tests/fixtures/heldout`, allowed for tuning. **Blind fixtures**: `tests/fixtures/blind3` and `tests/fixtures/blind4`, not allowed.
- **Start-line hit**: a symbol hit of a resolved task commit because the commit owns the symbol's start line in the blame. This is the only kind of symbol hit that existed before rule 6.
- **Modified-symbol hit**: a symbol hit of a resolved task commit because the commit owns at least one line of the symbol's line range other than as a start-line hit, and the design.md of the task's spec names the symbol. The code link made from it carries `modified: true`.

## Requirements

### Requirement 1: Python module-level constants

**User Story:** As a maintainer, I want a Python constant to be a symbol, so that a requirement tag above it links to it and the requirement is not a false ghost.

#### Acceptance Criteria

1. WHEN a top-level statement of a Python file is an assignment whose left side is a single plain identifier, with or without a type annotation and with a value, THEN the indexer SHALL add a symbol of kind `const` with that name and with the line range of the statement.
2. The indexer SHALL NOT add a symbol for a tuple or list target, an attribute target, a subscript target, an annotation without a value, an assignment that is not a direct child of the module, the name `__all__` or a dunder name.
3. WHEN a top-level statement chains assignments such as `A = B = 1`, THEN the indexer SHALL add a symbol for the leftmost target only.
4. The indexer SHALL mark a Python constant as exported by the rule that applies to a top-level function: not exported when the name starts with `_`, and, when `__all__` is a list of string literals, exported only when the name is listed.
5. WHEN a requirement tag comment stands directly above a Python constant, THEN the linker SHALL link the tag to that constant by the existing tag rule, and `tags.ts` SHALL stay unchanged.
6. The indexer SHALL give the same functions, classes and methods of a Python file as before this feature.

### Requirement 2: Numbers in the tokeniser

**User Story:** As a maintainer, I want a number in a requirement and in a test title to count as a shared word, so that the most specific word of a requirement is not thrown away.

#### Acceptance Criteria

1. WHEN a token is made of digits only and has at least 2 digits, THEN `tokenise` SHALL keep it.
2. WHEN a token is a single digit, THEN `tokenise` SHALL drop it, and every other rule of `tokenise` (camelCase and snake_case splitting, stopwords, the 3-character minimum for a token with letters, the trailing "s" strip only for a token with letters, duplicates removed) SHALL stay as it was.
3. The result of `tokenise` SHALL stay idempotent: `tokenise(tokenise(s).join(" "))` equals `tokenise(s)`.
4. WHEN a requirement text and a test title contain the same number of 2 or more digits, THEN `requirementTokens` and `tokenise` SHALL both contain that number as a token.
5. THRESHOLD, NEAR_MISS, `overlapScore` and `overlaps` SHALL stay unchanged.

### Requirement 3: Call and reference data in the indexer

**User Story:** As a maintainer, I want the indexer to record which names a test and a symbol use, so that the linker can follow a call without reading a file.

#### Acceptance Criteria

1. The indexer SHALL add the optional fields `calls: string[]` and `endLine: number` to `TestCase`, and the optional field `references: string[]` to `Symbol`, and SHALL NOT make any other field of the index required or different.
2. WHEN the indexer extracts a test case, THEN it SHALL set `endLine` to the last line of the node of the test case (the call expression for `it`, `test` and `describe`, the function definition for a Python `def test_*`).
3. WHEN the indexer extracts a test case, THEN it SHALL set `calls` to the distinct identifier names inside that node, in order of first occurrence, leaving out the names of the callees `it`, `test` and `describe`, the name of a Python test function itself, and every name that lies inside a nested test case.
4. WHEN the indexer extracts a symbol, THEN it SHALL set `references` to the distinct identifier names inside the node of the symbol, in order of first occurrence, leaving out the definition name of the symbol and the definition names of the methods, functions and classes defined inside it.
5. WHEN `extractTs`, `extractPy` or `extractTestCases` is called without the new option, THEN it SHALL return objects without `calls`, `endLine` and `references`, so that existing callers see the same objects as before, and `indexRepo` SHALL pass the option.
6. The indexer SHALL keep the `references` of a symbol when it clamps the symbols of a file.
7. IF the extraction of these fields throws, THEN the indexer SHALL report the existing diagnostic `parse-failed` for the file and SHALL NOT throw.
8. The indexer SHALL walk the syntax tree without recursion, SHALL add no dependency and SHALL start no shell.

### Requirement 4: The test-call link

**User Story:** As a maintainer, I want a requirement with a linked test to take the code that test calls, so that it is not a ghost and the called function is not a zombie.

#### Acceptance Criteria

1. The linker SHALL add the method `test-call` to `LinkMethod`.
2. WHEN a requirement that is not a defect description has no code link after the commit, tag and overlap steps and has at least one test link, THEN the linker SHALL link to it, with method `test-call` and score 1, every zombie candidate whose name appears in the call set of one of its linked test cases.
3. The linker SHALL find the test case of a test link by file, line and title, and SHALL treat a test case without `calls` as having an empty call set.
4. IF a symbol has an explicit link to a different requirement, THEN the linker SHALL NOT link that symbol to this requirement by `test-call`.
5. WHEN several requirements qualify for a `test-call` link to the same symbol and the symbol has no explicit link, THEN the linker SHALL link it to each of them, and the result SHALL NOT depend on the order of the requirements.
6. WHEN a requirement already has a code link by any method, THEN the linker SHALL NOT add a `test-call` link to it.
7. WHEN a symbol is linked to a requirement by `test-call`, THEN the linker SHALL NOT report it as a zombie.
8. The linker SHALL count a `test-call` link as a code link for classification, so that a requirement with a `test-call` link and a test link is `proven`, and `classifyRequirement` SHALL stay unchanged.
9. The report validator SHALL accept `test-call` as a link method, and WHEN a code link has method `test-call`, THEN the evidence line of the report SHALL name the method `test-call`.
10. WHEN the only code links of an unproven requirement have method `test-call`, THEN `unprovenConfidence` SHALL return level `medium`.

### Requirement 5: Helpers of linked code

**User Story:** As a maintainer, I want a helper that linked code calls not to be called a zombie, so that the report lists only code nobody asked for.

#### Acceptance Criteria

1. WHEN a root symbol lists the name of a zombie candidate in its `references`, THEN the linker SHALL adopt that candidate: it is linked to nothing and it is not a zombie.
2. WHEN a candidate is adopted, THEN the linker SHALL also read the `references` of the adopted candidate, so that a helper of a helper is adopted, and SHALL keep a visited set so that the search ends on cycles.
3. The linker SHALL NOT adopt a candidate because of a reference from a symbol or a test case of a test file, from a zombie that is not adopted, or from any symbol that is not a root symbol or an adopted helper.
4. WHEN no root symbol or adopted helper references a candidate, THEN the linker SHALL report it as a zombie exactly as before.
5. The linker SHALL match a reference to a candidate by exact name, and when several non-test files define a candidate with that name, it SHALL adopt every one of them.
6. The linker SHALL NOT add a code link or change the status of a requirement because of an adopted helper.
7. WHEN a symbol has no `references`, THEN the linker SHALL treat it as having none.

### Requirement 6: Purity, determinism and compatibility

**User Story:** As a user of any repository, I want the tool to behave as before when the new data is absent, so that nothing breaks outside the cases these rules fix.

#### Acceptance Criteria

1. The linker SHALL NOT read files, call git, use the clock, call the network or use random values inside `link`.
2. WHEN the index has no `calls`, no `references` and no Python constant, and no text has a digit-only token of 2 or more digits, THEN `link` SHALL return the body map it returned before this feature.
3. WHEN `link` runs on an index with `calls` and `references`, THEN every code link and every test link that `link` gives for the same index without them SHALL still be present, and the zombies SHALL be a subset of the zombies it gives without them.
4. WHEN the same inputs are linked twice, THEN the linker SHALL return deeply equal body maps whose JSON serialisation is identical.
5. The report SHALL stay valid under schema version 1: the new optional fields of the index SHALL NOT appear in the report, and the only addition SHALL be the method value `test-call`.
6. THRESHOLD SHALL stay unchanged, the feature SHALL add no dependency, and no source file SHALL contain a name taken from a fixture.
7. The linker SHALL NOT throw on partial data, such as a test case with `calls` and a symbol without `references`, a call set that names no symbol, or a reference that names no symbol.

### Requirement 7: Fixtures and scoring

**User Story:** As a maintainer, I want the rules checked on a planted fixture and on the held-out fixture, so that they are measured and not guessed.

#### Acceptance Criteria

1. The planted fixture SHALL gain one new spec `dispatch` with new files only: its `requirements.md`, `src/dispatch.py`, `tests/test_dispatch.py`, and one appended entry of `commits.json` that lists them. No existing file of the planted fixture SHALL change.
2. The new planted files SHALL hold these scenarios and nothing else: a tagged Python constant with a tagged test, giving a proven requirement; a requirement linked to a test by title whose code is found by `test-call`, giving a proven requirement; and an exported helper and a helper of that helper, both called by linked code, that are no zombies.
3. The new planted scenarios SHALL produce no ghost, no unproven and no zombie finding, and every existing entry of the planted `expected.json` SHALL stay, because existing tests assert exactly 14 planted findings and exactly 4 planted ghosts. The one exception is the rule 5 scenario of requirement 9, which MAY add one ghost finding as an add-only entry of `expected.json` if the planted truth needs it.
4. The accuracy test SHALL keep asserting planted overall precision and overall recall of at least 0.8 and SHALL keep printing them in the same format.
5. The repository SHALL contain a held-out accuracy test that prints the held-out precision and recall and asserts that both are at least 0.80, and it SHALL be the only new assertion on the held-out fixture.
6. The repository SHALL contain one unit test per rule on a small synthetic input: Python constants, numbers, call and reference data, `test-call` including the explicit-link exception, helper adoption including transitivity, a cycle and a reference from a test file, and overlap owners.
7. The repository SHALL contain fast-check properties: with no `calls`, no `references` and no Python constants `link` equals the result without the new data; a `test-call` or an adoption never removes a link that exists without them; two runs give deep-equal results; removing all explicit links gives the result of before rule 5.
8. IF the held-out floor is not reached after all tasks, THEN the implementer SHALL report the printed numbers and the remaining false findings, and SHALL NOT change THRESHOLD, any `expected.json` (other than the add-only entry allowed in criterion 3), the floor or the assertions of an existing test to make it pass.
9. The maintainers SHALL NOT edit `tests/fixtures/heldout`, `tests/fixtures/blind3` or `tests/fixtures/blind4`, SHALL NOT open the blind fixtures, and SHALL NOT edit the assertions of an existing test; IF an existing test fails because of the new behavior, THEN design.md and the final summary SHALL name that test.

### Requirement 8: Acceptance

**User Story:** As a maintainer, I want the whole project to stay green, so that the demo and the build keep working.

#### Acceptance Criteria

1. WHEN the work is done, THEN `npx vitest --run` and `npx tsc --noEmit` SHALL pass, apart from any existing test named in design.md as a deliberate consequence.
2. WHEN `npm run autopsy` runs on this repository after the change, THEN it SHALL finish without error.
3. WHEN the last task is done, THEN the final summary SHALL state the planted and the held-out precision and recall as printed, before (held-out precision 0.50, recall 0.80) and after.

### Requirement 9: Overlap respects explicit owners

**User Story:** As a maintainer, I want a symbol that a tag or a commit gave to one requirement not to be linked by name overlap to other requirements, so that a true ghost is not turned into a "proven" requirement.

#### Acceptance Criteria

1. IF a symbol has an explicit link (method `tag` or `commit`) to a requirement A, THEN step 2 of `link` (token overlap) SHALL NOT link that symbol to any requirement B other than A.
2. WHEN a symbol has a `tag` link to requirement A, THEN the linker SHALL still link that symbol to A with that tag link, and the overlap step SHALL NOT remove or change it.
3. WHEN two or more requirements both have an explicit link to the same symbol, THEN each of them SHALL keep its explicit link, and the symbol SHALL count as owned by all of them, so that overlap links it to none of the others.
4. WHEN a symbol has a `commit` link to a requirement, THEN the linker SHALL treat that requirement as an explicit owner of the symbol exactly as it treats a `tag` link.
5. WHEN a symbol has no explicit owner, THEN overlap SHALL link it exactly as before this rule, and THRESHOLD, NEAR_MISS, `overlapScore`, `overlaps` and the near-miss logic SHALL stay unchanged.
6. The linker SHALL take the explicit owners from one snapshot, built by one helper that `test-call` (requirement 4) also uses, and `link` SHALL stay pure and deterministic, and its result SHALL NOT depend on the order of the requirements.
7. WHEN the rule is done, THEN on the planted fixture overall precision and overall recall SHALL stay at least 0.8, and every existing test SHALL pass without editing an assertion; IF one needs a change, THEN design.md "Existing tests that may fail" SHALL name it.

### Requirement 10: Modified symbols are linked to the task that changed them

**User Story:** As a maintainer, I want a function that a task modified to be linked to that task, so that a requirement built by changing existing code is not reported as a ghost.

#### Acceptance Criteria

1. WHEN `commitHits` examines a non-test symbol and a resolved task commit owns at least one line in the symbol's line range [startLine, endLine] in the blame of its file, and the symbol's name is named, by `isNamedInDesign`, in the design.md text of the spec of that task, THEN `commitHits` SHALL also return a hit of that symbol for that commit, and the code link made from it SHALL have method `commit`, score 1, the SHA of the commit and the field `modified: true`.
2. IF no design.md text is given for the spec of the task, or `commitHits` receives no design texts, THEN `commitHits` SHALL return no modified-symbol hit for that task, so that nothing is guessed.
3. WHEN a resolved task commit owns the start line of a symbol, THEN `commitHits` SHALL return the hit exactly as before this rule, and the code link made from it SHALL NOT have the field `modified`; the design filter, helper adoption, `test-call`, token overlap and the explicit-owner rules SHALL stay as they are, and a test file SHALL never get a modified-symbol hit.
4. WHEN several resolved task commits qualify for the same symbol, THEN `commitHits` SHALL return one hit per commit, in the order of file, then symbol line, then the order of those commits in `kiroCommits`.
5. The linker SHALL stay pure and deterministic: `commitHits` SHALL take the design texts as an optional parameter, and WHEN `link` runs without design texts, THEN it SHALL return the body map it returned before this rule, and the result SHALL NOT depend on the order of the requirements.
6. WHEN the evidence line of the report names a code link that has `modified: true` and method `commit`, THEN it SHALL read "modified by task commit <sha7>" instead of the commit wording of a start-line hit.
7. The report SHALL stay valid under schema version 1: `CodeLink` SHALL gain the optional field `modified?: true`, and `validateReport` SHALL accept a code link with `modified: true` and SHALL reject a `modified` field that is not `true`.
8. WHEN the work is done, THEN `npm run autopsy` on this repository SHALL show at most 8 ghosts (26 before this rule) and none of precision-fix/R1.2, precision-fix/R1.3, precision-fix/R1.4, precision-fix/R1.5, precision-fix/R1.6, precision-fix/R2.3, precision-fix/R2.4, precision-fix/R5.1, precision-fix/R5.2, precision-fix/R5.4, precision-fix/R5.5 and precision-fix/R5.7 SHALL be a ghost, and planted overall precision and overall recall SHALL stay at least 0.8 with the 14 planted findings unchanged.
