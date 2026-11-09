# Requirements Document

## Introduction

An agent should be able to ask "which requirements are ghosts?" without parsing `report.json` itself. This feature adds a tiny local MCP server over stdio, `src/mcp/server.ts`, built on the official MCP TypeScript SDK. It reads the autopsy report (schema v1) and exposes three read-only tools: `list_ghosts`, `list_findings` and `explain`. It is deterministic, makes no network call, writes no file and costs nothing to host or test.

Run it with `node_modules/.bin/tsx src/mcp/server.ts`. Kiro finds it through the workspace config `.kiro/settings/mcp.json`.

Requirement IDs follow the convention of the EARS parser: `mcp-report-server/R<N>.<M>`.

## Glossary

- **Report**: the JSON file written by `npm run autopsy`, by default `.autopsy/report.json`, validated by `validateReport` from `src/report`.
- **Finding row**: the object `{ type, id, title, file, line, confidence }` where `id` is the requirement id (null for a zombie) and `confidence` is the level `high`, `medium` or `low`.
- **Tool error**: an MCP tool result with `isError: true` and one text content item.

## Requirements

### Requirement 1: Report source and validation

**User Story:** As an agent user, I want the server to read the report I already have, and to tell me clearly when it cannot, so that I know what to fix.

#### Acceptance Criteria

1. The server SHALL take the report path from its first command-line argument, else from the environment variable `AUTOPSY_REPORT`, else `.autopsy/report.json` under the current directory.
2. WHEN a tool is called, THEN the server SHALL read the report file at that moment and check it with `validateReport` from `src/report`.
3. IF the report is missing, unreadable, not valid JSON or fails `validateReport`, THEN the tool SHALL return a tool error whose text says what is wrong (with the path and the first validation errors) and how to create the report (`npm run autopsy`), and the server SHALL keep running.

### Requirement 2: Tools

**User Story:** As an agent, I want small read-only tools, so that I can name the ghosts and explain one finding without reading the whole report.

#### Acceptance Criteria

1. The tool `list_ghosts` SHALL take no input and SHALL return one text item: a one-line count, then the ghost findings as one compact JSON array of finding rows (requirement id, title, file, line, confidence level).
2. The tool `list_findings` SHALL take an optional `type` (`ghost`, `zombie` or `unproven`) and SHALL return the same shape for that type, or for all findings when `type` is omitted.
3. WHEN `explain` is called with an `id` that is the requirement id or the zombie symbol name of a finding, THEN it SHALL return that finding's evidence lines, confidence (score and level) and location (file and line).
4. WHEN `explain` is called with the id of a requirement that has no finding (it is proven), THEN it SHALL return the requirement's status, its location, its code links and its test links.
5. IF `explain` is called with an id that matches no finding and no requirement, THEN it SHALL return a tool error whose text contains `not found` and the id, and SHALL NOT throw.

### Requirement 3: Safety

**User Story:** As a maintainer, I want the server to be harmless and quiet, so that I can auto-approve its tools.

#### Acceptance Criteria

1. The server SHALL NOT write any file, SHALL NOT open a socket, SHALL NOT spawn a process and SHALL NOT read any file other than the report path.
2. The server SHALL write nothing to stdout except protocol frames; every log line SHALL go to stderr.
3. The server SHALL make no network call and SHALL be deterministic: the same report and the same call give the same text. The total code in `src/mcp/` SHALL be under 150 lines.

### Requirement 4: Dependencies and registration

**User Story:** As a maintainer, I want pinned dependencies and a ready Kiro config, so that the server works after `npm install`.

#### Acceptance Criteria

1. `package.json` SHALL list `@modelcontextprotocol/sdk` and `zod` in `dependencies` with exact versions (no `^` or `~`).
2. The workspace file `.kiro/settings/mcp.json` SHALL register the server `spec-autopsy` with `command` `node_modules/.bin/tsx`, `args` `["src/mcp/server.ts"]`, no secret in `env`, and `autoApprove` of `list_ghosts`, `list_findings` and `explain`.
3. `README.md` SHALL have a section "Ask your agent about the report" of 4 lines that says how to run the server and which tools it offers.

### Requirement 5: Tests

**User Story:** As a maintainer, I want the server tested through the real protocol, so that a framing or stdout regression is caught.

#### Acceptance Criteria

1. The tests in `tests/mcp/` SHALL start the server as a child process with the SDK `Client` and `StdioClientTransport`, against a report built with `buildReport` from `tests/helpers/report-sample.ts` and written to a temporary directory that they remove afterwards.
2. The tests SHALL check: the list of tools; that `list_ghosts` returns exactly the ghosts; that `explain` returns evidence for a ghost, a status for a proven requirement and a tool error for an unknown id; that a missing report and an invalid report each give a tool error and not a crash; and that the session works at all (a stray stdout line would break the client).
3. A test SHALL parse `.kiro/settings/mcp.json` and check the server name, `command`, `args`, `autoApprove`, and that no `env` key holds a value.
