# Implementation Plan

- [x] 1. Renewal window and extension
  - Create `src/renewal.ts` with the window check and the 12 month extension.
  - _Requirements: permit-renewal/R1.1, permit-renewal/R1.2_

- [x] 2. Grace period
  - Add the late surcharge and the new-application rule, with tests in `tests/renewal.test.ts`.
  - _Requirements: permit-renewal/R2.1, permit-renewal/R2.2_

- [ ] 3. Expiry reminders
  - Send a reminder 30 days before expiry.
  - _Requirements: permit-renewal/R3.1_
