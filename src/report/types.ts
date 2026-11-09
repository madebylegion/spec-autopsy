// No `node:` imports in src/report/: the UI bundles validate-report.ts.
import type {
  BodyMapDiagnostic,
  CodeLink,
  LastCommit,
  RequirementStatus,
  TestLink,
} from "../linker/index.js";

export type FindingType = "ghost" | "unproven" | "zombie";
export type ConfidenceLevel = "high" | "medium" | "low";

export interface Confidence {
  score: number;
  level: ConfidenceLevel;
}

export interface SpecCounts {
  requirements: number;
  ghost: number;
  unproven: number;
  proven: number;
}

export interface ReportSummary {
  requirements: number;
  ghost: number;
  unproven: number;
  proven: number;
  zombies: number;
  bySpec: Record<string, SpecCounts>;
}

export interface ReportRequirement {
  id: string;
  text: string;
  status: RequirementStatus;
  file: string;
  line: number;
  lastCommit: LastCommit | null;
  codeLinks: CodeLink[];
  testLinks: TestLink[];
}

export interface ReportSpec {
  name: string;
  requirements: ReportRequirement[];
}

export interface Finding {
  type: FindingType;
  /** null for a zombie. */
  requirementId: string | null;
  /** Requirement text, or the zombie symbol name. */
  title: string;
  file: string;
  /** At least 1. */
  line: number;
  /** At least one sentence; the first states the cause. */
  evidence: string[];
  confidence: Confidence;
}

export interface Report {
  schemaVersion: 1;
  tool: { name: "spec-autopsy"; version: string };
  /** The package.json name when there is one, else the base name of the root; never a path. */
  project: { name: string };
  summary: ReportSummary;
  specs: ReportSpec[];
  findings: Finding[];
  diagnostics: BodyMapDiagnostic[];
}

export interface ReportOptions {
  version: string;
  /** Project name (the `name` of package.json); default is the base name of the root. */
  projectName?: string;
}

export type ValidateResult = { ok: true; report: Report } | { ok: false; errors: string[] };

export type { BodyMapDiagnostic, CodeLink, LastCommit, RequirementStatus, TestLink };
