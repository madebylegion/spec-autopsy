# Implementation Plan

- [x] 1. Plate lookup and citations
  - Create `src/enforcement.ts` with the permit lookup and the citation on a miss.
  - _Requirements: enforcement/R1.1, enforcement/R1.2_

- [x] 2. Fine amounts
  - Create `src/fines.py` with fine amounts per violation type, and `tests/test_fines.py`.
  - _Requirements: enforcement/R2.1_

- [x] 3. Fine escalation and payment
  - Raise unpaid fines every 30 days and mark paid citations. Tests in `tests/enforcement.test.ts`.
  - _Requirements: enforcement/R2.2, enforcement/R2.3_
