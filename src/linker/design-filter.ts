import type { CommitHit } from "./commit-links.js";

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

function occursAsWord(text: string, candidate: string): boolean {
  if (candidate === "") return false;
  let from = 0;
  for (;;) {
    const at = text.indexOf(candidate, from);
    if (at === -1) return false;
    const before = at === 0 ? "" : text.charAt(at - 1);
    const after = text.charAt(at + candidate.length);
    if (!IDENTIFIER_CHAR.test(before) && !IDENTIFIER_CHAR.test(after)) return true;
    from = at + 1;
  }
}

/**
 * True when `name` occurs in `text` with no identifier character (letter,
 * digit, underscore, dollar sign) directly before or after it. Case-sensitive,
 * exact text, no substring match. For a dotted name such as `Class.method` the
 * whole name or the part after the last dot counts. A backticked name is a
 * whole-word match too. Pure.
 */
export function isNamedInDesign(text: string, name: string): boolean {
  if (text === "" || name === "") return false;
  if (occursAsWord(text, name)) return true;
  const dot = name.lastIndexOf(".");
  if (dot === -1) return false;
  return occursAsWord(text, name.slice(dot + 1));
}

/**
 * Rule 1: for each resolved task commit, keep only the symbol hits whose symbol
 * the design text of the task's spec names. A commit keeps all its symbol hits
 * when the spec has no design text or when none of them is named. Test hits are
 * never filtered. The result is a subsequence of `hits`. Pure.
 */
export function filterHitsByDesign(
  hits: readonly CommitHit[],
  designTexts: ReadonlyMap<string, string> | undefined,
): CommitHit[] {
  if (designTexts === undefined || designTexts.size === 0) return [...hits];
  const dropped = new Set<CommitHit>();
  const bySha = new Map<string, CommitHit[]>();
  for (const hit of hits) {
    if (hit.kind !== "symbol") continue;
    const list = bySha.get(hit.sha);
    if (list === undefined) bySha.set(hit.sha, [hit]);
    else list.push(hit);
  }
  for (const list of bySha.values()) {
    const first = list[0];
    if (first === undefined) continue;
    const text = designTexts.get(first.task.spec);
    if (text === undefined) continue;
    const named = list.filter((h) => h.kind === "symbol" && isNamedInDesign(text, h.symbol.name));
    if (named.length === 0) continue;
    for (const h of list) {
      if (!named.includes(h)) dropped.add(h);
    }
  }
  return hits.filter((h) => !dropped.has(h));
}
