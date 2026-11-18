import { describe, expect, it } from "vitest";
import type { CodeIndex, FileIndex, Symbol as CodeSymbol, TestCase } from "../../src/indexer/index.js";
import { classifyRequirement } from "../../src/linker/classify.js";
import { link } from "../../src/linker/link.js";
import type { CodeLink, LinkMethod, TestLink } from "../../src/linker/types.js";
import type { Requirement } from "../../src/parser/index.js";

const code = (method: LinkMethod, symbol = "TreatBag"): CodeLink => ({
  symbol,
  file: "src/treat-bag.ts",
  startLine: 2,
  method,
  score: 1,
});
const tl = (method: LinkMethod): TestLink => ({
  title: "Treat Bag",
  file: "tests/treat-bag.test.ts",
  line: 3,
  method,
  score: 1,
});
function req(id: string, system: string, response: string): Requirement {
  return { id, pattern: "ubiquitous", system, response, file: ".kiro/specs/x/requirements.md", line: 1 };
}
function file(path: string, partial: Partial<FileIndex> = {}): FileIndex {
  return {
    path,
    language: "typescript",
    isTest: false,
    lineCount: 100,
    symbols: [],
    comments: [],
    testCases: [],
    history: { commits: [], commitCount: 0, authors: [] },
    ...partial,
  };
}
const sym = (name: string): CodeSymbol => ({
  name,
  kind: "function",
  exported: true,
  startLine: 2,
  endLine: 3,
  file: "src/a.ts",
});
function treatBagShape(testCase: TestCase): CodeIndex {
  return {
    root: "/repo",
    diagnostics: [],
    files: [
      file("src/a.ts", { symbols: [sym("handler")], comments: [{ line: 1, text: "// spec/R1.1" }] }),
      file("tests/a.test.ts", { isTest: true, testCases: [testCase] }),
    ],
  };
}
const requirement = req("spec/R1.1", "gateway", "notify customer declined payment");

describe("overlap-proof", () => {
  // overlap-proof/R1.1
  it("tag code and an overlap-only test link is unproven (was proven)", () => {
    const result = classifyRequirement([code("tag")], [tl("overlap")]);
    expect(result).toBe("unproven");
  });

  // overlap-proof/R1.2
  it("tag code with tag test link is proven", () => {
    const result = classifyRequirement([code("tag")], [tl("tag")]);
    expect(result).toBe("proven");
  });

  // overlap-proof/R1.2
  it("tag code with commit test link is proven", () => {
    const result = classifyRequirement([code("tag")], [tl("commit")]);
    expect(result).toBe("proven");
  });

  // overlap-proof/R1.3
  it("code with test-call link and overlap test link is proven", () => {
    const result = classifyRequirement(
      [code("tag"), code("test-call", "getNutAlerts")],
      [tl("overlap")],
    );
    expect(result).toBe("proven");
  });

  // overlap-proof/R1.4
  it("code with overlap test link whose test calls the symbol is proven", () => {
    const result = classifyRequirement([code("tag")], [tl("overlap")], true);
    expect(result).toBe("proven");
  });

  // overlap-proof/R1.5
  it("no code link with overlap test link is ghost", () => {
    const result = classifyRequirement([], [tl("overlap")]);
    expect(result).toBe("ghost");
  });

  // overlap-proof/R1.5
  it("no code link with tag test link is proven", () => {
    const result = classifyRequirement([], [tl("tag")]);
    expect(result).toBe("proven");
  });

  // overlap-proof/R1.5
  it("code link with no test link is unproven", () => {
    const result = classifyRequirement([code("tag")], []);
    expect(result).toBe("unproven");
  });

  // overlap-proof/R1.6
  it("tag code with overlap test link stays listed but marked unproven", () => {
    const body = link([requirement], treatBagShape({ title: "payment declined notify customer", line: 4 }));
    const entry = body.requirements[0];
    expect(entry.codeLinks.map((l) => l.method)).toEqual(["tag"]);
    expect(entry.testLinks.map((l) => l.method)).toEqual(["overlap"]);
    expect(entry.status).toBe("unproven");
  });

  // overlap-proof/R1.4
  it("tag code with overlap test link that calls the symbol is proven", () => {
    const body = link(
      [requirement],
      treatBagShape({ title: "payment declined notify customer", line: 4, calls: ["handler"] }),
    );
    const entry = body.requirements[0];
    expect(entry.status).toBe("proven");
  });

  // overlap-proof/R1.6
  it("tag code with overlap test link that calls something else is unproven", () => {
    const body = link(
      [requirement],
      treatBagShape({ title: "payment declined notify customer", line: 4, calls: ["somethingElse"] }),
    );
    const entry = body.requirements[0];
    expect(entry.status).toBe("unproven");
  });
});
