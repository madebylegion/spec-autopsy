# Implementation Plan

- [x] 1. Create applications and validate plates
  - Create `src/permits.ts` with the `Permit` type, `createApplication` and plate validation.
  - _Requirements: permit-issue/R1.1, permit-issue/R1.2_

- [x] 2. Fees and senior discount
  - Add the zone tariff, `zoneFee` and the senior price.
  - _Requirements: permit-issue/R2.1, permit-issue/R2.2_

- [x] 3. Active permit limit
  - Add the two-permit limit check and tests in `tests/permits.test.ts`.
  - _Requirements: permit-issue/R3.1_

- [ ] 4. Confirmation email
  - Send a confirmation email when a permit is issued.
  - _Requirements: permit-issue/R3.2_
