---
inclusion: always
---

# Tech stack

## Defaults
- **Language**: TypeScript on Node, ESM, `strict` mode on.
- **Tests**: vitest.
- **Property-based tests**: fast-check.
- **Code index**: `web-tree-sitter` 0.25.10 (the WASM build of tree-sitter) with the prebuilt grammars from the `tree-sitter-wasms` package 0.1.13 (typescript, tsx, javascript, python). Never use the native `tree-sitter` node package: it needs node-gyp and a C++ toolchain, and this project must install with `npm install` alone. Both versions are pinned exactly because the grammar ABI must match the runtime: this pair was tested together, and web-tree-sitter 0.24 and older have a different API (no `Language` export) and fail to load these grammars.
- **MCP server**: the official MCP TypeScript SDK.
- **Morgue UI**: Vite, built as a static site. `vite` 5.4.21, pinned exactly, is the only UI dependency (a devDependency); it is not vite 7 because vite 7 needs a newer `@types/node` than the pinned 22.10.2, and vitest 2.1.8 already uses vite 5. Plain TypeScript and CSS: no UI framework, no runtime dependencies for the UI. The UI has its own `src/ui/tsconfig.ui.json` with the DOM lib (the root `tsconfig.json` stays DOM-free for Node code); `npm run typecheck` checks both.
- **Licence**: MIT.

Change a default only if you can justify it in one sentence, written in the PR or commit message.

## Rules
- The core is deterministic. No LLM calls, no network calls and no randomness at runtime. The same inputs must give the same report.
- Every finding carries evidence: requirement ID, file, line. A finding without all three is a bug.
- Everything must be free to host and free to test: no paid services, no API keys, no per-visitor cost. The Morgue UI is static files only.
- Pin dependency versions exactly. Add a dependency only when the work needs it.
- Keep a single package (no monorepo).
- Git history is read with `git log` through `child_process.execFile` (no shell string). No git library.

## Commands
- Test once: `npx vitest --run`
- Type check: `npx tsc --noEmit`
- Do not run watch-mode or dev-server commands from the agent.
- Dependency changes: write package.json, then ask the human to run npm install; the agent has no shell.
