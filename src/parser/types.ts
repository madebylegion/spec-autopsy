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

export interface TaskCommitSubject {
  spec: string | null;
  number: number;
  title: string;
}

export interface TaskRequirementRef {
  id: string; // "<spec>/R<N>.<M>", or as written when not bare
  line: number; // 1-based line of the requirements line
}

export interface TaskEntry {
  spec: string;
  number: number;
  title: string;
  file: string; // ".kiro/specs/<spec>/tasks.md"
  line: number; // 1-based line of the task line
  requirements: TaskRequirementRef[]; // order of appearance, no duplicate ids
}
