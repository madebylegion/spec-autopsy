# Requirements Document

## Introduction

The linker classifies a requirement as "proven" when it has a code link and ANY test link. However, test links found only by word overlap between requirement text and test titles are weak evidence. In a sample repo, treat-bag/R3.1 (nut alert) is tagged in the code but the only test link is an overlap match to describe('Treat Bag'), with no actual test call to the tagged symbol. The tool incorrectly says "proven". Real proof requires either a tag/commit test link, a test-call code link, or an overlap-linked test case whose body actually uses one of the requirement's linked symbols.

## Glossary

**Overlap_Test_Link**: A test link discovered by word overlap matching between requirement text and test describe/it titles, without evidence that the test case body uses any of the requirement's code symbols.

**Real_Test_Evidence**: Test link with method "tag" or "commit", OR a test-call code link, OR an overlap test link to a test case that actually calls one of the requirement's linked symbols (TestCase.calls).

## Requirements

### Requirement 1: Overlap-only test links do not prove a requirement

**User Story:**
As a code auditor, I want overlap-only test links to be recognized as weak evidence so that unproven requirements are not incorrectly marked as proven, allowing me to focus on actual gaps in test coverage.

#### Acceptance Criteria

1. WHEN a requirement has a code link, no tag or commit test link, no test-call code link, and none of its overlap-linked test cases uses the name of one of its linked symbols, THE linker SHALL classify it as unproven.

2. WHEN a requirement has a code link and a tag or commit test link, THE linker SHALL classify it as proven.

3. WHEN a requirement has a code link and a test-call code link, THE linker SHALL classify it as proven.

4. WHEN a requirement has a code link and an overlap-linked test case whose calls contain the name of one of its linked symbols, THE linker SHALL classify it as proven.

5. THE linker SHALL keep overlap test links in the entry's testLinks, and the rules for requirements with no code link, the report.json shape, the Report types, validateReport and the dependencies SHALL stay unchanged.

6. A unit test SHALL fail under the old rule and pass under the new rule, built from the treat-bag shape (tag code link, one overlap test link whose test case calls nothing linked).
