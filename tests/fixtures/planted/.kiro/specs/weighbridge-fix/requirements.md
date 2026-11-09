# Requirements Document

## Introduction

Bugfix spec of the planted fixture. Not part of the real project.

## Requirements

### Requirement 1: Current behavior (the defect)

**User Story:** As a scale operator, I want to know what goes wrong today, so that the fix is clear.

#### Acceptance Criteria

1. WHEN a reading is below the noise floor, the weighbridge SHALL show a small non-zero figure.

### Requirement 2: Expected behavior (the fix)

**User Story:** As a scale operator, I want clean figures, so that tickets are right.

#### Acceptance Criteria

1. WHEN a weight is converted, the weighbridge SHALL keep two decimals in the kilo output.
2. WHEN a reading is below the noise floor, the weighbridge SHALL report zero.

### Requirement 3: Unchanged behavior (regression guard)

**User Story:** As a scale operator, I want old tickets to stay the same, so that nothing regresses.

#### Acceptance Criteria

1. WHILE existing weighings are loaded, the ticket archive SHALL keep their stored value.
