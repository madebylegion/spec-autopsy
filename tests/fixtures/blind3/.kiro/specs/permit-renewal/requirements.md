# Requirements Document

## Introduction

Permit holders renew before or shortly after expiry. This spec covers the renewal window, the extension, the grace period and reminders.

## Requirements

### Requirement 1: Renewal window

**User Story:** As a permit holder, I want to renew early, so that I never lapse.

#### Acceptance Criteria

1. WHEN a permit is within 30 days of its expiry date, THEN the system SHALL allow the holder to renew it.
2. WHEN a permit is renewed, THEN the system SHALL extend its expiry date by 12 months.

### Requirement 2: Grace period

**User Story:** As a permit holder, I want a short grace period, so that a late renewal is still possible.

#### Acceptance Criteria

1. WHILE a permit is up to 14 days past expiry, the system SHALL allow renewal with a 10 percent late surcharge.
2. IF a permit is more than 14 days past expiry, THEN the system SHALL require a new application.

### Requirement 3: Reminders

**User Story:** As a permit holder, I want a reminder, so that I do not forget.

#### Acceptance Criteria

1. WHEN a permit is 30 days from expiry, THEN the system SHALL send a reminder to the holder.
