# Design: ears-parser

## Overview

A small, pure, deterministic parser in `src/parser/`. It has no imports from later organs. Only the project-root function touches the file system, and it never throws.

```
src/parser/
  types.ts                 # Requirement, Diagnostic, ParseResult
  statement-parser.ts      # one statement line -> clauses/system/response
  requirement-parser.ts    # whole text -> ParseResult, assigns IDs
  requirement-printer.ts   # Requirement -> canonical EARS line
  project-reader.ts        # project root -> ParseResult
  index.ts                 # public exports
```

## Public API

```ts
export function parseRequirementsText(
  text: string,
  options: { specName: string; file: string },
): ParseResult;

export function parseProject(projectRoot: string): Promise<ParseResult>;

export function printRequirement(req: Requirement): string;
```

## Types

```ts
export type EarsPattern =
  | "ubiquitous" | "event-driven" | "state-driven"
  | "unwanted" | "optional" | "complex";

export interface Requirement {
  id: string;            // "ears-parser/R2.3"
  pattern: EarsPattern;
  state?: string;        // WHILE
  feature?: string;      // WHERE
  trigger?: string;      // WHEN
  condition?: string;    // IF
  system: string;        // "parser" (the leading "the" is dropped)
  response: string;      // text after SHALL
  file: string;          // as passed in; project-relative, "/" separators
  line: number;          // 1-based
}

export type DiagnosticCode =
  | "missing-shall" | "missing-system" | "empty-response"
  | "unnumbered-statement" | "duplicate-id" | "unreadable-file";

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  file: string;
  line: number;          // 1-based; 1 for file-level problems
}

export interface ParseResult {
  requirements: Requirement[];  // sorted by file, then line
  diagnostics: Diagnostic[];    // sorted by file, then line, then code
}
```

## Parsing rules

Line scan, ignoring fenced code blocks:

1. `^#{1,6}\s+Requirement\s+(\d+)` sets the current requirement number N.
2. Under a heading, `^\s*(\d+)\.\s+(.*)$` is a criterion with number M and statement text. Before any heading, numbered lines are ignored.
3. A non-numbered line starting with WHILE, WHERE, WHEN or IF (case-insensitive, followed by a space) yields an `unnumbered-statement` diagnostic.

Statement text is whitespace-normalised, then:

1. Split at the first word SHALL (case-insensitive). No match: `missing-shall`. The right side is the response; empty: `empty-response`.
2. In the left side (the head), the system is the text after the last word "the". None or empty: `missing-system`.
3. The rest of the head has a trailing `, THEN` / `THEN` removed and is cut into clauses. A clause starts with WHILE, WHERE, WHEN or IF at the start of the head or right after a comma. Text up to the next clause is its value, minus a trailing comma and a trailing THEN.
4. No clauses: ubiquitous. One clause: its pattern. Two or more: complex.

If a statement yields a diagnostic, no requirement object is produced for it.

## IDs

`id = ${specName}/R${N}.${M}` uses only the numbers written in the file. It does not depend on statement text, line position or order, so edits and re-ordering of unrelated lines cannot change it. A repeated id keeps the first object and reports `duplicate-id` on the later line.

## Printer

Canonical form, one line, no number prefix:

```
[WHILE <state>, ][WHERE <feature>, ][WHEN <trigger>, ][IF <condition>, ]THEN the <system> SHALL <response>
The <system> SHALL <response>            (no clauses)
```

Because the parser normalises whitespace and drops the leading "the", `parse(print(r))` equals `r` apart from id, file and line. Fields must not contain line breaks.

## Error model

- No function throws. `parseRequirementsText` wraps its scan in a guard and reports anything unexpected as a diagnostic on line 1.
- `parseProject` catches every file-system error: a missing `.kiro/specs` gives an empty result, a failing file gives `unreadable-file` and the scan continues.
- Discovery lists `.kiro/specs/*/requirements.md`, sorted by spec folder name with plain code-unit comparison (not locale-aware), so output does not depend on the OS.
- File paths in results are relative to the project root with `/` separators.

## Testing

- Example-based tests in `tests/parser/` for each pattern, the Kiro THEN form, case-insensitivity and each diagnostic code.
- fast-check properties: round trip parse, print, parse; ID stability when unrelated prose lines are inserted or shuffled; the parser never throws on arbitrary strings.
- One test parses this spec's own `requirements.md` and expects zero diagnostics.
