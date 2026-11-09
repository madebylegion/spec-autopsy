// Pure functions only: no DOM, no node: imports. Tested without a DOM.
import type {
  ConfidenceLevel,
  Finding,
  FindingType,
  Report,
  ReportRequirement,
  ValidateResult,
} from "../report/types.js";

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

/**
 * Splits a path so that a line break is only allowed after a "/":
 * "a/b/c.ts" gives ["a/", "b/", "c.ts"]. Joining the parts gives the path back.
 */
export function pathParts(file: string): string[] {
  const parts: string[] = [];
  let start = 0;
  for (let i = 0; i < file.length; i++) {
    if (file.charAt(i) === "/") {
      parts.push(file.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < file.length) parts.push(file.slice(start));
  return parts;
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

// ---------------------------------------------------------------------------
// Body map geometry and markers
// ---------------------------------------------------------------------------

export type MapRegion = Region | "extra-limb";

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Size of the SVG drawing, in drawing units. */
export const MAP_WIDTH = 300;
export const MAP_HEIGHT = 700;

/** Where the markers of each region go. The "extra limb" strip is for zombies. */
export const REGION_BOXES: Readonly<Record<MapRegion, Box>> = {
  head: { x: 110, y: 22, w: 80, h: 76 },
  chest: { x: 98, y: 112, w: 104, h: 112 },
  abdomen: { x: 102, y: 232, w: 96, h: 100 },
  "left-arm": { x: 36, y: 122, w: 52, h: 230 },
  "right-arm": { x: 212, y: 122, w: 52, h: 230 },
  "left-leg": { x: 102, y: 344, w: 44, h: 250 },
  "right-leg": { x: 154, y: 344, w: 44, h: 250 },
  "extra-limb": { x: 20, y: 616, w: 260, h: 70 },
};

export interface Grid {
  /** Side of one square cell. */
  cell: number;
  /** Cell centres in reading order; every cell lies inside the box. */
  points: Point[];
}

/**
 * Places `count` markers in a grid inside `box`. Picks the number of columns
 * that gives the biggest square cell, then centres the grid in the box.
 */
export function gridPositions(count: number, box: Box): Grid {
  const n = Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
  if (n === 0) return { cell: 0, points: [] };
  let bestCols = 1;
  let bestCell = 0;
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const cell = Math.min(box.w / cols, box.h / rows);
    if (cell > bestCell) {
      bestCell = cell;
      bestCols = cols;
    }
  }
  const rows = Math.ceil(n / bestCols);
  const left = box.x + (box.w - bestCols * bestCell) / 2;
  const top = box.y + (box.h - rows * bestCell) / 2;
  const points: Point[] = [];
  for (let i = 0; i < n; i++) {
    points.push({
      x: left + ((i % bestCols) + 0.5) * bestCell,
      y: top + (Math.floor(i / bestCols) + 0.5) * bestCell,
    });
  }
  return { cell: bestCell, points };
}

export type MarkerStatus = "ghost" | "unproven" | "proven" | "zombie";

export interface MapMarker {
  /** Unique key; a requirement id, or `zombie:<index in report.findings>`. */
  key: string;
  /** The requirement id, or the zombie symbol. */
  id: string;
  status: MarkerStatus;
  region: MapRegion;
  /** Centre in drawing units. */
  x: number;
  y: number;
  /** Side of the grid cell in drawing units. */
  cell: number;
  /** Accessible name. */
  name: string;
  /** Confidence level of the finding, or null for a proven requirement. */
  level: ConfidenceLevel | null;
}

export function markerName(id: string, status: MarkerStatus): string {
  return `${id}, ${status}`;
}

/** Key of each finding: its requirement id, or `zombie:<index>` for a zombie. */
export function findingKeys(report: Report): Map<Finding, string> {
  const keys = new Map<Finding, string>();
  report.findings.forEach((finding, index) => {
    keys.set(finding, finding.requirementId ?? `zombie:${index}`);
  });
  return keys;
}

/**
 * One marker per requirement (grouped by region, in report order) and one per
 * zombie (in the extra limb strip). Positions do not depend on any filter.
 */
export function buildMarkers(report: Report): MapMarker[] {
  const markers: MapMarker[] = [];
  const byId = new Map<string, ReportRequirement>();
  for (const spec of report.specs) for (const req of spec.requirements) byId.set(req.id, req);
  const levelById = new Map<string, ConfidenceLevel>();
  for (const finding of report.findings) {
    if (finding.requirementId !== null) levelById.set(finding.requirementId, finding.confidence.level);
  }

  for (const group of groupByRegion(report)) {
    const grid = gridPositions(group.requirementIds.length, REGION_BOXES[group.region]);
    group.requirementIds.forEach((id, i) => {
      const req = byId.get(id);
      const point = grid.points[i];
      if (req === undefined || point === undefined) return;
      markers.push({
        key: id,
        id,
        status: req.status,
        region: group.region,
        x: point.x,
        y: point.y,
        cell: grid.cell,
        name: markerName(id, req.status),
        level: levelById.get(id) ?? null,
      });
    });
  }

  const zombies: { finding: Finding; index: number }[] = [];
  report.findings.forEach((finding, index) => {
    if (finding.type === "zombie") zombies.push({ finding, index });
  });
  const grid = gridPositions(zombies.length, REGION_BOXES["extra-limb"]);
  zombies.forEach(({ finding, index }, i) => {
    const point = grid.points[i];
    if (point === undefined) return;
    markers.push({
      key: `zombie:${index}`,
      id: finding.title,
      status: "zombie",
      region: "extra-limb",
      x: point.x,
      y: point.y,
      cell: grid.cell,
      name: markerName(finding.title, "zombie"),
      level: finding.confidence.level,
    });
  });
  return markers;
}

/** Whether a marker is drawn under the current filters. Proven ones are hidden by "Low confidence" only. */
export function markerVisible(marker: MapMarker, f: Filters): boolean {
  if (marker.status === "proven") return !f.lowOnly;
  if (!f[marker.status]) return false;
  if (f.lowOnly && marker.level !== "low") return false;
  return true;
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

export interface Detail {
  key: string;
  kind: "requirement" | "zombie";
  /** Requirement id, or zombie symbol. */
  heading: string;
  status: MarkerStatus;
  spec: string | null;
  /** Full requirement text, or the zombie symbol. */
  text: string;
  file: string;
  line: number;
  /** For example "high 0.90"; null for a proven requirement. */
  confidence: string | null;
  evidence: string[];
  codeLinks: string[];
  testLinks: string[];
  lastCommit: string | null;
}

function viaText(method: string, score: number, commit: string | undefined): string {
  const sha = commit === undefined ? "" : `, commit ${commit.slice(0, 7)}`;
  return `${method}${sha}, score ${score.toFixed(2)}`;
}

/** Everything the detail panel shows for a marker or card key, or null if the key is unknown. */
export function detailFor(report: Report, key: string): Detail | null {
  for (const spec of report.specs) {
    for (const req of spec.requirements) {
      if (req.id !== key) continue;
      const finding = report.findings.find((f) => f.requirementId === key);
      return {
        key,
        kind: "requirement",
        heading: req.id,
        status: req.status,
        spec: spec.name,
        text: req.text !== "" ? req.text : (finding?.title ?? req.id),
        file: req.file,
        line: req.line,
        confidence:
          finding === undefined
            ? null
            : `${finding.confidence.level} ${finding.confidence.score.toFixed(2)}`,
        evidence: finding === undefined ? [] : [...finding.evidence],
        codeLinks: req.codeLinks.map(
          (l) => `${l.file}:${l.startLine} ${l.symbol} (${viaText(l.method, l.score, l.commit)})`,
        ),
        testLinks: req.testLinks.map(
          (l) => `${l.file}:${l.line} ${l.title} (${viaText(l.method, l.score, l.commit)})`,
        ),
        lastCommit:
          req.lastCommit === null
            ? null
            : `${req.lastCommit.subject} (${req.lastCommit.author}, ${req.lastCommit.date})`,
      };
    }
  }
  const match = /^zombie:(\d+)$/.exec(key);
  if (match === null) return null;
  const finding = report.findings[Number(match[1])];
  if (finding === undefined || finding.type !== "zombie") return null;
  return {
    key,
    kind: "zombie",
    heading: finding.title,
    status: "zombie",
    spec: null,
    text: finding.title,
    file: finding.file,
    line: finding.line,
    confidence: `${finding.confidence.level} ${finding.confidence.score.toFixed(2)}`,
    evidence: [...finding.evidence],
    codeLinks: [],
    testLinks: [],
    lastCommit: null,
  };
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
