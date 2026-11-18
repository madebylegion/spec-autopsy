# Implementation Plan: Overlap Proof

- [x] 1. classifyRequirement needs real test evidence, with unit tests (1.1 classify.ts, 1.2 link.ts helper, 1.3 tests/linker/overlap-proof.test.ts) _Requirements: overlap-proof/R1.1, overlap-proof/R1.2, overlap-proof/R1.3, overlap-proof/R1.4, overlap-proof/R1.5, overlap-proof/R1.6_
- [x] 2. Human run: update the three old-rule assertions named in design.md, add requirement tags to the existing untagged real tests of constraint-reqs/R2.1 and proven-evidence-ui/R1.1-R1.3, run `npx vitest --run` and `npx tsc --noEmit`, refresh src/ui/public/report.json. _Requirements: overlap-proof/R1.5_
