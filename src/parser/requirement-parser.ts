import { parseStatement } from "./statement-parser.js";
import type { Diagnostic, DiagnosticCode, ParseResult, Requirement } from "./types.js";

export interface ParseOptions {
  specName: string;
  file: string;
}

const HEADING_RE = /^#{1,6}\s+Requirement\s+(\d+)/i;
const CRITERION_RE = /^\s*(\d+)\.\s+(.*)$/;
const FENCE_RE = /^\s*(?:```|~~~)/;
const CLAUSE_START_RE = /^\s*(?:while|where|when|if)\s/i;

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

const MESSAGES: Record<"missing-shall" | "missing-system" | "empty-response", string> = {
  "missing-shall": "Criterion has no SHALL obligation keyword.",
  "missing-system": "Criterion has no system name before SHALL.",
  "empty-response": "Criterion has an empty response after SHALL.",
};

/**
 * Parse the text of one requirements.md into requirement objects and
 * diagnostics. Deterministic and total: never throws.
 */
export function parseRequirementsText(text: string, options: ParseOptions): ParseResult {
  const { specName, file } = options;
  const requirements: Requirement[] = [];
  const diagnostics: Diagnostic[] = [];

  const diag = (code: DiagnosticCode, message: string, line: number): void => {
    diagnostics.push({ code, message, file, line });
  };

  try {
    const lines = String(text).split(/\r\n|\r|\n/);
    const seenIds = new Set<string>();
    let inFence = false;
    let requirementNumber: string | undefined;

    lines.forEach((rawLine, index) => {
      const lineNo = index + 1;

      if (FENCE_RE.test(rawLine)) {
        inFence = !inFence;
        return;
      }
      if (inFence) return;

      const heading = HEADING_RE.exec(rawLine);
      if (heading !== null) {
        requirementNumber = heading[1];
        return;
      }

      const criterion = CRITERION_RE.exec(rawLine);
      if (criterion !== null) {
        if (requirementNumber === undefined) return;
        const criterionNumber = criterion[1] ?? "";
        const result = parseStatement(criterion[2] ?? "");
        if (!result.ok) {
          diag(result.code, MESSAGES[result.code], lineNo);
          return;
        }
        const id = `${specName}/R${requirementNumber}.${criterionNumber}`;
        if (seenIds.has(id)) {
          diag("duplicate-id", `Duplicate requirement id ${id}; the first occurrence is kept.`, lineNo);
          return;
        }
        seenIds.add(id);
        requirements.push({ id, ...result.statement, file, line: lineNo });
        return;
      }

      if (CLAUSE_START_RE.test(rawLine)) {
        diag("unnumbered-statement", "Line starts with an EARS clause keyword but is not a numbered criterion.", lineNo);
      }
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    diag("unreadable-file", `Unexpected error while parsing: ${reason}`, 1);
  }

  requirements.sort((a, b) => a.line - b.line);
  diagnostics.sort((a, b) => a.line - b.line || compareCodeUnits(a.code, b.code));
  return { requirements, diagnostics };
}
