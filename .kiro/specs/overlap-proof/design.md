# Design: Overlap Proof

## Overview

The fix narrows the property "equals the old rule whenever a code link exists" (constraint-reqs/R1.3) to code links with no test link or a non-overlap test link.

## Changes

In `src/linker/classify.ts`, add an optional third parameter `overlapTestCallsCode = false` to `classifyRequirement`. The return type stays unchanged. With a code link, a requirement is proven only when:
- Some test link has a method other than "overlap", OR
- Some code link has method "test-call", OR
- `overlapTestCallsCode` is true (indicating an overlap test link calls one of the code symbols)

Otherwise (code link with no real test evidence) classify as "unproven".

In `src/linker/link.ts`, add a non-exported helper `overlapTestCalls` that returns true when some overlap test link maps to a TestCase whose `calls` contains one of the code link symbols. Call this helper at the single `classifyRequirement` invocation site.

## Test Updates

Three existing assertions encode the old overlap-only result and must be updated:
1. tests/linker/link.test.ts — "decides the test side independently of the code side"
2. tests/linker/constraint-reqs.test.ts — "equals the old rule whenever a code link exists"
3. tests/linker/link-properties.test.ts — unproven branch

## Known Limits

A method symbol is named "Class.method" and does not match a bare call name in the test case calls.
