# Requirements Document

## Introduction

The linker joins requirements to code and tests by two signals: explicit ID tags, then token overlap. On code that carries no tags and uses synonyms, word overlap makes both a false ghost and a false zombie (precision 0.50 on a blind fixture). Every Kiro project leaves a better signal: each task is committed as `kiro: <spec> task <N> <title>`, and `.kiro/specs/<spec>/tasks.md` lists for task N a line `_Requirements: <spec>/R1.1, <spec>/R2.3_`. That gives a chain: commit, task, requirement IDs, and the symbols and test cases that commit wrote.

This feature adds that chain as a THIRD deterministic link, method name `commit`, with the order of evidence: commit link, explicit tag, token overlap. It is deterministic: no LLM, no network, no randomness, and `link` stays pure. Git is read only in the indexer, `tasks.md` is read only in the parser, and the join is done in the linker. Dependencies keep flowing one way: parser and indexer, then linker.

Requirement IDs follow the convention of the EARS parser: `task-commit-link/R<N>.<M>`, where M is the number written on the criterion line.

## Glossary

- **Task commit**: a commit whose subject matches `kiro: <spec> task <N> <title>` or `kiro: task <N> <title>`, and that resolves to a task of a `tasks.md` of the project.
- **Task**: an entry `- [ ] N. title` (or `[x]`, `[-]`) of a `tasks.md`, with its sub-lines.
- **Task requirements**: the requirement IDs listed by the `_Requirements: ..._` lines of a task.
- **Owner of a line**: the commit that last wrote that line, as reported by `git blame`.
- **Commit link**: a link with method `commit`, score 1 and the SHA of the task commit that owns the start line of a symbol, or the line of a test case.
- **Explicit link**: a requirement has an explicit code link (resp. test link) when it has a commit link or a tag link on that side. Token overlap is skipped for that side.
- **Commit data**: the optional `kiroCommits` of the code index, the optional `blame` of each file index and the task list given to `link`.
- **Fixture history**: a `commits.json` file next to a fixture, describing commits to replay.

## Requirements

### Requirement 1: Task commit subjects

**User Story:** As a maintainer, I want to recognise task commits by their subject, so that a commit can be traced to the task it implements.

#### Acceptance Criteria

1. The parser SHALL export `matchTaskCommitSubject(subject)` from `src/parser/index.ts` as a pure function that returns `{ spec, number, title }` for a task commit subject and `null` for any other subject, where spec is a string or `null`.
2. WHEN a subject has the form `kiro: <spec> task <N> <title>`, where `kiro:` and `task` are matched ignoring case, spec is lowercase kebab-case, N is a sequence of digits and title is not empty after trimming, THEN the parser SHALL return the spec, N as a number and the trimmed title.
3. WHEN a subject has the form `kiro: task <N> <title>` with no spec name, THEN the parser SHALL return spec `null`, N as a number and the trimmed title.
4. The parser SHALL return `null` for every other subject, including `kiro: spec linker (requirements, design, tasks)`, a subject without the `kiro:` prefix, a subject whose N is not an integer, and a subject with an empty title.
5. The parser SHALL NOT throw from `matchTaskCommitSubject` on any string.

### Requirement 2: Task requirements reader

**User Story:** As a maintainer, I want the requirement IDs of every task read from `tasks.md`, so that a task commit can be tied to requirements.

#### Acceptance Criteria

1. The parser SHALL export `parseTasksText(text, { specName, file })` and `parseTasksProject(root)` from `src/parser/index.ts`, where the first returns the `TaskEntry[]` of one text and the second returns the `TaskEntry[]` of every `.kiro/specs/<spec>/tasks.md` under `root`.
2. The parser SHALL recognise a task line of the form `- [ ] N. title`, `- [x] N. title` or `- [-] N. title` that starts in the first column, and SHALL record the spec, the number, the trimmed title and the line.
3. The parser SHALL treat every following line as part of the task until the next task line or the next non-blank line that starts in the first column.
4. WHEN a line of a task, after an optional leading list marker, has the form `_Requirements: a, b, c_`, with IDs separated by commas and spaces, THEN the parser SHALL record the IDs in the order written, without duplicates, each with the line it was written on.
5. WHEN an ID in a requirements line has the bare form `1.1`, THEN the parser SHALL read it as `<spec>/R1.1`, where spec is the spec of the file.
6. WHEN a task has several requirements lines, THEN the parser SHALL join their IDs in order of appearance.
7. The parser SHALL NOT throw from either function, SHALL give no tasks for a text that has no task line, an unreadable file or a missing `.kiro/specs` folder, and SHALL list the tasks of a project by spec name in code-unit order and then in file order.
8. The parser SHALL read `tasks.md` from the project directory, which is the state at HEAD in a clean checkout, in the same way as it reads `requirements.md`.

### Requirement 3: Git reading in the indexer

**User Story:** As a maintainer, I want the commits and the line owners read once, in the indexer, so that `link` stays pure.

#### Acceptance Criteria

1. The indexer SHALL set the optional field `kiroCommits` of the code index to the list of `{ sha, subject }` of every commit whose subject starts with `kiro:` ignoring case, in `git log` order.
2. WHEN `kiroCommits` is not empty, THEN the indexer SHALL read `git blame --porcelain` for every indexed file and SHALL set the optional field `blame` of the file index to a list of `{ startLine, endLine, sha }` ranges, 1-based and inclusive, sorted by startLine, that do not overlap.
3. WHEN there is no `kiro:` commit, THEN the indexer SHALL NOT run `git blame`, and SHALL leave `kiroCommits` and every `blame` unset.
4. WHEN a line is not committed (the all-zero SHA), THEN the indexer SHALL leave it out of the ranges.
5. The indexer SHALL run git only through `child_process.execFile` without a shell, in the directory `root`, and SHALL record the paths of the blame ranges relative to `root`, also when `root` is a sub-folder of a larger repository.
6. IF git is missing, `root` is not in a repository, the repository is a shallow clone, or the blame of a file fails, THEN the indexer SHALL leave the corresponding fields unset and SHALL NOT throw.

### Requirement 4: The commit chain

**User Story:** As a maintainer, I want a symbol or a test linked to the requirements of the task whose commit wrote it, so that AI-written code with synonyms is still traced to its spec.

#### Acceptance Criteria

1. The linker SHALL accept the task list as an optional fourth parameter of `link(requirements, index, parserDiagnostics?, tasks?)`, SHALL read `index.kiroCommits` and the `blame` of each file, and SHALL NOT read files, call git or use the clock inside `link`.
2. WHEN a commit has a spec in its subject, THEN the linker SHALL resolve it to the task with that spec and number, and WHEN it has no spec, THEN the linker SHALL resolve it to the one task with that number whose title equals the commit title after trimming and ignoring case.
3. IF no task, or more than one task, matches a commit, or the subject is not a task commit subject, THEN the linker SHALL ignore the commit.
4. IF a requirement ID of a task names no requirement, THEN the linker SHALL drop it and emit a diagnostic with code `unknown-task-requirement`, the file of the `tasks.md` and the line of the requirements line.
5. WHEN the owner of the start line of a non-test symbol, of any kind, is a task commit, THEN the linker SHALL link the symbol to every known requirement of that task.
6. WHEN the owner of the line of a test case is a task commit, THEN the linker SHALL link the test case to every known requirement of that task.
7. WHEN a line was rewritten by a later commit, THEN the linker SHALL treat the later commit as its only owner, so that the earlier task commit owns nothing of it.
8. WHEN a symbol is linked by a commit link to a known requirement, THEN the linker SHALL NOT report it as a zombie, and WHEN a task lists no known requirement, THEN the linker SHALL create no link for the symbols its commit wrote.

### Requirement 5: Precedence and link records

**User Story:** As a developer reading a finding, I want to see which evidence linked a symbol, so that I can trust or challenge it.

#### Acceptance Criteria

1. The linker SHALL apply the evidence in this order: commit links, then explicit tags, then token overlap.
2. WHEN a requirement has a commit link to code, THEN the linker SHALL skip token overlap to code for it, and WHEN it has a commit link to a test, THEN the linker SHALL skip token overlap to tests for it, each side decided independently.
3. The linker SHALL union commit links and tag links, and SHALL record at most one link for the same requirement and the same symbol or test case, where the commit link is the one recorded.
4. The linker SHALL record a commit link with method `commit`, score 1 and the field `commit` set to the SHA of the task commit, and SHALL NOT add a `commit` field to a tag link or an overlap link.
5. The linker SHALL sort commit links together with the other links by file, then line, then name or title, by code-unit comparison.

### Requirement 6: Missing data and determinism

**User Story:** As a user of any repository, I want the linker to behave as before when there is no commit data, so that nothing breaks outside Kiro projects.

#### Acceptance Criteria

1. WHEN there is no commit data, meaning `kiroCommits` unset or empty, no `blame`, no tasks, or no task commit that resolves, THEN the linker SHALL return exactly the body map it returned before this feature, using tags and then token overlap.
2. The linker SHALL NOT throw on partial commit data, such as blame for some files only, a SHA that no commit names, or a task with no requirements.
3. WHEN the same inputs are linked twice, THEN the linker SHALL return deeply equal body maps whose JSON serialisation is identical.
4. The linker SHALL NOT call an LLM, call the network or use random values at any point of the commit link.

### Requirement 7: Fixtures with history and verification

**User Story:** As a maintainer, I want a fixture that has a git history without a nested `.git`, so that the commit link is measured against a plan.

#### Acceptance Criteria

1. The repository SHALL accept a file `commits.json` next to a fixture, holding an array, oldest commit first, of `{ "message", "files" }`, where each file is a path (the whole file as in the fixture directory) or `{ "path", "lines": [[from, to], ...] }` (only those 1-based inclusive line ranges of the final file, accumulated over commits, in file order), and every other file of the fixture directory is committed first with the message `chore: initial files`.
2. The repository SHALL contain the test helper `tests/helpers/build-fixture-repo.ts`, which copies a fixture directory to a fresh temporary directory, runs `git init`, sets a fixed author and committer name and email and fixed increasing dates, replays `commits.json` with `execFile` and no shell, and returns the temporary path, which the caller removes.
3. The planted fixture SHALL gain `.kiro/specs/stock/tasks.md`, `.kiro/specs/orders/tasks.md`, a `commits.json`, and appended requirements, sources and tests, with `expected.json` unchanged and the same 13 planted findings.
4. The planted fixture SHALL contain at least 3 requirements that are proven only through the commit chain (no tag and no word overlap), at least 1 requirement whose task commit wrote a symbol with a name unrelated to the requirement words, and a file that one task commit writes and a later task commit also edits.
5. The planted fixture SHALL list no ghost requirement in any task requirements line, and SHALL have every zombie symbol written by a commit that is not a task commit, or by a task commit that lists no requirement.
6. The accuracy test SHALL run `linkProject` on the built temporary repository for every fixture directory that has a `commits.json` and on the directory itself otherwise, SHALL keep its output format, SHALL assert that planted overall precision and overall recall are each at least 0.8, and SHALL assert for the held-out fixture only that the numbers are within 0 and 1.
7. The maintainers SHALL NOT change THRESHOLD or any `expected.json` to make accuracy numbers pass, and the repository SHALL contain fast-check properties for the tasks reader (never throws, keeps ID order), the subject matcher (accepts the two forms, rejects the rest), `link` without commit data (equals the result before this feature) and `link` determinism (two runs deep-equal).
