# Design Document

## Overview

One rule changes: a requirement with no code link and at least one tag test link is `proven`. The change is one condition in `classifyRequirement`. The report gets one new pure helper, `provenEvidence`, that words the case. Nothing else in the linker or the report moves, the report shape and `schemaVersion` 1 stay, and THRESHOLD is not touched.

Why the tag and not the overlap: a tag test link is the author's claim ("this test checks R11.4"); an `overlap` test link is a word-match guess made by the tool. Trusting a guess to remove a ghost would hide true ghosts, so a guess alone changes nothing.

## The rule

```ts
// src/linker/classify.ts
// constraint-reqs/R1.1
export function classifyRequirement(
  codeLinks: readonly CodeLink[],
  testLinks: readonly TestLink[],
): RequirementStatus {
  if (codeLinks.length === 0) {
    return testLinks.some((t) => t.method === "tag") ? "proven" : "ghost";
  }
  if (testLinks.length === 0) return "unproven";
  return "proven";
}
```

Truth table (code links = C, test links = T):

| C | T | Status |
| --- | --- | --- |
| none | none | ghost |
| none | only `overlap` or `commit` | ghost |
| none | at least one `tag` | proven (new) |
| some | none | unproven |
| some | any | proven |

The doc comment above the function changes from "ghost: no code links" to name the exception. A `commit` test link (a test written by a task commit) is not a tag: the task chain is a tool inference, and the earlier `recall-fix` rules already decide what a commit proves. Only the `tag` method counts.

## Callers and ordering

`grep` finds one non-test caller of `classifyRequirement`: `src/linker/link.ts`, step 3, `status: classifyRequirement(codeLinks, testLinks)`. Both arrays are the final sorted arrays of the work, so they already hold every link of steps 0 (commit), 1 (tag), 2 (overlap) and 2b (`test-call`). Consequences:

- Ordering needs no change. Step 2b (`test-call`) runs before classification, only for a requirement with no code link and at least one test link. If the tagged test calls a zombie candidate, the requirement gets a `test-call` code link and is `proven` by the old rule. If it calls nothing that qualifies, the requirement has no code link and the new rule makes it `proven`. Both end in `proven`.
- The `testOnlyCommit` block that follows (`codeLinks.length === 0 && testOnlySha !== undefined`) sets `proven` and `testOnlyCommit` as before. It can now run on an entry that is already `proven`; the assignment is idempotent and the diagnostic `test-only-task` is still emitted exactly as today.
- The block `if (entry.status === "ghost")` computes `nearMiss` and `contradiction` only for ghosts. A requirement made `proven` by the new rule skips it, which is correct: it is no longer a ghost finding.
- The counting loop at the end counts by `entry.status`, so `counts.proven` includes the new entries and `counts.ghost` drops.
- `src/linker/index.ts` re-exports `classifyRequirement` unchanged. The other consumers (`build-report.ts`, `src/cli/autopsy.ts`, `src/ui/*`) read `entry.status` and never call it.

The tag step (step 1) is the only place that creates a test link with method `tag`: a comment tag above a test case, or a tag inside a test title. A tag that attaches to no test case creates no link (`target === null`) and so proves nothing.

## Report side

`src/report/evidence.ts` has `ghostEvidence`, `unprovenEvidence` and `zombieEvidence`. There is no proven-evidence function today because `buildReport` makes a finding only for ghosts, unproven requirements and zombies; a proven requirement appears in `specs[].requirements[]` and has no `evidence` field. So nothing in the report assumes a proven entry has a code link, and nothing crashes or prints an empty line for the new case. `confidence.ts` is called only for findings, so it is not reached by a proven entry and does not change.

The feature still adds the helper, so that the wording exists, is tested and is available to whoever shows a proven entry:

```ts
// src/report/evidence.ts
// constraint-reqs/R2.1
export function provenEvidence(entry: RequirementEntry): string[] {
  const tagged = entry.testLinks.find((t) => t.method === "tag");
  const first = entry.testLinks[0];
  if (entry.codeLinks.length > 0) {
    return [first === undefined ? "proven" : `proven by test ${first.file}:${first.line}`];
  }
  if (tagged !== undefined) return [`no code link; proven by tagged test ${tagged.file}:${tagged.line}`];
  if (entry.testOnlyCommit !== undefined) {
    return [`no code link; proven by test-only task commit ${sha7(entry.testOnlyCommit)}`];
  }
  if (first !== undefined) return [`no code link; proven by test ${first.file}:${first.line}`];
  return ["no code link"];
}
```

`entry.testLinks` is already sorted by file, line, title, so "first" is deterministic. The function is total: it never throws and always returns one non-empty string. Precedence when both a tag and a `testOnlyCommit` exist: the tag line wins, because it is the author's claim.

Limit, stated plainly: `provenEvidence` is not called by `buildReport`, because adding an `evidence` field to proven requirements, or a new finding type, would change the report shape, which this feature must not do. The Morgue UI detail panel therefore still shows "No code linked." for such a requirement and no evidence line. Showing the line there is a UI change that needs its own spec and an update of `product.md` first; it is out of scope. The helper is exported and tagged (`constraint-reqs/R2.1`) so that the self-autopsy does not list it as a zombie.

`validate-report.ts`: `checkArrayOf(req, "codeLinks", ...)` accepts an empty array, `STATUSES` already contains `proven`, and nothing requires a proven entry to have a code link; `METHODS` already contains `tag` for test links. The test-only-task entries already travel through it with empty `codeLinks`. So no source change is expected; R4.1 adds a test that pins it. If the test shows a rejection, the fix is limited to the check that rejected it.

## Types

No type changes. `RequirementStatus`, `RequirementEntry`, `TestLink` and the report types stay as they are.

## Error model

`classifyRequirement` and `provenEvidence` are total functions over arrays: an empty array is valid input, nothing is indexed out of range (`find` and `[0]` are checked for `undefined`), and neither reads anything outside its arguments.

## Existing tests that may fail

The human ran the suite (the agent has no shell): 705 pass, 2 fail, `tsc` clean. Both failures are confirmed, both are intended consequences of constraint-reqs/R3.4, and the human (Commander-delegated) decided to update them minimally. No other assertion was changed.

- **(a) CONFIRMED, edited. `tests/linker/classify.test.ts`, "is ghost without code links, even with test links".** The old line `expect(classifyRequirement([], [testLink])).toBe("ghost")` used a `testLink` with method `tag`, which is exactly the case the new rule turns into `proven`. Reason: the old rule (any test link without code is a ghost) is the one this spec deliberately replaces. Exact edit: that line is now `expect(classifyRequirement([], [{ ...testLink, method: "overlap" }])).toBe("ghost")`. The test keeps checking "ghost without code links, even with test links" for a guess (`overlap`); the tag case (`proven`) is checked in `tests/linker/constraint-reqs.test.ts`.
- **(b) CONFIRMED, edited. `tests/linker/link-properties.test.ts`, "never throws, lists each requirement once with one status, and keeps counts consistent".** It asserted `codeLinks.length > 0` for every `proven` entry. Reason: its random test file has tag comments such as `// spec/R1.1` that attach to a random test case, so a requirement with such a tag and no code is now `proven` with empty `codeLinks`. That invariant is the one constraint-reqs/R3.4 changes. Exact edit: in the `else` branch for `proven`, the line `expect(entry.codeLinks.length).toBeGreaterThan(0)` is now wrapped in `if (!entry.testLinks.some((t) => t.method === "tag")) { ... }` (with a `// constraint-reqs/R3.4` comment), so `proven` needs a code link OR a tag test link. The assertion `testLinks.length > 0` for `proven` is unchanged.
- **(c) Held-out and blind accuracy tests** (`tests/linker/heldout-accuracy.test.ts`, the existing held-out test, and any blind-fixture test). Not opened. A ghost on those fixtures that has a tag test link flips to `proven`: a false ghost disappears (precision up), a true ghost with a tag test link would be lost (recall down). The floor is 0.80 for precision and recall. If a floor test fails, report the printed numbers and the flipped requirement IDs; do not change the floor, THRESHOLD or any `expected.json`. (The human's run showed no other failure.)
- **(d) Checked and expected to pass.** `tests/linker/test-call.test.ts`, `commit-links.test.ts` and `modified-symbol.test.ts` have ghost cases, but their test links are by `overlap` or `commit`, not `tag`. The four planted ghosts (`stock/R1.4`, `stock/R2.1`, `orders/R2.2`, `orders/R2.3`) have no tag in any planted file (searched by ID), so the planted counts (14 findings, 4 ghosts, 4 unproven, 6 zombies) do not move. `tests/linker/self-link-modified.test.ts` only bounds the ghost count from above, and the count can only fall. The generated artifacts `.autopsy/*.json` and `src/ui/public/report.json` are not regenerated by this work; the human reruns `./demo.sh` for that.

## Fixture plan

The planted fixture gets new files only. No existing file changes and `expected.json` is not edited: `tests/helpers/build-fixture-repo.ts` commits every file that `commits.json` does not list in one initial commit, so `commits.json` needs no entry either. The new requirement is proven, so it adds no finding of any class and the existing tests that pin 14 findings and 4 ghosts see the same result.

- `.kiro/specs/kerb-style/requirements.md`, one requirement: R1.1 "The kerb stylesheet SHALL NOT use any gradient." (follow the layout of `.kiro/specs/dispatch/requirements.md` in the same fixture).
- `src/kerb.css`: a few lines of plain CSS with no gradient. It is a text file; the indexer reads no symbols from it. It is the artifact the constraint is about, and there is no code to link.
- `tests/test_kerb.py`:

```python
# kerb-style/R1.1
def test_kerb_sheet_is_flat():
    text = open("src/kerb.css").read()
    assert "gradient" not in text
```

  The tag sits on the line above the `def`, so `tagsInFile` attaches it by look-ahead to that test case, giving a test link with method `tag` and line 2 (the implementer recounts after writing the file).
- Expected outcome: `kerb-style/R1.1` is `proven`, `codeLinks` is empty, the single test link has method `tag` and file `tests/test_kerb.py`; the findings still equal `expected.json`.

The implementer checks by hand, with the `tokenise` rules, that the words `kerb`, `stylesheet` and `gradient` appear in no other requirement, symbol name or test title of the planted fixture (so no overlap link appears), and that the calls of the test (`open`, `read`) name no exported symbol of `src/` (so no `test-call` link appears). The test has no symbol to call: the point of the case is a requirement with a tag test link and nothing else. The case where the fixture would show the old behaviour (a ghost) is covered by the unit tests, not by the planted fixture, because a new planted ghost would change the 14 findings.

## Testing

Tests live in `tests/`, mirror `src/`, and carry the tag of the requirement they check (`// constraint-reqs/R<N>.<M>` on the line above the `it(`, one comment may hold several IDs). They use no property of `src/` that is not exported. New files:

- `tests/linker/constraint-reqs.test.ts`:
  - `classifyRequirement`: tag only (`proven`), overlap only (`ghost`), commit only (`ghost`), tag plus code (`proven`), code without test (`unproven`), no link (`ghost`), tag plus overlap plus no code (`proven`).
  - `provenEvidence`: the line `no code link; proven by tagged test tests/a.test.ts:12` for a tag test link; first tag link wins when there are several; the test-only-task line; the fallbacks `no code link; proven by test <file>:<line>` and `no code link`; the line for an entry with code links; never throws on an entry with empty arrays.
  - `link` on a hand-written index (patterns of `tests/linker/test-call.test.ts`): a test file with comment `// s/R1.1` above a test case and an index with no code gives `proven`, empty `codeLinks`, one test link with method `tag`, no zombie, `counts.proven` 1; the same index with a title that only overlaps gives `ghost`; a tag whose comment is too far from any test case gives `ghost`.
  - `buildReport` plus `validateReport`: the report built from the map above passes `validateReport`, has the entry under `specs` with `status: "proven"` and `codeLinks: []`, and has no finding for it.
  - fast-check: for random lists of code links and test links (methods from `commit`, `tag`, `overlap`, `test-call` for code, `commit`, `tag`, `overlap` for tests), (1) if some test link has method `tag`, the status is not `ghost`; (2) if there is a code link, the status equals the old rule written in the test (`unproven` without test links, `proven` with); (3) if there is no code link and no tag test link, the status is `ghost`; (4) two calls return the same value.
- `tests/linker/constraint-reqs-planted.test.ts`: builds the planted fixture with `buildFixtureRepo`, links it with `linkProject`, asserts `kerb-style/R1.1` is `proven` with no code link and a `tag` test link in `tests/test_kerb.py`, and that the findings (ghost and unproven requirements and zombies, as `class key`) equal `expected.json` and number 14. Same layout as `tests/linker/precision-fix-planted.test.ts`.

## Requirement coverage

| Requirement | Covered by |
| --- | --- |
| constraint-reqs/R1.1 to R1.6 | `classify.ts`, `link.ts` (unchanged call site), `constraint-reqs.test.ts` |
| constraint-reqs/R2.1 to R2.7 | `evidence.ts` (`provenEvidence`), `validate-report.ts` (unchanged unless the test shows otherwise), `constraint-reqs.test.ts` |
| constraint-reqs/R3.1 to R3.6 | the whole change, the "Existing tests that may fail" section, the final run |
| constraint-reqs/R4.1 to R4.5 | `constraint-reqs.test.ts`, `constraint-reqs-planted.test.ts`, the planted files |
| constraint-reqs/R5.1 to R5.3 | the final run: `npx vitest --run`, `npx tsc --noEmit`, `npm run autopsy` |
