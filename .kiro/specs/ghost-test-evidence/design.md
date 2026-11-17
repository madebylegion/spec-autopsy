# Design Document: Correct Ghost Evidence for Test Links

## Overview

The `ghostEvidence` function in `src/report/evidence.ts` produces contradictory output when a ghost has test links: it states "no symbol or test links" and "nothing links to <id>" even when test links exist. This is incorrect because ghosts are classified by the absence of code links and tag test links only (see `src/linker/classify.ts`); commit and overlap test links may still exist. This design corrects the evidence strings by counting `entry.testLinks.length` and adjusting the output accordingly.

## Architecture

The change is confined to the `ghostEvidence` function in `src/report/evidence.ts`. The function receives a `RequirementEntry` object that includes a `testLinks` array. The fix counts the length of this array and produces different strings based on whether it is zero, one, or greater than one.

## Components and Interfaces

### 1. `src/report/evidence.ts` — ghostEvidence Function

**Current behavior:**
- First line: always "no symbol or test links to <id> by tag, commit or word overlap"
- Contradiction line: ends with "yet nothing links to <id>"

**Modified behavior:**
- Count `entry.testLinks.length`
- If zero: keep current strings unchanged
- If one: first line becomes "no symbol links to <id>; 1 test link only (tests do not prove code)"
- If > 1: first line becomes "no symbol links to <id>; N test links only (tests do not prove code)"
- Contradiction line ending: "yet nothing links to <id>" when zero test links, "yet no symbol links to <id>" when test links exist
- All other lines remain unchanged

### 2. Callers Checked

The following callers of `ghostEvidence` were checked and require no changes:

- **src/report/build-report.ts** (`requirementFinding` function): calls `ghostEvidence` and stores the result in `ReportRequirement.evidence` array. The string change is transparent.
- **src/ui/view-model.ts** (`cardText` function): uses the first line of `evidence` array as card cause text. The string change is transparent.
- **src/ui/view-model.ts** (`detailFor` function): copies `evidence` array into `Detail.evidence`. The string change is transparent.
- **src/ui/render.ts** (`detailPanel` function): renders `detail.evidence` as-is. The string change is transparent.

No caller inspects or parses the evidence strings; they are all treated as opaque display text.

### 3. Existing Tests

The following existing tests use ghost evidence strings with zero test links and remain valid:

- **tests/recall-fix/doubtful-ghost.test.ts**: creates ghosts with no test links; assertions on evidence strings remain valid because the zero-test-link case is unchanged.
- **tests/report/build-report.test.ts**: creates ghosts with no test links; assertions remain valid for the same reason.

## Data Models

No data model changes. The `RequirementEntry` type already includes `testLinks: TestLink[]`. The `ReportRequirement` type already includes `evidence: string[]`. The change only affects the content of the strings.

## Testing Strategy

### Unit Tests (example-based)

A new test file `tests/report/ghost-test-evidence.test.ts` will include:

1. **Ghost with zero test links**: verify first line is "no symbol or test links to <id> by tag, commit or word overlap" and contradiction ends "yet nothing links to <id>"
2. **Ghost with one test link**: verify first line is "no symbol links to <id>; 1 test link only (tests do not prove code)" and contradiction ends "yet no symbol links to <id>"
3. **Ghost with six test links**: verify first line is "no symbol links to <id>; 6 test links only (tests do not prove code)" and contradiction ends "yet no symbol links to <id>"
4. **Ghost with one test link and no contradiction**: verify first line is correct and no contradiction line exists
5. **Ghost with zero test links and no contradiction**: verify first line is correct and no contradiction line exists

Each test will be tagged with a comment `// ghost-test-evidence/R1.<n>` directly above its `it(` line. The `ghostEvidence` function itself will be tagged with `// ghost-test-evidence/R1.2` in `src/report/evidence.ts`.

### Correctness Properties

This is a string-formatting change with discrete cases (0, 1, >1 test links). Example-based tests cover all branches comprehensively. Property-based testing is not applicable here.

## Error Handling

No error handling changes. The `entry.testLinks` array is always defined (may be empty). Counting its length is safe.
