---
inclusion: always
---

# Structure

A single package, no monorepo. `src/` is split by organ.

```
.kiro/
  specs/       # one folder per feature, with requirements.md
  steering/    # these files
  hooks/
  agents/
src/
  parser/      # reads EARS requirements, assigns stable IDs
  indexer/     # tree-sitter code index, git history
  linker/      # joins specs, code, git and tests into the body map
                 and finds ghosts, zombies and unproven promises
  report/      # renders findings, each with requirement ID, file, line
  mcp/         # MCP server over the report
  ui/          # Vite static Morgue UI
tests/         # mirrors src/ (tests/parser, tests/linker, ...)
README.md
LICENSE        # MIT
```

## Rules
- `.kiro/` (specs, steering, hooks, agents) is committed and never gitignored. The self-autopsy demo depends on it.
- Dependencies flow one way: parser and indexer, then linker, then report, then mcp and ui. An organ never imports from one later in that chain.
- Tests live in `tests/`, not next to the source files. Name them `<module>.test.ts`. Property-based tests use fast-check.

## Naming
- Files and folders use kebab-case, for example `requirement-parser.ts`.
- Requirement IDs are stable. Once assigned, an ID is never renumbered or reused. Retire an ID instead of recycling it.
- Spec folders under `.kiro/specs/` use kebab-case feature names.
