# Design Document

## Overview

Four deterministic rules remove the four measured causes of false findings. The indexer records more data (optional fields only); `link` stays pure and reads that data from the index. Nothing in `src/` names anything from a fixture. With no new data, and no number of 2 or more digits in a text, the result is the one `link` gives today.

## Types

All additions are optional, so every existing object keeps its shape and report schema v1 stays valid.

```ts
// src/indexer/types.ts
interface Symbol   { /* ... */ references?: string[] }           // identifier names its body uses
interface TestCase { title: string; line: number;
                     endLine?: number; calls?: string[] }        // body extent and identifier names

// src/linker/types.ts
type LinkMethod = "commit" | "tag" | "overlap" | "test-call";
```

`validate-report.ts` has a `METHODS` list; `test-call` is added there. This is the only report change besides one evidence branch. The new index fields never reach the report.

## Which layer reads what

- Indexer (`src/indexer/`): `py-extractor.ts` adds Python constants. `ts-extractor.ts`, `py-extractor.ts` and `comments.ts` fill `references`, `calls` and `endLine` from the syntax tree they already have, with an iterative walk (the `walk` generator pattern of `comments.ts`), no dependency and no shell. `index.ts` passes the option and `clampSymbols` copies `references`, because it rebuilds every symbol field by field and would drop it.
- Linker (`src/linker/`): `overlap.ts` keeps numbers. `link.ts` adds step 2b (`test-call`) and step 2c (helper adoption) after token overlap. `types.ts` adds the method value. `tags.ts`, `classify.ts` (`classifyRequirement`, `findZombies`) and `commit-links.ts` do not change.
- Report (`src/report/`): `evidence.ts` names `test-call` in the linked-code line; `validate-report.ts` accepts the value. `confidence.ts` needs no code change: `unprovenConfidence` already gives `medium` unless a link is `commit` or `tag`; a test gives it a unit test.

The new data is produced only when asked. `extractTs`, `extractPy` and `extractTestCases` get an optional last parameter (`withDetails`, default `false`) and `indexRepo` passes `true`. Existing callers and tests, such as `tests/indexer/comments.test.ts`, which compares test cases with `toEqual([{ title, line }])`, see the same objects as before. This keeps the filling inside the existing extraction functions without breaking those assertions.

## The rules

**Rule 1, Python constants (cause 1).** In `extractPy`, for each child of the module root of type `expression_statement` whose first named child is an `assignment`: take the `left` field; accept it only when it is an `identifier` and the assignment has a `right` field (so `NAME: int` alone is out; `NAME: int = 3` has a `type` field and a `right`). For a chain `A = B = 1` the outer `left` is `A`, so only `A` counts. Skip `__all__` and dunder names (`isDunder` is already there; the check also covers `__all__`). The symbol is `{ name, kind: "const", exported: topLevelExported(name), range: the statement }`. Tuple, attribute and subscript targets are not identifiers, so they fall out. Assignments inside `if`, `try`, `def` or `class` are not direct children of the module and are never visited. No change in `tags.ts`: a tag comment on the line above is found by `symbolForTag` through the look-ahead, as for a function. A public Python constant that nobody tags becomes a zombie candidate, like an exported TypeScript `const`; that is the intended parity.

**Rule 2, numbers (cause 4).** In `tokenise`, the early `continue` on `raw.length < 3` becomes: keep the token when it is `/^[0-9]{2,}$/`, otherwise drop it if shorter than 3 or a stopword, as now. The "s" strip never touches an all-digit token, because it does not end in "s". A kept digit token passes through the second `tokenise` run unchanged, so the result stays idempotent. A single digit is still dropped.

Effect to watch: a number is one more token on each side that has it. When both sides have it, the shared count and the score go up. When only the smaller side has it, the denominator `min(|A|, |B|)` may grow with no shared word and the score may fall; a link that exists today could in rare cases be lost. The summary names any such case. Nothing else in the overlap formulas changes.

**Rule 3, `test-call` (cause 2).** Step 2b of `link`, after the overlap step. First, snapshot the explicit owners: for each work, the keys of its code links whose method is `tag` or `commit`. Then, for each active work with no code link and at least one test link: collect the `calls` of its linked test cases (a map from `file`, `line`, `title` to the test case is built once from the index). For each non-test file and each symbol with `isZombieCandidate` true whose `name` is in that set: skip it when another work owns it explicitly; otherwise add a code link `{ method: "test-call", score: 1 }` and add its key to `linkedSymbols`. Because the owners are a snapshot taken before this step, and a `test-call` link never counts as an owner, the result does not depend on the order of the requirements, and a test that overlaps two requirements cannot take a symbol that a tag or a commit gave to another one. A true ghost with an accidental test overlap stays a ghost when the only symbols its test calls are owned elsewhere. The step adds links only; it never removes or changes one.

`explicitCode` is not set by this step, so no other step reads it differently.

**Rule 4, helper adoption (cause 3).** Step 2c, after step 2b. Roots: every symbol of a non-test file whose key is in `linkedSymbols`. Build `byName`: the zombie candidates of non-test files that are not in `linkedSymbols`, by name. Walk with a work list and a `visited` set of keys: for each root, for each name in `references`, for each candidate in `byName.get(name)` that is not yet visited, add it to `adoptedSymbols` and to the work list; adopted helpers are read for their own `references`. Only roots and adopted helpers are read, so a reference from a test file, from a zombie that was not adopted, or from any symbol that is not linked adopts nothing. Private functions between a root and a helper are not traversed: only linked and adopted symbols are sources. `adoptedSymbols` is the set that the design filter of `recall-fix` already uses, and the zombie step already excludes `linkedSymbols ∪ adoptedSymbols`, so `findZombies` does not change.

Known limits, stated so nobody is surprised. A reference is a name, not a resolved binding: a local variable or a parameter with the same name as an exported function counts as a reference to it, and when two files define the same candidate name both are adopted. Both can hide a true zombie, never create a false one. The score of the held-out fixture decides whether this is acceptable.

## Order of steps in `link`

0 commit links, 1 tags, 2 token overlap, 2b `test-call`, 2c adoption, 3 classify and assemble. Steps 2b and 2c only add links or adopted keys, so every result of the earlier steps survives.

## Error model

The extractor changes sit inside the existing `try` of `indexRepo`: a failure gives the `parse-failed` diagnostic and empty symbols, as today, and never throws. `link` treats a missing `calls`, `endLine` or `references` as an empty list and never throws on partial data (a call that names no symbol, a reference that names no symbol, a test case missing from the map). No file, git or clock access is added to `link`.

## Fixture plan

The planted fixture gets new files only, plus appended entries; no existing file changes. The existing tests assert exactly 14 planted findings (`tests/report/planted-report.test.ts`) and exactly 4 planted ghosts (`tests/cli/autopsy.test.ts`), so the new scenarios must produce no finding of any class. Then `expected.json` needs no new entry, and the only add-only edit is one appended chore commit in `commits.json` that lists the new files (check `tests/helpers/build-fixture-repo.ts` for how unlisted files are handled before relying on that). The three scenarios are built up over tasks 1, 3 and 4; each task appends to files that this spec created.

- `.kiro/specs/dispatch/requirements.md`: R1.1 "The dispatcher SHALL cap each lane at 12 bundles." (task 1); R1.2 "WHEN a lane is sealed, the dispatcher SHALL hand every bundle to the night courier." (task 3).
- `src/dispatch.py`: `# dispatch/R1.1` above `LANE_CEILING = 12` (task 1; before the fix this tag attaches to nothing and R1.1 is a ghost). Task 3 adds `rotate_manifest`, whose name shares no word with R1.2. Task 4 makes `rotate_manifest` call an exported `pad_manifest_rows`, which calls an exported `blank_row`.
- `tests/test_dispatch.py`: a test tagged `# dispatch/R1.1` that uses `LANE_CEILING` (task 1); a test named `test_hands_every_bundle_to_night_courier` that calls `rotate_manifest` and nothing else from `src` (task 3). It must not call the helpers, so they are adopted and not `test-call` linked.
- Expected outcome: R1.1 proven (tag on the constant, tag on the test); R1.2 proven by a `test-call` link to `rotate_manifest` only; `pad_manifest_rows` and `blank_row` linked to nothing and not zombies. Findings stay at 14.

The implementer recounts line numbers and checks by hand, with the `tokenise` rules, that no new name or test title shares two words with a requirement of another spec, and that no new requirement shares two words with an existing symbol name or title. The cases that need a ghost or a zombie, the explicit-link exception, a cycle and a reference from a test file, are covered by hand-written indexes in unit tests, not by the planted fixture.

The held-out and blind fixtures are not touched. The only new use of the held-out fixture is one new test file, `tests/linker/heldout-accuracy.test.ts`, that links it, prints precision and recall in the format of `planted-accuracy.test.ts` and asserts both are at least 0.80. The existing held-out test, which asserts only sane numbers, stays as it is.

## Existing tests that may fail

None confirmed: I wrote this spec without running the suite. Candidates the implementer checks first, each of which is named here and in the reply if it fails, with the reason, and is not edited:

- `tests/indexer/` tests that compare a whole `FileIndex` or `Symbol` from `indexRepo` with `toEqual` (the new `references` field), and tests on a Python source with a module-level assignment (a new `const` symbol). The extractor-level tests are protected by the `withDetails` default.
- `tests/linker/` and `tests/report/` tests whose requirement or title text contains a number of 2 or more digits (rule 2 changes the token sets and so possibly the score).
- A `tests/report/` test that lists the accepted link methods exactly.
- `tests/linker/recall-fix`-style self tests on this repository (`tests/recall-fix/recall-fix-self.test.ts`): the new spec adds requirements to this repository, and rule 4 removes zombies; the assertions there are about ghosts of another spec and should hold.
- `tests/report/planted-report.test.ts` and `tests/cli/autopsy.test.ts` hold only while the planted scenarios stay finding-free, as planned.

py-extractor.test.ts 'ignores nested functions and non-definition statements': asserted that `x = 1` is no symbol; changed on purpose by rule 1 (owner decision)

## Testing

Tests mirror `src/`: `tests/indexer/py-constants.test.ts`, `tests/indexer/call-data.test.ts`, `tests/linker/overlap-numbers.test.ts` (a new file, so `overlap.test.ts` is not edited), `tests/linker/test-call.test.ts`, `tests/report/test-call-report.test.ts`, `tests/linker/helper-adoption.test.ts`, `tests/linker/precision-fix-planted.test.ts`, `tests/linker/precision-fix-properties.test.ts`, `tests/linker/heldout-accuracy.test.ts`. Indexer tests parse small strings through the same grammar loader as `tests/indexer/comments.test.ts`. fast-check properties: with no `calls`, no `references` and no Python constants, `link` deep-equals the result with `calls: []` and `references: []` everywhere and has no `test-call` link and no extra adopted key (generated texts contain no digit-only token, since rule 2 intentionally changes those); with the data present, every code link, test link and zombie-exclusion of the run without the data is still there; two runs deep-equal and have the same JSON; `tokenise` stays idempotent on strings with digits.

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
