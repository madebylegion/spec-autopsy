import type { RequirementEntry, Zombie } from "../linker/index.js";

const MAX_LINKED = 5;

function sha7(sha: string): string {
  return sha.slice(0, 7);
}

function score2(score: number): string {
  return score.toFixed(2);
}

// ghost-test-evidence/R1.2
export function ghostEvidence(entry: RequirementEntry): string[] {
  const testCount = entry.testLinks.length;
  const firstLine =
    testCount === 0
      ? `no symbol or test links to ${entry.id} by tag, commit or word overlap`
      : testCount === 1
        ? `no symbol links to ${entry.id}; 1 test link only (tests do not prove code)`
        : `no symbol links to ${entry.id}; ${testCount} test links only (tests do not prove code)`;
  const out = [firstLine];
  const near = entry.nearMiss;
  if (near !== undefined && near.symbol !== null) {
    out.push(`closest name: ${near.file}#${near.symbol} shares words (score ${score2(near.score)})`);
  }
  const doubt = entry.contradiction;
  if (doubt !== undefined) {
    const slash = entry.id.indexOf("/");
    const spec = slash < 0 ? entry.id : entry.id.slice(0, slash);
    const ending = testCount === 0 ? `yet nothing links to ${entry.id}` : `yet no symbol links to ${entry.id}`;
    out.push(
      `task ${doubt.task} of ${spec} is checked [x] and its commit ${sha7(doubt.commit)} is resolved, ${ending}`,
    );
  }
  return out;
}

export function unprovenEvidence(entry: RequirementEntry): string[] {
  const out = ["no test case links to this requirement"];
  const shown = entry.codeLinks.slice(0, MAX_LINKED);
  for (const link of shown) {
    let how: string;
    if (link.method === "commit") {
      if (link.modified === true) {
        // Rule 6: the task commit changed lines inside the symbol.
        how = link.commit === undefined ? "modified by task commit" : `modified by task commit ${sha7(link.commit)}`;
      } else {
        how = link.commit === undefined ? "commit" : `commit ${sha7(link.commit)}`;
      }
    } else if (link.method === "tag") {
      how = "tag";
    } else if (link.method === "test-call") {
      how = "test-call";
    } else {
      how = `overlap ${score2(link.score)}`;
    }
    out.push(`linked code: ${link.file}#${link.symbol} (${how})`);
  }
  const more = entry.codeLinks.length - shown.length;
  if (more > 0) out.push(`and ${more} more`);
  return out;
}

export function zombieEvidence(zombie: Zombie): string[] {
  const exportedKind = zombie.kind === "function" || zombie.kind === "class" || zombie.kind === "const";
  const cause = exportedKind
    ? `exported ${zombie.kind} never referenced by a requirement`
    : `${zombie.kind} ${zombie.symbol} is never referenced by a requirement`;
  const out = [cause];
  const near = zombie.nearMiss;
  if (near !== undefined && near.requirementId !== null) {
    out.push(`closest requirement: ${near.requirementId} shares words (score ${score2(near.score)})`);
  }
  return out;
}

// constraint-reqs/R2.1
/** Words why a proven requirement is proven, including one with no code link. Total, never throws. */
export function provenEvidence(entry: RequirementEntry): string[] {
  const tagged = entry.testLinks.find((t) => t.method === "tag");
  const first = entry.testLinks[0];
  if (entry.codeLinks.length > 0) {
    return [first === undefined ? "proven" : `proven by test ${first.file}:${first.line}`];
  }
  if (tagged !== undefined) {
    return [`no code link; proven by tagged test ${tagged.file}:${tagged.line}`];
  }
  if (entry.testOnlyCommit !== undefined) {
    return [`no code link; proven by test-only task commit ${sha7(entry.testOnlyCommit)}`];
  }
  if (first !== undefined) return [`no code link; proven by test ${first.file}:${first.line}`];
  return ["no code link"];
}
