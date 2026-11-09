# Requirements Document

## Introduction

The waitlist spec covers patients who want a day that is fully booked. The ID of a criterion is `waitlist/R<N>.<M>`.

## Glossary

- **Desk**: the clinic appointment desk software.
- **Waitlist**: the ordered queue of patients for one day.

## Requirements

### Requirement 1: Join the waitlist

**User Story:** As a patient, I want to wait for a cancelled slot, so that I can get an earlier visit.

#### Acceptance Criteria

1. WHEN a patient asks for a full day, THEN the desk SHALL add the patient to the waitlist of that day in order of request.
2. The desk SHALL limit the waitlist to 20 patients per day.

### Requirement 2: Promote waiting patients

**User Story:** As a receptionist, I want freed slots offered fairly, so that the queue is respected.

#### Acceptance Criteria

1. WHEN a slot is freed, THEN the desk SHALL offer it to the first patient on the waitlist.
2. IF the offered patient does not answer within 15 minutes, THEN the desk SHALL offer the slot to the next patient.

### Requirement 3: Queue visibility

**User Story:** As a patient, I want to know my place, so that I can plan.

#### Acceptance Criteria

1. The desk SHALL show each patient their position on the waitlist.
