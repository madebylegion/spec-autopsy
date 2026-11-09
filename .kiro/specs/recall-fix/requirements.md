# Requirements Document

## Introduction

The commit link (spec `task-commit-link`) has two measured defects.

False ghosts. The self-autopsy of this repository (`npm run autopsy`) shows 7 ghosts, all in `printer-ubiquitous-gap`: R1.1, R2.1, R2.3, R3.1, R3.2, R3.4 and R3.5. All 7 were checked by hand and all are false. That spec is a test-only bugfix, so its task 1 commit wrote test files only (plus the checkbox in its own `tasks.md`), and `classifyRequirement` says "no code link means ghost". A requirement built by a test-only task can never leave the ghost state. R1.1 sits in the bugfix template section "Current behavior": it describes the defect as it is today, there is nothing to build, and no task lists it.

Low recall. A task commit links all the symbols it wrote to all requirements of its task, so one unrelated helper wrongly proves a requirement and the link is coarse (recall 0.45 and precision 0.71 on a blind fixture). The `design.md` of each spec names the symbols and files the task builds.

This feature makes four deterministic changes: a design symbol filter, test-only tasks, defect-description requirements and doubtful ghosts. No LLM, no network, no randomness, no new dependency, and `link` stays pure. Files are read in the parser and the indexer and reach `link` as data. Dependencies keep flowing one way: parser and indexer, then linker, then report.

Requirement IDs follow the convention of the EARS parser: `recall-fix/R<N>.<M>`, where M is the number written on the criterion line.

## Glossary

- **Design text**: the text of `.kiro/specs/<spec>/design.md`.
- **Named symbol**: a symbol whose name occurs in the design text of the spec of its task, as a backticked identifier or as a whole word, compared case-sensitively and exactly.
- **Adopted symbol**: a symbol written by a resolved task commit that the design symbol filter dropped. It proves no requirement, and it is not a zombie.
- **Test file**: a file for which the indexer rule `isTestPath` is true.
- **Spec bookkeeping file**: a changed file whose path starts with `.kiro/`, such as the `tasks.md` checkbox a task commit ticks.
- **Test-only task**: a resolved task whose task commit changed at least one test file, and whose other changed files, if any, are all spec bookkeeping files.
- **Defect description**: a requirement under a Requirement heading that says "current behavior" (ignoring case), in a `requirements.md` that also has a heading saying "expected behavior" or "unchanged behavior" (the Kiro bugfix template: Current Behavior, Expected Behavior, Unchanged Behavior).
- **Doubtful ghost**: a ghost that is listed by a task that is checked `[x]` in `tasks.md` and whose task commit is resolved. The tool contradicts itself there.
- **Extras**: the optional fifth parameter of `link`, holding `designTexts` and `checkedTasks`.
- **Confident ghost**: a ghost finding whose confidence level is `medium` or `high`.

## Requirements

### Requirement 1: Design symbol filter

**User Story:** As a maintainer, I want a task commit to link only the symbols its design names, so that one unrelated helper no longer proves a requirement.

#### Acceptance Criteria

1. The parser SHALL export `readDesignTexts(root)` from `src/parser/index.ts`, which resolves to a map from spec folder name to the design text of every spec folder under `.kiro/specs` that has a `design.md`, and SHALL NOT throw.
2. The linker SHALL accept the design texts as data in `extras.designTexts` of `link`, and SHALL NOT read a file inside `link`.
3. WHEN a resolved task commit wrote non-test symbols and the design text of the spec of its task names at least one of them, THEN the linker SHALL keep a commit link only for the named symbols of that commit.
4. WHEN the name of a symbol occurs in the design text with no identifier character (letter, digit, underscore or dollar sign) directly before or after it, THEN the linker SHALL count the symbol as named, comparing case-sensitively and by exact text, so that `Requirement` does not match `requirement` and `link` does not match `linker`, and for a dotted name such as `Class.method` the whole name or the part after the last dot SHALL count.
5. IF the spec of the task has no design text, or none of the symbols the commit wrote is named in it, THEN the linker SHALL NOT filter any symbol of that commit.
6. The linker SHALL NOT filter test cases, tag links or overlap links.
7. WHEN a symbol is filtered out of a commit link, THEN the linker SHALL NOT link it to any requirement through that commit, and SHALL NOT report it as a zombie, because a resolved task commit wrote it. A symbol that no resolved task commit wrote, and that no requirement links to, SHALL stay a zombie candidate as before.
8. The links produced with design texts SHALL be a subset of the links produced without them, for code links and for test links.

### Requirement 2: Test-only tasks

**User Story:** As a maintainer, I want a requirement built by a test-only task to count as proven, so that a test-only bugfix does not produce ghosts.

#### Acceptance Criteria

1. WHEN `kiroCommits` is not empty, THEN the indexer SHALL set the optional field `testOnlyCommits` of the code index to the SHAs of the `kiro:` commits that changed at least one test file and whose every other changed file is a test file or a spec bookkeeping file (a path starting with `.kiro/`), and SHALL leave the field unset when there is none.
2. The indexer SHALL read the files changed by the commits through `git log --name-only` run with `child_process.execFile` and without a shell.
3. IF git fails, THEN the indexer SHALL leave `testOnlyCommits` unset and SHALL NOT throw.
4. WHEN a requirement has no code link and has at least one test link with method `commit` whose commit is in `testOnlyCommits`, THEN the linker SHALL classify the requirement as `proven`.
5. WHEN the linker classifies a requirement by criterion 4, THEN the linker SHALL set the optional field `testOnlyCommit` of the requirement entry to the SHA and SHALL emit a diagnostic with code `test-only-task`, source `linker`, the file and the line of the requirement and a message that says "<id>: implemented by test-only task commit <sha7>".
6. For every requirement that criterion 4 does not select, the linker SHALL give the status that `classifyRequirement` gives, and `classifyRequirement` SHALL stay unchanged.
7. WHEN `testOnlyCommits` is unset or empty, THEN the linker SHALL behave as it did before this feature.

### Requirement 3: Defect-description requirements

**User Story:** As a maintainer, I want a requirement that only describes the existing defect to be left out of the verdict, so that it is never reported as a ghost.

#### Acceptance Criteria

1. WHEN a Requirement heading contains "current behavior" (ignoring case, also spelled "behaviour") and the same `requirements.md` has a heading outside code fences that contains "expected behavior" or "unchanged behavior", THEN the parser SHALL set the optional field `defectDescription` to `true` on every requirement under that heading.
2. The parser SHALL NOT add the key `defectDescription` to any other requirement, so that the parsed objects of all other requirements stay as they were.
3. The linker SHALL leave a requirement with `defectDescription` out of the `requirements` of the body map and out of the counts.
4. WHEN the linker leaves a requirement out by criterion 3, THEN the linker SHALL emit one diagnostic with code `defect-description`, source `linker`, and the file and the line of the requirement.
5. The report SHALL NOT show a requirement with `defectDescription` as a ghost, unproven or proven finding.
6. WHEN a task lists a requirement with `defectDescription`, THEN the linker SHALL NOT emit `unknown-task-requirement` for it.

### Requirement 4: Doubtful ghosts

**User Story:** As a developer reading a report, I want a ghost that contradicts the task list to say so and to be low confidence, so that I do not trust it blindly.

#### Acceptance Criteria

1. The parser SHALL export `readCheckedTasks(root)` from `src/parser/index.ts`, which resolves to the set of keys `<spec>#<N>` of the tasks marked `[x]` in the `tasks.md` files of the project, and SHALL NOT throw and SHALL NOT change `TaskEntry`.
2. The linker SHALL accept the checked tasks as data in `extras.checkedTasks` of `link`.
3. WHEN a ghost is listed by a task that is checked and that a resolved task commit names, THEN the linker SHALL set the optional field `contradiction` of its entry to the task number and the SHA of that commit.
4. WHEN a ghost entry has `contradiction`, THEN `ghostConfidence` SHALL return level `low`, and `ghostEvidence` SHALL add a sentence that names the task, the commit and the contradiction.
5. For every other ghost, `ghostConfidence` and `ghostEvidence` SHALL give what they gave before this feature.

### Requirement 5: Purity, determinism and missing data

**User Story:** As a user of any repository, I want the tool to behave as before when there is no new data, so that nothing breaks outside Kiro projects.

#### Acceptance Criteria

1. The linker SHALL NOT read files, call git, use the clock, call the network or use random values inside `link`.
2. WHEN `extras` is absent, `testOnlyCommits` is unset and no requirement has `defectDescription`, THEN `link` SHALL return exactly the body map it returned before this feature.
3. WHEN the same inputs are linked twice, THEN the linker SHALL return deeply equal body maps whose JSON serialisation is identical.
4. The linker SHALL NOT throw on partial data, such as design texts for some specs only, checked tasks for unknown specs or a SHA in `testOnlyCommits` that no commit names.
5. The report SHALL stay valid under schema version 1, and THRESHOLD SHALL stay unchanged.
6. The feature SHALL add no dependency.

### Requirement 6: Fixtures and scoring

**User Story:** As a maintainer, I want the new rules measured on a planted fixture, so that they are checked against a plan and not tuned on blind data.

#### Acceptance Criteria

1. The planted fixture SHALL gain one test-only bugfix spec `weighbridge-fix` with `requirements.md`, `design.md` and `tasks.md`, the files `src/weighbridge.ts` and `tests/weighbridge.test.ts`, and appended commits in `commits.json`.
2. The first appended commit SHALL be a test-only task commit that also changes the `tasks.md` of its spec, and the second SHALL write a named symbol and exported and non-exported helper symbols that `design.md` does not name. A further appended non-task commit SHALL write one exported function that no spec names.
3. The planted fixture SHALL NOT change or remove any existing entry of `expected.json`. The new spec adds no ghost or unproven finding; the exported function of the non-task commit is a zombie and is appended to `expected.json` as one new entry.
4. The accuracy test SHALL keep asserting planted overall precision and overall recall of at least 0.8 and SHALL keep printing them in the same format.
5. The maintainers SHALL NOT edit anything under `tests/fixtures/heldout` or `tests/fixtures/blind3`, and SHALL NOT tune the rules on them.
6. The repository SHALL contain fast-check properties: the design symbol filter never adds a link, `link` with no extras and no test-only data equals the result before this feature, and two runs give deep-equal results.
7. The maintainers SHALL NOT edit the assertions of an existing test to make it pass, except a test that asserted a behavior these requirements deliberately change.
8. IF an existing test fails because of the new behavior, THEN design.md and the final summary SHALL name that test.

### Requirement 7: Self-autopsy acceptance

**User Story:** As a maintainer, I want the self-autopsy of this repository to stop reporting the 7 false ghosts, so that the demo tells the truth.

#### Acceptance Criteria

1. WHEN `npm run autopsy` runs on this repository after the change, THEN none of `printer-ubiquitous-gap/R1.1`, `R2.1`, `R2.3`, `R3.1`, `R3.2`, `R3.4` and `R3.5` SHALL be a confident ghost.
2. The report SHALL list a ghost with level `low` only with a visible reason in its evidence.
3. The repository SHALL contain a test that runs `linkProject` on this repository root and asserts that the 7 IDs are not confident ghosts, and the test SHALL be skipped when the repository is a shallow clone, where commit data does not exist.
