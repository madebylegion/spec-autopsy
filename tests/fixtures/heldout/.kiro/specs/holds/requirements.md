# Requirements Document

## Introduction

Holds let members queue for a book that is currently on loan.

## Requirements

### Requirement 1: Hold queue

**User Story:** As a member, I want to place a hold, so that I get the book when it returns.

#### Acceptance Criteria

1. WHEN a member places a hold on a book, THEN the system SHALL append the member to the hold queue for that book.
2. WHEN a copy is returned and the queue is not empty, THEN the system SHALL assign the copy to the first member in the queue.
3. IF a hold is not collected within 3 days, THEN the system SHALL expire the hold.
4. The system SHALL limit each member to 3 simultaneous holds.
5. WHEN a member cancels a hold, THEN the system SHALL remove the member from the queue.

### Requirement 2: Queue visibility

**User Story:** As a member, I want to see my place in line.

#### Acceptance Criteria

1. WHEN a member asks about a hold, THEN the system SHALL report the member's one-based position in the queue.
