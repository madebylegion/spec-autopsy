# Requirements Document

## Introduction

The committed hook `.kiro/hooks/autopsy-on-spec-save.json` fires on `PostFileSave` of a `requirements.md` in a real `kiro-cli chat --v3 --no-interactive` run, but its command runs in `/bin/sh` with a short PATH where `npm` and `node` are not found. The log shows `/bin/sh: line 1: npm: command not found` and `exit=127`. On the measured machine node lives under mise (`$HOME/.local/share/mise/installs/node/<ver>/bin`, shims in `$HOME/.local/share/mise/shims`); other machines use nvm, volta, fnm, Homebrew or `/usr/local/bin`.

This feature moves the logic into one small POSIX sh script, `.kiro/hooks/run-autopsy.sh`, that finds node itself. No sandbox change, no hard-coded version, no `eval`, no secret read, no network.

Requirement IDs follow the convention of the EARS parser: `hook-npm/R<N>.<M>`.

## Glossary

- **Hook log**: `.autopsy/hook.log`, relative to the project root, which is the working directory of the hook.
- **Candidate directories**: `$HOME/.local/share/mise/installs/node/*/bin`, `$HOME/.local/share/mise/shims`, `$HOME/.volta/bin`, `$HOME/.nvm/versions/node/*/bin`, `$HOME/.local/share/fnm/node-versions/*/installation/bin`, `/opt/homebrew/bin` and `/usr/local/bin`.

## Requirements

### Requirement 1: Hook command

**User Story:** As a maintainer, I want the hook to call one script, so that the logic can be tested and read in one place.

#### Acceptance Criteria

1. The hook file `.kiro/hooks/autopsy-on-spec-save.json` SHALL keep its name, its trigger `PostFileSave` and its matcher, and its `command` SHALL be `sh .kiro/hooks/run-autopsy.sh`.
2. The script `.kiro/hooks/run-autopsy.sh` SHALL use POSIX sh only, SHALL NOT use `eval`, SHALL NOT read a secret, SHALL NOT use the network, and SHALL be shorter than 40 lines.

### Requirement 2: Logging

**User Story:** As a maintainer, I want every run logged, so that I can see that the hook fired and how it ended.

#### Acceptance Criteria

1. The script SHALL create `.autopsy` with `mkdir -p`, and SHALL append to the hook log a line `<UTC timestamp> fired <text>`, where the text is the first 200 bytes of stdin with newlines turned into spaces.
2. WHEN the autopsy command has run, THEN the script SHALL append `exit=<code>` to the hook log and exit with that code.

### Requirement 3: Finding node

**User Story:** As a user of any machine, I want the hook to find node in the usual places, so that it works under a short PATH.

#### Acceptance Criteria

1. IF `command -v node` fails, THEN the script SHALL add to PATH each candidate directory that exists, newest first where a glob is used.
2. IF node is still missing, THEN the script SHALL write `node not found` and the PATH it tried to the hook log, SHALL write `exit=127`, and SHALL exit with code 127.
3. The script SHALL NOT hard-code a node version number.

### Requirement 4: Running the autopsy

**User Story:** As a maintainer, I want the autopsy to run with npm when present and without it otherwise.

#### Acceptance Criteria

1. WHEN `npm` is found, THEN the script SHALL run `npm run --silent autopsy` with stdout and stderr appended to the hook log.
2. WHEN `npm` is not found, THEN the script SHALL run `node_modules/.bin/tsx src/cli/autopsy.ts` through node with stdout and stderr appended to the hook log.

### Requirement 5: Test

**User Story:** As a maintainer, I want a test of the script, so that a PATH regression is caught.

#### Acceptance Criteria

1. The test `tests/hook/hook-npm.test.ts` SHALL run the script through `/bin/sh` with `execFile` and an explicit `env`, in a temporary project that it removes afterwards.
2. The test SHALL check that a node stub under a fake `$HOME` mise directory is called when PATH has no node, that the script exits 127 and logs `node not found` when node exists nowhere, and that the hook JSON has trigger `PostFileSave`, the same matcher and the command `sh .kiro/hooks/run-autopsy.sh`.
