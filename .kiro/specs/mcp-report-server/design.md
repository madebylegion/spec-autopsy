# Design Document

## Overview

One file, `src/mcp/server.ts` (about 100 lines, limit 150 for `src/mcp/`), starts an `McpServer` from the official SDK on a `StdioServerTransport`. Dependency flow follows the steering rule: `mcp` imports only from `report` (`validateReport` and its types). Nothing in `parser`, `indexer`, `linker` or `report` changes.

## Dependencies

- `@modelcontextprotocol/sdk` 1.20.0: it is the official SDK required by `tech.md`, it is a 1.x ESM package that runs on Node 22+, and 1.20.0 has the `McpServer.registerTool` API and `StdioClientTransport` used by the tests.
- `zod` 3.25.76: the SDK declares `zod` as a dependency and tool input schemas are written with it, so it is pinned exactly at the last 3.x release that the SDK range accepts, to keep the install tree to one copy.

Both go into `dependencies` (the server runs from them), pinned without `^`. The maintainer runs `npm install`; the version of the SDK is the one to re-check at that moment (`npm ls @modelcontextprotocol/sdk zod` must show one `zod`).

## Server flow

1. `reportPath` = `process.argv[2]`, else `process.env.AUTOPSY_REPORT`, else `.autopsy/report.json`, resolved against the current directory.
2. `load(path)` reads the file (UTF-8), parses JSON, and runs `validateReport`. It returns `{ report }` or `{ error }`; the error text is `Report <problem> at <path>. Create it with \`npm run autopsy\`.` with at most the first 3 validation errors. It is called on every tool call, so a report refreshed by the hook is seen at once, and no state is cached.
3. Each tool handler is wrapped: load, then build the text, any thrown error becomes a tool error. A handler never throws to the SDK.
4. `list_ghosts` and `list_findings` map each finding to a finding row and return `"<n> <type> finding(s)"` on the first line and `JSON.stringify(rows)` on the second (compact, one line).
5. `explain` looks for findings whose `requirementId` or (for a zombie) `title` equals `id`; if there are any, it returns each as compact JSON with `evidence`, `confidence` and `file`/`line`. Otherwise it looks the id up in `specs[].requirements[]` and returns `status`, `file`, `line`, `text`, `codeLinks` and `testLinks` as compact JSON. Otherwise: tool error `not found: <id>`.
6. Logs: one line to stderr at start (`spec-autopsy MCP server reading <path>`). Nothing else prints; `console.log` is never used because stdout is the protocol channel.

## Safety

No write, socket, process spawn or extra file read exists in the code. `readFile` is called with the report path only. No network.

## Registration

`.kiro/settings/mcp.json` has `mcpServers["spec-autopsy"]` with `command` `node_modules/.bin/tsx` (relative, so it works in any checkout), `args` `["src/mcp/server.ts"]`, no `env`, and `autoApprove` of the three read-only tool names.

## Tests

`tests/mcp/server.test.ts` writes a report built from `sampleMap()`/`sampleTexts()` with `buildReport` to a temp directory (plus a missing path, a file with broken JSON and a file with valid JSON that is not a report), connects the SDK client through `StdioClientTransport` to `node_modules/.bin/tsx src/mcp/server.ts <path>`, and removes the temp directory afterwards. A stray stdout line would corrupt the framing and fail every case. `tests/mcp/mcp-config.test.ts` parses `.kiro/settings/mcp.json`.

## Requirement coverage

| Requirement | Covered by |
| --- | --- |
| mcp-report-server/R1.1 to R1.3 | `load`, `reportPath`; tests for missing, broken and invalid report |
| mcp-report-server/R2.1 to R2.5 | the three tool handlers; tests for ghosts, findings, explain |
| mcp-report-server/R3.1 to R3.3 | the code shape, stderr-only logging; the session test, line limit |
| mcp-report-server/R4.1 | `package.json` |
| mcp-report-server/R4.2, R4.3 | `.kiro/settings/mcp.json`, README section |
| mcp-report-server/R5.1, R5.2 | `tests/mcp/server.test.ts` |
| mcp-report-server/R5.3 | `tests/mcp/mcp-config.test.ts` |
