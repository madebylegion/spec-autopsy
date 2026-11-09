# Design Document

## Overview

`link(requirements, index, parserDiagnostics?)` joins requirements, the code index and the tests into a body map. It is a pure function. `linkProject(root)` calls `parseProject` and `indexRepo`, then `link`. The linker is the third organ: it imports from `src/parser` and `src/indexer` only, never from report, mcp or ui.

Flow: tags (explicit links) -> overlap (only where a requirement lacks an explicit link) -> classify -> assemble and sort.

## Types (`src/linker/types.ts`)

```ts
import type { SymbolKind } from "../indexer/index.js";

export type LinkMethod = "tag" | "overlap";
export type RequirementStatus = "ghost" | "unproven" | "proven";
export type ZombieKind = "function" | "class" | "const" | "enum" | "interface" | "type";

export interface CodeLink { symbol: string; file: string; startLine: number; method: LinkMethod; score: number }
export interface TestLink { title: string; file: string; line: number; method: LinkMethod; score: number }
export interface LastCommit { date: string; subject: string; author: string }

export interface RequirementEntry {
  id: string;
  status: RequirementStatus;
  file: string;            // the requirement's own location
  line: number;
  codeLinks: CodeLink[];
  testLinks: TestLink[];
  lastCommit: LastCommit | null;
}

export interface Zombie { symbol: string; kind: ZombieKind; file: string; line: number }

export interface BodyMapDiagnostic {
  source: "parser" | "indexer" | "linker";
  code: string;            // linker codes: "unknown-requirement-tag", "link-failed"
  message: string;
  file: string;
  line: number | null;     // null for index diagnostics
}

export interface BodyMapCounts { requirements: number; ghost: number; unproven: number; proven: number; zombies: number }

export interface BodyMap {
  root: string;
  requirements: RequirementEntry[];
  zombies: Zombie[];
  diagnostics: BodyMapDiagnostic[];
  counts: BodyMapCounts;
}
```

`SymbolKind` is imported only so `ZombieKind` stays a subset of it. Key order in every object is the order written above; builders construct objects literally in that order.

## Module layout (`src/linker/`)

- `types.ts`: the types above, plus `TagHit` and the accuracy types.
- `tags.ts`: `TAG_PATTERN`; `findTags(text): { id: string; lineOffset: number }[]`; `tagsInFile(file: FileIndex): TagHit[]` where `TagHit = { id; file; line; target: { kind: "symbol"; symbol: Symbol } | { kind: "test"; testCase: TestCase } | null }`. Pure; `null` target means the tag attached to nothing.
- `overlap.ts`: `THRESHOLD = 0.5`, `STOPWORDS`, `tokenise(text): string[]`, `requirementTokens(req)`, `symbolTokens(name)`, `sharedCount(a, b)`, `overlapScore(a, b)`, `overlaps(a, b)`.
- `classify.ts`: `classifyRequirement(codeLinks, testLinks)`, `isZombieCandidate(symbol, file)`, `findZombies(index, linkedSymbolKeys)`.
- `link.ts`: `link(...)`: runs tags, overlap, classify, `lastCommit`, sorting, diagnostics merge.
- `accuracy.ts`: `scoreAgainstTruth(bodyMap, truth)`.
- `index.ts`: re-exports, and `linkProject(root)`.

## Algorithm

Symbol identity is `file`, `startLine`, `name` (names can repeat). A requirement id maps to the first requirement entry that has it.

**1. Explicit tags** (`tagsInFile`, per file):

- `TAG_PATTERN = /(?<![A-Za-z0-9-])[a-z0-9][a-z0-9-]*\/R\d+\.\d+/g`, case-sensitive. Tags are searched in `comments[].text` and, in test files, in `testCases[].title`.
- A tag at offset k line breaks into a comment starting at line L has line L + k. The comment's end line is L + (line breaks in the text).
- Non-test file: among symbols whose `[startLine, endLine]` contains the tag line, take the innermost (smallest range, then lowest startLine, then lowest name). If none, take the first symbol (sorted order) with `endLineOfComment < startLine <= endLineOfComment + 3`. Consequence: a tag in a JSDoc right above a method inside a class lies inside the class range, so it attaches to the class, not to the method.
- Test file: the test case with `line` equal to the tag line; else the first test case with `commentEnd < line <= commentEnd + 3`. A tag in a title attaches to its own test case. A test file never attaches to symbols, a non-test file never to test cases.
- Known id: a link `{ method: "tag", score: 1 }`, deduplicated per requirement and target. Unknown id: diagnostic `unknown-requirement-tag` with file and tag line (the test case line for a title tag), no link. Known id with `null` target: dropped silently.

**2. Token overlap**, only for a requirement with no explicit code link (code side) or no explicit test link (test side); the two sides are independent.

`tokenise(text)`: split camelCase (`([a-z0-9])([A-Z])` and `([A-Z]+)([A-Z][a-z])` into separate words) and snake_case, lowercase, split on `[^a-z0-9]+`, drop stopwords and tokens shorter than 3 characters, strip one trailing `s` from tokens longer than 3 characters unless they end in `ss`, drop tokens that are stopwords after stripping, deduplicate keeping the first occurrence. Stopwords: the, a, an, of, to, and, or, in, on, for, with, shall, when, then, if, while, where, is, are, be, it, that, this, as, by, at, from, not, no, any, each, every.

Two refinements to the plain recipe make `tokenise` idempotent (R3.3): the `ss` exception, because stripping `glass` twice would give `gla`; and the stopword check after stripping, because `ands` would otherwise become the stopword `and` on a second pass. After stripping, a token never ends in `s` unless it ends in `ss`, is at least 3 characters long and is not a stopword, so a second pass changes nothing.

Token sets: requirement = `tokenise(system + " " + response + " " + trigger + " " + state + " " + condition + " " + feature)` (missing parts are empty). Code = `tokenise(symbol.name)` (the `.` in `Class.method` is a separator). Test = `tokenise(testCase.title)`.

```
shared(A, B) = |A ∩ B|
score(A, B)  = shared(A, B) / min(|A|, |B|)      (0 if A or B is empty)
link         = shared >= 2  and  score >= THRESHOLD
THRESHOLD    = 0.5     // exported from src/linker/overlap.ts
```

`score` is symmetric and within 0..1. Every candidate that passes becomes a link `{ method: "overlap", score }`, not only the best one. Code candidates are all symbols (any kind, exported or not) of non-test files; test candidates are test cases. THRESHOLD is a fixed design constant: it is not tuned to the planted fixture. If accuracy is low, it is reported (R6.6).

**3. Classification:** `ghost` if no code links; else `unproven` if no test links; else `proven`. A zombie is an exported symbol of a non-test file with kind function, class, const, enum, interface or type that has no link to any requirement (tag or overlap).

**4. `lastCommit`:** among the files of the requirement's code links, take each file's `history.commits[0]`; pick the newest by `Date.parse(date)` (unparseable dates rank oldest), ties by lowest file path. `{ date, subject, author }`, or `null` if there is no code link or no commit.

**5. Assemble:** requirements in input order; links sorted by file, line, name or title; zombies by file, line, symbol; diagnostics merged (parser: `source: "parser"`, line kept; index: `source: "indexer"`, line `null`; linker: `source: "linker"`) and sorted by file, line (null first), code, message, source. All comparisons use code units, never `localeCompare`. Counts are derived from the lists.

## Accuracy (`accuracy.ts`)

```ts
export interface TruthEntry { class: "ghost" | "zombie" | "unproven"; key: string }
export interface ClassScore { found: number; planted: number; truePositives: number; precision: number; recall: number }
export interface AccuracyReport { ghost: ClassScore; zombie: ClassScore; unproven: ClassScore; overall: ClassScore }
```

Found findings: ghost and unproven keyed by requirement id, zombie keyed by `file#symbol`. Truth and found are treated as sets. `precision = tp / found`, `recall = tp / planted`, each 1 when the denominator is 0. Overall sums the three classes. Proven requirements are not scored.

## Planted fixture plan (`tests/fixtures/planted/`)

Two specs, `stock` and `orders`, 7 requirements each. The texts are written by the implementer, who checks by hand with the rules above that each row behaves as planned. `expected.json` is written from this table first and never changed afterwards.

| ID | Class | Code link | Test link | Notes |
|---|---|---|---|---|
| stock/R1.1 | proven | tag on `recordAdjustment` (src/stock.ts) | tag | text must contain record, stock, adjustment, reason |
| stock/R1.2 | proven | overlap | overlap | TS only, no tags |
| stock/R1.3 | unproven | tag | none | no test overlaps it |
| stock/R1.4 | ghost | none | none | |
| stock/R2.1 | ghost | none | none | decoy A: shares 2 tokens with `buildReorderAlertSummaryReport` (5 tokens), score 0.4 < THRESHOLD |
| stock/R2.2 | proven | overlap | tag | |
| stock/R2.3 | unproven | overlap | none | |
| orders/R1.1 | proven | tag on `tallyBeacon` (src/orders.ts) | tag | decoy C: name shares no word with the requirement text |
| orders/R1.2 | proven | overlap (src/shipping.py) | overlap (tests/test_shipping.py) | Python, no tags |
| orders/R1.3 | proven | tag | overlap | |
| orders/R1.4 | unproven | tag | none | |
| orders/R2.1 | unproven | overlap | none | |
| orders/R2.2 | ghost | none | none | |
| orders/R2.3 | ghost | none | none | |

Truth: ghosts `stock/R1.4`, `stock/R2.1`, `orders/R2.2`, `orders/R2.3`; unproven `stock/R1.3`, `stock/R2.3`, `orders/R1.4`, `orders/R2.1`; zombies:

- `src/stock.ts#buildReorderAlertSummaryReport` (decoy A, partial overlap with ghost stock/R2.1)
- `src/stock.ts#recordStockAdjustmentReasons` (decoy B: shares words with stock/R1.1, which has an explicit code link, so overlap is skipped for it)
- `src/stock.ts#legacyCsvExport` (plain)
- `src/orders.ts#OrderDebugFlags` (exported const)
- `src/shipping.py#export_audit_blob` (Python)

Also present as negatives: a non-exported helper, an unlinked method of an exported class, and a Python `_private` function; none is a zombie. Proven (6): tag/tag 2, overlap/overlap 2, mixed 2. Every zombie name and every untagged test title must be checked by hand against all requirements, so that no zombie overlaps any requirement and no unproven requirement gets a test link. The key list lives in `expected.json` as `[{ "class": "ghost", "key": "stock/R1.4" }, ...]`.

## Error model

`link` never throws. Inputs are used as given; empty requirements or an empty index give an empty body map. Files with empty `comments`, `symbols` or `testCases` just contribute nothing. Tag problems become `unknown-requirement-tag` diagnostics. `linkProject` wraps `parseProject`, `indexRepo` and `link` in one guard: an unexpected error returns an empty body map (root as given) with one `link-failed` diagnostic (source `linker`, file `.`, line 1). Parser and index diagnostics pass through unchanged.

## Determinism

No clock, no random values, no I/O in `link`; no absolute paths other than `root` as passed in. Output is sorted as above, with a fixed key order, so JSON output is identical for equal inputs.

## Testing

Example tests per module in `tests/linker/`. Properties with fast-check: `tokenise` is total and idempotent; `overlapScore` is within 0..1 and symmetric; `link` never throws on generated requirements and a small generated index; each requirement appears once with one status; equal inputs give deep-equal body maps; no ghost has code links. Accuracy test on the planted fixture prints one line per class and overall and asserts sanity bounds and overall precision and recall of at least 0.8. A self-run test runs `linkProject` on this repository's root. Fixtures sit under `tests/fixtures/`, which vitest excludes.
