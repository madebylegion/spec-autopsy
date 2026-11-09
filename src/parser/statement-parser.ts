import type { DiagnosticCode, EarsPattern, Requirement } from "./types.js";

/** A parsed statement: a requirement without the fields that come from the file. */
export type ParsedStatement = Omit<Requirement, "id" | "file" | "line">;

export type StatementResult =
  | { ok: true; statement: ParsedStatement }
  | { ok: false; code: Extract<DiagnosticCode, "missing-shall" | "missing-system" | "empty-response"> };

type ClauseKind = "state" | "feature" | "trigger" | "condition";

const KEYWORD_KIND: Record<string, ClauseKind> = {
  while: "state",
  where: "feature",
  when: "trigger",
  if: "condition",
};

const KIND_PATTERN: Record<ClauseKind, EarsPattern> = {
  state: "state-driven",
  feature: "optional",
  trigger: "event-driven",
  condition: "unwanted",
};

/** Collapse runs of whitespace to a single space and trim both ends. */
export function normaliseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Remove trailing commas and a trailing THEN (repeatedly), then trim. */
function stripTrailing(value: string): string {
  let current = value.trim();
  for (;;) {
    const next = current.replace(/\s*,$/, "").replace(/(?:^|\s)THEN$/i, "").trim();
    if (next === current) return current;
    current = next;
  }
}

/**
 * Parse one statement (the text of a numbered criterion) into its clauses,
 * system and response. Pure and total: never throws.
 */
export function parseStatement(rawText: string): StatementResult {
  const text = normaliseWhitespace(rawText);

  const shall = /\bshall\b/i.exec(text);
  if (shall === null) return { ok: false, code: "missing-shall" };

  const head = text.slice(0, shall.index).trim();
  const response = text.slice(shall.index + shall[0].length).trim();
  if (response === "") return { ok: false, code: "empty-response" };

  // System: the text after the last word "the" in the head.
  let lastThe: RegExpExecArray | null = null;
  const theRe = /\bthe\b/gi;
  for (let m = theRe.exec(head); m !== null; m = theRe.exec(head)) lastThe = m;
  if (lastThe === null) return { ok: false, code: "missing-system" };
  const system = head.slice(lastThe.index + lastThe[0].length).trim();
  if (system === "") return { ok: false, code: "missing-system" };

  const clausePart = stripTrailing(head.slice(0, lastThe.index));

  // Cut the clause part into clauses.
  const starts: { kind: ClauseKind; matchStart: number; valueStart: number }[] = [];
  const clauseRe = /(?:^|,\s*)(while|where|when|if)(?=\s|$)/gi;
  for (let m = clauseRe.exec(clausePart); m !== null; m = clauseRe.exec(clausePart)) {
    const keyword = (m[1] ?? "").toLowerCase();
    const kind = KEYWORD_KIND[keyword];
    if (kind === undefined) continue;
    starts.push({ kind, matchStart: m.index, valueStart: m.index + m[0].length });
  }

  const statement: ParsedStatement = { pattern: "ubiquitous", system, response };
  const seen = new Set<ClauseKind>();
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? (starts[i + 1]?.matchStart ?? clausePart.length) : clausePart.length;
    const value = stripTrailing(clausePart.slice(start.valueStart, end));
    if (seen.has(start.kind)) return;
    seen.add(start.kind);
    statement[start.kind] = value;
  });

  if (starts.length === 1 && starts[0] !== undefined) {
    statement.pattern = KIND_PATTERN[starts[0].kind];
  } else if (starts.length >= 2) {
    statement.pattern = "complex";
  }

  return { ok: true, statement };
}
