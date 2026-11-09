# Design Document

## Overview

One POSIX sh script, `.kiro/hooks/run-autopsy.sh`, replaces the inline command of the hook. The hook JSON changes only its `command` (now `sh .kiro/hooks/run-autopsy.sh`) and its description. No TypeScript source changes; no dependency.

## Script flow

1. `mkdir -p .autopsy`; append `<UTC> fired <first 200 bytes of stdin, newlines as spaces>` to `.autopsy/hook.log` (same format as the old command).
2. If `command -v node` fails, loop over the candidate directories listed from lowest to highest priority and prepend each existing one to PATH. Prepending reverses the order, so the first candidate (mise installs) ends up first. A glob expands in ascending order, so prepending its matches puts the last match first. The order is lexicographic, not semantic version order; this is a known limit, and it is only used when node is not already on PATH.
3. If node is still missing: log `node not found; PATH tried: ...` and `exit=127`, exit 127.
4. Run `npm run --silent autopsy` when npm exists, else `node node_modules/.bin/tsx src/cli/autopsy.ts`, both appended to the log. Log `exit=<code>`, exit with it.

Safety: no `eval`, no secret read, no network. Only fixed directories under `$HOME` and two system directories are added to PATH.

## Test

`tests/hook/hook-npm.test.ts` builds a temp project with the script copied in, a temp `bin` directory with symlinks to `mkdir`, `date`, `head` and `tr` (found on the current PATH), so that PATH contains no node. Case (a): fake HOME with `.local/share/mise/installs/node/9.9.9/bin/node`, a stub that records argv; the script must call it and exit 0. Case (b): empty HOME; exit 127 and `node not found` in the log. Case (b) is skipped when `/usr/local/bin/node` or `/opt/homebrew/bin/node` exists on the test machine, because the script would legitimately find it. Case (c): the hook JSON.

## Requirement coverage

| Requirement | Covered by |
| --- | --- |
| hook-npm/R1.1, R1.2 | hook JSON, script, test (c) |
| hook-npm/R2.1, R2.2 | script steps 1 and 4, test (a) |
| hook-npm/R3.1 to R3.3 | script steps 2 and 3, tests (a) and (b) |
| hook-npm/R4.1, R4.2 | script step 4, test (a) |
| hook-npm/R5.1, R5.2 | `tests/hook/hook-npm.test.ts` |
