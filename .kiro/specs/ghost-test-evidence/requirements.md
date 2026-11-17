# Requirements Document

## Introduction

The `ghostEvidence` function in `src/report/evidence.ts` currently produces contradictory output when a ghost requirement has test links. The first line always states "no symbol or test links to <id>" even when test links exist, and the final contradiction line states "yet nothing links to <id>" even when test links are present. This contradicts the UI, which displays the test links in a "Test links" section directly below the evidence text. For example, requirement mcp-report-server/R4.2 in this repo's own report shows "no symbol or test links" followed by a list of 6 test links. This feature corrects the evidence strings to distinguish between ghosts with no test links and ghosts with test links only (which remain ghosts because tests do not prove that code exists).

## Glossary

- **Ghost**: A requirement with no code links and no tag test links (classified in `src/linker/classify.ts`). A ghost may have test links via commit or word overlap.
- **Test_Link**: A link between a requirement and a test, established by tag, commit, or word overlap (see `src/linker/link.test.ts`).
- **ghostEvidence**: The function in `src/report/evidence.ts` that returns a string array explaining why a requirement is classified as a ghost.

## Requirements

### Requirement 1: Correct ghost evidence strings to reflect test links

**User Story:** As a developer reviewing the Morgue, I want the ghost evidence to accurately describe the linking state, so that I understand whether test links exist without seeing contradictory statements.

#### Acceptance Criteria

1. WHEN a ghost requirement has zero test links, THE first evidence line SHALL remain exactly "no symbol or test links to <id> by tag, commit or word overlap" unchanged.
2. WHEN a ghost requirement has exactly one test link, THE first evidence line SHALL be exactly "no symbol links to <id>; 1 test link only (tests do not prove code)".
3. WHEN a ghost requirement has N > 1 test links, THE first evidence line SHALL be exactly "no symbol links to <id>; N test links only (tests do not prove code)".
4. WHEN a ghost requirement has zero test links, THE contradiction line SHALL end with "yet nothing links to <id>".
5. WHEN a ghost requirement has one or more test links, THE contradiction line SHALL end with "yet no symbol links to <id>".
6. THE rest of the contradiction line and the closest-name line SHALL remain unchanged.
7. THE `report.json` schema, the `Report` types in `src/report/types.ts`, the `validateReport` function, the confidence rules in `src/linker/classify.ts`, and all UI code SHALL remain unchanged.
8. THE change SHALL introduce no new npm dependencies.
9. A unit test SHALL fail on the old evidence strings and pass on the new evidence strings.
