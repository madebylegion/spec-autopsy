# Design Document

## Overview

A third link, method `commit`, joins a symbol or test case to requirements through the task commit that wrote it: commit, then task, then requirement IDs, then the symbols and tests whose start line that commit owns. Git is read in the indexer, `tasks.md` in the parser, and the join is a pure step of `link`. Order of evidence: commit, tag, overlap.

## Types

`src/parser/types.ts` (new):

```ts
export interface TaskCommitSubject { spec: string | null; number: number; title: string }
export interface TaskRequirementRef { id: string; line: number }   // id is always "<spec>/R<N>.<M>" or as written if not bare
export interface TaskEntry {
  spec: string;
  number: number;
  title: string;
  file: string;                        // ".kiro/specs/<spec>/tasks.md"
  line: number;                        // of the task line
  requirements: TaskRequirementRef[];  // order of appearance, no duplicate ids
}
```

`src/indexer/types.ts` (new optional fields, so existing indexes stay valid):

```ts
export interface KiroCommit { sha: string; subject: string }
export interface BlameRange { startLine: number; endLine: number; sha: string }  // 1-based, inclusive
// CodeIndex.kiroCommits?: KiroCommit[]     FileIndex.blame?: BlameRange[]
```

`src/linker/types.ts`: `LinkMethod = "commit" | "tag" | "overlap"`; `CodeLink` and `TestLink` get `commit?: string` as the last key. Only commit links have the key, so the JSON of tag and overlap links is unchanged.

## Module layout

- `src/parser/task-commit-subject.ts`: `matchTaskCommitSubject(subject): TaskCommitSubject | null`.
- `src/parser/tasks-reader.ts`: `parseTasksText(text, { specName, file }): TaskEntry[]` and `parseTasksProject(root): Promise<TaskEntry[]>`. Both re-exported from `src/parser/index.ts`.
- `src/indexer/run-git.ts`: the private `runGit` of `git-history.ts`, exported and shared (execFile, no shell, undefined on failure).
- `src/indexer/git-blame.ts`: `readKiroCommits(root)`, `readBlame(root, relPath)`, `isShallow(root)`. `indexRepo` calls them and sets the optional fields.
- `src/linker/commit-links.ts`: pure helpers `resolveTaskCommits`, `ownerAt`, `commitHits`, `unknownTaskRequirements`.
- `src/linker/link.ts`: new fourth parameter `tasks: readonly TaskEntry[] = []`; `linkProject` also calls `parseTasksProject`.
- `tests/helpers/build-fixture-repo.ts`: the fixture replay helper.

The linker imports `TaskEntry` and the matcher from `src/parser` and the optional fields from `src/indexer`. The indexer never imports the parser: it keeps only a loose filter (`kiro:` prefix, ignoring case) and leaves the exact match to the linker.

## The chain

**1. Subjects.** `matchTaskCommitSubject` uses `^kiro:\s+(?:<spec>\s+)?task\s+(\d+)\s+(\S.*)$` with `kiro` and `task` matched ignoring case, `<spec>` = `[a-z0-9]+(-[a-z0-9]+)*` (lowercase only), title trimmed. `kiro: task 3 x` has spec `null`. Anything else, such as `kiro: spec linker (requirements, design, tasks)`, gives `null`.

**2. Tasks.** A task line is `^- \[[ x-]\] (\d+)\.\s+(.+)$` in the first column. The task body is every following line up to the next task line or the next non-blank line in the first column. In the body, a line matching `^\s*(?:[-*]\s+)?_Requirements:\s*(.*?)\s*_\s*$` contributes IDs: split on commas and whitespace, drop empties, a bare `^\d+\.\d+$` becomes `<spec>/R<token>`, duplicates dropped (first wins), several lines joined in order. `parseTasksProject` reads each `.kiro/specs/<spec>/tasks.md` from the working tree (the state at HEAD in a clean checkout, like `requirements.md`).

**3. Resolve.** In `link`, for each `index.kiroCommits` entry: match the subject; with a spec, take the task with that spec and number; without, take the tasks with that number whose title equals the commit title after trim and lowercase; exactly one must match. A commit that does not resolve is ignored. A task from another repository history (this repo's own `kiro:` commits seen from a fixture folder inside it) resolves to nothing, because the fixture has no such spec.

**4. Requirement IDs.** Each ID of the task is looked up among the requirement IDs (first requirement with that ID, as for tags). Unknown IDs give one `unknown-task-requirement` diagnostic per task and ID (source `linker`, file = `tasks.md` path, line = line of the requirements line) and are dropped. This is emitted whenever tasks are given, whether or not a commit resolves.

**5. Blame rule.** The indexer runs `git blame --porcelain -- <path>` per indexed file (no revision, so line numbers always match the file on disk; on a clean tree this is HEAD, and uncommitted lines get the all-zero SHA and no range). Group headers `<sha> <orig> <final> <count>` give the ranges; adjacent ranges with the same SHA are merged. Only when `kiroCommits` is not empty. `ownerAt(blame, line)` returns the SHA whose range contains the line.
- A non-test symbol (any kind, exported or not, like overlap) is linked when `ownerAt(file.blame, symbol.startLine)` is a resolved task commit.
- A test case is linked when `ownerAt(file.blame, testCase.line)` is a resolved task commit.
- The link goes to every known requirement of that task. File-level linking is deliberately not done. A line rewritten later is owned by the later commit, so the earlier commit owns nothing there.
- Known limit: a task that lists several requirements links all of its symbols to all of them. Keep tasks narrow.

**6. Precedence.** Commit hits are applied first, then tags, then overlap. A commit hit sets `explicitCode` or `explicitTest` of the requirement, so overlap is skipped for that side exactly as for tags. The link maps stay keyed per requirement and target, so a tag on a target that already has a commit link adds nothing (the recorded method is `commit`). A commit-linked symbol is added to the linked-symbol set, so it is not a zombie. A task without known requirements links nothing, so its symbols stay zombie candidates.

**7. Record.** `{ symbol|title, file, startLine|line, method: "commit", score: 1, commit: sha }`. Sorting is the existing one.

## Fixture format and helper

`commits.json` next to a fixture: an array, oldest first, of `{ "message": string, "files": (string | { "path": string, "lines": [number, number][] })[] }`. A string is the whole file as in the fixture directory. An object commits only those 1-based inclusive ranges of the final file; ranges accumulate over commits and the file at a commit is the lines committed so far, in order. Every file of the fixture directory that no commit lists (and not `commits.json`) goes into a first commit `chore: initial files`.

`buildFixtureRepo(fixtureDir): Promise<string>` copies the directory (without `commits.json`) to a temp directory, runs `git init`, sets `user.name`, `user.email` and fixed `GIT_AUTHOR_DATE` and `GIT_COMMITTER_DATE` (2026-01-01T00:00:00Z plus one minute per commit), replays the commits with `git add` and `git commit` through `execFile`, and returns the path. A fixture with no `commits.json` is copied without git. The caller removes the temp directory. Fixtures use append-only ranges per file, so blame never has to choose between identical lines.

## Planted fixture plan

`expected.json` stays as is. Existing lines of the sources and tests do not change; new content is appended. New requirements (vocabulary chosen so that no new name or title shares two tokens with any other requirement, symbol or test): `stock/R3.1` "WHEN a pallet is scanned at the gate, the sticker printer SHALL print a batch barcode.", `stock/R3.2` "WHEN a pallet is damaged, the claims desk SHALL open a claim file.", `orders/R3.1` "WHEN a customer requests a refund, the returns desk SHALL issue a credit note."

| Requirement | Code (appended) | Test (appended) | Reached by |
|---|---|---|---|
| stock/R3.1 | `sealCrate` (stock.ts 40-43) | "sealed crates carry a prefix" (stock.test.ts 24) | commit only |
| stock/R3.2 | `vouchTally` (stock.ts 44-47) | "voucher counts add up" (stock.test.ts 30) | commit only |
| orders/R3.1 | `quillMemo` (orders.ts 31-34) | "memo carries the amount" (orders.test.ts 15) | commit only |

Each new test case is imported by a separate `import` line inside the appended block, so the existing first lines never change. Line numbers are the plan; the implementer recounts them from the files.

`tasks.md` of `stock`: 1 R1.1, R1.2 (adjustments, validation); 2 R1.3; 3 R2.2; 4 R2.3; 5 R3.1; 6 R3.2. Of `orders`: 1 R1.1; 2 R1.2; 3 R1.3; 4 R1.4; 5 R2.1; 6 "Add debug switches" with no requirements line; 7 R3.1. No task lists `stock/R1.4`, `stock/R2.1`, `orders/R2.2` or `orders/R2.3`, so they stay ghosts. Tasks that write both a symbol and a test of the same requirement keep each unproven requirement unproven by not writing its test (R1.3, R2.3, R1.4, R2.1 have no test in any commit).

Commits, oldest first (file: lines):

1. `kiro: stock task 1 Record adjustments and validate quantities` stock.ts 1-11, stock.test.ts 1-17
2. `kiro: orders task 1 Calculate order totals` orders.ts 1-7, orders.test.ts 1-8
3. `kiro: stock task 2 Raise the low stock flag` stock.ts 12-16
4. `kiro: orders task 2 Generate tracking labels` shipping.py 1-7, test_shipping.py (whole)
5. `kiro: stock task 3 Compute supplier lead time` stock.ts 17-20, stock.test.ts 18-20
6. `kiro: orders task 3 Keep the order open on declined payment` orders.ts 8-12, orders.test.ts 9-11
7. `kiro: stock task 4 Update on hand quantity` stock.ts 21-24
8. `chore: add reports, reasons, csv export and rounding helper` stock.ts 25-39
9. `kiro: orders task 4 Track order holds` orders.ts 13-21
10. `kiro: orders task 5 Apply coupon discounts` orders.ts 22-25
11. `kiro: orders task 6 Add debug switches` orders.ts 26-27
12. `chore: audit export and money rounding` shipping.py 8-13, orders.ts 28-30
13. `kiro: stock task 5 Print pallet barcodes` stock.ts 40-43, stock.test.ts 21-26
14. `kiro: orders task 7 Issue refund credit notes` orders.ts 31-34, orders.test.ts 12-17
15. `kiro: stock task 6 Open damage claims` stock.ts 44-47, stock.test.ts 27-32

Zombies by writer: `buildReorderAlertSummaryReport`, `recordStockAdjustmentReasons`, `legacyCsvExport` (commit 8, not a task commit), `export_audit_blob` (commit 12, not a task commit), `OrderDebugFlags` (commit 11, a task commit that lists no requirement). Stock files are edited by tasks 1 to 6, so earlier and later task commits own different lines of the same file. `tests/cli/autopsy.test.ts` copies the planted fixture without git and would see the three new requirements as ghosts; its set-up switches to `buildFixtureRepo`, its assertions stay.

## Error model

`link` never throws. Missing, empty or partial commit data contributes nothing: no `kiroCommits`, no `blame` for a file, a SHA that resolves to no task, a task with no known requirement. With no commit data the result is byte-identical to the result before this feature. The indexer wraps every git call; a failure (no git, no repository, shallow clone, blame error) leaves the field unset and adds no diagnostic. `parseTasksProject` returns `[]` for a missing or unreadable `.kiro/specs`, and skips an unreadable `tasks.md`. `linkProject` keeps its single guard and `link-failed` diagnostic.

## Determinism

Git output is read in order and sorted as written; maps are built in input order and links are sorted by file, line and name. No clock, network or random value is used. Dates in fixtures are fixed.

## Testing

Examples per module in `tests/parser/`, `tests/indexer/` and `tests/linker/`. fast-check properties: tasks reader never throws and keeps ID order; subject matcher accepts both forms and rejects the rest; `link` with empty or absent commit data deep-equals the result without it; two runs deep-equal. Git tests build tiny repos with the helper, in temp directories removed afterwards.
