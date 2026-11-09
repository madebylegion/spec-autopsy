# Design Document

## Overview

A visual and interaction pass on `src/ui/`. Files touched: `view-model.ts` (pure logic), `body-map.ts`, `render.ts`, `main.ts`, `style.css`, `index.html`, and one new thin DOM file `link-map.ts` (hover, focus and scroll wiring). Nothing under `src/linker`, `src/indexer`, `src/parser`, `src/report`, and no change to `package.json`. Dependencies still flow one way; `link-map.ts` imports only `view-model.ts`.

## Two conflicts with existing rules (decisions)

1. **Gradients.** `tests/report-and-morgue/style-rules.test.ts` fails on any `gradient(` in `style.css`, and the brief asks for a brushed steel from CSS gradients. The test is not edited. The steel uses an inline SVG `<pattern>` of hairlines (stroke from a CSS class on a token) plus `box-shadow` with token colours. If gradients are wanted later, that is a decision for the owner (a deliberate, scoped change to that test), not part of this spec.
2. **Stamp colour.** The accent tokens (`--ghost-ink` and the others) are about 1.5:1 on `--tag-paper`, far below the 4.5:1 the brief demands for the stamp text. The stamp therefore uses three new tokens of the same hues but dark enough for paper: `--ghost-stamp`, `--zombie-stamp`, `--unproven-stamp`. The accents stay for the tag top bar, the big numbers and the chips.

Other decisions: (a) a marker click on a marker that has a tag moves the focus to the tag, not to the detail panel, as the brief asks; the detail panel still opens as today, and a marker without a tag (proven, or hidden by a filter) still focuses the detail panel. (b) There is no DOM test environment (jsdom would be a new dependency), so DOM and screenshot checks are a manual checklist at the end of this file; the logic is covered by vitest on pure functions, and the CSS by text rules. (c) No existing test is expected to fail. `body-map-model.test.ts` checks every marker against `REGION_BOXES[region]`; the zombie markers keep a grid position inside the (moved) `extra-limb` box, so it still holds. If it does fail, the task says so and leaves the test alone. (d) The existing 200 ms tag swing stays as the one animation, next to the 200 ms highlight transition.

## Geometry

`BODY_WIDTH = 300` (the body, unchanged boxes), `MAP_WIDTH = 460`, `MAP_HEIGHT = 700`. The extra 160 units on the right hold the zombie group: `REGION_BOXES["extra-limb"] = { x: 312, y: 100, w: 140, h: 490 }`. The CSS replaces the literal `300` (aspect ratio, `cqw` dot size, map width formula) by `--map-w: 460` and `--map-h: 700` (plain numbers, not colours). The wide column grows from `22rem` to `28rem`. Zombie marker `x/y/cell` stay computed by `gridPositions` (they keep the existing tests valid) but the zombie group lays its buttons out as an HTML list in report order, because a grid cell is too small for a label.

## Item 1: full body always

- Exposes: `.map svg [data-region]` (7 elements, class `map-body`), `data-region-state="used|unused"`, class `map-body--unused`. Phone: `svg.icon` always has the 7 parts.
- CSS: `.map-body { fill: none; stroke: var(--slab-line) }`, `.map-body--unused { stroke-opacity: 0.45 }`. No new colour.
- View model:
  ```ts
  export const BODY_REGIONS: readonly Region[];            // the 7, drawing order
  export interface RegionState { region: Region; state: "used" | "unused"; specs: string[]; requirementIds: string[] }
  export function regionStates(report: Report): RegionState[]; // always 7 entries; built on groupByRegion
  ```
- `silhouette()` takes the `RegionState[]` and sets the two attributes; the list of parts no longer depends on the data.
- Tests (new file `tests/ui/body-map-full.test.ts`): `regionStates` for 0, 1, 3, 7, 9 specs gives 7 entries, used counts 0/1/3/7/7, region order, spec names kept in order; a spec with no requirements still counts as used.

## Item 3: zombie group

- Exposes: `div.zombie-group[role=group][aria-labelledby][data-zone="extra-limbs"][data-region-state]` with `h3` text "Extra limbs (zombies)" and an inner `ul`; each zombie `button.marker.marker--zombie[data-marker-key][title][aria-label]` with `span.marker-dot` and `span.marker-label` (`aria-hidden="true"`; the accessible name is the full name from `aria-label`). Empty: `data-region-state="unused"` and a `p` "none".
- CSS: the group is absolutely placed with percentages from `REGION_BOXES["extra-limb"]`, `overflow-y: auto`, dashed `--slab-line` frame (the old SVG strip is removed); rows `min-height: var(--tap)`; `.marker-label { font-size: 0.75rem }` (12 px), one line. Phone: the zombie `specBlock` becomes a single-column list of rows (`.phone-zombie-row`, 44 px) with the same label.
- View model:
  ```ts
  export const ZOMBIE_LABEL_MAX = 16;
  export function middleTruncate(text: string, max: number): string; // <= max chars, keeps head and tail, one "…"
  ```
- Tests: `middleTruncate` leaves short text, result length `<= max` (fast-check property), keeps the first and last characters, contains one ellipsis only when cut, is deterministic, copes with `max < 3` and empty text. Existing `buildMarkers` zombie tests stay valid.

## Item 2: toe tag

```
li.tag-item
  article.tag[data-tag-key][tabindex=-1]     <- not clipped: focus, selected and linked outline target
    div.tag-shape                            <- clip-path cut corner, background = paper edge colour
      div.tag-sheet                          <- same polygon, margin 1.5px, background = paper, accent top bar
        div.tag-head
          div.tag-eyelet  (span.tag-hole + svg.tag-string)
          span.tag-id   span.tag-type
        p.tag-title
        button "Open details"   button "Show on map"
        dl.tag-meta
```

`.tag-shape` is a wrapper with no text of its own; `.tag-sheet` is the container R2.1 names.

- CSS: `.tag-shape { background: var(--tag-paper-edge); clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%) }` and `.tag-sheet { margin: 1.5px; background: var(--tag-paper); clip-path: polygon(0 0, calc(100% - 24px) 0, 100% 24px, 100% 100%, 0 100%) }`, so an edge of 1.5 px in the paper-edge colour follows every side, including the cut. `.tag-head` is a grid `56px minmax(0,1fr) auto`: the eyelet column is reserved and nothing is absolutely positioned over text.
- String loop: `svg.tag-string` (24 x 56 viewBox, in the eyelet zone and the padding above the tag, no text there), one `<path>` with class `tag-string-line` (`stroke: var(--bone-dim); fill: none; stroke-width: 2`), a loop that goes down through the hole centre.
- Focus: the `:focus-visible`, `.tag--selected` and `.tag[data-linked="true"]` outlines are on `.tag` (unclipped). The old `.tag::before` paperclip rule is deleted.
- Tests: CSS text rules (task 4): the paperclip rule is gone, `clip-path: polygon` exists for the tag, `.tag-head` reserves a column. Manual: bounding boxes of `.tag-eyelet` against `.tag-id`, `.tag-type`, `.tag-title`.

## Item 6: stamp and steel

- Stamp: `.tag .tag-type { --stamp: var(--ghost-stamp) ...per type; position: relative; color: var(--stamp); background: transparent; font-size: 0.875rem; transform: rotate(-2.5deg); padding: 2px 12px; letter-spacing: 0.12em }`. `.tag .tag-type::before { content: ""; position: absolute; inset: 0; border: 3px double var(--stamp); filter: url(#stamp-rough); pointer-events: none }`: the border is filtered, the text is not. `index.html` holds one hidden `<svg class="defs" aria-hidden="true" width="0" height="0">` with `<filter id="stamp-rough">`: `feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="1" seed="3"` into `feDisplacementMap scale="1.8"` (fixed seed, so the same output every time). The detail-panel `.tag-type` keeps the old filled style (the new rules are scoped to `.tag .tag-type`).
- Steel: new tokens `--steel`, `--steel-line`, `--steel-light`, `--steel-shadow`. `body-map.ts` draws `rect.map-slab` (fill `--steel`, stroke `--slab-line`) and a second `rect.map-brush` filled with `url(#brush)`, where `<pattern id="brush" width="6" height="3">` holds one `line.map-brush-line` (`stroke: var(--steel-line)`). `.map { box-shadow: inset 0 1px 0 var(--steel-light), 0 10px 24px var(--steel-shadow) }`. No gradient function, no image.
- Starting token values (the style rules test measures them; adjust to meet the ratios): `--steel #2f3236`, `--steel-line #3a3e44`, `--steel-light #4a4f56`, `--steel-shadow #0b0c0d`, `--ghost-stamp #8a2418`, `--zombie-stamp #4a5410`, `--unproven-stamp #7f3806`. My hand estimates, not yet measured: stamps on `--tag-paper` 4.8 to 5.3; `--bone-dim` on `--steel` 6.3, `--ghost-ink` 5.0, `--slab-line` 3.4.
- Tests: style rules (task 4): token names present, stamp pairs at least 4.5 on `--tag-paper`, ink pairs at least 4.5 and `--slab-line` at least 3 on `--steel`, `.tag .tag-type` font size at least 14 px, rotation in -3..-2 deg, `border: 3px double`, no `blur(` and no `text-shadow`, `filter: url(#...)` only.

## Item 4: chips

- Exposes: `div.filters[role=group]` with four `button.chip[data-filter=ghost|zombie|unproven|low]`, children `span.chip-mark` (aria-hidden, check mark or empty), `span.chip-label`, `span.chip-count`. Disabled: `disabled`, `aria-pressed="false"`. Low label: "Low confidence only: off|on".
- CSS: one `.chip` rule (min-height `var(--tap)`, 2px solid `--accent`, no radius, display font, uppercase), `.chip[aria-pressed="true"]` fills with `--accent` and `--tag-ink`, `.chip:disabled { opacity: 0.45; cursor: not-allowed }`. The `.toggle` rules are removed. Phone grid stays 2 per row.
- View model:
  ```ts
  export interface ChipCounts { ghost: number; zombie: number; unproven: number; low: number }
  export interface ChipState { key: "ghost" | "zombie" | "unproven" | "low"; label: string; count: number; pressed: boolean; disabled: boolean }
  export function chipStates(f: Filters, counts: ChipCounts): ChipState[]; // fixed order
  export function effectiveFilters(f: Filters, counts: ChipCounts): Filters; // a chip with count 0 counts as off
  ```
  `pressed` is `f[key] && count > 0`. `effectiveFilters` stops a stale "low only" (after another report is opened) from hiding everything with no way to switch it off. `render.ts` uses it for `applyFilters` and `markerVisible`. The stored `Filters` in `main.ts` is unchanged, so persistence is as today.
- Tests: counts 0 give `disabled` and not pressed even when the stored flag is true; label text; order; `effectiveFilters` makes `lowOnly` off when no low finding exists and leaves the rest alone; stored filters are not mutated.

## Item 5: link map and tags

- Exposes: `[data-marker-key]` on wide markers and phone markers, `[data-tag-key]` on `article.tag`, `data-linked="true"` on the linked element, `button.link-button[data-show-on-map]` with `aria-label="Show <id> on the map"` and `data-focus-id="show:<key>"`, and `p#link-status[data-link-status][aria-live="polite"]` in `index.html` after `#app` (sticky at the bottom, hidden when empty), written to by `link-map.ts` and never rebuilt.
- Today a tag key and a marker key are the same string (`<requirement id>` or `zombie:<index>`). The functions below keep that fact in one place:
  ```ts
  export function tagKeyForMarker(markerKey: string, tagKeys: ReadonlySet<string>): string | null; // null when no tag is on the page
  export function markerKeyForTag(tagKey: string, markers: readonly MapMarker[]): string | null;
  export interface LinkInputs { hover: string | null; focus: string | null; pinned: string | null }
  export function linkedKey(i: LinkInputs): string | null; // hover, then focus, then pinned
  export function linkMessage(kind: "map" | "tag" | "no-tag", key: string, report: Report): string;
  //  "map"    -> "Showing R2.1 on the map"           (tag to marker)
  //  "tag"    -> "Showing the toe tag of R2.1"       (marker to tag)
  //  "no-tag" -> "R2.1 has no toe tag on the page"
  export function scrollBehavior(reducedMotion: boolean): "auto" | "smooth";
  ```
  The short id is the part after the last `/`; a zombie uses its symbol (`report.findings[index].title`).
- `link-map.ts` (`attachLinks(app, getReport)`): event delegation on `app` for `pointerover/pointerout/focusin/focusout`; it reads `closest("[data-marker-key], [data-tag-key]")`, computes `linkedKey`, and sets or removes `data-linked` on the pair (no re-render, so the focus is never lost). Keyboard focus and activation announce; hover does not. Activation: a marker click calls `onSelect` (opens the detail as today) and then, if a tag exists, `tag.scrollIntoView({ block: "center", behavior: scrollBehavior(matchMedia("(prefers-reduced-motion: reduce)").matches) })` and `tag.focus({ preventScroll: true })`. "Show on map": pin the key, open the phone `<details>` if the visible map is the phone one, scroll, focus the visible marker (the one with a layout box). `main.ts` re-applies the current link after each render and clears it on Escape (in the existing keydown handler, together with closing the detail).
- CSS: `[data-linked="true"]` on `.tag` gets `outline: 3px dashed var(--bone); outline-offset: 3px`; on markers the dot gets the same outline; `transition: outline-color var(--swing)`, removed under reduced motion by the existing block. `:focus-visible` rules cover `.chip`, `.link-button`, `.marker`, `.phone-marker`, `.tag`.
- Tests: a requirement id and a zombie key map to themselves when the tag exists and to null when it does not; the reverse on a marker list; `linkedKey` precedence table; `linkMessage` for a requirement, a zombie and the no-tag case; `scrollBehavior(true) === "auto"`.

## Tokens and CSS rules (task 4)

New tokens: `--steel`, `--steel-line`, `--steel-light`, `--steel-shadow`, `--ghost-stamp`, `--zombie-stamp`, `--unproven-stamp`. The comment above the token block gets the new measured ratios. The style rules test is extended (never weakened): tokens present, new pairs, only `var(--swing)` or `200ms` in `animation` and `transition` durations, no `scroll-behavior: smooth`, no `gradient(`, no `blur(`, `url(` only as `url(#fragment)`, `src/ui/public/` holds only `report.json`, `.chip:disabled`, `[data-linked="true"]` and `clip-path: polygon` rules exist, and `.marker-label` is at least `0.75rem`.

## Manual checklist (run at 1440x900 and 390x844 with the report of this repo and with a 3-spec, a 0-spec and a 300-finding report)

```js
document.documentElement.scrollWidth <= document.documentElement.clientWidth        // R8
document.querySelectorAll(".map svg [data-region]").length === 7                      // R1.1
[...document.querySelectorAll(".chip")].map(c => [c.dataset.filter, c.disabled, c.getAttribute("aria-pressed")])  // R4
getComputedStyle(document.querySelector(".marker-label")).fontSize                    // R3.6 (>= 12px)
```

Also: Tab to a marker and see the dashed outline on its tag and the status line; Enter moves the focus to the tag; on the tag, Tab to "Show on map", Enter, focus lands on the marker; Escape clears. Repeat with `prefers-reduced-motion` emulated. Take screenshots for R1.8, R2.10, R3.10, R4.10, R5.12, R6.8, R7.6.
