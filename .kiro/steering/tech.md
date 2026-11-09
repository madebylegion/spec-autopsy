---
inclusion: always
---

# Tech stack

## Defaults
- **Language**: TypeScript on Node, ESM, `strict` mode on.
- **Tests**: vitest.
- **Property-based tests**: fast-check.
- **Code index**: tree-sitter.
- **MCP server**: the official MCP TypeScript SDK.
- **Morgue UI**: Vite, built as a static site.
- **Licence**: MIT.

Change a default only if you can justify it in one sentence, written in the PR or commit message.

## Rules
- The core is deterministic. No LLM calls, no network calls and no randomness at runtime. The same inputs must give the same report.
- Every finding carries evidence: requirement ID, file, line. A finding without all three is a bug.
- Everything must be free to host and free to test: no paid services, no API keys, no per-visitor cost. The Morgue UI is static files only.
- Pin dependency versions exactly. Add a dependency only when the work needs it.
- Keep a single package (no monorepo).

## Commands
- Test once: `npx vitest --run`
- Type check: `npx tsc --noEmit`
- Do not run watch-mode or dev-server commands from the agent.
