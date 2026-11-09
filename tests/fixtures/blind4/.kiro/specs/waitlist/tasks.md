# Implementation Plan

- [x] 1. Joining the waitlist
  - Create `src/waitlist/waitlist.ts` with `WaitEntry`, the daily cap and `joinWaitlist`.
  - Add `tests/waitlist/join.test.ts`.
  - _Requirements: waitlist/R1.1, waitlist/R1.2_

- [x] 2. Promotion
  - Add `promoteNext` and `skipUnanswered` to `src/waitlist/waitlist.ts`.
  - Add `tests/waitlist/promotion.test.ts`.
  - _Requirements: waitlist/R2.1, waitlist/R2.2_

- [x] 3. Position lookup
  - Add `positionOf` to `src/waitlist/waitlist.ts`.
  - Add `tests/waitlist/position.test.ts`.
  - _Requirements: waitlist/R3.1_
