# Requirements Document

## Introduction

The booking spec covers how the clinic front desk creates and cancels appointments. A slot is a start time on the local clock. The ID of a criterion is `booking/R<N>.<M>`.

## Glossary

- **Desk**: the clinic appointment desk software.
- **Slot**: a start time that can hold one appointment.

## Requirements

### Requirement 1: Create appointments

**User Story:** As a receptionist, I want to book a patient into a free slot, so that nobody is double booked.

#### Acceptance Criteria

1. WHEN a patient requests a free slot, THEN the desk SHALL create an appointment with status booked.
2. IF the requested slot is already taken, THEN the desk SHALL reject the request with the error slot-taken.
3. IF the requested start is outside the opening hours of 08:00 to 18:00, THEN the desk SHALL reject the request with the error closed.

### Requirement 2: Cancel appointments

**User Story:** As a patient, I want to cancel an appointment, so that the slot can be used by someone else.

#### Acceptance Criteria

1. WHEN a patient cancels an appointment, THEN the desk SHALL set its status to cancelled and free the slot.
2. IF a cancellation is requested less than 2 hours before the start, THEN the desk SHALL refuse it with the error too-late.
3. WHEN an appointment is cancelled, THEN the desk SHALL record the reason that was given.
