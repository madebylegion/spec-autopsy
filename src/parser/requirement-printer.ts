import type { Requirement } from "./types.js";

/**
 * Render a requirement as its canonical one-line EARS statement (no number
 * prefix). Clauses come in the fixed order WHILE, WHERE, WHEN, IF. Fields must
 * not contain line breaks.
 */
export function printRequirement(req: Requirement): string {
  const clauses: string[] = [];
  if (req.state !== undefined) clauses.push(`WHILE ${req.state}`);
  if (req.feature !== undefined) clauses.push(`WHERE ${req.feature}`);
  if (req.trigger !== undefined) clauses.push(`WHEN ${req.trigger}`);
  if (req.condition !== undefined) clauses.push(`IF ${req.condition}`);

  if (clauses.length === 0) {
    return `The ${req.system} SHALL ${req.response}`;
  }
  return `${clauses.join(", ")}, THEN the ${req.system} SHALL ${req.response}`;
}
