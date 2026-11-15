# SpecAutopsy
An autopsy table for AI-built code: it joins EARS specs, a code index, git history and property tests, then names the ghosts, zombies and unproven promises.
Early build, made with Kiro (see `.kiro/`). Licence: MIT.

- Live demo: https://madebylegion.github.io/spec-autopsy/
- Demo video: {VIDEO_URL}
- Category: Kiroween 2026, Frankenstein.

## Run it
Needs Node 22 and git.
```
npm ci
npm test               # test suite
npm run typecheck
./demo.sh              # SpecAutopsy runs on its own .kiro folder, no network, no LLM
npm run morgue         # refresh report.json and build the Morgue into dist/ui
npm run ui:preview     # open the Morgue locally
```

## How Kiro was used
All application code in this repository was written by Kiro, driven by specs, except the one change below. A human ran the tests and decided what to fix.
- The "proven evidence in Code links" feature was specced with Kiro CLI during the hackathon (requirements, design and tasks: `.kiro/specs/proven-evidence-ui/`). Its code (task 1) and its tests (tasks 2.1 to 2.3) were written by hand, because the Kiro CLI turn that was meant to build it ran past the free credit budget without writing code.
- Steering: `.kiro/steering/product.md`, `tech.md`, `structure.md`.
- Specs (requirements, design, tasks; spec-driven, one per feature): `.kiro/specs/` holds 13 specs, e.g. `ears-parser`, `indexer`, `linker`, `report-and-morgue`, `mcp-report-server`, `morgue-pass-2`, `constraint-reqs`.
- Hook: `.kiro/hooks/autopsy-on-spec-save.json` re-runs the autopsy when a requirements file is saved.
- MCP: `.kiro/settings/mcp.json` registers the `spec-autopsy` server (`src/mcp/server.ts`).
- Custom agent: `.kiro/agents/autopsy.json`.
- Property-based tests: fast-check, under `tests/`.
- Vibe coding: small fixes after a failing test; the spec stays the source of truth.

## Pre-existing code
None. Every commit dates from 9 Nov 2026 or later (inside the submission period). Third-party libraries only: `@modelcontextprotocol/sdk`, `web-tree-sitter`, `tree-sitter-wasms`, `zod`; dev: `vite`, `vitest`, `fast-check`, `tsx`, `typescript`.

## Morgue
The Morgue is a static page over `report.json`. It shows:
- the full body, with the regions no spec maps to drawn dimmer instead of left out;
- one toe tag per finding, with a string loop, a cut corner and the type rubber-stamped on it;
- the zombie group, labelled "Extra limbs (zombies)", next to the body;
- filter chips for ghosts, zombies, unproven promises and low confidence (a chip with no findings is disabled);
- a two-way link between map and tags: hover or focus a marker or a tag to see its partner outlined; Enter on a marker jumps to its tag, "Show on map" on a tag jumps to its marker, Tab reaches every control, Escape clears the link.

A demo `report.json` (the self-autopsy of this repository) is committed at `src/ui/public/report.json`, so `npm run ui:build` on any static host gives a working Morgue; `npm run morgue` refreshes it. Host settings: build command `npm ci && npm run ui:build`, publish directory `dist/ui`. The page makes no network request except `./report.json`.

Two design decisions (see `.kiro/specs/morgue-pass-2/design.md`):
- The steel panel comes from an SVG hairline pattern and token-coloured shadows, not CSS gradients (the style rules test forbids gradients).
- The stamp uses its own dark ink tokens (`--ghost-stamp`, `--zombie-stamp`, `--unproven-stamp`), because the accent colours are too light on manila paper.

## Ask your agent about the report
The MCP server in `src/mcp/server.ts` is registered as `spec-autopsy` in `.kiro/settings/mcp.json`.
Ask your agent "which requirements are ghosts?" and it calls `list_ghosts`.
The other tools are `list_findings` and `explain`; all three are auto-approved.
Every answer carries requirement ID, file and line, and nothing leaves your machine.
