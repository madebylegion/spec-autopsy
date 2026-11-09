# Design Document

## Overview

Booking keeps appointments in a plain array passed to each function. Errors are thrown as `Error` with the message equal to the error code in the requirements.

## Modules

- `src/booking/booking.ts`: the `Appointment` type, `bookSlot`, `cancelAppointment`, and the opening hour constants.

## Functions

- `bookSlot(book, patientId, start)` checks opening hours, checks the slot is free, then pushes a new appointment.
- `cancelAppointment(book, id, reason)` finds the appointment, sets status cancelled and stores the reason.

## Testing

Tests live in `tests/booking/`.
