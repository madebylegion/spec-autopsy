# Requirements Document

## Introduction

A design review of the running Morgue page (1440x900) scored it 6/10. The data and the story are right, but six things look unfinished. This feature is a visual and interaction pass 2 of the existing Morgue UI in `src/ui/`: a full body on the map, a cleaner toe tag, labelled zombie markers, consistent filter chips, a two-way link between map and tags, and a stamped, atmospheric finish.

The dark slab palette, the token block at the top of `style.css`, the measured contrast ratios, the keyboard behaviour and the phone layout stay. It is plain TypeScript and CSS: no framework, no new dependency, no new font. Nothing under `src/linker`, `src/indexer`, `src/parser` or `src/report` changes, and the report format does not change.

Each requirement names a stable selector, attribute or text that the page exposes, so that it can be checked in the DOM and in a screenshot at 1440x900 and at 390x844. Requirement IDs follow the convention of the EARS parser: `morgue-pass-2/R<N>.<M>`, where M is the number written on the criterion line.

## Glossary

- **Morgue**: the Vite single-page UI in `src/ui/`.
- **Body map**: the SVG silhouette with its HTML marker buttons, in `.map` (wide) or the `<details class="map-phone">` (phone).
- **Region**: one of the seven body parts: `head`, `chest`, `abdomen`, `left-arm`, `right-arm`, `left-leg`, `right-leg`. A spec is assigned to a region by `regionForSpec`.
- **Used / unused region**: a region with at least one spec assigned / with none.
- **Marker**: the `button` of one requirement or one zombie. Its key is in `data-marker-key`.
- **Toe tag**: the card of one finding, `article.tag`. Its key is in `data-tag-key`.
- **Zombie group**: the labelled group of zombie markers on the body map.
- **Chip**: one of the four filter buttons (Ghosts, Zombies, Unproven, Low confidence).
- **Link**: the pairing of a marker with the toe tag of the same finding.
- **Link status line**: the element `[data-link-status]` with `aria-live="polite"`.
- **Token**: a custom property in the `:root` block at the top of `style.css`.

## Requirements

### Requirement 1: Full body always

**User Story:** As a visitor, I want the whole body drawn even when few specs exist, so that the map never looks broken.

#### Acceptance Criteria

1. The wide body map SHALL draw, inside `.map svg`, exactly seven elements with a `data-region` attribute, with the values `head`, `chest`, `abdomen`, `left-arm`, `right-arm`, `left-leg` and `right-leg`, each with a visible outline, for a report with any number of specs, including 0.
2. Each of the seven elements SHALL carry `data-region-state="used"` when at least one spec is assigned to its region by `regionForSpec`, and `data-region-state="unused"` otherwise.
3. An unused region SHALL be drawn with a lower-contrast outline than a used region, SHALL have no fill, and SHALL have no marker button in it.
4. WHEN a report has 0, 1, 3, 7 or 9 specs, THEN the number of `data-region-state="used"` elements SHALL be 0, 1, 3, 7 and 7, and the number of `unused` elements SHALL be 7, 6, 4, 0 and 0.
5. The mapping of spec to region SHALL NOT change (spec 1 head, 2 chest, 3 abdomen, 4 left arm, 5 right arm, 6 left leg, 7 and more right leg).
6. The view model SHALL export `BODY_REGIONS` (the seven regions in drawing order) and `regionStates(report)`, a pure function that returns for each region its state, its spec names and its requirement ids.
7. The silhouette icon of each spec block in the phone body map SHALL draw all seven body parts, with the block's region highlighted.
8. Screenshot at 1440x900 with a 3-spec report: the head, chest and abdomen are drawn at normal contrast, and both arms and both legs are drawn dimmed, with no part missing.

### Requirement 2: Toe tag layout

**User Story:** As a developer, I want a toe tag whose decoration never covers its text, so that every tag is readable.

#### Acceptance Criteria

1. Each toe tag SHALL be an `article.tag[data-tag-key]` that contains one `.tag-sheet`, and the sheet SHALL contain a `.tag-head` with, in order, a `.tag-eyelet`, the `.tag-id` and the `.tag-type`, followed by `.tag-title`.
2. The `.tag-eyelet` SHALL be a reserved zone that holds the punch hole (`.tag-hole`) and the string loop (`svg.tag-string`), and no other content.
3. The bounding box of `.tag-eyelet` and of `svg.tag-string` SHALL NOT intersect the bounding box of `.tag-id`, `.tag-type` or `.tag-title` of the same tag.
4. The page SHALL NOT draw the paperclip: no pseudo-element on `.tag` SHALL be positioned over the tag content.
5. The string loop SHALL be an inline SVG with `aria-hidden="true"`, drawn as a loop of string that passes through the hole, with its stroke colour taken from a token by a CSS class.
6. The `.tag-sheet` SHALL have a cut corner: the top-right corner (opposite the hole) SHALL be cut at an angle of 45 degrees, at least 20 px on each side, by a `clip-path: polygon(...)`.
7. The tag outline SHALL show the paper edge along every side, including the cut: `.tag` SHALL draw the edge colour (`--tag-paper-edge`) behind the sheet, and the sheet SHALL be inset so that an edge of at least 1 px remains visible.
8. The focus, selected and linked outlines SHALL be drawn on `.tag`, which is not clipped, and SHALL be fully visible.
9. The tag text SHALL keep its contrast (`--tag-ink` on `--tag-paper` at 11.1:1), and at 390 px wide no tag text SHALL be clipped or overflow its tag (`scrollWidth <= clientWidth` for `.tag` and `.tag-sheet`).
10. Screenshot at 1440x900 and 390x844: the hole and the string loop sit in the top-left corner zone, the id and the title start to the right of or below that zone, and the cut corner is visible at the top right.

### Requirement 3: Zombie markers

**User Story:** As a developer, I want to see which zombie is which on the map, so that I do not have to open every marker.

#### Acceptance Criteria

1. The wide body map SHALL draw all zombie markers inside one `div.zombie-group[role="group"][data-zone="extra-limbs"]` that is named by a visible heading with the exact text "Extra limbs (zombies)" (`aria-labelledby`).
2. The zombie group SHALL be on the right-hand side of the body map: its left edge SHALL be to the right of the right edge of the `right-arm` region, and its vertical range SHALL overlap the vertical range of the `chest` and `abdomen` regions. The page SHALL NOT draw any zombie marker or dashed box under the feet.
3. Each zombie marker SHALL be a `button.marker--zombie[data-marker-key]` that contains a visible `.marker-label` with the short symbol name, SHALL have `title` equal to the full symbol name, and SHALL have the accessible name `<full symbol name>, zombie`.
4. The short symbol name SHALL be the full name when it has at most 16 characters, and otherwise SHALL be cut in the middle with a single ellipsis character, keep the beginning and the end of the name, and be at most 16 characters long.
5. Each zombie marker SHALL stay reachable by keyboard in report order, with a visible `:focus-visible` outline, and SHALL open its detail as today.
6. The computed font size of `.marker-label` SHALL be at least 12 px at 1440x900 and at 390x844.
7. WHEN there are more zombie markers than fit the group, THEN the group SHALL scroll inside its own box, and the page SHALL NOT grow wider.
8. WHEN there is no zombie, THEN the zombie group SHALL still be drawn, dimmed, with `data-region-state="unused"`, the heading and the text "none".
9. The phone body map SHALL show the zombie block with the heading "Extra limbs (zombies)" and one marker row per zombie, each row at least 44 px high with its short name visible.
10. Screenshot at 1440x900: the labelled zombie group sits at the right of the torso, below its heading, and each marker shows a readable short name.

### Requirement 4: Filter chips

**User Story:** As a visitor, I want the four filters to look and behave the same, so that I can read their state at a glance.

#### Acceptance Criteria

1. The filter bar SHALL contain exactly four `button.chip` elements with `data-filter` equal to `ghost`, `zombie`, `unproven` and `low`, in this order.
2. All four chips SHALL have the same height, the same shape (no rounding), the same border width and the same font.
3. WHEN a chip is pressed, THEN it SHALL have `aria-pressed="true"`, be filled with its accent colour and show a check mark in `.chip-mark`; WHEN it is not pressed, THEN it SHALL have `aria-pressed="false"`, be drawn as an outline and have an empty `.chip-mark`.
4. WHEN the count of a chip is 0, THEN the chip SHALL have the `disabled` attribute, `aria-pressed="false"`, no check mark and a dimmed look, and the filters SHALL be applied as if that chip were off.
5. The "Low confidence" chip SHALL read "Low confidence only: off" or "Low confidence only: on", SHALL have `aria-pressed`, SHALL show its count in `.chip-count`, and SHALL use the chip style of the other three.
6. Each chip SHALL show its count in `.chip-count`.
7. The filter state SHALL persist as it does today: it is kept when the page is redrawn and when another report is opened.
8. The view model SHALL export `chipStates(filters, counts)` and `effectiveFilters(filters, counts)` as pure functions.
9. Every chip SHALL have a hit area of at least 44 px by 44 px on the phone, and the chips SHALL wrap without horizontal scroll at 390 px.
10. Screenshot at 1440x900 with a report that has 0 unproven findings: the Unproven chip is dimmed, not filled and has no check mark.

### Requirement 5: Link between map and tags

**User Story:** As a visitor, I want to jump between a marker and its tag in both directions, with the keyboard alone if I want, so that I can read the map and the tags together.

#### Acceptance Criteria

1. Every marker (wide and phone) SHALL expose `data-marker-key`, and every toe tag SHALL expose `data-tag-key`; for the same finding the two values SHALL be linked by the view model functions `tagKeyForMarker` and `markerKeyForTag`.
2. WHEN a marker is hovered or focused and its tag is on the page, THEN that tag SHALL get `data-linked="true"` and a visible dashed outline in a token colour; WHEN the marker is no longer hovered or focused, THEN the attribute SHALL be removed.
3. WHEN a toe tag is hovered, or the focus is on it or on a control inside it, THEN its marker SHALL get `data-linked="true"` and a visible dashed outline in a token colour, and the attribute SHALL be removed in the same way.
4. WHEN a marker is activated by click or Enter and its tag is on the page, THEN the page SHALL scroll that tag into view, SHALL move the focus to it (`article.tag` with `tabindex="-1"`), and SHALL keep the detail panel opening as today; WHEN the marker has no tag on the page (a proven requirement, or a tag hidden by a filter), THEN the focus SHALL go to the detail panel as today.
5. Each toe tag SHALL have a "Show on map" button with the accessible name `Show <id> on the map`; WHEN it is activated by click or Enter, THEN its marker SHALL get `data-linked="true"` until Escape is pressed or another link is made, and the focus SHALL move to the marker.
6. WHEN the phone body map is closed and "Show on map" is activated, THEN the page SHALL open it before it focuses the marker.
7. WHEN Escape is pressed, THEN the page SHALL remove every `data-linked` attribute and clear the link status line, and SHALL still close the detail panel as today.
8. The page SHALL scroll with `behavior: "smooth"` only when `prefers-reduced-motion: reduce` does not match, and with `behavior: "auto"` otherwise.
9. The page SHALL have one `[data-link-status][aria-live="polite"]` element that is not rebuilt when the page is redrawn; WHEN a link is made by keyboard focus or by activation, THEN it SHALL read "Showing <id> on the map" for a tag to marker link and "Showing the toe tag of <id>" for a marker to tag link, with `<id>` the short requirement id (the part after the last `/`) or the zombie symbol; WHEN a marker has no tag on the page, THEN it SHALL read "<id> has no toe tag on the page".
10. All of the link behaviour SHALL work with Tab, Enter and Escape only, and every control of it SHALL have a visible `:focus-visible` outline.
11. The view model SHALL export `tagKeyForMarker`, `markerKeyForTag`, `linkedKey`, `linkMessage` and `scrollBehavior` as pure functions, and the DOM code SHALL only call them.
12. Screenshot at 1440x900 with the pointer on a marker: the matching tag has a dashed outline; with the pointer on a tag: the matching marker has a dashed outline.

### Requirement 6: Stamped labels

**User Story:** As a visitor, I want the GHOST, ZOMBIE and UNPROVEN labels to look like an ink stamp, so that the tags feel real while staying readable.

#### Acceptance Criteria

1. The type label of a toe tag (`.tag .tag-type`) SHALL look like a rubber stamp: transparent background, a double border (`border-style: double`, at least 3 px) and text in the same stamp ink, rotated between -3 and -2 degrees.
2. The stamp ink SHALL be a token per type (`--ghost-stamp`, `--zombie-stamp`, `--unproven-stamp`), each of the hue of the accent of its type, and each at least 4.5:1 against `--tag-paper`.
3. The stamp edge SHALL be slightly uneven, made with CSS and one small inline SVG filter (`#stamp-rough`) that is applied to a pseudo-element that draws the border only, so that the text is not filtered and not blurred.
4. The stamp text SHALL be at least 14 px, uppercase, bold, with the letter spacing it has today (`0.12em`), and SHALL have no `text-shadow` and no `blur`.
5. The stamp SHALL NOT overlap `.tag-id`, `.tag-title` or the eyelet zone, and SHALL NOT be clipped at 390 px.
6. The `.tag-type` of the detail panel SHALL stay as it is.
7. The filter is deterministic: the SVG turbulence uses a fixed seed.
8. Screenshot at 1440x900 and 390x844: the stamp is readable, tilted, with a double border in the stamp ink and a slightly rough edge.

### Requirement 7: Examination table and motion

**User Story:** As a visitor, I want the body to lie on a steel table, so that the map column has atmosphere without noise.

#### Acceptance Criteria

1. The wide map column SHALL show a steel examination-table panel behind the body: `.map-slab` filled with `--steel`, a brushed look made from an inline SVG hairline pattern whose stroke is `--steel-line`, a thin rim in `--slab-line`, an inset light edge in `--steel-light` and a soft drop shadow in `--steel-shadow` on `.map`.
2. The steel panel SHALL use no gradient function, no image file and no download.
3. The text and the markers that sit on the steel panel SHALL keep their contrast: `--bone`, `--bone-dim`, `--ghost-ink`, `--zombie-ink` and `--unproven-ink` at least 4.5:1 and `--slab-line` at least 3:1 against `--steel`.
4. The page SHALL use no glow, no gradient text and no text shadow.
5. The only motion SHALL be the existing 200 ms swing of an opened tag and the 200 ms highlight transition of the link outline (both use `var(--swing)`), and WHEN `prefers-reduced-motion: reduce` matches, THEN all animation and transition SHALL be off.
6. Screenshot at 1440x900: the body lies on a dark steel panel with a thin rim and a soft shadow, and every marker and label on it stays readable.

### Requirement 8: No horizontal scroll

**User Story:** As a visitor on any screen, I want the page never to scroll sideways, so that I can read it.

#### Acceptance Criteria

1. At 390x844 and at 1440x900, `document.documentElement.scrollWidth` SHALL be at most `document.documentElement.clientWidth`, with a report that has 0, 3 and 300 findings and a very long title and symbol name.
2. The zombie group, the chips, the stamp, the link status line and the toe tags SHALL wrap or scroll inside their own box, and SHALL NOT widen the page.

### Requirement 9: Tap targets and focus

**User Story:** As a keyboard or phone user, I want every control to be easy to hit and easy to see, so that I can use the page.

#### Acceptance Criteria

1. At 390x844, every interactive element (chips, "Open details", "Show on map", markers, phone marker rows, "Open another report", "Close", the summary of the phone body map) SHALL have a hit area of at least 44 px by 44 px.
2. Every interactive element SHALL show a `:focus-visible` outline of at least 3 px in a token colour; the `.tag` outline SHALL stay fully visible.
3. The page SHALL keep the existing keyboard behaviour: Tab order follows the DOM, Escape closes the detail panel, and Close returns the focus to the control that opened the panel.

### Requirement 10: Tokens, dependencies and fonts

**User Story:** As a maintainer, I want the new look to stay inside the rules of the project, so that it stays checkable.

#### Acceptance Criteria

1. Every colour added by this feature SHALL be a token in the `:root` block at the top of `style.css`, with its contrast ratios measured and written in the comment above the block; the style rules test SHALL check them.
2. The existing tokens SHALL keep their values and their measured ratios.
3. `package.json` SHALL NOT change: no new dependency, no new script.
4. The page SHALL use no new font: no `@font-face`, no font file in `src/ui/public/`, no remote request.
5. The page SHALL NOT use `gradient(` in `style.css`, `transition: all`, `outline: none` without a replacement, an emoji or a remote `url(`.

### Requirement 11: Existing tests and boundaries

**User Story:** As a maintainer, I want the existing safety net to stay as it is, so that this pass cannot hide a regression.

#### Acceptance Criteria

1. No existing test file SHALL be edited to make it pass. WHEN an existing test fails because of the new behaviour, THEN design.md and the final report of the task SHALL say which test and why, and the test SHALL be left as it is.
2. This feature SHALL NOT change any file under `src/linker`, `src/indexer`, `src/parser` or `src/report`.
3. The new tests SHALL be new files, or new cases appended to `tests/report-and-morgue/style-rules.test.ts` without weakening an existing case.
4. The view model SHALL stay pure (no DOM, no `node:` import) and SHALL stay the only place for the logic of this feature.

### Requirement 12: Build and report loading

**User Story:** As a user, I want the Morgue to build and load the report as before, so that this pass is safe to ship.

#### Acceptance Criteria

1. `npm run morgue` SHALL still build `dist/ui` without error.
2. The page SHALL load `./report.json` as today and SHALL make no other network request.
3. The loading, error (missing, invalid JSON, invalid report, newer report), empty and bad-file banner states SHALL show the same texts and roles as today.
4. `npm run typecheck` and `npx vitest --run` SHALL pass.
