import type { BodyMap, RequirementEntry, Zombie } from "../linker/index.js";
import type { Confidence, ConfidenceLevel } from "./types.js";

/** The score depends on the level only. */
export const LEVEL_SCORE: Readonly<Record<ConfidenceLevel, number>> = {
  high: 0.9,
  medium: 0.6,
  low: 0.3,
};

function make(level: ConfidenceLevel): Confidence {
  return { score: LEVEL_SCORE[level], level };
}

/** Level by score: >= 0.8 high, >= 0.5 medium, else low. */
export function levelForScore(score: number): ConfidenceLevel {
  if (score >= 0.8) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

/** Spec folder name: the part of the requirement id before the first "/". */
export function specOf(id: string): string {
  const slash = id.indexOf("/");
  return slash < 0 ? id : id.slice(0, slash);
}

/**
 * Ghost: near miss gives low; a contradiction (a checked task with a resolved
 * commit lists it) gives low; a commit link in the same spec gives high; else medium.
 */
export function ghostConfidence(entry: RequirementEntry, map: BodyMap): Confidence {
  if (entry.nearMiss !== undefined) return make("low");
  if (entry.contradiction !== undefined) return make("low");
  const spec = specOf(entry.id);
  const commitInSpec = map.requirements.some(
    (r) => specOf(r.id) === spec && r.codeLinks.some((l) => l.method === "commit"),
  );
  return make(commitInSpec ? "high" : "medium");
}

/** Unproven: a commit or tag code link gives high; only overlap links give medium. */
export function unprovenConfidence(entry: RequirementEntry): Confidence {
  const strong = entry.codeLinks.some((l) => l.method === "commit" || l.method === "tag");
  return make(strong ? "high" : "medium");
}

/** Zombie: near miss gives low; a commit link on the same file gives high; else medium. */
export function zombieConfidence(zombie: Zombie, map: BodyMap): Confidence {
  if (zombie.nearMiss !== undefined) return make("low");
  const commitOnFile = map.requirements.some((r) =>
    r.codeLinks.some((l) => l.method === "commit" && l.file === zombie.file),
  );
  return make(commitOnFile ? "high" : "medium");
}
