# SpecAutopsy
An autopsy table for AI-built code: it joins EARS specs, a code index, git history and property tests, then names the ghosts, zombies and unproven promises.
Early build, made with Kiro (see `.kiro/`). Licence: MIT.

## Morgue
The Morgue is a static page over `report.json`. It shows:
- the full body, with the regions no spec maps to drawn dimmer instead of left out;
- one toe tag per finding, with a string loop, a cut corner and the type rubber-stamped on it;
- the zombie group, labelled "Extra limbs (zombies)", next to the body;
- filter chips for ghosts, zombies, unproven promises and low confidence (a chip with no findings is disabled);
- a two-way link between map and tags: hover or focus a marker or a tag to see its partner outlined; Enter on a marker jumps to its tag, "Show on map" on a tag jumps to its marker, Tab reaches every control, Escape clears the link.

Build it with `npm run morgue`. It writes `src/ui/public/report.json` and builds the static site with Vite. The page makes no network request except `./report.json`.

Two design decisions (see `.kiro/specs/morgue-pass-2/design.md`):
- The steel panel comes from an SVG hairline pattern and token-coloured shadows, not CSS gradients (the style rules test forbids gradients).
- The stamp uses its own dark ink tokens (`--ghost-stamp`, `--zombie-stamp`, `--unproven-stamp`), because the accent colours are too light on manila paper.
