# Requirements Document

## Introduction

The EARS parser is the first organ of SpecAutopsy. It reads every `.kiro/specs/*/requirements.md` file in a project and turns each EARS statement into a typed requirement object with a stable ID. Later organs (indexer, linker, report) depend on these IDs as evidence keys, so the parser is deterministic: no network, no randomness, no LLM.

A statement is a numbered criterion under a `### Requirement N` heading. Its ID is `<spec-name>/R<N>.<M>`, for example `ears-parser/R2.3`, where M is the number written on the criterion line.

## Glossary

- **EARS**: Easy Approach to Requirements Syntax, the sentence templates used by Kiro specs.
- **Clause**: a leading part of a statement introduced by WHILE, WHERE, WHEN or IF.
- **Obligation keyword**: the word SHALL, matched case-insensitively.
- **Diagnostic**: a structured record of a problem, with a code, a message, a file and a line.

## Requirements

### Requirement 1: Discover requirements files

**User Story:** As a SpecAutopsy user, I want every spec in my project found automatically, so that nothing escapes the autopsy.

#### Acceptance Criteria

1. WHEN a project root is given, THEN the parser SHALL read every file matching `.kiro/specs/*/requirements.md` under that root.
2. WHEN several requirements files are found, THEN the parser SHALL process them in ascending sorted order of spec folder name.
3. IF the project root has no `.kiro/specs` folder, THEN the parser SHALL return an empty result and no diagnostics.
4. IF a requirements file cannot be read, THEN the parser SHALL emit a diagnostic with code unreadable-file and the file path, and continue with the remaining files.

### Requirement 2: Recognise EARS patterns

**User Story:** As a SpecAutopsy user, I want each statement classified by its EARS pattern, so that triggers, states and conditions can be checked later.

#### Acceptance Criteria

1. The parser SHALL classify a statement with no leading clause keyword as the ubiquitous pattern.
2. WHEN a statement begins with the keyword WHEN, THEN the parser SHALL classify it as event-driven and store the text after the keyword as the trigger.
3. WHEN a statement begins with the keyword WHILE, THEN the parser SHALL classify it as state-driven and store the text after the keyword as the state.
4. WHEN a statement begins with the keyword IF, THEN the parser SHALL classify it as unwanted behaviour and store the text after the keyword as the condition.
5. WHEN a statement begins with the keyword WHERE, THEN the parser SHALL classify it as optional feature and store the text after the keyword as the feature.
6. WHEN a statement combines two or more clauses separated by commas, THEN the parser SHALL classify it as complex and store every clause.
7. The parser SHALL match every keyword case-insensitively.
8. WHEN a criterion is written in the Kiro form with THEN after the trigger, THEN the parser SHALL accept it with the same result as the form without THEN.

### Requirement 3: Produce typed requirement objects

**User Story:** As a developer of later organs, I want typed objects instead of raw text, so that I can join requirements to code and tests.

#### Acceptance Criteria

1. WHEN a statement is parsed, THEN the parser SHALL produce a requirement object with the fields id, pattern, system, response, file and line.
2. WHEN a statement has clauses, THEN the parser SHALL store the state, feature, trigger and condition parts in separate fields.
3. WHEN a statement is parsed, THEN the parser SHALL record the source file and the 1-based line number of the statement.
4. The parser SHALL collapse runs of whitespace in every text field to a single space and trim both ends.

### Requirement 4: Stable IDs

**User Story:** As a SpecAutopsy user, I want IDs that never change by accident, so that findings and test links stay valid over time.

#### Acceptance Criteria

1. The parser SHALL build each id from the spec folder name, a slash, the letter R, the requirement number, a dot and the criterion number.
2. WHEN the text of a statement is edited without changing its numbers, THEN the parser SHALL keep its id unchanged.
3. WHEN unrelated lines are re-ordered or inserted, THEN the parser SHALL keep the ids of all statements unchanged.
4. IF two statements in one file produce the same id, THEN the parser SHALL keep the first and emit a diagnostic with code duplicate-id for the second.
5. The parser SHALL return the same ids every time it reads the same file text.

### Requirement 5: Diagnostics and robustness

**User Story:** As a spec author, I want clear messages about malformed statements, so that I can fix them instead of losing requirements silently.

#### Acceptance Criteria

1. IF a numbered criterion under a requirement heading lacks the obligation keyword, THEN the parser SHALL emit a diagnostic with code missing-shall, the file and the line.
2. IF a statement has no system name before the obligation keyword, THEN the parser SHALL emit a diagnostic with code missing-system, the file and the line.
3. IF a statement has an empty response after the obligation keyword, THEN the parser SHALL emit a diagnostic with code empty-response, the file and the line.
4. IF a line outside a code fence begins with an EARS clause keyword and is not a numbered criterion, THEN the parser SHALL emit a diagnostic with code unnumbered-statement, the file and the line.
5. The parser SHALL never throw an exception for any input text or any file system error.
6. The parser SHALL give every diagnostic a code, a message, a file and a 1-based line.

### Requirement 6: Canonical printer

**User Story:** As a developer, I want to render a requirement object back to EARS text, so that parsing can be verified by a round trip.

#### Acceptance Criteria

1. WHEN a requirement object is given to the printer, THEN the printer SHALL return one line of canonical EARS text.
2. WHEN the requirement has no clauses, THEN the printer SHALL render the system name, the obligation keyword in upper case and the response.
3. WHEN the requirement has clauses, THEN the printer SHALL render them in the fixed order WHILE, WHERE, WHEN, IF, each followed by a comma.
4. WHEN a printed requirement is parsed again, THEN the parser SHALL return an object equal to the original in every field except id, file and line.
5. The printer SHALL be a pure function that does not read files, the clock or any random source.
