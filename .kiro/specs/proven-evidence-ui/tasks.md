# Implementation Plan: Proven Evidence UI

## Overview

This plan implements a focused UI change to the Morgue detail panel: when a proven requirement has no code links, display the first line of `provenEvidence` instead of the static "No code linked." fallback. The change is confined to the render layer in `src/ui/render.ts` and requires no new dependencies.

## Tasks

- [x] 1. Modify detailPanel() in src/ui/render.ts
  - [x] 1.1 Import `provenEvidence` from `src/report/evidence.ts`
    - Add import at the top of the file
    - _Requirements: 1.4_
  
  - [x] 1.2 Update the Code links section rendering logic
    - Modify the `detailPanel` function to check if `detail.kind === "requirement"` AND `detail.status === "proven"` AND `detail.codeLinks.length === 0`
    - When all conditions are true: look up the requirement in the report using `detail.heading` and call `provenEvidence()` to get the first line
    - Pass the first line as the "none" fallback to `list()` instead of "No code linked."
    - Otherwise, render code links as before
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  
  - [x] 1.3 Handle edge cases
    - If requirement lookup fails (defensive), fall back to "No code linked."
    - Ensure zombies are not affected (they never have status `"proven"`)
    - _Requirements: 1.3_

- [ ] 2. Update test cases in tests/ui/
  - [x] 2.1 Add unit test for proven requirement with no code links
    - Create a test that builds a `Detail` object with `kind="requirement"`, `status="proven"`, `codeLinks=[]`
    - Mock or provide a known `provenEvidence` output
    - Assert the Code links section contains the first line of `provenEvidence`
    - _Requirements: 1.1, 1.2_
  
  - [x] 2.2 Add unit test for proven requirement with code links
    - Create a test that builds a `Detail` object with `kind="requirement"`, `status="proven"`, `codeLinks=["file.ts:10 symbol"]`
    - Assert the Code links section shows the code links, not `provenEvidence`
    - _Requirements: 1.2_
  
  - [x] 2.3 Add unit test for unproven requirement with no code links
    - Create a test that builds a `Detail` object with `kind="requirement"`, `status="unproven"`, `codeLinks=[]`
    - Assert the Code links section shows "No code linked."
    - _Requirements: 1.3_
  
  - [ ] 2.4* Add integration test with real report fixture
    - Test with a real report fixture that includes a proven requirement with no code links
    - Ensure the detail panel renders it correctly end-to-end
    - _Requirements: 1.1, 1.2_

- [x] 3. Checkpoint - Verify all tests pass
  - Run `npx vitest --run` to ensure all tests pass
  - Ensure no TypeScript errors with `npx tsc --noEmit`
  - Verify the change does not break existing detail panel rendering

## Notes

- This is a single-file change in the render layer (`src/ui/render.ts`)
- The `provenEvidence` function is already available in `src/report/evidence.ts`
- The change affects only the display of proven requirements with empty code links
- Tasks marked with `*` are optional integration tests; core functionality is complete without them
- All existing behavior is preserved for non-proven requirements and proven requirements with code links

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "2.4"] }
  ]
}
```
