# Implementation Plan: Ghost Test Evidence

## Overview

This plan corrects the `ghostEvidence` function in `src/report/evidence.ts` to produce accurate strings when a ghost has test links. The function will count `entry.testLinks.length` and generate different strings for zero, one, and multiple test links. A new test file will verify all cases.

## Tasks

- [x] 1. ghostEvidence counts test links, with unit tests
  - [x] 1.1 Modify `ghostEvidence` in `src/report/evidence.ts`
    - Count `entry.testLinks.length` at the start of the function
    - When `testLinks.length === 0`: keep first line as "no symbol or test links to <id> by tag, commit or word overlap" and contradiction ending as "yet nothing links to <id>" (unchanged)
    - When `testLinks.length === 1`: change first line to "no symbol links to <id>; 1 test link only (tests do not prove code)" and contradiction ending to "yet no symbol links to <id>"
    - When `testLinks.length > 1`: change first line to "no symbol links to <id>; N test links only (tests do not prove code)" and contradiction ending to "yet no symbol links to <id>"
    - Keep all other lines unchanged (closest-name line, rest of contradiction line)
    - Add tag comment `// ghost-test-evidence/R1.2` directly above the `ghostEvidence` function
    - _Requirements: ghost-test-evidence/R1.1, ghost-test-evidence/R1.2, ghost-test-evidence/R1.3, ghost-test-evidence/R1.4, ghost-test-evidence/R1.5, ghost-test-evidence/R1.6, ghost-test-evidence/R1.7, ghost-test-evidence/R1.8_
  
  - [x] 1.2 Create `tests/report/ghost-test-evidence.test.ts`
    - Test case 1: ghost with zero test links, with contradiction
      - Tag: `// ghost-test-evidence/R1.1` above `it(`
      - Assert first line is "no symbol or test links to <id> by tag, commit or word overlap"
      - Assert contradiction line ends "yet nothing links to <id>"
    - Test case 2: ghost with one test link, with contradiction
      - Tag: `// ghost-test-evidence/R1.2` above `it(`
      - Assert first line is "no symbol links to <id>; 1 test link only (tests do not prove code)"
      - Assert contradiction line ends "yet no symbol links to <id>"
    - Test case 3: ghost with six test links, with contradiction
      - Tag: `// ghost-test-evidence/R1.3` above `it(`
      - Assert first line is "no symbol links to <id>; 6 test links only (tests do not prove code)"
      - Assert contradiction line ends "yet no symbol links to <id>"
    - Test case 4: ghost with one test link, no contradiction
      - Tag: `// ghost-test-evidence/R1.2` above `it(`
      - Assert first line is "no symbol links to <id>; 1 test link only (tests do not prove code)"
      - Assert no contradiction line
    - Test case 5: ghost with zero test links, no contradiction
      - Tag: `// ghost-test-evidence/R1.1` above `it(`
      - Assert first line is "no symbol or test links to <id> by tag, commit or word overlap"
      - Assert no contradiction line
    - _Requirements: ghost-test-evidence/R1.1, ghost-test-evidence/R1.2, ghost-test-evidence/R1.3, ghost-test-evidence/R1.4, ghost-test-evidence/R1.5, ghost-test-evidence/R1.9_
  
  - [ ] 1.3 Run verification
    - Run `npx vitest --run` to ensure all tests pass
    - Run `npx tsc --noEmit` to ensure no TypeScript errors
    - Verify that existing tests in `tests/recall-fix/doubtful-ghost.test.ts` and `tests/report/build-report.test.ts` still pass (they use ghosts with zero test links, unchanged case)
    - _Requirements: ghost-test-evidence/R1.9_

## Notes

- The change is confined to `src/report/evidence.ts` (`ghostEvidence` function only)
- No callers require changes; all treat evidence strings as opaque display text
- Existing tests with zero-test-link ghosts remain valid (unchanged case)
- No new dependencies introduced

