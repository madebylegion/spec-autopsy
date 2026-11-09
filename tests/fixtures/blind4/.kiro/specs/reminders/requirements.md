# Requirements Document

## Introduction

The reminders spec covers messages sent to patients before an appointment. The ID of a criterion is `reminders/R<N>.<M>`.

## Glossary

- **Desk**: the clinic appointment desk software.
- **Reminder**: a message scheduled for one appointment.

## Requirements

### Requirement 1: Schedule reminders

**User Story:** As a patient, I want a reminder before my visit, so that I do not forget it.

#### Acceptance Criteria

1. WHEN an appointment is booked, THEN the desk SHALL schedule a reminder 24 hours before its start.
2. WHERE the patient has opted in to SMS, THEN the desk SHALL send the reminder by SMS.
3. WHEN an appointment is cancelled, THEN the desk SHALL drop its pending reminder.

### Requirement 2: Message text

**User Story:** As a patient, I want a clear message, so that I know when to come.

#### Acceptance Criteria

1. The desk SHALL write the reminder text with the patient name and the local time of the appointment.
2. The desk SHALL write the reminder text in the preferred language of the patient.
