export type EarsPattern =
  | "ubiquitous"
  | "event-driven"
  | "state-driven"
  | "unwanted"
  | "optional"
  | "complex";

export interface Requirement {
  id: string; // "ears-parser/R2.3"
  pattern: EarsPattern;
  state?: string; // WHILE
  feature?: string; // WHERE
  trigger?: string; // WHEN
  condition?: string; // IF
  system: string; // "parser" (the leading "the" is dropped)
  response: string; // text after SHALL
  file: string; // as passed in; project-relative, "/" separators
  line: number; // 1-based
}

export type DiagnosticCode =
  | "missing-shall"
  | "missing-system"
  | "empty-response"
  | "unnumbered-statement"
  | "duplicate-id"
  | "unreadable-file";

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  file: string;
  line: number; // 1-based; 1 for file-level problems
}

export interface ParseResult {
  requirements: Requirement[]; // sorted by file, then line
  diagnostics: Diagnostic[]; // sorted by file, then line, then code
}
