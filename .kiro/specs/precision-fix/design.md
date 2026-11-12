# Design Document

## Overview

Six deterministic rules remove the six measured causes of false findings. The indexer records more data (optional fields only); `link` stays pure and reads that data from the index. Nothing in `src/` names anything from a fixture. With no new data, and no number of 2 or more digits in a text, the result is the one `link` gives today (rule 5 changes a result only where a symbol has an explicit owner; rule 6 only where design texts are given and a resolved task commit owns a line inside a symbol but not its start line).

## Types

All additions are optional, so every existing object keeps its shape and report schema v1 stays valid.

```ts
// src/indexer/types.ts
interface Symbol   { /* ... */ references?: string[] }           // identifier names its body uses
interface TestCase { title: string; line: number;
                     endLine?: number; calls?: string[] }        // body extent and identifier names

// src/linker/types.ts
type LinkMethod = "commit" | "tag" | "overlap" | "test-call";
interface CodeLink { /* ... */ commit?: string; modified?: true } // rule 6: set only on a modified-symbol hit
```

`validate-report.ts` has a `METHODS` list; `test-call` is added there, and rule 6 adds a check that an optional `modified` field is `true`. The new index fields never reach the report; `modified` does, because `buildReport` copies code links field by field with a spread.

## Which layer reads what

- Indexer (`src/indexer/`): `py-extractor.ts` adds Python constants. `ts-extractor.ts`, `py-extractor.ts` and `comments.ts` fill `references`, `calls` and `endLine` from the syntax tree they already have, with an iterative walk (the `walk` generator pattern of `comments.ts`), no dependency and no shell. `index.ts` passes the option and `clampSymbols` copies `references`, because it rebuilds every symbol field by field and would drop it.
- Linker (`src/linker/`): `overlap.ts` keeps numbers. `link.ts` adds the owner snapshot helper (rule 5), the owner check in step 2, step 2b (`test-call`) and step 2c (helper adoption). `types.ts` adds the method value and (rule 6) `CodeLink.modified`. `commit-links.ts` changes only for rule 6 (`commitHits` and `CommitHit`). `tags.ts` and `classify.ts` (`classifyRequirement`, `findZombies`) do not change.
- Report (`src/report/`): `evidence.ts` names `test-call` in the linked-code line and (rule 6) words a modified link; `validate-report.ts` accepts the value and the optional `modified` field. `confidence.ts` needs no code change: `unprovenConfidence` already gives `medium` unless a link is `commit` or `tag`; a test gives it a unit test.

The new data is produced only when asked. `extractTs`, `extractPy` and `extractTestCases` get an optional last parameter (`withDetails`, default `false`) and `indexRepo` passes `true`. Existing callers and tests, such as `tests/indexer/comments.test.ts`, which compares test cases with `toEqual([{ title, line }])`, see the same objects as before. This keeps the filling inside the existing extraction functions without breaking those assertions.

## The rules

**Rule 1, Python constants (cause 1).** In `extractPy`, for each child of the module root of type `expression_statement` whose first named child is an `assignment`: take the `left` field; accept it only when it is an `identifier` and the assignment has a `right` field (so `NAME: int` alone is out; `NAME: int = 3` has a `type` field and a `right`). For a chain `A = B = 1` the outer `left` is `A`, so only `A` counts. Skip `__all__` and dunder names (`isDunder` is already there; the check also covers `__all__`). The symbol is `{ name, kind: "const", exported: topLevelExported(name), range: the statement }`. Tuple, attribute and subscript targets are not identifiers, so they fall out. Assignments inside `if`, `try`, `def` or `class` are not direct children of the module and are never visited. No change in `tags.ts`: a tag comment on the line above is found by `symbolForTag` through the look-ahead, as for a function. A public Python constant that nobody tags becomes a zombie candidate, like an exported TypeScript `const`; that is the intended parity.

**Rule 2, numbers (cause 4).** In `tokenise`, the early `continue` on `raw.length < 3` becomes: keep the token when it is `/^[0-9]{2,}$/`, otherwise drop it if shorter than 3 or a stopword, as now. The "s" strip never touches an all-digit token, because it does not end in "s". A kept digit token passes through the second `tokenise` run unchanged, so the result stays idempotent. A single digit is still dropped.

Effect to watch: a number is one more token on each side that has it. When both sides have it, the shared count and the score go up. When only the smaller side has it, the denominator `min(|A|, |B|)` may grow with no shared word and the score may fall; a link that exists today could in rare cases be lost. The summary names any such case. Nothing else in the overlap formulas changes.

**Rule 3, `test-call` (cause 2).** Step 2b of `link`, after the overlap step. It reuses the owner snapshot of rule 5 (`explicitOwners`, one helper, not a second copy). For each active work with no code link and at least one test link: collect the `calls` of its linked test cases (a map from `file`, `line`, `title` to the test case is built once from the index). For each non-test file and each symbol with `isZombieCandidate` true whose `name` is in that set: skip it when another work owns it explicitly according to the snapshot; otherwise add a code link `{ method: "test-call", score: 1 }` and add its key to `linkedSymbols`. Because the owners are a snapshot taken before step 2, and neither an `overlap` nor a `test-call` link counts as an owner, the result does not depend on the order of the requirements, and a test that overlaps two requirements cannot take a symbol that a tag or a commit gave to another one. A true ghost with an accidental test overlap stays a ghost when the only symbols its test calls are owned elsewhere. The step adds links only; it never removes or changes one.

`explicitCode` is not set by this step, so no other step reads it differently.

**Rule 4, helper adoption (cause 3).** Step 2c, after step 2b. Roots: every symbol of a non-test file whose key is in `linkedSymbols`. Build `byName`: the zombie candidates of non-test files that are not in `linkedSymbols`, by name. Walk with a work list and a `visited` set of keys: for each root, for each name in `references`, for each candidate in `byName.get(name)` that is not yet visited, add it to `adoptedSymbols` and to the work list; adopted helpers are read for their own `references`. Only roots and adopted helpers are read, so a reference from a test file, from a zombie that was not adopted, or from any symbol that is not linked adopts nothing. Private functions between a root and a helper are not traversed: only linked and adopted symbols are sources. `adoptedSymbols` is the set that the design filter of `recall-fix` already uses, and the zombie step already excludes `linkedSymbols ∪ adoptedSymbols`, so `findZombies` does not change.

Known limits, stated so nobody is surprised. A reference is a name, not a resolved binding: a local variable or a parameter with the same name as an exported function counts as a reference to it, and when two files define the same candidate name both are adopted. Both can hide a true zombie, never create a false one. The score of the held-out fixture decides whether this is acceptable.

**Rule 5, overlap respects explicit owners (cause 5).** Measured on the held-out fixture: an exported Python constant tagged to one requirement was also linked by name overlap to two other requirements with no explicit code link. One of them was a true ghost and became "proven": a lost true finding.

- Where the snapshot is built. One function in `src/linker/link.ts`, `explicitOwners(works)`, returns a map from symbol key (`file:name:line`, the key `linkedSymbols` uses) to the set of requirement IDs whose code links to that symbol have method `tag` or `commit`. It reads only code links already on the works, so it is pure.
- How step 2 uses it. For each requirement B and each symbol S that token overlap would link: skip S when its owner set is non-empty and does not contain B. If B is in the set, S is already linked to B by its explicit link, and overlap adds nothing new for B (the existing duplicate rule of step 2 applies unchanged). A symbol with no owner is linked exactly as today, and the score, THRESHOLD and near-miss path are not touched: the check is a filter in front of the existing decision, not a change to it. Two requirements that both own S both keep their explicit links and no third requirement gets S by overlap.
- Ordering. Steps 0 (commit) and 1 (tag) run first. The snapshot is taken right after them and before step 2. Step 2 adds only `overlap` links, which never count as owners, so the snapshot stays valid for the whole run and step 2b (`test-call`) reuses the same object instead of building its own. Because the snapshot does not change while the steps run, the result does not depend on the order of the requirements.
- Effect. A requirement whose only code links came from overlap onto a symbol owned by another requirement loses them. If it has a test link it may then get a `test-call` link in step 2b, which has its own owner check. This can turn a false "proven" back into a ghost, which is the intended repair, and it can turn a zombie candidate that was only overlap-linked into a still-linked symbol (it stays linked to its owner, so no new zombie).

**Rule 6, modified symbols (cause 6).** Measured on this repository's self-autopsy: 20 new false ghosts, because a task that edits the inside of an existing function owns none of the start lines of its symbols. Today `commitHits` asks one question per symbol: who owns `startLine`? Rule 6 adds a second question for the same symbol: which resolved task commits own any line of `[startLine, endLine]`?

- Where `designTexts` reaches `commitHits`. `link` already receives `extras.designTexts` (spec folder name to the text of its design.md). Step 0 changes from `commitHits(index, resolved)` to `commitHits(index, resolved, extras.designTexts)`. The third parameter is optional and read-only; it is the same map that `filterHitsByDesign` gets on the next line. No new reader, no file access.
- The line-range check against blame. For a non-test file with blame and a non-test symbol: the start-line owner `s0 = ownerAt(blame, startLine)` is found as today and gives the hit exactly as today when it is a resolved commit (no `modified` flag, rule unchanged). In addition, the set of SHAs of all blame ranges that intersect `[startLine, max(startLine, endLine)]` is collected (a range intersects when `range.startLine <= end && range.endLine >= start`). For each SHA of that set that is resolved, is not `s0`, and whose task's spec has a design text that names the symbol (`isNamedInDesign(text, symbol.name)`), a hit with `modified: true` is added. No design text for the spec, or an empty one, gives no modified hit: nothing is guessed. Test files and test cases are never read by this rule.
- Ordering. Hits stay in index order (file, then symbol in index order, which is line order). The hits of one symbol follow the order of the resolved commits in `kiroCommits`: the list of resolved SHAs in that order is built once per call, so the start-line hit and the modified hits of one symbol are merged by commit order, with no dependence on blame order or map iteration order. One hit per commit and symbol.
- How `link` uses the hits. The `CommitHit` symbol variant gets an optional `modified?: true`. In step 0, the code link made from a hit copies it as `modified: true` only when the hit has it. When the same requirement gets the same symbol from a start-line hit and from a modified hit (two tasks list it), the start-line link wins: a modified link is replaced by a plain one and never the other way round, so the result does not depend on hit order. The design filter, `adoptedSymbols`, the owner snapshot, `test-call`, overlap and helper adoption are not touched: a modified hit is a `commit` link, so it counts as an explicit owner exactly as a start-line hit does (rule 5). A modified hit is named by the design text by construction, so the design filter keeps it; it can make the filter drop an unnamed start-line hit of the same commit, as the filter always did once some hit of a commit is named.
- Evidence. `unprovenEvidence` in `src/report/evidence.ts` words a `commit` link as `commit <sha7>` (a start-line link) in the line `linked code: <file>#<symbol> (...)`. For `modified: true` it reads `modified by task commit <sha7>` in the same place. (The existing wording is "commit <sha7>", not "written by"; the new wording is the only one that says "modified".) Without a SHA the text is `modified by task commit`.
- Report. `CodeLink.modified?: true` is copied into the report by `buildReport` as it copies the other fields. `validate-report.ts` accepts an absent `modified` or `true` and rejects anything else. Schema version stays 1.
- Fixture plan. No fixture folder changes. Tests build `CodeIndex` objects by hand with `blame` ranges and `kiroCommits`, and `TaskEntry` objects, as `tests/linker/overlap-owners.test.ts` does; design texts are `Map`s written in the test. `tests/linker/self-link-modified.test.ts` links this repository's own root, like `tests/linker/self-link.test.ts`, and checks the 12 requirements named in R10.8 and the ghost count.
- Known limits. The range check says that a commit touched a line inside the symbol, not that the commit changed its behavior (a comment edit or a rename inside counts). The design.md of the spec must name the symbol, which is what keeps this from linking every function a broad commit brushed. A spec without a design.md gets no modified hits, so such a spec keeps today's result. Blame is the blame at HEAD: lines that a later commit rewrote belong to that later commit, so a task whose edits were all overwritten later gets no modified hit; that is the same limit as the start-line rule.

## Order of steps in `link`

0 commit links (start-line and modified hits, then the design filter), 1 tags, owner snapshot (rule 5), 2 token overlap (skips symbols owned by another requirement), 2b `test-call` (reuses the snapshot), 2c adoption, 3 classify and assemble. Steps 2b and 2c only add links or adopted keys, so every result of steps 0 and 1 survives; step 2 may now add fewer overlap links than before, never more. Rule 6 only adds hits to step 0, so it can add links and remove zombies or overlap links through the owner snapshot, never remove a start-line link.

## Error model

The extractor changes sit inside the existing `try` of `indexRepo`: a failure gives the `parse-failed` diagnostic and empty symbols, as today, and never throws. `link` treats a missing `calls`, `endLine` or `references` as an empty list and never throws on partial data (a call that names no symbol, a reference that names no symbol, a test case missing from the map). `commitHits` treats a missing blame, a missing design text and an `endLine` below `startLine` as no extra hit. No file, git or clock access is added to `link`.

## Fixture plan

The planted fixture gets new files only, plus appended entries; no existing file changes. The existing tests assert exactly 14 planted findings (`tests/report/planted-report.test.ts`) and exactly 4 planted ghosts (`tests/cli/autopsy.test.ts`), so the new scenarios of tasks 1, 3 and 4 must produce no finding of any class. Then `expected.json` needs no new entry, and the only add-only edit is one appended chore commit in `commits.json` that lists the new files (check `tests/helpers/build-fixture-repo.ts` for how unlisted files are handled before relying on that). The three scenarios are built up over tasks 1, 3 and 4; each task appends to files that this spec created.

- `.kiro/specs/dispatch/requirements.md`: R1.1 "The dispatcher SHALL cap each lane at 12 bundles." (task 1); R1.2 "WHEN a lane is sealed, the dispatcher SHALL hand every bundle to the night courier." (task 3).
- `src/dispatch.py`: `# dispatch/R1.1` above `LANE_CEILING = 12` (task 1; before the fix this tag attaches to nothing and R1.1 is a ghost). Task 3 adds `rotate_manifest`, whose name shares no word with R1.2. Task 4 makes `rotate_manifest` call an exported `pad_manifest_rows`, which calls an exported `blank_row`.
- `tests/test_dispatch.py`: a test tagged `# dispatch/R1.1` that uses `LANE_CEILING` (task 1); a test named `test_hands_every_bundle_to_night_courier` that calls `rotate_manifest` and nothing else from `src` (task 3). It must not call the helpers, so they are adopted and not `test-call` linked.
- Expected outcome: R1.1 proven (tag on the constant, tag on the test); R1.2 proven by a `test-call` link to `rotate_manifest` only; `pad_manifest_rows` and `blank_row` linked to nothing and not zombies. Findings stay at 14.

Rule 5 does not extend the planted fixture, because four existing tests pin its 14 findings (and 4 ghosts) and their assertions must not be edited. Rule 5 is covered by `tests/linker/overlap-owners.test.ts` on hand-written indexes. Rule 6 does not touch any fixture either: it is covered by `tests/linker/modified-symbol.test.ts` on hand-written indexes with blame ranges, and by `tests/linker/self-link-modified.test.ts` on this repository. The planted fixture's design-less specs give no modified hit, so its 14 findings do not move; this is checked by the planted tests that already exist.

The implementer recounts line numbers and checks by hand, with the `tokenise` rules, that no new name or test title shares two words with a requirement of another spec, and that no new requirement shares two words with an existing symbol name or title. The cases that need a ghost or a zombie, the explicit-link exception, a cycle and a reference from a test file, are covered by hand-written indexes in unit tests, not by the planted fixture.

The held-out and blind fixtures are not touched. The only new use of the held-out fixture is one new test file, `tests/linker/heldout-accuracy.test.ts`, that links it, prints precision and recall in the format of `planted-accuracy.test.ts` and asserts both are at least 0.80. The existing held-out test, which asserts only sane numbers, stays as it is.

## Existing tests that may fail

- (a) `py-extractor.test.ts "ignores nested functions and non-definition statements"`: changed on purpose by rule 1 (owner decision, task 1 fix round).
- (b) Planted-count tests (autopsy.test.ts, commit-links-planted.test.ts, planted-report.test.ts): failed once when task 5 added a planted ghost; the planted extension was reverted (owner decision, task 5 fix round), no assertion edited.
- (c) Rule 6, not yet run (the agent has no shell; the human runs `npm test`). Tests that give `link` design texts and a blame can gain a modified hit when a resolved commit owns a line inside a symbol but not its start line and the design names the symbol: `tests/recall-fix/design-symbol-filter.test.ts` (one resolved commit, ranges inside one blame range, so no second commit is expected to qualify) and `tests/recall-fix/recall-fix-properties.test.ts` (random design texts over `fixtureIndex()`). Tests that call `commitHits` with two arguments (`tests/linker/commit-links.test.ts`) are unaffected, since the third parameter is optional. The planted-count tests of (b) and the held-out tests (`tests/linker/heldout-accuracy.test.ts`, which pins 0.80 precision and recall) read real fixtures whose specs may have a design.md; a modified hit there could move a finding. None is expected to fail; if one does, it is named in the reply and its assertion is not edited.

## Testing

Tests mirror `src/`: `tests/indexer/py-constants.test.ts`, `tests/indexer/call-data.test.ts`, `tests/linker/overlap-numbers.test.ts` (a new file, so `overlap.test.ts` is not edited), `tests/linker/test-call.test.ts`, `tests/report/test-call-report.test.ts`, `tests/linker/helper-adoption.test.ts`, `tests/linker/overlap-owners.test.ts`, `tests/linker/precision-fix-planted.test.ts`, `tests/linker/precision-fix-properties.test.ts`, `tests/linker/heldout-accuracy.test.ts`, and for rule 6 `tests/linker/modified-symbol.test.ts`, `tests/report/modified-evidence.test.ts` and `tests/linker/self-link-modified.test.ts`. Indexer tests parse small strings through the same grammar loader as `tests/indexer/comments.test.ts`. fast-check properties: with no `calls`, no `references` and no Python constants, `link` deep-equals the result with `calls: []` and `references: []` everywhere and has no `test-call` link and no extra adopted key (generated texts contain no digit-only token, since rule 2 intentionally changes those); with the data present, every code link, test link and zombie-exclusion of the run without the data is still there; two runs deep-equal and have the same JSON; `tokenise` stays idempotent on strings with digits; with all explicit links removed, `link` gives the result it gave before rule 5 (in `overlap-owners.test.ts`); with no `designTexts`, `link` equals the result with `designTexts` over a spec that has no text (rule 6, in `modified-symbol.test.ts`).

The regression statement "equals today's result" rests on three things, since the old code is not kept: the existing linker tests pass unedited, the planted fixture gives the same findings and counts, and the property above shows that absent data changes nothing.

## Requirement coverage

| Requirement | Covered by |
| --- | --- |
| precision-fix/R1.1 to R1.6 | rule 1, `py-extractor.ts`, `py-constants.test.ts` |
| precision-fix/R2.1 to R2.5 | rule 2, `overlap.ts`, `overlap-numbers.test.ts` |
| precision-fix/R3.1 to R3.8 | indexer types, `comments.ts`, extractors, `index.ts`, `call-data.test.ts` |
| precision-fix/R4.1 to R4.10 | rule 3, `link.ts`, `types.ts`, `evidence.ts`, `validate-report.ts`, `test-call.test.ts` |
| precision-fix/R5.1 to R5.7 | rule 4, `link.ts`, `helper-adoption.test.ts` |
| precision-fix/R6.1 to R6.7 | pure `link`, optional fields, properties |
| precision-fix/R7.1 to R7.9 | planted extension, `heldout-accuracy.test.ts`, properties |
| precision-fix/R8.1 to R8.3 | full run, `npm run autopsy`, final summary |
| precision-fix/R9.1 to R9.7 | rule 5, `link.ts` (`explicitOwners`, step 2), `overlap-owners.test.ts` |
| precision-fix/R10.1 to R10.8 | rule 6, `commit-links.ts` (`commitHits`), `link.ts` (step 0), `types.ts`, `evidence.ts`, `validate-report.ts`, `modified-symbol.test.ts`, `modified-evidence.test.ts`, `self-link-modified.test.ts` |
