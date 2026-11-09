# Requirements Document

## Introduction

The linker is the third organ of SpecAutopsy and its core. It joins the requirements from the EARS parser, the code index from the indexer and the tests into one body map, and classifies every requirement (ghost, unproven, proven) and every exported symbol (zombie or not). The linker is deterministic: no LLM, no network, no randomness. The same inputs always give the same body map.

The linker consumes exactly the existing types `Requirement` and `Diagnostic` from `src/parser`, and `CodeIndex`, `FileIndex`, `Symbol`, `CommentEntry` and `TestCase` from `src/indexer`. It uses two signals only, in this order: explicit requirement ID tags, then token overlap. There is no other signal.

Requirement IDs follow the convention of the EARS parser: `linker/R<N>.<M>`, for example `linker/R3.2`, where M is the number written on the criterion line.

## Glossary

- **Body map**: the `BodyMap` object returned by `link` and `linkProject`.
- **Test file**: a file with `isTest` true in the code index.
- **Implementing code**: a non-test symbol linked to a requirement. Tests are files with `isTest` true.
- **Ghost**: a requirement with no implementing code.
- **Unproven**: a requirement with implementing code but no linked test.
- **Proven**: a requirement with implementing code and at least one linked test.
- **Zombie**: an exported symbol in a non-test file, of kind function, class, const, enum, interface or type (methods are not zombie candidates), that is linked to no requirement.
- **Tag**: a requirement ID, written as the exact text `<spec>/R<N>.<M>`, found in a comment or in a test title.
- **Link**: a record that joins a requirement to a symbol or to a test case, with a method (`tag` or `overlap`) and a score.
- **Token set**: the set of normalised words of a text, as defined in Requirement 3.
- **Overlap score**: shared tokens divided by the size of the smaller token set.
- **THRESHOLD**: the minimum overlap score for an overlap link, exported from `src/linker/overlap.ts`.
- **Truth**: a JSON list of `{ class, key }` entries that states which findings are planted in a fixture.

## Requirements

### Requirement 1: Entry points and totality

**User Story:** As a developer of later organs, I want one pure function and one project-level function that give me the body map, so that the report, MCP server and UI all read the same result.

#### Acceptance Criteria

1. The linker SHALL export `link(requirements, index, parserDiagnostics?)` from `src/linker/index.ts` as a pure function that returns a `BodyMap`, where `requirements` is a `Requirement[]`, `index` is a `CodeIndex` and `parserDiagnostics` is an optional `Diagnostic[]`.
2. The linker SHALL export `linkProject(root): Promise<BodyMap>` from `src/linker/index.ts`, which calls `parseProject(root)` and `indexRepo(root)` and passes their results to `link`.
3. The linker SHALL give the body map the fields root, requirements, zombies, diagnostics and counts.
4. The linker SHALL NOT throw from `link` on any requirements and index, and SHALL NOT read files, call the network, read the clock or use random values inside `link`.
5. IF `linkProject` meets an unexpected error, THEN the linker SHALL return an empty body map with one diagnostic of code link-failed instead of throwing.
6. WHEN the same inputs are linked twice, THEN the linker SHALL return deeply equal body maps whose JSON serialisation is identical.

### Requirement 2: Explicit tags

**User Story:** As a developer, I want to name the requirement a function or a test is for, so that the link is certain and not guessed.

#### Acceptance Criteria

1. The linker SHALL find tags in comment text and in test titles with a case-sensitive pattern equivalent to `[a-z0-9][a-z0-9-]*\/R\d+\.\d+` that is not directly preceded by a letter, digit or hyphen.
2. WHEN a block comment spans several lines, THEN the linker SHALL give a tag the line of the comment plus the number of line breaks before the tag in the comment text, and SHALL treat the last line of the comment as the end line of the comment.
3. WHEN a tag is in a comment of a non-test file and a symbol of that file has a line range containing the tag line, THEN the linker SHALL attach the tag to the innermost such symbol, that is the one with the smallest line range, and then the lowest startLine, then the lowest name.
4. WHEN a tag is in a comment of a non-test file and no symbol contains the tag line, THEN the linker SHALL attach the tag to the first symbol that starts within the 3 lines after the end line of the comment.
5. WHEN a tag is in a comment of a test file, THEN the linker SHALL attach it to the test case on the same line as the tag, or if there is none, to the first test case that starts within the 3 lines after the end line of the comment.
6. WHEN a tag is inside the title of a test case, THEN the linker SHALL attach it to that test case.
7. The linker SHALL NOT attach a tag in a test file to a symbol, and SHALL NOT attach a tag in a non-test file to a test case.
8. IF a tag names an ID that no requirement has, THEN the linker SHALL emit a diagnostic with code unknown-requirement-tag, the file and the line of the tag, and SHALL link nothing for that tag.
9. IF a tag names a known requirement but attaches to no symbol or test case, THEN the linker SHALL create no link and emit no diagnostic for it.
10. WHEN a tag attaches to a symbol or test case, THEN the linker SHALL record one link with method tag and score 1, and SHALL record at most one link for the same requirement and the same symbol or test case.

### Requirement 3: Token overlap

**User Story:** As a developer, I want untagged code and tests to be matched to requirements by shared words, so that I do not have to tag everything.

#### Acceptance Criteria

1. WHEN a requirement has no explicit code link, THEN the linker SHALL try overlap links to code for it, and WHEN it has no explicit test link, THEN the linker SHALL try overlap links to tests for it, each decided independently of the other.
2. The linker SHALL tokenise a text by: splitting camelCase and snake_case boundaries, lowercasing, splitting on every character that is not a-z or 0-9, dropping the stopwords the, a, an, of, to, and, or, in, on, for, with, shall, when, then, if, while, where, is, are, be, it, that, this, as, by, at, from, not, no, any, each, every, dropping tokens shorter than 3 characters, stripping one trailing `s` from tokens longer than 3 characters that do not end in `ss`, dropping tokens that are stopwords after stripping, and removing duplicates while keeping the first occurrence.
3. The linker SHALL make tokenise total and idempotent: it never throws on any string, and tokenising the space-joined output of tokenise gives the same tokens.
4. The linker SHALL build the requirement token set from the tokens of the system, the response, the trigger, the state, the condition and the feature, the code token set from the tokens of the symbol name where `Class.method` yields the tokens of both parts, and the test token set from the tokens of the test case title.
5. The linker SHALL compute the overlap score as the number of shared tokens divided by the size of the smaller of the two token sets, and 0 when either set is empty, so that the score is within 0 and 1 and the same for both argument orders.
6. WHEN two token sets share at least 2 tokens and their overlap score is at least THRESHOLD, THEN the linker SHALL consider them overlapping, where THRESHOLD is the constant 0.5 exported from `src/linker/overlap.ts`.
7. For code, the linker SHALL consider only symbols of non-test files, of every kind including methods and including symbols that are not exported, and for tests the linker SHALL consider only test cases.
8. WHEN a candidate overlaps a requirement that is eligible under Criterion 1, THEN the linker SHALL record a link with method overlap and the overlap score, for every such candidate and not only the best one.

### Requirement 4: Classification

**User Story:** As a SpecAutopsy user, I want every requirement and every exported symbol put into a fixed class, so that the report names what was never built, what nobody asked for and what nothing proves.

#### Acceptance Criteria

1. The linker SHALL treat a non-test symbol linked to a requirement as implementing code for that requirement.
2. WHEN a requirement has no implementing code, THEN the linker SHALL give it the status ghost.
3. WHEN a requirement has implementing code and no linked test, THEN the linker SHALL give it the status unproven.
4. WHEN a requirement has implementing code and at least one linked test, THEN the linker SHALL give it the status proven.
5. The linker SHALL give every requirement exactly one status, and SHALL NOT give the status ghost to a requirement that has a code link.
6. WHEN an exported symbol of kind function, class, const, enum, interface or type in a non-test file is linked to no requirement, THEN the linker SHALL report it as a zombie.
7. The linker SHALL NOT report as zombie a symbol of kind method, a symbol that is not exported, or any symbol of a test file.
8. WHEN a symbol is linked to at least one requirement by tag or by overlap, THEN the linker SHALL NOT report it as a zombie.

### Requirement 5: Body map content and order

**User Story:** As a user reading a finding, I want evidence and a reason for every finding, so that I can check it myself.

#### Acceptance Criteria

1. The linker SHALL give each requirement entry the fields id, status, file, line, codeLinks, testLinks and lastCommit.
2. The linker SHALL set the file and line of a requirement entry to the file and line of the requirement itself, so that every ghost and unproven finding carries requirement id, file and line.
3. The linker SHALL list requirement entries in the order in which the requirements were given.
4. The linker SHALL record a code link as symbol name, file, startLine, method and score, and a test link as test title, file, line, method and score, and SHALL sort links by file, then line, then name or title, by code-unit comparison.
5. The linker SHALL record a zombie as symbol name, kind, file and line, where line is the startLine of the symbol, and SHALL sort zombies by file, then line, then symbol name.
6. The linker SHALL merge the parser diagnostics, the index diagnostics and the linker diagnostics into one list, each with source (parser, indexer or linker), code, message, file and line, where line is null for index diagnostics.
7. The linker SHALL sort diagnostics by file, then line (null first), then code, then message, then source.
8. The linker SHALL give the body map counts of requirements, ghost, unproven, proven and zombies that agree with the lists.
9. WHEN a requirement has implementing code and git history exists, THEN the linker SHALL set lastCommit to the date, subject and author of the newest commit among the first history entries of its implementing files, breaking ties by file path, and otherwise SHALL set lastCommit to null.
10. WHEN two requirements share the same id, THEN the linker SHALL list both entries, attach tags to the first of them, and apply overlap to each independently.

### Requirement 6: Accuracy measurement

**User Story:** As a maintainer, I want precision and recall measured against a planted truth, so that I know how good the linker is without tuning it to look good.

#### Acceptance Criteria

1. The linker SHALL export `scoreAgainstTruth(bodyMap, truth)` from `src/linker/accuracy.ts`, where truth is a list of entries `{ class, key }` and class is ghost, zombie or unproven.
2. The linker SHALL use the requirement id as the key of a ghost or unproven finding, and `file#symbol` as the key of a zombie.
3. WHEN a found finding is in the truth, THEN the linker SHALL count it as a true positive, and SHALL compute precision as true positives divided by found and recall as true positives divided by planted.
4. The linker SHALL return precision, recall and the counts found, planted and true positives for each of ghost, zombie and unproven, and for all three together.
5. WHEN a denominator is 0, THEN the linker SHALL define the ratio as 1.
6. The maintainers SHALL NOT change THRESHOLD, or the truth of the planted fixture, to make accuracy numbers pass, and SHALL report low accuracy as it is.

### Requirement 7: Planted fixture and verification

**User Story:** As a maintainer, I want a small repository with known planted findings, so that the linker is measured against something it did not shape.

#### Acceptance Criteria

1. The repository SHALL contain `tests/fixtures/planted/` as plain files without a nested `.git`, with `.kiro/specs/<name>/requirements.md` for two specs and about 14 EARS requirements, TypeScript sources in `src/`, one small Python module, TypeScript tests in `tests/`, a `test_*.py` file, and `expected.json`.
2. The fixture SHALL plant at least 3 ghosts, 3 unproven requirements, 4 zombies and 4 proven requirements, of which at least 2 are linked by explicit tag and at least 2 only by token overlap.
3. The fixture SHALL contain at least these decoys: a ghost whose words partly overlap an unrelated exported function name below THRESHOLD, a zombie whose name shares words with a requirement already proven by another symbol, and an exported symbol linked by tag whose name has no word in common with its requirement.
4. The author SHALL write `expected.json` from the plan in design.md before the linker exists, and SHALL NOT change it to fit the output of the linker.
5. The accuracy test SHALL print one line `linker accuracy: precision=<x> recall=<y>` for each of ghost, zombie, unproven and overall, and SHALL assert only that every number is a real value between 0 and 1 and that overall precision and overall recall are each at least 0.8.
6. The repository SHALL contain a test that runs `linkProject` on the root of this repository, checks that nothing throws and that every finding has its evidence (requirement id, file and line for ghosts and unproven requirements; symbol, file and line for zombies).
