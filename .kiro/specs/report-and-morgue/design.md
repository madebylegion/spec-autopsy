# Design Document

## Overview

`src/report/` turns a `BodyMap` plus requirement texts into a versioned `Report`. `src/ui/` is a Vite page that loads that report, validates it with the same `validateReport`, and draws it. Dependencies flow one way: parser and indexer, linker, report, then cli and ui. The report module never imports from `ui` or `cli`. The UI imports `src/report/` types and `validateReport` only (the report module must not import `node:` modules, so the browser bundle stays clean).

## Near miss (linker change)

A ghost has no links and a zombie has no requirement, so the body map alone holds no near-miss data. The linker therefore records it (the one linker change of this feature, with a test):

```ts
export interface NearMiss {
  /** The other side of the near miss. */
  requirementId: string | null; // set on a zombie
  symbol: string | null;        // set on a ghost
  file: string;
  line: number;
  score: number;                // overlapScore, 0..1, below the link threshold
}
// RequirementEntry.nearMiss?: NearMiss   (ghosts only)
// Zombie.nearMiss?: NearMiss
```

Rule: for a ghost, the best `overlapScore(requirementTokens, symbolTokens)` over every non-test symbol; for a zombie, the best over every requirement. Ties go to the lowest file, line, then name by code-unit order. The field is set only when the best score is at least `NEAR_MISS = 0.4` (exported from `src/linker/overlap.ts`) and the pair is not linked; otherwise it is left out, so body maps without near misses stay byte-identical to before. Pure and deterministic.

## Report schema

```ts
export type FindingType = "ghost" | "unproven" | "zombie";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface Report {
  schemaVersion: 1;
  tool: { name: "spec-autopsy"; version: string };
  project: { name: string }; // base name of bodyMap.root, never a path
  summary: {
    requirements: number; ghost: number; unproven: number; proven: number; zombies: number;
    bySpec: Record<string, { requirements: number; ghost: number; unproven: number; proven: number }>;
  };
  specs: ReportSpec[];
  findings: Finding[];
  diagnostics: BodyMapDiagnostic[];
}
export interface ReportSpec { name: string; requirements: ReportRequirement[] }
export interface ReportRequirement {
  id: string; text: string; status: RequirementStatus; file: string; line: number;
  lastCommit: LastCommit | null; codeLinks: CodeLink[]; testLinks: TestLink[];
}
export interface Finding {
  type: FindingType;
  requirementId: string | null; // null for a zombie
  title: string;                // requirement text, or zombie symbol name
  file: string; line: number;   // line >= 1
  evidence: string[];           // at least one
  confidence: { score: number; level: ConfidenceLevel };
}
export interface ReportOptions { version: string }
export function buildReport(map: BodyMap, texts: ReadonlyMap<string, string>, options: ReportOptions): Report;
export type ValidateResult = { ok: true; report: Report } | { ok: false; errors: string[] };
export function validateReport(value: unknown): ValidateResult;
```

Key order is built literally in `buildReport`. `bySpec` keys follow first appearance of the spec. A requirement text missing from `texts` is `""` and the finding title falls back to the id. Spec name is the id before the first `/` (whole id if none). `validateReport` checks keys and their order is not enforced; it collects up to 5 errors with a path like `findings[2].line: must be an integer >= 1`, and never throws (the whole body is in try/catch that returns one error).

## Evidence sentences

| Finding | Evidence, in order |
| --- | --- |
| ghost | `no symbol or test links to <id> by tag, commit or word overlap`; then, when a near miss exists, `closest name: <file>#<symbol> shares words (score 0.xx)` |
| unproven | `no test case links to this requirement`; then one `linked code: <file>#<symbol> (commit <sha7>)` per code link (the `(commit ...)` part only for commit links; `(tag)` or `(overlap 0.xx)` otherwise), at most 5, then `and N more` |
| zombie | `exported function never referenced by a requirement` (`<kind>` replaces `function`; "exported" is dropped for `kind` other than function, class, const; the sentence is `<kind> <symbol> is never referenced by a requirement` otherwise); then, when a near miss exists, `closest requirement: <id> shares words (score 0.xx)` |

SHAs are shortened to 7 characters in sentences and kept whole in links.

## Confidence table

| Type | Condition (first match wins) | Level | Score |
| --- | --- | --- | --- |
| ghost | `nearMiss` present | low | 0.3 |
| ghost | some code link in the same spec has method `commit` (the commit chain would have caught real work) | high | 0.9 |
| ghost | otherwise (tags and overlap only) | medium | 0.6 |
| unproven | some code link of the requirement has method `commit` or `tag` | high | 0.9 |
| unproven | all code links are `overlap` | medium | 0.6 |
| zombie | `nearMiss` present | low | 0.3 |
| zombie | some code link of any requirement has method `commit` and the same `file` as the zombie (the file has task-commit history, and no task claims this symbol) | high | 0.9 |
| zombie | otherwise | medium | 0.6 |

Score depends on the level only. Level by score: `>= 0.8` high, `>= 0.5` medium, else low; `validateReport` checks that they agree.

## Module layout

```
src/report/
  types.ts        Report, Finding, ... (no node imports)
  confidence.ts   confidence(table above)
  evidence.ts     evidence sentences
  build-report.ts buildReport
  validate-report.ts validateReport
  index.ts
src/cli/autopsy.ts   writes .autopsy/report.json or --json <path>
src/ui/
  index.html  main.ts  view-model.ts  style.css  tsconfig.ui.json
  render.ts   (thin DOM code)  body-map.ts (SVG building)  public/report.json (generated, gitignored)
vite.config.ts  (root: "src/ui", base: "./", build.outDir: "../../dist/ui", emptyOutDir: true)
tsconfig.json   (include: src, tests; exclude: src/ui)
tsconfig.ui.json (lib ES2022 + DOM, include: src/ui and src/report, types: [])
```

`runAutopsy(root, options?: { jsonPath?: string; version?: string })` keeps its printed text. The CLI reads `version` from `package.json` next to the CLI (two levels up from `src/cli`), parses `--json <path>` from `process.argv`, and writes the Report with `JSON.stringify(report, null, 2) + "\n"`. The first non-flag argument is still the root.

## View model (`src/ui/view-model.ts`)

```ts
export type Region = "head"|"chest"|"abdomen"|"left-arm"|"right-arm"|"left-leg"|"right-leg";
export function regionForSpec(index: number): Region;          // 0-based; >= 6 gives right-leg
export interface Filters { ghost: boolean; zombie: boolean; unproven: boolean; lowOnly: boolean }
export function applyFilters(findings: Finding[], f: Filters): Finding[];
export function sortFindings(findings: Finding[]): Finding[];  // stable
export function typeCounts(findings: Finding[]): Record<FindingType, number>;
export function cardText(f: Finding): { id: string; title: string; clamped: string; where: string; confidence: string; cause: string };
export function clampTitle(text: string, maxChars?: number): string; // 3 lines ~ 3*40 chars, cut on a word, adds "..."
export function groupByRegion(report: Report): RegionGroup[];  // spec -> region -> requirement markers (with grid cells)
export type PageState =
  | { kind: "loading" }
  | { kind: "error"; title: string; lines: string[] }
  | { kind: "empty"; report: Report }
  | { kind: "ready"; report: Report };
export function stateFromLoad(result: {status:"missing"} | {status:"json-error"} | {status:"validated"; result: ValidateResult}): PageState;
```

An all-0 findings report gives `empty`. A missing report gives an error with the line `Run npm run autopsy to make one.`. Several specs share a region in spec order, and their markers are laid out in one grid in that order.

## UI layout

```
header:  project name · v<version>      [ GHOSTS n ] [ ZOMBIES n ] [ UNPROVEN n ]   [Open another report]
main (>= 900 px, 2 columns)                      main (phone, 1 column)
+-----------------+  +------------------+        header
| BODY MAP (svg)  |  | filters          |        BODY MAP
| slab, body,     |  | detail panel     |        filters
| extra limb strip|  | TOE TAGS (list)  |        detail panel
+-----------------+  +------------------+        TOE TAGS
```

The body map column is sticky on wide screens. The detail panel sits above the tag list in the right column and below the map on a phone (same DOM place; on phone, activating a marker scrolls to it).

## Page state machine

```
loading --fetch ok + valid, findings > 0--> ready
loading --fetch ok + valid, findings = 0--> empty
loading --404 / network error--> error (how to make a report)
loading --invalid / newer schema--> error (first validator errors)
ready|empty --open file ok--> ready|empty
ready|empty --open file bad--> same state, error banner above (current report kept)
error --open file ok--> ready|empty
```

Detail panel: `closed` / `open(findingId)`; Escape or the close button goes to `closed`; a marker or a card opens it.

## Token block (top of `style.css`)

Names: `--slab` (page surface), `--slab-raised` (cards, panels), `--slab-line` (borders and field edges, 3:1), `--bone` (text), `--bone-dim` (secondary text, 4.5:1), `--ghost-ink` (ghost accent, a cold pale blue), `--zombie-ink` (zombie accent, a sickly green), `--unproven-ink` (unproven accent, a dull amber), `--focus-ring` (bone-white ring colour), `--tag-ink` (dark text on tag fills), `--font-body`, `--font-display` (system condensed stack), `--tap` (44px), `--swing` (200ms). No purple, no gradients, no text-shadow. The task that fills the values states the measured contrast of each pair.

## Testing

Vitest only. `tests/report/` covers `buildReport` on a hand-made body map, determinism, no absolute path, the planted fixture against `expected.json`, `validateReport` including a fast-check no-throw property, and the near miss. `tests/ui/view-model.test.ts` covers the view model without a DOM. The CLI test covers `.autopsy/report.json`.
