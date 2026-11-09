# Requirements Document

## Introduction

The linker produces a body map. This feature adds the last two surfaces of the first version of SpecAutopsy: a versioned REPORT (a JSON document with every finding and its evidence) and the MORGUE, a single-page Vite UI that reads that report and shows it as a body map and a set of toe tags. Both are deterministic: no LLM, no network, no randomness, no timestamps, no absolute paths. The UI is static files, free to host.

Requirement IDs follow the convention of the EARS parser: `report-and-morgue/R<N>.<M>`, where M is the number written on the criterion line.

## Glossary

- **Report**: the JSON document returned by `buildReport`, with `schemaVersion` 1.
- **Finding**: one entry of `findings`: a ghost, an unproven requirement or a zombie.
- **Evidence sentence**: a short plain-text sentence that states a checkable fact about a finding.
- **Near miss**: a symbol and a requirement that share words but fall under the link threshold, so that a finding may be a synonym naming issue. Its score is defined in design.md.
- **Confidence**: `{ score, level }` of a finding, computed by the table of design.md.
- **Morgue**: the Vite single-page UI in `src/ui/`.
- **Toe tag**: the card of one finding. **Body map**: the SVG silhouette where each spec is a region and each requirement a marker.
- **Marker**: the `button` of one requirement or one zombie on the body map.

## Requirements

### Requirement 1: Report shape

**User Story:** As a tool author, I want one versioned JSON report, so that the UI, the MCP server and the Action read the same document.

#### Acceptance Criteria

1. The report module (`src/report/`) SHALL export `buildReport(bodyMap, requirementTexts, options)` as a pure function that returns a `Report` and imports from the parser, indexer and linker only.
2. The Report SHALL have exactly the top-level keys `schemaVersion`, `tool`, `project`, `summary`, `specs`, `findings` and `diagnostics`, in this order, and `schemaVersion` SHALL be the number 1.
3. The Report SHALL set `tool` to `{ name: "spec-autopsy", version }` with the version passed in `options`, and SHALL set `project` to `{ name }` with the base name of the body map root.
4. The Report SHALL contain the `summary` counts `requirements`, `ghost`, `unproven`, `proven` and `zombies`, and `bySpec`, which maps each spec folder name (the part of the requirement ID before `/`) to its requirement counts by status.
5. The Report SHALL contain `specs`: for each spec in order of first appearance, its name and its requirements in body map order, each with `id`, `text`, `status`, `file`, `line`, `lastCommit`, and the `codeLinks` and `testLinks` exactly as the linker gives them, including `method` and `commit` when present.
6. The Report SHALL copy `diagnostics` from the body map.
7. The Report SHALL contain no timestamp, no absolute path and no random value, and WHEN the same input is built twice, THEN the two JSON strings SHALL be identical.

### Requirement 2: Findings and evidence

**User Story:** As a developer, I want each finding to say what is wrong and how to check it, so that I can trust or challenge it.

#### Acceptance Criteria

1. The Report SHALL list in `findings` one entry per ghost, one per unproven requirement and one per zombie, in the order ghosts, unproven, zombies, and inside each group in body map order.
2. Each finding SHALL have `type` ("ghost", "unproven" or "zombie"), `requirementId` (a string, or `null` for a zombie), `title`, `file`, `line`, `evidence` and `confidence`.
3. WHEN a finding is a ghost or unproven, THEN `title` SHALL be the requirement text, and `file` and `line` SHALL be the requirement's own file and line.
4. WHEN a finding is a zombie, THEN `title` SHALL be the symbol name, and `file` and `line` SHALL be the symbol's file and line.
5. Each finding SHALL have `line` of at least 1 and at least one evidence sentence, and the first evidence sentence SHALL state the cause of the finding.
6. The Report SHALL build evidence sentences only from data of the body map and the requirement texts, in the forms of design.md, naming linked code as `file#symbol` followed by the commit SHA in parentheses when the link has one.

### Requirement 3: Confidence

**User Story:** As a developer, I want to know how sure the tool is, so that I can start with the findings that are surely real.

#### Acceptance Criteria

1. The Report SHALL compute `confidence` by the deterministic table of design.md, without a model call, with level `high`, `medium` or `low` and a score from 0 to 1 that depends on the level only.
2. WHEN a ghost has a near miss, THEN its confidence level SHALL be `low`; otherwise it SHALL be `high` when its spec has a code link by commit, and `medium` when not.
3. WHEN a requirement is unproven, THEN its confidence level SHALL be `high` when one of its code links is by commit or tag, and `medium` when all its code links are by overlap.
4. WHEN a zombie has a near miss, THEN its confidence level SHALL be `low`; otherwise it SHALL be `high` when a commit link names the zombie's file, and `medium` when not.
5. The linker SHALL record the best near miss of each ghost and each zombie on the body map as an optional field, and the Report SHALL NOT recompute it.

### Requirement 4: Report validation

**User Story:** As the UI author, I want to validate any JSON before drawing it, so that a bad file gives a clear message and not a crash.

#### Acceptance Criteria

1. The report module SHALL export `validateReport(value)` that returns `{ ok: true, report }` or `{ ok: false, errors }`, where errors is a non-empty array of strings.
2. The report module SHALL NOT throw from `validateReport` on any input, including non-objects, cyclic-free random values and objects with wrong types.
3. WHEN `schemaVersion` is not 1, THEN `validateReport` SHALL reject the value, and WHEN it is a number greater than 1, THEN the first error SHALL say that the report is newer than this viewer.
4. WHEN a top-level key is missing, a status or type is unknown, a finding has a `line` below 1 or a confidence score outside 0 to 1, or a finding has no evidence sentence, THEN `validateReport` SHALL reject the value and name the path of the first problems.
5. The UI SHALL use `validateReport` imported from the report module, without a copy.

### Requirement 5: CLI output

**User Story:** As a user, I want `npm run autopsy` to write the report, so that the Morgue and other tools can read it.

#### Acceptance Criteria

1. WHEN `npm run autopsy` runs, THEN the CLI SHALL write the Report to `.autopsy/report.json` next to `.autopsy/last.json`, as JSON with two-space indentation and a final newline.
2. WHEN `--json <path>` is given, THEN the CLI SHALL write the Report to that path instead, creating missing folders.
3. The CLI SHALL pass the `version` of `package.json` to `buildReport`.
4. The CLI SHALL keep writing `.autopsy/last.json` and SHALL print the same text as before this feature.
5. WHEN the planted fixture is analysed, THEN the Report SHALL list findings that match the 13 entries of `tests/fixtures/planted/expected.json`.

### Requirement 6: Page loading and states

**User Story:** As a visitor, I want the page to always show something meaningful, so that I know what happened.

#### Acceptance Criteria

1. The Morgue SHALL be a Vite app with root `src/ui`, built to `dist/ui` with `base: "./"`, so that the build opens from any static host.
2. WHEN the page opens, THEN it SHALL show the loading state with the line "Opening the morgue..." and fetch `./report.json`.
3. WHEN the fetch fails or the file is missing, THEN the page SHALL show an error state that tells the user to make a report with `npm run autopsy`.
4. WHEN the report is invalid or newer, THEN the page SHALL show an error state with the first errors of `validateReport`.
5. WHEN the report has no findings, THEN the page SHALL show "No bodies. Every requirement is built and proven." and SHALL still draw the body map.
6. The page SHALL offer an "Open another report" file input and drag-and-drop of a local `report.json`, validated in the same way, and a bad file SHALL leave the current report in place with the error shown.
7. The page SHALL handle a report with 0 specs, a very long title or path (wrapped, no overflow) and 300 findings (a plain list, no layout jump).
8. The page SHALL make no network request other than `./report.json`.

### Requirement 7: View model

**User Story:** As a maintainer, I want the logic of the page in pure functions, so that it is tested without a DOM.

#### Acceptance Criteria

1. The Morgue SHALL keep grouping, filtering, sorting, region assignment, clamping, card text and state derivation in `src/ui/view-model.ts` as pure functions that use no DOM.
2. The view model SHALL sort cards ghosts first, then unproven, then zombies, and inside a type by confidence level high to low, then by file and line by code-unit comparison, and SHALL keep the sort stable.
3. The view model SHALL filter by type toggles and by a "Low confidence" toggle, and SHALL give the count of each type for the toggle labels.
4. The view model SHALL assign spec number 1 to the head, 2 chest, 3 abdomen, 4 left arm, 5 right arm, 6 left leg and 7 right leg, SHALL give specs from 8 on the last region, and SHALL use only the first regions when there are fewer than 7 specs.
5. The view model SHALL clamp a card title to 3 lines of text for the card and SHALL keep the full text for the detail view.
6. The view model SHALL derive the page state (loading, error, empty, ready) as data.

### Requirement 8: Body map

**User Story:** As a visitor, I want to see where the bodies are, so that I can find the weak parts of a project at a glance.

#### Acceptance Criteria

1. The page SHALL draw an SVG human silhouette, front view, lying on a morgue slab, where each spec is a body region and each requirement of the spec is a marker placed in a grid inside that region.
2. The page SHALL draw each zombie as a marker on a separate "extra limb" strip beside the body.
3. The page SHALL mark status with colour and with a second cue: ghost an open ring, unproven a dashed ring, proven a filled dot.
4. Each marker SHALL be a real `button`, reachable by keyboard, with a visible focus ring and an accessible name that has the id (or symbol) and the status.
5. WHEN a marker is activated, THEN the page SHALL open its toe tag detail below the map and scroll it into view, and WHEN Escape is pressed, THEN the page SHALL close the detail.
6. WHEN a requirement is proven, THEN its marker SHALL open a detail view as well, with its links.
7. The page SHALL keep every marker hit area at least 44 px by 44 px on a phone by enlarging the hit area, not the drawn marker.

### Requirement 9: Toe tags, filters and detail

**User Story:** As a developer, I want one card per finding and a place to read its evidence, so that I can act on it.

#### Acceptance Criteria

1. The page SHALL show one toe tag per finding, shaped like a morgue toe tag (a hole and a string), with the tag colour by type.
2. Each toe tag SHALL show the requirement id or the symbol, the title clamped to 3 lines, `file:line`, the confidence level with its score, and a "Cause of death" line that is the first evidence sentence.
3. The page SHALL show a detail view, in the page and not in a modal, with all evidence sentences, the code and test links with their method (tag, commit or overlap) and the last commit when there is one.
4. The page SHALL show three toggle buttons (Ghosts, Zombies, Unproven) with counts and `aria-pressed`, and a "Low confidence" toggle, and the toggles SHALL wrap on a narrow screen.
5. The page SHALL list the toe tags sorted by the view model rule.
6. The header SHALL show the project name, the tool version and the totals of ghosts, zombies and unproven as three big numbers.

### Requirement 10: Look and motion

**User Story:** As a visitor, I want a Halloween look that stays readable, so that the tool is memorable and usable.

#### Acceptance Criteria

1. The stylesheet SHALL define a token block at the top of `style.css` with named colours: dark slab-grey and bone-white surfaces and ONE signal accent per type.
2. The text SHALL have a contrast ratio of at least 4.5:1, and large text, marker edges and field edges at least 3:1, against their surface.
3. The page SHALL use only the system font stack, and a condensed system face for numbers and tags, with no web font, no CDN, no emoji and no cartoon ghosts.
4. The page SHALL animate only a slight swing of a toe tag when it opens, with a CSS transform of 200 ms, and a `prefers-reduced-motion` rule SHALL remove all motion.
5. The page SHALL show a `:focus-visible` ring on every interactive element and SHALL NOT use `transition: all` or `outline: none` without a replacement.
6. The page SHALL use no purple gradient, no glow text and no neon.

### Requirement 11: Responsive layout

**User Story:** As a phone user, I want the same page on a small screen, so that I can read a report anywhere.

#### Acceptance Criteria

1. WHEN the viewport is 1440 by 900, THEN the page SHALL show the body map on the left and the toe tags on the right in two columns.
2. WHEN the viewport is 390 by 844, THEN the page SHALL use one column with the body map above the tags, scaled to the screen width.
3. The page SHALL not scroll horizontally at 390 px, SHALL keep tap targets at least 44 px, and SHALL show the main content without a first-screen wall of decoration.

### Requirement 12: Project wiring and tests

**User Story:** As a maintainer, I want the scripts and tests in place, so that the surfaces stay correct.

#### Acceptance Criteria

1. `package.json` SHALL pin `vite` 7.3.8 exactly as a devDependency and add no runtime dependency for the UI.
2. `package.json` SHALL have the scripts `ui:dev`, `ui:build`, `ui:preview` and `morgue`, where `morgue` runs the autopsy on the repository root with the report at `src/ui/public/report.json` and then `ui:build`.
3. `npm run typecheck` SHALL check `tsconfig.json` and `tsconfig.ui.json`.
4. The repository SHALL test `buildReport` and `validateReport` in `tests/report/`, including a fast-check property that `validateReport` never throws, and the report of the planted fixture against `expected.json`.
5. The repository SHALL test the view model in `tests/ui/` with vitest and no DOM.
6. The CLI test SHALL assert that `.autopsy/report.json` is written and valid.
