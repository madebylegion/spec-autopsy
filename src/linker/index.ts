import { indexRepo } from "../indexer/index.js";
import { parseProject, parseTasksProject } from "../parser/index.js";
import { link } from "./link.js";
import type { BodyMap } from "./types.js";

export { scoreAgainstTruth } from "./accuracy.js";
export { classifyRequirement, findZombies, isZombieCandidate, symbolKey } from "./classify.js";
export { commitHits, ownerAt, resolveTaskCommits, unknownTaskRequirements } from "./commit-links.js";
export type { CommitHit } from "./commit-links.js";
export { link } from "./link.js";
export {
  NEAR_MISS,
  overlapScore,
  overlaps,
  requirementTokens,
  sharedCount,
  symbolTokens,
  THRESHOLD,
  tokenise,
} from "./overlap.js";
export { findTags, tagsInFile } from "./tags.js";
export type {
  AccuracyReport,
  BodyMap,
  BodyMapCounts,
  BodyMapDiagnostic,
  ClassScore,
  CodeLink,
  LastCommit,
  LinkMethod,
  NearMiss,
  RequirementEntry,
  RequirementStatus,
  TagHit,
  TagTarget,
  TestLink,
  TruthEntry,
  Zombie,
  ZombieKind,
} from "./types.js";

/**
 * Parses the specs and tasks and indexes the code under `root`, then links
 * them. Never throws: an unexpected error gives an empty body map with one
 * `link-failed` diagnostic.
 */
export async function linkProject(root: string): Promise<BodyMap> {
  try {
    const parsed = await parseProject(root);
    const tasks = await parseTasksProject(root);
    const index = await indexRepo(root);
    return link(parsed.requirements, index, parsed.diagnostics, tasks);
  } catch (error) {
    return {
      root,
      requirements: [],
      zombies: [],
      diagnostics: [
        {
          source: "linker",
          code: "link-failed",
          message: error instanceof Error ? error.message : String(error),
          file: ".",
          line: 1,
        },
      ],
      counts: { requirements: 0, ghost: 0, unproven: 0, proven: 0, zombies: 0 },
    };
  }
}
