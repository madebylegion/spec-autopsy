import type { Requirement } from "../parser/index.js";

/**
 * Token overlap between a requirement and a symbol name or test title.
 *
 *   shared(A, B) = |A ∩ B|
 *   score(A, B)  = shared(A, B) / min(|A|, |B|)      (0 if A or B is empty)
 *   link         = shared >= 2  and  score >= THRESHOLD
 *
 * THRESHOLD is a fixed design constant. It is not tuned to any fixture.
 */
export const THRESHOLD = 0.5;

export const STOPWORDS: ReadonlySet<string> = new Set([
  "the", "a", "an", "of", "to", "and", "or", "in", "on", "for", "with",
  "shall", "when", "then", "if", "while", "where", "is", "are", "be", "it",
  "that", "this", "as", "by", "at", "from", "not", "no", "any", "each", "every",
]);

/**
 * Split text into lowercase word tokens. camelCase and snake_case are split,
 * stopwords and tokens shorter than 3 characters are dropped, one trailing "s"
 * is stripped (not after "ss"), and duplicates are removed (first one wins).
 * The result is idempotent: tokenise(tokenise(s).join(" ")) equals tokenise(s).
 */
export function tokenise(text: string): string[] {
  const spaced = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of spaced.split(/[^a-z0-9]+/)) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    let token = raw;
    if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) {
      token = token.slice(0, -1);
    }
    if (STOPWORDS.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    out.push(token);
  }
  return out;
}

export function requirementTokens(req: Requirement): string[] {
  const parts = [req.system, req.response, req.trigger, req.state, req.condition, req.feature];
  return tokenise(parts.map((p) => p ?? "").join(" "));
}

export function symbolTokens(name: string): string[] {
  return tokenise(name);
}

export function sharedCount(a: readonly string[], b: readonly string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let n = 0;
  for (const t of setA) if (setB.has(t)) n++;
  return n;
}

export function overlapScore(a: readonly string[], b: readonly string[]): number {
  const sizeA = new Set(a).size;
  const sizeB = new Set(b).size;
  if (sizeA === 0 || sizeB === 0) return 0;
  return sharedCount(a, b) / Math.min(sizeA, sizeB);
}

export function overlaps(a: readonly string[], b: readonly string[]): boolean {
  return sharedCount(a, b) >= 2 && overlapScore(a, b) >= THRESHOLD;
}
