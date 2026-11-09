import type { BodyMap, CodeLink, RequirementEntry, Zombie } from "../../src/linker/index.js";

export const SAMPLE_ROOT = "/home/user/projects/my-app";

const COMMIT_SHA = "abcdef1234567890abcdef1234567890abcdef12";
const TEST_SHA = "fedcba9876543210fedcba9876543210fedcba98";

function link(
  symbol: string,
  file: string,
  startLine: number,
  method: CodeLink["method"],
  score: number,
  commit?: string,
): CodeLink {
  const base: CodeLink = { symbol, file, startLine, method, score };
  return commit === undefined ? base : { ...base, commit };
}

function entry(
  id: string,
  status: RequirementEntry["status"],
  line: number,
  extra: Partial<RequirementEntry> = {},
): RequirementEntry {
  const spec = id.slice(0, id.indexOf("/"));
  return {
    id,
    status,
    file: `.kiro/specs/${spec}/requirements.md`,
    line,
    codeLinks: [],
    testLinks: [],
    lastCommit: null,
    ...extra,
  };
}

const manyLinks: CodeLink[] = [1, 2, 3, 4, 5, 6, 7].map((n) =>
  link(`fn${n}`, "src/many.ts", n * 10, "overlap", 0.5 + n / 100),
);

/**
 * A hand-made body map with two specs (alpha, beta), every row of the
 * confidence table, and requirement order that interleaves the specs.
 */
export function sampleMap(): BodyMap {
  const requirements: RequirementEntry[] = [
    entry("alpha/R1.1", "ghost", 5),
    entry("beta/R1.1", "ghost", 5),
    entry("alpha/R1.2", "unproven", 9, {
      codeLinks: [link("parseA", "src/commit.ts", 4, "commit", 1, COMMIT_SHA)],
      lastCommit: { date: "2026-01-02T03:04:05Z", subject: "task 1", author: "Ada" },
    }),
    entry("alpha/R1.3", "ghost", 12, {
      nearMiss: { requirementId: null, symbol: "almostA", file: "src/near.ts", line: 12, score: 0.45 },
    }),
    entry("beta/R1.2", "unproven", 9, {
      codeLinks: [link("doB", "src/b.ts", 2, "overlap", 0.75)],
    }),
    entry("beta/R1.3", "unproven", 13, {
      codeLinks: [link("tagged", "src/t.ts", 3, "tag", 1)],
    }),
    entry("beta/R1.4", "proven", 17, {
      codeLinks: [link("renewB", "src/b.ts", 20, "overlap", 0.6)],
      testLinks: [
        { title: "renews", file: "tests/b.test.ts", line: 3, method: "commit", score: 1, commit: TEST_SHA },
      ],
    }),
    entry("beta/R1.5", "unproven", 21, { codeLinks: manyLinks }),
  ];
  const zombies: Zombie[] = [
    { symbol: "helper", kind: "function", file: "src/commit.ts", line: 20 },
    { symbol: "Widget", kind: "class", file: "src/other.ts", line: 1 },
    {
      symbol: "Shape",
      kind: "type",
      file: "src/shape.ts",
      line: 8,
      nearMiss: { requirementId: "alpha/R1.1", symbol: null, file: ".kiro/specs/alpha/requirements.md", line: 5, score: 0.42 },
    },
  ];
  return {
    root: SAMPLE_ROOT,
    requirements,
    zombies,
    diagnostics: [
      {
        source: "linker",
        code: "unknown-requirement-tag",
        message: "Tag nope/R9.9 names no known requirement.",
        file: "src/t.ts",
        line: 7,
      },
    ],
    counts: { requirements: 8, ghost: 3, unproven: 4, proven: 1, zombies: 3 },
  };
}

/** Texts for every requirement of the sample map except beta/R1.5 (title falls back to the id). */
export function sampleTexts(): Map<string, string> {
  return new Map([
    ["alpha/R1.1", "The parser SHALL read files."],
    ["beta/R1.1", "The linker SHALL join specs."],
    ["alpha/R1.2", "The parser SHALL assign ids."],
    ["alpha/R1.3", "The parser SHALL report errors."],
    ["beta/R1.2", "The linker SHALL tag code."],
    ["beta/R1.3", "The linker SHALL tag tests."],
    ["beta/R1.4", "The linker SHALL renew links."],
  ]);
}
