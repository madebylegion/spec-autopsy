import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, TestCase } from "../../src/indexer/types.js";
import { classifyRequirement } from "../../src/linker/classify.js";
import { link } from "../../src/linker/link.js";
import type {
  BodyMap,
  CodeLink,
  LinkMethod,
  RequirementEntry,
  RequirementStatus,
  TestLink,
} from "../../src/linker/types.js";
import type { Requirement } from "../../src/parser/index.js";
import { buildReport } from "../../src/report/build-report.js";
import { provenEvidence } from "../../src/report/evidence.js";
import { validateReport } from "../../src/report/validate-report.js";

const HISTORY = { commits: [], commitCount: 0, authors: [] };

function testFile(path: string, testCases: TestCase[], comments: FileIndex["comments"]): FileIndex {
  return {
    path,
    language: "typescript",
    isTest: true,
    lineCount: 40,
    symbols: [],
    comments,
    testCases,
    history: HISTORY,
  };
}

function req(id: string, system: string, response: string): Requirement {
  return {
    id,
    pattern: "ubiquitous",
    system,
    response,
    file: ".kiro/specs/s/requirements.md",
    line: 3,
  };
}

function indexOf(files: FileIndex[]): CodeIndex {
  return { root: "/repo", files, diagnostics: [] };
}

function entryOf(map: BodyMap, id: string): RequirementEntry {
  const found = map.requirements.find((r) => r.id === id);
  if (found === undefined) throw new Error(`no entry ${id}`);
  return found;
}

function code(method: LinkMethod): CodeLink {
  return { symbol: "f", file: "src/a.ts", startLine: 1, method, score: 1 };
}

function tl(method: LinkMethod, file = "tests/a.test.ts", line = 12): TestLink {
  return { title: "t", file, line, method, score: 1 };
}

function entry(over: Partial<RequirementEntry> = {}): RequirementEntry {
  return {
    id: "s/R1.1",
    status: "proven",
    file: ".kiro/specs/s/requirements.md",
    line: 3,
    codeLinks: [],
    testLinks: [],
    lastCommit: null,
    ...over,
  };
}

// Tokens: engine, rotate, ledger, page. The tagged title below shares none of them.
const A = req("s/R1.1", "engine", "rotate ledger pages");

// The tag comment sits on line 1, the test case on line 2: look-ahead attaches it.
function taggedIndex(): CodeIndex {
  return indexOf([
    testFile(
      "tests/a.test.ts",
      [{ title: "keeps the sheet flat", line: 2 }],
      [{ line: 1, text: "// s/R1.1" }],
    ),
  ]);
}

describe("classifyRequirement: constraint requirements", () => {
  // constraint-reqs/R1.1
  it("is proven with a tag test link and no code link", () => {
    expect(classifyRequirement([], [tl("tag")])).toBe("proven");
  });

  // constraint-reqs/R1.2
  it("is ghost with only an overlap test link and no code link", () => {
    expect(classifyRequirement([], [tl("overlap")])).toBe("ghost");
  });

  // constraint-reqs/R1.2
  it("is ghost with only a commit test link and no code link", () => {
    expect(classifyRequirement([], [tl("commit")])).toBe("ghost");
  });

  // constraint-reqs/R1.3
  it("is proven with a tag test link plus a code link", () => {
    expect(classifyRequirement([code("tag")], [tl("tag")])).toBe("proven");
  });

  // constraint-reqs/R1.3
  it("is unproven with a code link and no test link", () => {
    expect(classifyRequirement([code("overlap")], [])).toBe("unproven");
  });

  // constraint-reqs/R1.2
  it("is ghost with no link at all", () => {
    expect(classifyRequirement([], [])).toBe("ghost");
  });

  // constraint-reqs/R1.1
  it("is proven with a tag and an overlap test link and no code link", () => {
    expect(classifyRequirement([], [tl("overlap"), tl("tag")])).toBe("proven");
  });
});

// constraint-reqs/R2.1
describe("provenEvidence", () => {
  // constraint-reqs/R2.2
  it("words a tagged test with no code link", () => {
    const e = entry({ testLinks: [tl("tag", "tests/a.test.ts", 12)] });
    expect(provenEvidence(e)).toEqual(["no code link; proven by tagged test tests/a.test.ts:12"]);
  });

  // constraint-reqs/R2.2
  it("uses the first tag test link of several", () => {
    const e = entry({
      testLinks: [tl("overlap", "tests/o.test.ts", 1), tl("tag", "tests/b.test.ts", 5), tl("tag", "tests/c.test.ts", 9)],
    });
    expect(provenEvidence(e)[0]).toBe("no code link; proven by tagged test tests/b.test.ts:5");
  });

  // constraint-reqs/R2.3
  it("words a test-only task commit", () => {
    const e = entry({ testOnlyCommit: "abcdef0123456789", testLinks: [tl("commit")] });
    expect(provenEvidence(e)).toEqual(["no code link; proven by test-only task commit abcdef0"]);
  });

  // constraint-reqs/R2.3
  it("falls back to the first test link, then to a bare line", () => {
    expect(provenEvidence(entry({ testLinks: [tl("overlap", "tests/z.test.ts", 4)] }))).toEqual([
      "no code link; proven by test tests/z.test.ts:4",
    ]);
    expect(provenEvidence(entry())).toEqual(["no code link"]);
  });

  // constraint-reqs/R2.4
  it("words an entry with code links", () => {
    expect(provenEvidence(entry({ codeLinks: [code("tag")], testLinks: [tl("tag", "tests/a.test.ts", 12)] }))).toEqual([
      "proven by test tests/a.test.ts:12",
    ]);
    expect(provenEvidence(entry({ codeLinks: [code("tag")] }))).toEqual(["proven"]);
  });

  // constraint-reqs/R2.5
  it("does not throw on empty arrays and always returns a non-empty string", () => {
    const out = provenEvidence(entry({ codeLinks: [], testLinks: [] }));
    expect(out.length).toBeGreaterThan(0);
    for (const line of out) expect(line.length).toBeGreaterThan(0);
  });
});

describe("link: a tagged test and no code", () => {
  // constraint-reqs/R1.1, constraint-reqs/R1.6, constraint-reqs/R4.2
  it("gives a proven requirement with no code link and no zombie", () => {
    const map = link([A], taggedIndex());
    const e = entryOf(map, "s/R1.1");
    expect(e.status).toBe("proven");
    expect(e.codeLinks).toEqual([]);
    expect(e.testLinks).toHaveLength(1);
    expect(e.testLinks[0]?.method).toBe("tag");
    expect(e.nearMiss).toBeUndefined();
    expect(e.contradiction).toBeUndefined();
    expect(map.zombies).toEqual([]);
    expect(map.counts.proven).toBe(1);
    expect(map.counts.ghost).toBe(0);
  });

  // constraint-reqs/R1.2, constraint-reqs/R4.2
  it("stays a ghost when the test link is an overlap only", () => {
    const index = indexOf([
      testFile("tests/a.test.ts", [{ title: "rotates ledger pages nightly", line: 3 }], []),
    ]);
    const e = entryOf(link([A], index), "s/R1.1");
    expect(e.testLinks.map((t) => t.method)).toEqual(["overlap"]);
    expect(e.status).toBe("ghost");
  });

  // constraint-reqs/R1.2
  it("stays a ghost when the tag is too far from any test case", () => {
    const index = indexOf([
      testFile(
        "tests/a.test.ts",
        [{ title: "keeps the sheet flat", line: 10 }],
        [{ line: 1, text: "// s/R1.1" }],
      ),
    ]);
    const e = entryOf(link([A], index), "s/R1.1");
    expect(e.testLinks).toEqual([]);
    expect(e.status).toBe("ghost");
  });
});

describe("buildReport and validateReport", () => {
  // constraint-reqs/R2.6, constraint-reqs/R2.7, constraint-reqs/R4.1
  it("accepts a proven entry with empty codeLinks and makes no finding for it", () => {
    const map = link([A], taggedIndex());
    const report = buildReport(map, new Map([["s/R1.1", "The sheet SHALL be flat."]]), {
      version: "0.0.0",
    });
    const result = validateReport(JSON.parse(JSON.stringify(report)));
    expect(result.ok).toBe(true);
    const listed = report.specs.flatMap((s) => s.requirements).find((r) => r.id === "s/R1.1");
    expect(listed?.status).toBe("proven");
    expect(listed?.codeLinks).toEqual([]);
    expect(listed?.testLinks.map((t) => t.method)).toEqual(["tag"]);
    expect(report.findings).toEqual([]);
    expect(report.schemaVersion).toBe(1);
    expect(report.summary.proven).toBe(1);
  });
});

const codeMethod = fc.constantFrom<LinkMethod>("commit", "tag", "overlap", "test-call");
const testMethod = fc.constantFrom<LinkMethod>("commit", "tag", "overlap");
const codeLinksArb = fc.array(codeMethod.map(code), { maxLength: 4 });
const testLinksArb = fc.array(
  fc.tuple(testMethod, fc.integer({ min: 1, max: 99 })).map(([m, line]) => tl(m, "tests/p.test.ts", line)),
  { maxLength: 4 },
);

function oldRule(codeLinks: readonly CodeLink[], testLinks: readonly TestLink[]): RequirementStatus {
  if (codeLinks.length === 0) return "ghost";
  if (testLinks.length === 0) return "unproven";
  return "proven";
}

describe("classifyRequirement: properties", () => {
  // constraint-reqs/R1.1
  it("is never ghost when a tag test link exists", () => {
    fc.assert(
      fc.property(codeLinksArb, testLinksArb, (c, t) => {
        fc.pre(t.some((x) => x.method === "tag"));
        expect(classifyRequirement(c, t)).not.toBe("ghost");
      }),
    );
  });

  // constraint-reqs/R1.3
  it("equals the old rule whenever a code link exists", () => {
    fc.assert(
      fc.property(codeLinksArb, testLinksArb, (c, t) => {
        // overlap-proof narrows this: overlap-only test links no longer prove
        fc.pre(c.length > 0 && (t.length === 0 || t.some((x) => x.method !== "overlap")));
        expect(classifyRequirement(c, t)).toBe(oldRule(c, t));
      }),
    );
  });

  // constraint-reqs/R1.2
  it("is ghost with no code link and no tag test link", () => {
    fc.assert(
      fc.property(testLinksArb, (t) => {
        fc.pre(!t.some((x) => x.method === "tag"));
        expect(classifyRequirement([], t)).toBe("ghost");
      }),
    );
  });

  // constraint-reqs/R3.1
  it("returns the same value on two calls", () => {
    fc.assert(
      fc.property(codeLinksArb, testLinksArb, (c, t) => {
        expect(classifyRequirement(c, t)).toBe(classifyRequirement(c, t));
      }),
    );
  });
});
