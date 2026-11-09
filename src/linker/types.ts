import type { Symbol as CodeSymbol, SymbolKind, TestCase } from "../indexer/index.js";

export type LinkMethod = "commit" | "tag" | "overlap";
export type RequirementStatus = "ghost" | "unproven" | "proven";
// Kept as a subset of SymbolKind (methods are never zombie candidates).
export type ZombieKind = Extract<
  SymbolKind,
  "function" | "class" | "const" | "enum" | "interface" | "type"
>;

export interface CodeLink {
  symbol: string;
  file: string;
  startLine: number;
  method: LinkMethod;
  score: number;
  /** SHA of the task commit; present only on commit links. */
  commit?: string;
}

export interface TestLink {
  title: string;
  file: string;
  line: number;
  method: LinkMethod;
  score: number;
  /** SHA of the task commit; present only on commit links. */
  commit?: string;
}

export interface LastCommit {
  date: string;
  subject: string;
  author: string;
}

/** The best unlinked pair of a ghost or a zombie that still shares words. */
export interface NearMiss {
  /** The other side of the near miss; set on a zombie. */
  requirementId: string | null;
  /** The other side of the near miss; set on a ghost. */
  symbol: string | null;
  file: string;
  line: number;
  /** overlapScore, at least NEAR_MISS and not a link. */
  score: number;
}

/** Optional data that `link` receives from the readers. All of it may be absent. */
export interface LinkExtras {
  /** Spec folder name -> text of its design.md. */
  designTexts?: ReadonlyMap<string, string>;
  /** `<spec>#<N>` of every task marked [x]. */
  checkedTasks?: ReadonlySet<string>;
}

export interface RequirementEntry {
  id: string;
  status: RequirementStatus;
  file: string; // the requirement's own location
  line: number;
  codeLinks: CodeLink[];
  testLinks: TestLink[];
  lastCommit: LastCommit | null;
  /** Ghosts only, and only when a near miss exists. */
  nearMiss?: NearMiss;
  /** SHA of the test-only task commit that made this requirement proven. */
  testOnlyCommit?: string;
  /** Ghosts only: a checked task with a resolved commit lists this requirement. */
  contradiction?: { task: number; commit: string };
}

export interface Zombie {
  symbol: string;
  kind: ZombieKind;
  file: string;
  line: number;
  /** Only when a near miss exists. */
  nearMiss?: NearMiss;
}

export interface BodyMapDiagnostic {
  source: "parser" | "indexer" | "linker";
  // linker codes: "unknown-requirement-tag", "unknown-task-requirement", "link-failed",
  // "defect-description", "test-only-task"
  code: string;
  message: string;
  file: string;
  line: number | null; // null for index diagnostics
}

export interface BodyMapCounts {
  requirements: number;
  ghost: number;
  unproven: number;
  proven: number;
  zombies: number;
}

export interface BodyMap {
  root: string;
  requirements: RequirementEntry[];
  zombies: Zombie[];
  diagnostics: BodyMapDiagnostic[];
  counts: BodyMapCounts;
}

/** What a tag attached to; `null` means it attached to nothing. */
export type TagTarget =
  | { kind: "symbol"; symbol: CodeSymbol }
  | { kind: "test"; testCase: TestCase };

export interface TagHit {
  id: string;
  file: string;
  line: number;
  target: TagTarget | null;
}

export interface TruthEntry {
  class: "ghost" | "zombie" | "unproven";
  key: string;
}

export interface ClassScore {
  found: number;
  planted: number;
  truePositives: number;
  precision: number;
  recall: number;
}

export interface AccuracyReport {
  ghost: ClassScore;
  zombie: ClassScore;
  unproven: ClassScore;
  overall: ClassScore;
}
