# Design Document

## Overview

Four deterministic changes to the commit link. Files are read in the parser and the indexer; `link` stays pure and receives the data as optional inputs. With no new data the result is byte-identical to today's.

## Types

`src/parser/types.ts`: `Requirement` gains `defectDescription?: true`. The key exists only on a defect description, so every other parsed object keeps its shape. `TaskEntry` does not change.

`src/indexer/types.ts`: `CodeIndex` gains `testOnlyCommits?: string[]` (SHAs, in `kiroCommits` order).

`src/linker/types.ts`:

```ts
export interface LinkExtras {
  designTexts?: ReadonlyMap<string, string>; // spec folder name -> design.md text
  checkedTasks?: ReadonlySet<string>;        // "<spec>#<N>" of every [x] task
}
// RequirementEntry gains, all optional:
//   testOnlyCommit?: string                       (rule 2)
//   contradiction?: { task: number; commit: string } (rule 4, ghosts only)
```

`link(requirements, index, parserDiagnostics = [], tasks = [], extras: LinkExtras = {})`. No other signature changes. New linker diagnostic codes: `defect-description`, `test-only-task`.

## Which layer reads what

- Parser: `src/parser/design-reader.ts` has `readDesignTexts(root)`. `src/parser/task-checks.ts` has `readCheckedTasks(root)`, reading the `[x]` marker with its own regex so `tasks-reader.ts` and `TaskEntry` stay as they are. `requirement-parser.ts` sets `defectDescription`. All three are exported from `src/parser/index.ts`, never throw, and return empty results on any file problem.
- Indexer: `src/indexer/git-blame.ts` gains `readTestOnlyCommits(root, shas)`. It runs one `git log --name-only --format=%x1e%H` through `runGit` (execFile, no shell, `-c core.quotepath=false`), takes the files of each kiro SHA, and keeps the SHAs where at least one file satisfies `isTestPath` (exported from `walker.ts`) and every other file is a test file or a spec bookkeeping file, that is a path starting with `.kiro/`. Without that exception a task commit that ticks its own checkbox in `tasks.md` would never count as test-only. `indexRepo` sets `testOnlyCommits` only when `kiroCommits` is set and the result is not empty.
- Linker: `src/linker/design-filter.ts` has the pure `isNamedInDesign(text, name)`. `link.ts` applies rules 1 to 4. `linkProject` reads the three data sources and passes them in.
- Report: `ghostConfidence` and `ghostEvidence` read `contradiction`. Nothing else in `src/report/` changes, and the report schema stays at version 1.

## The rules

**Rule 1, design filter.** After `commitHits`, group the symbol hits by commit SHA. For each SHA take the design text of `hit.task.spec`. If there is no text, keep all. Otherwise keep the hits whose symbol `isNamedInDesign`; if that leaves none, keep all (fallback). Test hits are never filtered. `isNamedInDesign(text, name)` finds every occurrence of `name` (and, for a dotted name, of the part after the last dot) and accepts it when the characters before and after are not in `[A-Za-z0-9_$]`. A backticked name is a whole-word match, so one rule covers both forms. Case-sensitive, no substring match. Because each commit keeps at least one symbol when it has any, a requirement never loses its explicit code side.

A symbol the filter drops is not added to `linkedSymbols`, so it proves no requirement; that is the point of the filter. It is not a zombie either, because a resolved task commit wrote it as part of a task, and "code no spec asked for" does not describe it. `link` therefore collects the keys of the dropped symbol hits (the hits of `commitHits` that `filterHitsByDesign` did not return) in a separate set, `adoptedSymbols`, and passes the union of `linkedSymbols` and `adoptedSymbols` to `findZombies`. `findZombies` and `classifyRequirement` do not change. A symbol that no resolved task commit wrote and that nothing links to stays a zombie exactly as before.

**Rule 2, test-only tasks.** While applying test hits, remember for each requirement the first test hit whose SHA is in `testOnlyCommits`. At assembly, if a requirement has no code link and has such a hit, status is `proven`, `testOnlyCommit` is set, and the diagnostic `<id>: implemented by test-only task commit <sha7>` is emitted. Otherwise `classifyRequirement` decides, unchanged. This is the evidence line: a proven requirement has no finding, so the diagnostic carries it into the report. A commit is in `testOnlyCommits` when at least one changed file is a test file and every other changed file is a test file or starts with `.kiro/`.

**Rule 3, defect descriptions.** Decision: (a), leave the requirement out of the body map and emit the diagnostic `defect-description`. Why, in two lines: a requirement with no status cannot be a ghost by construction, and the counts stay the sum of the entries with no new field; option (b) would still count it as a ghost, which would add a ghost to the planted fixture and break the existing planted assertions (4 ghosts) that must not be edited. Cost: the Morgue UI shows no toe-tag for such a requirement; the diagnostic is its only trace. The parser flags a requirement when its Requirement heading matches `/current\s+behaviou?r/i` and the file has any heading outside code fences matching `/(expected|unchanged)\s+behaviou?r/i`. In `link`, the work item stays in `firstById` (so tasks listing it raise no `unknown-task-requirement` and links to it stay legal) but is dropped from `entries`.

**Rule 4, doubtful ghosts.** After classification, a ghost gets `contradiction = { task, commit }` when a task that lists it is in `checkedTasks` and a resolved commit maps to that task (lowest task number, then first in `kiroCommits` order). `ghostConfidence` returns `low` for it (after the existing near-miss check, same result); `ghostEvidence` appends `task <N> of <spec> is checked [x] and its commit <sha7> is resolved, yet nothing links to <id>`.

## Error model

`link` never throws. Missing, empty or partial data contributes nothing: no `designTexts`, no text for a spec, no `checkedTasks`, no `testOnlyCommits`, a SHA that names no commit. Readers swallow file and git errors and return empty values, with no diagnostic (as for blame). `linkProject` keeps its single guard and the `link-failed` diagnostic.

## Fixture plan

Planted fixture additions (no existing entry of any file changes; `commits.json` and `expected.json` only get entries appended):

- `.kiro/specs/weighbridge-fix/requirements.md`: Requirement 1 "Current behavior (the defect)" with `1.1` (a defect description), Requirement 2 "Expected behavior (the fix)" with `2.1` (kilo output keeps two decimals) and `2.2` (a reading below the noise floor reads zero), Requirement 3 "Unchanged behavior (regression guard)" with `3.1` (existing weighing tests keep passing). Vocabulary is chosen so that no new name or test title shares two words with another requirement.
- `design.md`: names `zeroBelowFloor`, `src/weighbridge.ts` and `tests/weighbridge.test.ts`; it must not contain the words `sieveStub`, `tareOffset` or `calibrationStamp`.
- `tasks.md`: `[x] 1. Test the kilo conversion` with `_Requirements: weighbridge-fix/R2.1, weighbridge-fix/R3.1_`; `[x] 2. Zero readings below the floor` with `_Requirements: weighbridge-fix/R2.2_`.
- `src/weighbridge.ts` (17 lines): line 1 comment; lines 3 to 5 exported `zeroBelowFloor` (named); lines 7 to 9 non-exported `sieveStub` (a helper that is not named, used by `zeroBelowFloor`, so never a zombie); lines 11 to 13 exported `tareOffset` (an exported helper that `design.md` does not name); lines 15 to 17 exported `calibrationStamp` (named by no spec).
- `tests/weighbridge.test.ts` (15 lines): lines 1 to 11 hold the import, the `declare` and two cases ("kilo output keeps two decimals", "existing readings keep their value"); lines 12 to 15 hold a third case, "noise under the floor reads zero".
- Commits appended: `kiro: weighbridge-fix task 1 Test the kilo conversion` writes `tests/weighbridge.test.ts` lines 1 to 11 and the whole `.kiro/specs/weighbridge-fix/tasks.md` (the checkbox, as the real `printer-ubiquitous-gap` task 1 commit did); it is test-only because `.kiro/` files do not count. `kiro: weighbridge-fix task 2 Zero readings below the floor` writes `src/weighbridge.ts` lines 1 to 13 (`zeroBelowFloor`, `sieveStub`, `tareOffset`) and `tests/weighbridge.test.ts` lines 12 to 15. `chore: add calibration stamp` (not a task commit) writes `src/weighbridge.ts` lines 14 to 17.
- `expected.json` gets one appended entry, `{ "class": "zombie", "key": "src/weighbridge.ts#calibrationStamp" }`. No existing entry changes.

Expected outcome: R1.1 is left out with `defect-description` (rule 3); R2.1 and R3.1 are `proven` by the test-only commit (rule 2); R2.2 is `proven` with one code link, `zeroBelowFloor` (rule 1). `sieveStub` is linked to nothing and is no zombie because it is not exported. `tareOffset` is exported and not named in the design: it is linked to nothing and is not a zombie, because task 2's commit wrote it (adopted). `calibrationStamp` is exported, named by no spec and written by no task commit: it is a zombie. The new spec adds no ghost or unproven finding and one zombie, so the planted findings are 14 (4 ghosts, 4 unproven, 6 zombies), planted precision and recall stay as they are, and `expected.json` keeps all its entries. Rule 4 is covered by hand-written inputs, because the planted fixture must keep exactly 4 ghosts. The implementer recounts the line ranges against the final files and checks the word-overlap rules by hand, as in `task-commit-link`.

## Existing tests that may fail

None known, so far.

## Self-autopsy

For `printer-ubiquitous-gap`: R1.1 is left out (rule 3). Task 1 is test-only (its commit changes test files and its own `tasks.md`, and `.kiro/` files are ignored for that decision) and its commit owns test cases, so R2.1 to R3.5 are proven (rule 2). If a commit were not detected as test-only, those ghosts would still be low confidence by rule 4 (task 1 is `[x]` and its commit resolves). Rule 1 adds no zombie for a symbol written by a resolved task commit, so the self-autopsy zombie count follows the count before this feature, except for symbols that no resolved task commit wrote.

## Testing

Examples per module in `tests/parser/`, `tests/indexer/` and `tests/linker/`; git tests build tiny repositories in temporary directories removed afterwards. fast-check properties: the filter never adds a link (code and test links with extras are a subset of those without), `link` with no extras and no test-only data deep-equals and has the same JSON as the result of the same input on the old path, two runs deep-equal, `isNamedInDesign` never matches a substring or another case, the parser never throws and adds no `defectDescription` without an expected or unchanged heading. A new test links this repository root and checks the 7 IDs.

## Requirement coverage

| Requirement | Covered by |
| --- | --- |
| recall-fix/R1.1 to R1.8 | `design-reader.ts`, `design-filter.ts`, rule 1 in `link.ts` |
| recall-fix/R2.1 to R2.7 | `readTestOnlyCommits`, rule 2 in `link.ts` |
| recall-fix/R3.1 to R3.6 | `requirement-parser.ts`, rule 3 in `link.ts` |
| recall-fix/R4.1 to R4.5 | `task-checks.ts`, rule 4 in `link.ts`, `confidence.ts`, `evidence.ts` |
| recall-fix/R5.1 to R5.6 | optional inputs, pure `link`, properties |
| recall-fix/R6.1 to R6.8 | planted fixture extension, accuracy test, properties |
| recall-fix/R7.1 to R7.3 | self-autopsy test |
