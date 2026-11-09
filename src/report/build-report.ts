import type { BodyMap, RequirementEntry } from "../linker/index.js";
import {
  ghostConfidence,
  specOf,
  unprovenConfidence,
  zombieConfidence,
} from "./confidence.js";
import { ghostEvidence, unprovenEvidence, zombieEvidence } from "./evidence.js";
import type {
  Finding,
  Report,
  ReportOptions,
  ReportRequirement,
  ReportSpec,
  SpecCounts,
} from "./types.js";

/** Base name of a root path, by a plain split on "/" and "\" (no node:path). */
function baseName(root: string): string {
  const parts = root.split(/[\\/]/).filter((p) => p.length > 0);
  return parts.length === 0 ? "" : (parts[parts.length - 1] ?? "");
}

function atLeastOne(line: number): number {
  return Number.isFinite(line) && line >= 1 ? Math.trunc(line) : 1;
}

function titleOf(entry: RequirementEntry, texts: ReadonlyMap<string, string>): string {
  const text = texts.get(entry.id) ?? "";
  return text === "" ? entry.id : text;
}

function requirementFinding(
  entry: RequirementEntry,
  texts: ReadonlyMap<string, string>,
  map: BodyMap,
): Finding {
  const ghost = entry.status === "ghost";
  return {
    type: ghost ? "ghost" : "unproven",
    requirementId: entry.id,
    title: titleOf(entry, texts),
    file: entry.file,
    line: atLeastOne(entry.line),
    evidence: ghost ? ghostEvidence(entry) : unprovenEvidence(entry),
    confidence: ghost ? ghostConfidence(entry, map) : unprovenConfidence(entry),
  };
}

/**
 * Turns a body map and the requirement texts into a versioned Report.
 * Pure and deterministic: no timestamp, no absolute path, no random value.
 */
export function buildReport(
  map: BodyMap,
  texts: ReadonlyMap<string, string>,
  options: ReportOptions,
): Report {
  const specNames: string[] = [];
  const specRequirements = new Map<string, ReportRequirement[]>();
  const specCounts = new Map<string, SpecCounts>();

  for (const entry of map.requirements) {
    const name = specOf(entry.id);
    let list = specRequirements.get(name);
    let counts = specCounts.get(name);
    if (list === undefined || counts === undefined) {
      list = [];
      counts = { requirements: 0, ghost: 0, unproven: 0, proven: 0 };
      specNames.push(name);
      specRequirements.set(name, list);
      specCounts.set(name, counts);
    }
    list.push({
      id: entry.id,
      text: texts.get(entry.id) ?? "",
      status: entry.status,
      file: entry.file,
      line: entry.line,
      lastCommit: entry.lastCommit,
      codeLinks: entry.codeLinks.map((l) => ({ ...l })),
      testLinks: entry.testLinks.map((l) => ({ ...l })),
    });
    counts.requirements++;
    counts[entry.status]++;
  }

  const specs: ReportSpec[] = specNames.map((name) => ({
    name,
    requirements: specRequirements.get(name) ?? [],
  }));

  const findings: Finding[] = [
    ...map.requirements
      .filter((r) => r.status === "ghost")
      .map((r) => requirementFinding(r, texts, map)),
    ...map.requirements
      .filter((r) => r.status === "unproven")
      .map((r) => requirementFinding(r, texts, map)),
    ...map.zombies.map(
      (z): Finding => ({
        type: "zombie",
        requirementId: null,
        title: z.symbol,
        file: z.file,
        line: atLeastOne(z.line),
        evidence: zombieEvidence(z),
        confidence: zombieConfidence(z, map),
      }),
    ),
  ];

  let ghost = 0;
  let unproven = 0;
  let proven = 0;
  for (const entry of map.requirements) {
    if (entry.status === "ghost") ghost++;
    else if (entry.status === "unproven") unproven++;
    else proven++;
  }

  return {
    schemaVersion: 1,
    tool: { name: "spec-autopsy", version: options.version },
    project: { name: baseName(map.root) },
    summary: {
      requirements: map.requirements.length,
      ghost,
      unproven,
      proven,
      zombies: map.zombies.length,
      bySpec: Object.fromEntries(
        specNames.map((name) => [name, specCounts.get(name) as SpecCounts]),
      ),
    },
    specs,
    findings,
    diagnostics: map.diagnostics.map((d) => ({ ...d })),
  };
}
