# Requirements Document

## Introduction

Officers check plates in the street and cite cars without a valid permit. This spec covers the check, the fine and payment.

## Requirements

### Requirement 1: Plate checks

**User Story:** As an officer, I want to scan a plate, so that I can see if the car may park here.

#### Acceptance Criteria

1. WHEN an officer scans a plate in a zone, THEN the system SHALL look up an active permit for that plate and zone.
2. IF no active permit is found, THEN the system SHALL issue a citation.

### Requirement 2: Fines

**User Story:** As the parking office, I want fines that grow when ignored, so that people pay.

#### Acceptance Criteria

1. The system SHALL set the fine amount from the violation type.
2. WHILE a citation stays unpaid, the system SHALL raise the fine by 50 percent every 30 days.
3. WHEN a citation is paid, THEN the system SHALL mark it as paid.
