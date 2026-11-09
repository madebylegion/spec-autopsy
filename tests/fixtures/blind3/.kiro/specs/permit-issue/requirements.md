# Requirements Document

## Introduction

Residents apply for a parking permit for a zone. This spec covers the application, the fee and the limits on how many permits one resident may hold.

## Requirements

### Requirement 1: Apply for a permit

**User Story:** As a resident, I want to apply for a permit, so that I can park near my home.

#### Acceptance Criteria

1. WHEN a resident submits an application, THEN the system SHALL create a pending permit with a unique permit number.
2. IF the vehicle plate is not 2 to 8 letters or digits, THEN the system SHALL reject the application.

### Requirement 2: Fees

**User Story:** As a resident, I want a fair fee, so that I pay for the zone I use.

#### Acceptance Criteria

1. The system SHALL compute the permit fee from the tariff of the requested zone.
2. WHERE the applicant is aged 65 or over, the system SHALL apply a 50 percent discount to the fee.

### Requirement 3: Limits and confirmation

**User Story:** As the parking office, I want limits on permits, so that spaces stay fair.

#### Acceptance Criteria

1. IF the resident already holds two active permits, THEN the system SHALL reject the application.
2. WHEN a permit is issued, THEN the system SHALL send a confirmation email to the resident.
