# Implementation Plan

Run tests with `npx vitest --run` and type check with `npx tsc --noEmit`. No new dependencies. Only the hook JSON, the new script, this spec folder and the new test change.

- [x] 1. Hook script that finds node, with its test
  - Create `.kiro/hooks/run-autopsy.sh` (POSIX sh, under 40 lines, no `eval`): log `fired`, extend PATH with the candidate directories when `node` is missing, log `node not found` and exit 127 if still missing, else run `npm run --silent autopsy` (or `node node_modules/.bin/tsx src/cli/autopsy.ts` without npm), log `exit=<code>` and exit with it.
  - Change only the `command` (now `sh .kiro/hooks/run-autopsy.sh`) and the description of `.kiro/hooks/autopsy-on-spec-save.json`.
  - Add `tests/hook/hook-npm.test.ts`: node stub under a fake mise directory is called; exit 127 and `node not found` when node is nowhere; hook JSON trigger, matcher and command.
  - _Requirements: hook-npm/R1.1, hook-npm/R1.2, hook-npm/R2.1, hook-npm/R2.2, hook-npm/R3.1, hook-npm/R3.2, hook-npm/R3.3, hook-npm/R4.1, hook-npm/R4.2, hook-npm/R5.1, hook-npm/R5.2_
