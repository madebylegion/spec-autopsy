import { levelForScore } from "./confidence.js";
import type { Report, ValidateResult } from "./types.js";

const MAX_ERRORS = 5;
const TOP_KEYS = [
  "schemaVersion",
  "tool",
  "project",
  "summary",
  "specs",
  "findings",
  "diagnostics",
] as const;
const STATUSES: readonly string[] = ["ghost", "unproven", "proven"];
const TYPES: readonly string[] = ["ghost", "unproven", "zombie"];
const LEVELS: readonly string[] = ["high", "medium", "low"];
const METHODS: readonly string[] = ["commit", "tag", "overlap", "test-call"];
const SOURCES: readonly string[] = ["parser", "indexer", "linker"];

type Rec = Record<string, unknown>;

function isRec(value: unknown): value is Rec {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function has(obj: Rec, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isLine(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isCount(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/** Collects at most MAX_ERRORS messages, each prefixed with its path. */
class Errors {
  readonly list: string[] = [];

  add(path: string, message: string): void {
    if (this.list.length < MAX_ERRORS) this.list.push(`${path}: ${message}`);
  }

  get full(): boolean {
    return this.list.length >= MAX_ERRORS;
  }
}

function checkString(obj: Rec, key: string, path: string, errors: Errors): void {
  if (!has(obj, key)) errors.add(`${path}.${key}`, "missing");
  else if (!isString(obj[key])) errors.add(`${path}.${key}`, "must be a string");
}

function checkOneOf(
  obj: Rec,
  key: string,
  allowed: readonly string[],
  path: string,
  errors: Errors,
): void {
  if (!has(obj, key)) {
    errors.add(`${path}.${key}`, "missing");
    return;
  }
  const value = obj[key];
  if (!isString(value) || !allowed.includes(value)) {
    errors.add(`${path}.${key}`, `must be one of ${allowed.join(", ")}`);
  }
}

function checkInt(
  obj: Rec,
  key: string,
  path: string,
  errors: Errors,
  test: (v: unknown) => boolean,
  rule: string,
): void {
  if (!has(obj, key)) errors.add(`${path}.${key}`, "missing");
  else if (!test(obj[key])) errors.add(`${path}.${key}`, rule);
}

function checkCounts(obj: Rec, keys: readonly string[], path: string, errors: Errors): void {
  for (const key of keys) {
    checkInt(obj, key, path, errors, isCount, "must be an integer >= 0");
  }
}

function checkSummary(value: unknown, errors: Errors): void {
  const path = "summary";
  if (!isRec(value)) {
    errors.add(path, "must be an object");
    return;
  }
  checkCounts(value, ["requirements", "ghost", "unproven", "proven", "zombies"], path, errors);
  if (!has(value, "bySpec")) {
    errors.add(`${path}.bySpec`, "missing");
    return;
  }
  const bySpec = value["bySpec"];
  if (!isRec(bySpec)) {
    errors.add(`${path}.bySpec`, "must be an object");
    return;
  }
  for (const name of Object.keys(bySpec)) {
    const counts = bySpec[name];
    const where = `${path}.bySpec[${JSON.stringify(name)}]`;
    if (!isRec(counts)) errors.add(where, "must be an object");
    else checkCounts(counts, ["requirements", "ghost", "unproven", "proven"], where, errors);
  }
}

function checkLastCommit(value: unknown, path: string, errors: Errors): void {
  if (value === null) return;
  if (!isRec(value)) {
    errors.add(path, "must be an object or null");
    return;
  }
  for (const key of ["date", "subject", "author"]) checkString(value, key, path, errors);
}

function checkLinkCommon(value: unknown, path: string, errors: Errors): value is Rec {
  if (!isRec(value)) {
    errors.add(path, "must be an object");
    return false;
  }
  checkString(value, "file", path, errors);
  checkOneOf(value, "method", METHODS, path, errors);
  checkInt(value, "score", path, errors, isNumber, "must be a number");
  if (has(value, "commit") && !isString(value["commit"])) {
    errors.add(`${path}.commit`, "must be a string");
  }
  return true;
}

function checkCodeLink(value: unknown, path: string, errors: Errors): void {
  if (!checkLinkCommon(value, path, errors)) return;
  checkString(value, "symbol", path, errors);
  checkInt(value, "startLine", path, errors, isLine, "must be an integer >= 1");
  // Optional: set (true) on a commit link to a symbol the task commit modified.
  if (has(value, "modified") && value["modified"] !== true) {
    errors.add(`${path}.modified`, "must be true when present");
  }
}

function checkTestLink(value: unknown, path: string, errors: Errors): void {
  if (!checkLinkCommon(value, path, errors)) return;
  checkString(value, "title", path, errors);
  checkInt(value, "line", path, errors, isLine, "must be an integer >= 1");
}

function checkArrayOf(
  obj: Rec,
  key: string,
  path: string,
  errors: Errors,
  each: (item: unknown, itemPath: string) => void,
): void {
  if (!has(obj, key)) {
    errors.add(`${path}.${key}`, "missing");
    return;
  }
  const list = obj[key];
  if (!Array.isArray(list)) {
    errors.add(`${path}.${key}`, "must be an array");
    return;
  }
  for (let i = 0; i < list.length && !errors.full; i++) each(list[i], `${path}.${key}[${i}]`);
}

function checkSpecs(value: unknown, errors: Errors): void {
  if (!Array.isArray(value)) {
    errors.add("specs", "must be an array");
    return;
  }
  for (let i = 0; i < value.length && !errors.full; i++) {
    const spec: unknown = value[i];
    const path = `specs[${i}]`;
    if (!isRec(spec)) {
      errors.add(path, "must be an object");
      continue;
    }
    checkString(spec, "name", path, errors);
    checkArrayOf(spec, "requirements", path, errors, (req, reqPath) => {
      if (!isRec(req)) {
        errors.add(reqPath, "must be an object");
        return;
      }
      checkString(req, "id", reqPath, errors);
      checkString(req, "text", reqPath, errors);
      checkOneOf(req, "status", STATUSES, reqPath, errors);
      checkString(req, "file", reqPath, errors);
      checkInt(req, "line", reqPath, errors, isLine, "must be an integer >= 1");
      if (!has(req, "lastCommit")) errors.add(`${reqPath}.lastCommit`, "missing");
      else checkLastCommit(req["lastCommit"], `${reqPath}.lastCommit`, errors);
      checkArrayOf(req, "codeLinks", reqPath, errors, (l, p) => checkCodeLink(l, p, errors));
      checkArrayOf(req, "testLinks", reqPath, errors, (l, p) => checkTestLink(l, p, errors));
    });
  }
}

function checkConfidence(value: unknown, path: string, errors: Errors): void {
  if (!isRec(value)) {
    errors.add(path, "must be an object");
    return;
  }
  const score: unknown = value["score"];
  const level: unknown = value["level"];
  let scoreOk = false;
  if (!has(value, "score")) {
    errors.add(`${path}.score`, "missing");
  } else if (!isNumber(score) || score < 0 || score > 1) {
    errors.add(`${path}.score`, "must be a number from 0 to 1");
  } else {
    scoreOk = true;
  }
  checkOneOf(value, "level", LEVELS, path, errors);
  if (scoreOk && isNumber(score) && isString(level) && LEVELS.includes(level)) {
    const expected = levelForScore(score);
    if (expected !== level) errors.add(`${path}.level`, `must be ${expected} for score ${score}`);
  }
}

function checkFindings(value: unknown, errors: Errors): void {
  if (!Array.isArray(value)) {
    errors.add("findings", "must be an array");
    return;
  }
  for (let i = 0; i < value.length && !errors.full; i++) {
    const finding: unknown = value[i];
    const path = `findings[${i}]`;
    if (!isRec(finding)) {
      errors.add(path, "must be an object");
      continue;
    }
    checkOneOf(finding, "type", TYPES, path, errors);
    if (!has(finding, "requirementId")) {
      errors.add(`${path}.requirementId`, "missing");
    } else {
      const id: unknown = finding["requirementId"];
      if (id !== null && !isString(id)) {
        errors.add(`${path}.requirementId`, "must be a string or null");
      } else if (id === null && finding["type"] !== "zombie") {
        errors.add(`${path}.requirementId`, "must be a string unless the type is zombie");
      }
    }
    checkString(finding, "title", path, errors);
    checkString(finding, "file", path, errors);
    checkInt(finding, "line", path, errors, isLine, "must be an integer >= 1");
    if (!has(finding, "evidence")) {
      errors.add(`${path}.evidence`, "missing");
    } else {
      const evidence: unknown = finding["evidence"];
      if (!Array.isArray(evidence) || evidence.length === 0) {
        errors.add(`${path}.evidence`, "must be an array with at least one sentence");
      } else if (!evidence.every((e: unknown) => isString(e) && e.length > 0)) {
        errors.add(`${path}.evidence`, "must contain only non-empty strings");
      }
    }
    if (!has(finding, "confidence")) errors.add(`${path}.confidence`, "missing");
    else checkConfidence(finding["confidence"], `${path}.confidence`, errors);
  }
}

function checkDiagnostics(value: unknown, errors: Errors): void {
  if (!Array.isArray(value)) {
    errors.add("diagnostics", "must be an array");
    return;
  }
  for (let i = 0; i < value.length && !errors.full; i++) {
    const d: unknown = value[i];
    const path = `diagnostics[${i}]`;
    if (!isRec(d)) {
      errors.add(path, "must be an object");
      continue;
    }
    checkOneOf(d, "source", SOURCES, path, errors);
    checkString(d, "code", path, errors);
    checkString(d, "message", path, errors);
    checkString(d, "file", path, errors);
    checkInt(
      d,
      "line",
      path,
      errors,
      (v) => v === null || isLine(v),
      "must be an integer >= 1 or null",
    );
  }
}

function validate(value: unknown): ValidateResult {
  if (!isRec(value)) {
    return { ok: false, errors: ["report: must be a JSON object"] };
  }
  const errors = new Errors();

  if (!has(value, "schemaVersion")) {
    errors.add("schemaVersion", "missing");
  } else {
    const version: unknown = value["schemaVersion"];
    if (typeof version === "number" && version > 1) {
      errors.add(
        "schemaVersion",
        `report is newer than this viewer (schemaVersion ${version}, supported 1)`,
      );
    } else if (version !== 1) {
      errors.add("schemaVersion", "must be 1");
    }
  }
  for (const key of TOP_KEYS) {
    if (key !== "schemaVersion" && !has(value, key)) errors.add(key, "missing");
  }

  if (has(value, "tool")) {
    const tool: unknown = value["tool"];
    if (!isRec(tool)) {
      errors.add("tool", "must be an object");
    } else {
      checkString(tool, "name", "tool", errors);
      checkString(tool, "version", "tool", errors);
    }
  }
  if (has(value, "project")) {
    const project: unknown = value["project"];
    if (!isRec(project)) errors.add("project", "must be an object");
    else checkString(project, "name", "project", errors);
  }
  if (has(value, "summary")) checkSummary(value["summary"], errors);
  if (has(value, "specs")) checkSpecs(value["specs"], errors);
  if (has(value, "findings")) checkFindings(value["findings"], errors);
  if (has(value, "diagnostics")) checkDiagnostics(value["diagnostics"], errors);

  if (errors.list.length > 0) return { ok: false, errors: errors.list };
  return { ok: true, report: value as unknown as Report };
}

/**
 * Checks any JSON value before the UI draws it. Never throws: an unexpected
 * failure (for example a throwing getter) becomes one error.
 */
export function validateReport(value: unknown): ValidateResult {
  try {
    return validate(value);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unreadable value";
    return { ok: false, errors: [`report: could not be read (${reason})`] };
  }
}
