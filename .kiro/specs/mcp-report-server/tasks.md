# Implementation Plan

Run tests with `npx vitest --run` and type check with `npx tsc --noEmit`. The agent has no shell: after task 1 writes `package.json`, the maintainer runs `npm install`. Only `package.json`, `src/mcp/`, `tests/mcp/`, `.kiro/settings/mcp.json`, `README.md` and this spec folder change.

- [x] 1. Dependencies, the stdio server and its tests
  - In `package.json` add to `dependencies`, pinned exactly: `@modelcontextprotocol/sdk` 1.20.0 and `zod` 3.25.76. Ask the maintainer to run `npm install`.
  - Create `src/mcp/server.ts` (under 150 lines in `src/mcp/`): report path from argv[2], `AUTOPSY_REPORT` or `.autopsy/report.json`; `load` with `validateReport`; tools `list_ghosts`, `list_findings` (optional `type`) and `explain` (`id`); tool errors with `isError: true` that say what is wrong and `npm run autopsy`; logs to stderr only; no write, socket or other file read.
  - Add `tests/mcp/server.test.ts`: SDK `Client` over `StdioClientTransport` against a report built with `buildReport` from `tests/helpers/report-sample.ts` in a temp dir (removed afterwards): tool list, `list_ghosts` returns exactly the ghosts, `list_findings` by type, `explain` for a ghost, a proven requirement and an unknown id, missing report, broken JSON, invalid report.
  - _Requirements: mcp-report-server/R1.1, mcp-report-server/R1.2, mcp-report-server/R1.3, mcp-report-server/R2.1, mcp-report-server/R2.2, mcp-report-server/R2.3, mcp-report-server/R2.4, mcp-report-server/R2.5, mcp-report-server/R3.1, mcp-report-server/R3.2, mcp-report-server/R3.3, mcp-report-server/R4.1, mcp-report-server/R5.1, mcp-report-server/R5.2_

- [ ] 2. Kiro registration, README section and config test
  - Create `.kiro/settings/mcp.json`: server `spec-autopsy`, `command` `node_modules/.bin/tsx`, `args` `["src/mcp/server.ts"]`, no `env`, `autoApprove` `["list_ghosts", "list_findings", "explain"]`.
  - Add to `README.md` the section "Ask your agent about the report" (4 lines).
  - Add `tests/mcp/mcp-config.test.ts`: parse `.kiro/settings/mcp.json`; check the server name, `command`, `args`, `autoApprove`, and that no `env` key holds a value.
  - _Requirements: mcp-report-server/R4.2, mcp-report-server/R4.3, mcp-report-server/R5.3_
