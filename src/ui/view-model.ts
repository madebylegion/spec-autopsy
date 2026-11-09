// Pure functions only: no DOM, no node: imports. Tested without a DOM.
import type { Finding, FindingType, Report, ValidateResult } from "../report/types.js";

export type Region =
  | "head"
  | "chest"
  | "abdomen"
  | "left-arm"
  | "right-arm"
  | "left-leg"
  | "right-leg";

const REGIONS: readonly Region[] = [
  "head",
  "chest",
  "abdomen",
  "left-arm",
  "right-arm",
  "left-leg",
  "right-leg",
];

/** 0-based spec index to body region; index 6 and above gives the last region. */
export function regionForSpec(index: number): Region {
  const last = REGIONS.length - 1;
  const safe = Number.isFinite(index) ? Math.trunc(index) : 0;
  return REGIONS[Math.min(Math.max(safe, 0), last)] as Region;
}

export interface Filters {
  ghost: boolean;
  zombie: boolean;
  unproven: boolean;
  lowOnly: boolean;
}

export function applyFilters(findings: Finding[], f: Filters): Finding[] {
  return findings.filter((finding) => {
    if (!f[finding.type]) return false;
    if (f.lowOnly && finding.confidence.level !== "low") return false;
    return true;
  });
}

const TYPE_ORDER: Readonly<Record<FindingType, number>> = { ghost: 0, unproven: 1, zombie: 2 };
const LEVEL_ORDER: Readonly<Record<string, number>> = { high: 0, medium: 1, low: 2 };

function compareUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Ghosts first, then unproven, then zombies; inside a type by confidence level
 * high to low, then file and line. Stable, and does not change its input.
 */
export function sortFindings(findings: Finding[]): Finding[] {
  return findings
    .map((finding, index) => ({ finding, index }))
    .sort((a, b) => {
      const x = a.finding;
      const y = b.finding;
      const byType = TYPE_ORDER[x.type] - TYPE_ORDER[y.type];
      if (byType !== 0) return byType;
      const byLevel = (LEVEL_ORDER[x.confidence.level] ?? 3) - (LEVEL_ORDER[y.confidence.level] ?? 3);
      if (byLevel !== 0) return byLevel;
      const byFile = compareUnits(x.file, y.file);
      if (byFile !== 0) return byFile;
      if (x.line !== y.line) return x.line - y.line;
      return a.index - b.index;
    })
    .map((entry) => entry.finding);
}

export function typeCounts(findings: Finding[]): Record<FindingType, number> {
  const counts: Record<FindingType, number> = { ghost: 0, unproven: 0, zombie: 0 };
  for (const finding of findings) counts[finding.type] += 1;
  return counts;
}

/** About three lines of card text. */
export const TITLE_MAX_CHARS = 120;

/** Cuts on a word and adds "..."; the result is never longer than maxChars. */
export function clampTitle(text: string, maxChars: number = TITLE_MAX_CHARS): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;
  const room = Math.max(1, maxChars - 3);
  let cut = flat.slice(0, room);
  if (flat.charAt(room) !== " ") {
    const space = cut.lastIndexOf(" ");
    if (space > 0) cut = cut.slice(0, space);
  }
  return `${cut.trimEnd()}...`;
}

export interface CardText {
  id: string;
  title: string;
  clamped: string;
  where: string;
  confidence: string;
  cause: string;
}

export function cardText(f: Finding): CardText {
  return {
    id: f.requirementId ?? f.title,
    title: f.title,
    clamped: clampTitle(f.title),
    where: `${f.file}:${f.line}`,
    confidence: `${f.confidence.level} ${f.confidence.score.toFixed(2)}`,
    cause: f.evidence[0] ?? "",
  };
}

export interface RegionGroup {
  region: Region;
  /** Spec names in this region, in report order. */
  specs: string[];
  /** Requirement ids of those specs, in report order. */
  requirementIds: string[];
}

/** Specs to regions in report order; specs sharing a region are merged. */
export function groupByRegion(report: Report): RegionGroup[] {
  const groups: RegionGroup[] = [];
  report.specs.forEach((spec, index) => {
    const region = regionForSpec(index);
    let group = groups.find((g) => g.region === region);
    if (group === undefined) {
      group = { region, specs: [], requirementIds: [] };
      groups.push(group);
    }
    group.specs.push(spec.name);
    for (const req of spec.requirements) group.requirementIds.push(req.id);
  });
  return groups;
}

export type PageState =
  | { kind: "loading" }
  | { kind: "error"; title: string; lines: string[] }
  | { kind: "empty"; report: Report }
  | { kind: "ready"; report: Report };

export type LoadResult =
  | { status: "missing" }
  | { status: "json-error" }
  | { status: "validated"; result: ValidateResult };

export const MAKE_REPORT_LINE = "Run npm run autopsy to make one.";

export function stateFromLoad(result: LoadResult): PageState {
  if (result.status === "missing") {
    return {
      kind: "error",
      title: "No report found",
      lines: ["Could not open ./report.json.", MAKE_REPORT_LINE],
    };
  }
  if (result.status === "json-error") {
    return {
      kind: "error",
      title: "This file is not valid JSON",
      lines: ["The report could not be read as JSON.", MAKE_REPORT_LINE],
    };
  }
  const validated = result.result;
  if (!validated.ok) {
    const newer = validated.errors.some((e) => e.includes("newer"));
    return {
      kind: "error",
      title: newer ? "This report is newer than this viewer" : "This report is not valid",
      lines: validated.errors.slice(0, 5),
    };
  }
  const report = validated.report;
  return report.findings.length === 0 ? { kind: "empty", report } : { kind: "ready", report };
}
