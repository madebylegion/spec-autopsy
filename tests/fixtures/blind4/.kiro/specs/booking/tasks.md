# Implementation Plan

- [x] 1. Create and validate bookings
  - Create `src/booking/booking.ts` with the `Appointment` type, opening hour constants and `bookSlot`.
  - Add `tests/booking/booking.test.ts`.
  - _Requirements: booking/R1.1, booking/R1.2, booking/R1.3_

- [x] 2. Cancellation
  - Add `cancelAppointment` to `src/booking/booking.ts`: status, free slot, reason, and the 2 hour cut-off.
  - Add `tests/booking/cancel.test.ts`.
  - _Requirements: booking/R2.1, booking/R2.2, booking/R2.3_
