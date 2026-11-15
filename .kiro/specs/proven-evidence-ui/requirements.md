# Requirements Document

## Introduction

The detail panel in the Morgue UI shows a "Code links" section for each requirement. When a proven requirement has no code links (it was proven by a tagged test only), the section currently displays the static fallback text "No code linked." This feature replaces that fallback with the first line of `provenEvidence` from `src/report/evidence.ts`, which explains exactly how the requirement was proven (for example, "no code link; proven by tagged test tests/linker/link.test.ts:42"). No new dependencies are introduced, and the change is confined to the detail panel rendering path.

## Glossary

- **Detail_Panel**: The side-panel rendered by `detailPanel` in `src/ui/render.ts` that shows full information for a selected requirement or zombie.
- **Code_Links_Section**: The subsection of the Detail_Panel headed "Code links", rendered with the `detailSection` / `list` helpers in `src/ui/render.ts`.
- **provenEvidence**: The function in `src/report/evidence.ts` that returns a string array explaining why a requirement is considered proven.
- **Proven_Requirement**: A `ReportRequirement` whose `status` field equals `"proven"`.
- **Detail**: The view-model object produced by `detailFor` in `src/ui/view-model.ts` and consumed by `detailPanel`.

## Requirements

### Requirement 1: Show proven evidence when no code is linked

**User Story:** As a developer reviewing the Morgue, I want the "Code links" section to explain how a proven requirement was proven even when no code symbol is linked, so that I understand the basis for its proven status without leaving the panel.

#### Acceptance Criteria

1. WHEN the Detail_Panel renders a Proven_Requirement whose `codeLinks` array is empty, THE Detail_Panel SHALL display the first line of `provenEvidence` output for that requirement in the Code_Links_Section instead of the text "No code linked."
2. WHEN the Detail_Panel renders a Proven_Requirement whose `codeLinks` array is non-empty, THE Detail_Panel SHALL display the code links unchanged and SHALL NOT display `provenEvidence` output in the Code_Links_Section.
3. WHEN the Detail_Panel renders a requirement that is not a Proven_Requirement and whose `codeLinks` array is empty, THE Detail_Panel SHALL display the text "No code linked." in the Code_Links_Section unchanged.
4. THE Detail_Panel SHALL obtain the proven-evidence text from the `provenEvidence` function already present in `src/report/evidence.ts` and SHALL NOT duplicate its logic.
5. THE Detail_Panel SHALL NOT introduce any new npm dependencies to implement this change.
