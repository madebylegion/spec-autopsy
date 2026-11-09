# Requirements Document

## Introduction

Lending covers borrowing and returning books at a small public library.

## Requirements

### Requirement 1: Borrow a book

**User Story:** As a member, I want to borrow a book, so that I can read it at home.

#### Acceptance Criteria

1. WHEN a member borrows a book, THEN the library SHALL record a loan with a due date 21 days after checkout.
2. IF a member already has 5 active loans, THEN the library SHALL reject a new loan.
3. IF a book has no available copies, THEN the library SHALL reject the loan with an out-of-copies error.

### Requirement 2: Late returns

**User Story:** As a librarian, I want late returns to cost something, so that books come back on time.

#### Acceptance Criteria

1. WHEN a book is returned after its due date, THEN the library SHALL apply a fine of 25 cents for each day overdue.
2. WHILE a member owes more than 10 dollars in fines, THE library SHALL block new loans for that member.
3. WHERE email notices are enabled, THE library SHALL send a reminder 2 days before the due date.
