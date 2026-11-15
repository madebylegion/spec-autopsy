# Design Document: Show Proven Evidence in Detail Panel

## Overview

The Morgue UI detail panel currently displays "No code linked." as a fallback when a proven requirement has no code symbols linked. This design replaces that fallback with the first line of `provenEvidence` output, which explains exactly how the requirement was proven (e.g., "no code link; proven by tagged test tests/linker/link.test.ts:42"). 

The change is confined to the rendering path: no new dependencies, no restructuring of data flow, no changes to core report logic.

## Architecture

The feature follows the existing data flow:
1. **Report** (`src/report/types.ts`) contains `ReportRequirement` objects with `status: "proven"` and `codeLinks: []`.
2. **View-model** (`src/ui/view-model.ts`) builds a `Detail` object from the report, including `codeLinks` array.
3. **Render** (`src/ui/render.ts`) consumes the `Detail` object and renders it to DOM.

The change adds a single conditional branch in the render layer: when rendering "Code links" section for a proven requirement with empty `codeLinks`, fetch the first line of `provenEvidence` and display it instead of "No code linked."

## Components and Interfaces

### 1. `src/ui/view-model.ts` — Detail Interface

No changes to the `Detail` interface itself. The interface already carries:
- `kind: "requirement" | "zombie"` — identifies requirement vs zombie
- `status: MarkerStatus` — equals `"proven"` for proven requirements
- `codeLinks: string[]` — empty array when no code links exist

The `detailFor` function already populates `Detail.codeLinks` correctly.

### 2. `src/ui/render.ts` — Detail Panel Rendering

The `detailPanel` function currently renders the Code links section with:
```typescript
detailSection("Code links", list(detail.codeLinks, "No code linked."))
```

**Modified logic:**
- If `detail.codeLinks` is empty AND `detail.kind === "requirement"` AND `detail.status === "proven"`:
  - Call `provenEvidence(requirementEntry)` to get the first line
  - Pass that first line to `list()` as the "none" fallback instead of "No code linked."
- Otherwise, render as before

### 3. `src/report/evidence.ts` — provenEvidence Function

The `provenEvidence` function is already exposed and returns `string[]`. It requires a `RequirementEntry` object from `src/linker/index.js`.

**Required step:**
- Import `provenEvidence` from `src/report/evidence.ts` in `src/ui/render.ts`
- In `detailPanel`, resolve the `requirementEntry` by looking up the requirement in the report using `detail.heading` (the requirement ID)

### 4. Data Flow

```
Report (containing ReportRequirement + RequirementEntry link)
  ↓
detailFor() in view-model
  ↓
Detail object (heading, status, codeLinks, kind)
  ↓
detailPanel() in render
  ↓
Check: kind="requirement" AND status="proven" AND codeLinks.empty?
  ├─ YES: Call provenEvidence(entry) → get first line → pass to list()
  └─ NO: Use empty codeLinks array → list() shows "No code linked."
```

The `detail.heading` field holds the requirement ID. This can be used to locate the requirement in `report.specs` during rendering.

## Data Models

No new data models are introduced. The feature uses existing structures:

- **Report.specs**: Array of `ReportSpec`, each containing requirements
- **ReportRequirement**: Existing model with `id`, `status`, `codeLinks`, `testLinks`
- **RequirementEntry** (from `src/linker/index.js`): Passed to `provenEvidence()`
- **Detail** (from view-model): Includes `heading` (requirement ID), `status`, `codeLinks`, `kind`

## Correctness Properties

This feature is UI rendering with conditional display logic. It does **not** use property-based testing because:
- The logic is a simple state-based branching rule with three discrete cases (proven+empty, proven+nonempty, non-proven+empty)
- There is no universal property that holds across arbitrary inputs
- Behavior is deterministic and fully enumerable

Instead, correctness is verified through example-based unit tests (see Testing Strategy below) that cover all three cases explicitly.

## Error Handling

- **Missing requirement lookup**: If `detail.heading` does not map to a requirement in the report, fall back to "No code linked." This is a defensive measure; it should not happen if `detailFor()` builds `Detail` objects correctly.
- **Empty provenEvidence output**: The `provenEvidence` function always returns at least one line (guaranteed by its implementation). No special handling needed.
- **Zombie finding**: Zombies never have status `"proven"`, so they are never affected by this change.

## Testing Strategy

### Unit Tests (example-based)

Test scenarios in `tests/ui/render.test.ts` or similar:

1. **Proven requirement, no code links**
   - Build a `Detail` with `kind="requirement"`, `status="proven"`, `codeLinks=[]`
   - Render the detail panel
   - Assert the Code links section contains the first line of `provenEvidence` (mock or provide a known example)

2. **Proven requirement, with code links**
   - Build a `Detail` with `kind="requirement"`, `status="proven"`, `codeLinks=["file.ts:10 symbol"]`
   - Render the detail panel
   - Assert the Code links section shows the code links, not `provenEvidence`

3. **Unproven requirement, no code links**
   - Build a `Detail` with `kind="requirement"`, `status="unproven"`, `codeLinks=[]`
   - Render the detail panel
   - Assert the Code links section shows "No code linked."

4. **Zombie finding**
   - Build a `Detail` with `kind="zombie"`
   - Render the detail panel
   - Assert the Code links section is not shown (zombies have no code/test links)

### Integration Tests (optional)

Test with a real report fixture that includes a proven requirement with no code links, ensuring the detail panel renders it correctly end-to-end.

### No Property-Based Tests

The feature is a UI rendering conditional. There is no universal property to test across arbitrary inputs — the logic is a simple state-based branching rule. Example-based tests cover all cases comprehensively.

