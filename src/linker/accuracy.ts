import type { AccuracyReport, BodyMap, ClassScore, TruthEntry } from "./types.js";

type FindingClass = TruthEntry["class"];

function ratio(numerator: number, denominator: number): number {
  return denominator === 0 ? 1 : numerator / denominator;
}

function score(found: number, planted: number, truePositives: number): ClassScore {
  return {
    found,
    planted,
    truePositives,
    precision: ratio(truePositives, found),
    recall: ratio(truePositives, planted),
  };
}

/** The keys of the findings of one class: ghost/unproven by id, zombie by `file#symbol`. */
function foundKeys(bodyMap: BodyMap, cls: FindingClass): Set<string> {
  const keys = new Set<string>();
  if (cls === "zombie") {
    for (const z of bodyMap.zombies) keys.add(`${z.file}#${z.symbol}`);
  } else {
    for (const r of bodyMap.requirements) {
      if (r.status === cls) keys.add(r.id);
    }
  }
  return keys;
}

function scoreClass(bodyMap: BodyMap, truth: readonly TruthEntry[], cls: FindingClass): ClassScore {
  const found = foundKeys(bodyMap, cls);
  const planted = new Set<string>();
  for (const entry of truth) {
    if (entry.class === cls) planted.add(entry.key);
  }
  let truePositives = 0;
  for (const key of found) {
    if (planted.has(key)) truePositives++;
  }
  return score(found.size, planted.size, truePositives);
}

/** Precision and recall of a body map against a planted truth, per class and overall. */
export function scoreAgainstTruth(bodyMap: BodyMap, truth: readonly TruthEntry[]): AccuracyReport {
  const ghost = scoreClass(bodyMap, truth, "ghost");
  const zombie = scoreClass(bodyMap, truth, "zombie");
  const unproven = scoreClass(bodyMap, truth, "unproven");
  const overall = score(
    ghost.found + zombie.found + unproven.found,
    ghost.planted + zombie.planted + unproven.planted,
    ghost.truePositives + zombie.truePositives + unproven.truePositives,
  );
  return { ghost, zombie, unproven, overall };
}
