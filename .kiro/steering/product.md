---
inclusion: always
---

# Product: SpecAutopsy

SpecAutopsy is an autopsy table for AI-built code. It checks whether the code an AI built matches the specs it was given.

## The body map
SpecAutopsy stitches four sources into one "body map":
- EARS requirements specs (`.kiro/specs/*/requirements.md`)
- a tree-sitter code index
- git history
- property-based tests

## Findings
Every report names three kinds of finding:
- **Ghosts**: spec items that were never built.
- **Zombies**: code that no spec asked for.
- **Unproven promises**: rules (requirements) that no test checks.

Every finding must carry evidence: requirement ID, file, line.

## Planned surfaces
- **Morgue UI**: static web page with a toe-tag per requirement and ghost and zombie labels.
- **MCP server**: lets an agent ask "which requirements are ghosts?".
- **GitHub Action**.
- **Self-autopsy demo**: runs SpecAutopsy on its own `.kiro` folder.

## Principles
- The core is deterministic: no LLM call at runtime, no per-visitor cost.
- Everything must be free to host and free to test.
- Do not add features beyond those listed here without updating this file first.
