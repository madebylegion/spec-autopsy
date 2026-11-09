export { buildReport } from "./build-report.js";
export { ghostConfidence, levelForScore, specOf, unprovenConfidence, zombieConfidence } from "./confidence.js";
export { validateReport } from "./validate-report.js";
export type {
  Confidence,
  ConfidenceLevel,
  Finding,
  FindingType,
  Report,
  ReportOptions,
  ReportRequirement,
  ReportSpec,
  ReportSummary,
  SpecCounts,
  ValidateResult,
} from "./types.js";
