export type SymbolKind =
  | "function" | "class" | "method" | "interface" | "type" | "enum" | "const";

export interface Symbol {
  name: string;          // "Class.method" for methods
  kind: SymbolKind;
  exported: boolean;
  startLine: number;     // 1-based, inclusive
  endLine: number;       // 1-based, inclusive
  file: string;          // project-relative, "/" separators
}

export interface CommentEntry { line: number; text: string }
export interface TestCase { title: string; line: number }

export interface GitCommit {
  sha: string;
  author: string;
  date: string;          // ISO 8601
  subject: string;
}

export interface GitHistory {
  commits: GitCommit[];  // newest first, at most 5
  commitCount: number;   // total commits touching the file
  authors: string[];     // distinct, sorted
}

export interface KiroCommit { sha: string; subject: string }
export interface BlameRange { startLine: number; endLine: number; sha: string }  // 1-based, inclusive

export interface FileIndex {
  path: string;
  language: "typescript" | "tsx" | "javascript" | "python";
  isTest: boolean;
  lineCount: number;
  symbols: Symbol[];
  comments: CommentEntry[];
  testCases: TestCase[];
  history: GitHistory;
  blame?: BlameRange[];
}

export interface IndexDiagnostic { code: string; message: string; file: string }

export interface CodeIndex {
  root: string;
  files: FileIndex[];
  diagnostics: IndexDiagnostic[];
  kiroCommits?: KiroCommit[];
}
