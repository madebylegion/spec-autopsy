import { describe, expect, it } from "vitest";
import type {
  BlameRange,
  CodeIndex,
  FileIndex,
  KiroCommit,
  Symbol as CodeSymbol,
  TestCase,
} from "../../src/indexer/index.js";
import { commitHits, ownerAt, resolveTaskCommits, unknownTaskRequirements } from "../../src/linker/commit-links.js";
import { link } from "../../src/linker/link.js";
import type { CodeLink } from "../../src/linker/types.js";
import type { Requirement, TaskEntry } from "../../src/parser/index.js";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const SHA_D = "d".repeat(40);

function neutral(id: string, line = 1): Requirement {
  return {
    id,
    pattern: "ubiquitous",
    system: "engine",
    response: "idle quietly",
    file: ".kiro/specs/spec/requirements.md",
    line,
  };
}

function words(id: string, system: string, response: string, line = 1): Requirement {
  return { id, pattern: "ubiquitous", system, response, file: ".kiro/specs/spec/requirements.md", line };
}

function task(
  spec: string,
  number: number,
  title: string,
  requirements: [string, number][],
  line = 1,
): TaskEntry {
  return {
    spec,
    number,
    title,
    file: `.kiro/specs/${spec}/tasks.md`,
    line,
    requirements: requirements.map(([id, l]) => ({ id, line: l })),
  };
}

function sym(
  name: string,
  startLine: number,
  endLine: number,
  kind: CodeSymbol["kind"] = "function",
  exported = true,
  path = "src/a.ts",
): CodeSymbol {
  return { name, kind, exported, startLine, endLine, file: path };
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

function testFile(path: string, testCases: TestCase[], partial: Partial<FileIndex> = {}): FileIndex {
  return file(path, { isTest: true, testCases, ...partial });
}

function index(files: FileIndex[], kiroCommits?: KiroCommit[]): CodeIndex {
  const idx: CodeIndex = { root: "/repo", files, diagnostics: [] };
  if (kiroCommits !== undefined) idx.kiroCommits = kiroCommits;
  return idx;
}

const A_COMMIT: KiroCommit = { sha: SHA_A, subject: "kiro: spec task 1 Do it" };
const TASK_1 = task("spec", 1, "Do it", [["spec/R1.1", 7]], 3);

/** alpha 2-4 and Box.open 10-12 owned by A; beta 6-8 owned by B (not a task commit). */
function codeFile(extra: Partial<FileIndex> = {}): FileIndex {
  const blame: BlameRange[] = [
    { startLine: 1, endLine: 5, sha: SHA_A },
    { startLine: 6, endLine: 9, sha: SHA_B },
    { startLine: 10, endLine: 12, sha: SHA_A },
  ];
  return file("src/a.ts", {
    symbols: [sym("alpha", 2, 4), sym("beta", 6, 8), sym("Box.open", 10, 12, "method", false)],
    blame,
    ...extra,
  });
}

function firstTestFile(extra: Partial<FileIndex> = {}): FileIndex {
  return testFile("tests/a.test.ts", [{ title: "first works", line: 3 }], {
    blame: [{ startLine: 1, endLine: 5, sha: SHA_A }],
    ...extra,
  });
}

describe("resolveTaskCommits", () => {
  it("resolves a subject with a spec by spec and number", () => {
    const map = resolveTaskCommits([A_COMMIT], [TASK_1, task("other", 1, "Do it", [])]);
    expect([...map.keys()]).toEqual([SHA_A]);
    expect(map.get(SHA_A)).toBe(TASK_1);
  });

  it("resolves a subject without a spec by the unique title, ignoring case", () => {
    const map = resolveTaskCommits(
      [{ sha: SHA_A, subject: "kiro: task 2 DO IT now" }],
      [task("spec", 2, "Do it now", []), task("spec", 2, "Something else", [])],
    );
    expect(map.get(SHA_A)?.title).toBe("Do it now");
  });

  it("ignores no match, two matches and non-task subjects", () => {
    const tasks = [task("one", 1, "Same", []), task("two", 1, "Same", [])];
    const commits: KiroCommit[] = [
      { sha: SHA_A, subject: "kiro: task 1 Same" }, // two matches
      { sha: SHA_B, subject: "kiro: spec task 9 Missing" }, // no task
      { sha: SHA_C, subject: "kiro: spec linker (requirements, design, tasks)" }, // not a task subject
      { sha: SHA_D, subject: "chore: not a kiro commit" },
    ];
    expect(resolveTaskCommits(commits, tasks).size).toBe(0);
  });

  it("gives an empty map without commits or tasks", () => {
    expect(resolveTaskCommits(undefined, [TASK_1]).size).toBe(0);
    expect(resolveTaskCommits([A_COMMIT], []).size).toBe(0);
  });
});

describe("ownerAt", () => {
  it("finds the range that contains the line", () => {
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 2, sha: SHA_A },
      { startLine: 4, endLine: 6, sha: SHA_B },
    ];
    expect(ownerAt(blame, 1)).toBe(SHA_A);
    expect(ownerAt(blame, 2)).toBe(SHA_A);
    expect(ownerAt(blame, 3)).toBeUndefined();
    expect(ownerAt(blame, 6)).toBe(SHA_B);
    expect(ownerAt(blame, 7)).toBeUndefined();
    expect(ownerAt(undefined, 1)).toBeUndefined();
    expect(ownerAt([], 1)).toBeUndefined();
  });
});

describe("commitHits", () => {
  it("lists symbols and test cases owned by a resolved task commit", () => {
    const resolved = new Map([[SHA_A, TASK_1]]);
    const hits = commitHits(index([codeFile(), firstTestFile()]), resolved);
    expect(hits.map((h) => [h.kind, h.kind === "symbol" ? h.symbol.name : h.testCase.title])).toEqual([
      ["symbol", "alpha"],
      ["symbol", "Box.open"],
      ["test", "first works"],
    ]);
  });

  it("gives nothing for no resolved commit or no blame", () => {
    expect(commitHits(index([codeFile()]), new Map())).toEqual([]);
    const noBlame = file("src/a.ts", { symbols: [sym("alpha", 2, 4)] });
    expect(commitHits(index([noBlame]), new Map([[SHA_A, TASK_1]]))).toEqual([]);
  });
});

describe("unknownTaskRequirements", () => {
  it("gives one diagnostic per unknown id with the tasks.md file and line", () => {
    const tasks = [task("spec", 1, "Do it", [["spec/R1.1", 5], ["spec/R9.9", 6]], 3)];
    const out = unknownTaskRequirements(tasks, new Set(["spec/R1.1"]));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      source: "linker",
      code: "unknown-task-requirement",
      file: ".kiro/specs/spec/tasks.md",
      line: 6,
    });
    expect(out[0]?.message).toContain("spec/R9.9");
  });
});

describe("link: commit links", () => {
  it("links symbols and test cases owned by the task commit to the task requirements", () => {
    const map = link(
      [neutral("spec/R1.1", 3)],
      index([codeFile(), firstTestFile()], [A_COMMIT]),
      [],
      [TASK_1],
    );
    const entry = map.requirements[0];
    expect(entry?.codeLinks).toEqual([
      { symbol: "alpha", file: "src/a.ts", startLine: 2, method: "commit", score: 1, commit: SHA_A },
      { symbol: "Box.open", file: "src/a.ts", startLine: 10, method: "commit", score: 1, commit: SHA_A },
    ]);
    expect(entry?.testLinks).toEqual([
      { title: "first works", file: "tests/a.test.ts", line: 3, method: "commit", score: 1, commit: SHA_A },
    ]);
    expect(entry?.status).toBe("proven");
  });

  it("links a symbol of a task with several requirements to every known one", () => {
    const tasks = [task("spec", 1, "Do it", [["spec/R1.1", 5], ["spec/R1.2", 5]], 3)];
    const map = link(
      [neutral("spec/R1.1", 3), neutral("spec/R1.2", 4)],
      index([codeFile()], [A_COMMIT]),
      [],
      tasks,
    );
    expect(map.requirements.map((r) => r.codeLinks.map((l) => l.symbol))).toEqual([
      ["alpha", "Box.open"],
      ["alpha", "Box.open"],
    ]);
  });

  it("gives a symbol owned by a later non-task commit no link, and leaves it a zombie", () => {
    const map = link([neutral("spec/R1.1")], index([codeFile()], [A_COMMIT]), [], [TASK_1]);
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).not.toContain("beta");
    expect(map.zombies.map((z) => z.symbol)).toEqual(["beta"]);
  });

  it("gives a symbol rewritten by a later task commit to that commit only", () => {
    const later = task("spec", 2, "Rewrite", [["spec/R1.2", 9]], 10);
    const blame: BlameRange[] = [
      { startLine: 1, endLine: 1, sha: SHA_A },
      { startLine: 2, endLine: 4, sha: SHA_B },
    ];
    const f = file("src/a.ts", { symbols: [sym("alpha", 2, 4)], blame });
    const map = link(
      [neutral("spec/R1.1", 3), neutral("spec/R1.2", 4)],
      index([f], [A_COMMIT, { sha: SHA_B, subject: "kiro: spec task 2 Rewrite" }]),
      [],
      [TASK_1, later],
    );
    expect(map.requirements[0]?.status).toBe("ghost");
    expect(map.requirements[1]?.codeLinks.map((l) => l.commit)).toEqual([SHA_B]);
  });

  it("skips overlap on a side with a commit link, and counts it as explicit", () => {
    const requirement = words("spec/R1.1", "stock ledger", "record adjustment");
    const f = file("src/a.ts", {
      symbols: [sym("wrongName", 2, 4), sym("recordAdjustment", 6, 8)],
      blame: [{ startLine: 1, endLine: 5, sha: SHA_A }],
    });
    const t = testFile(
      "tests/a.test.ts",
      [
        { title: "unrelated title", line: 3 },
        { title: "ledger records adjustment", line: 7 },
      ],
      { blame: [{ startLine: 1, endLine: 5, sha: SHA_A }] },
    );
    const map = link([requirement], index([f, t], [A_COMMIT]), [], [TASK_1]);
    expect(map.requirements[0]?.codeLinks.map((l) => [l.symbol, l.method])).toEqual([
      ["wrongName", "commit"],
    ]);
    expect(map.requirements[0]?.testLinks.map((l) => [l.title, l.method])).toEqual([
      ["unrelated title", "commit"],
    ]);
    expect(map.zombies.map((z) => z.symbol)).toEqual(["recordAdjustment"]);
  });

  it("still uses overlap on the side without a commit link", () => {
    const requirement = words("spec/R1.1", "stock ledger", "record adjustment");
    const f = file("src/a.ts", {
      symbols: [sym("wrongName", 2, 4)],
      blame: [{ startLine: 1, endLine: 5, sha: SHA_A }],
    });
    const t = testFile("tests/a.test.ts", [{ title: "ledger records adjustment", line: 7 }]);
    const map = link([requirement], index([f, t], [A_COMMIT]), [], [TASK_1]);
    expect(map.requirements[0]?.codeLinks.map((l) => l.method)).toEqual(["commit"]);
    expect(map.requirements[0]?.testLinks.map((l) => l.method)).toEqual(["overlap"]);
  });

  it("keeps one link with method commit when a tag names the same target", () => {
    const f = codeFile({ comments: [{ line: 1, text: "// spec/R1.1" }] });
    const t = firstTestFile({ comments: [{ line: 2, text: "// spec/R1.1" }] });
    const map = link([neutral("spec/R1.1")], index([f, t], [A_COMMIT]), [], [TASK_1]);
    const entry = map.requirements[0];
    const alphaLinks = entry?.codeLinks.filter((l) => l.symbol === "alpha") ?? [];
    expect(alphaLinks).toHaveLength(1);
    expect(alphaLinks[0]?.method).toBe("commit");
    expect(alphaLinks[0]?.commit).toBe(SHA_A);
    expect(entry?.testLinks).toHaveLength(1);
    expect(entry?.testLinks[0]?.method).toBe("commit");
  });

  it("adds tag links without a commit key next to commit links", () => {
    const f = codeFile({ comments: [{ line: 5, text: "// spec/R1.1" }] });
    const map = link([neutral("spec/R1.1")], index([f], [A_COMMIT]), [], [TASK_1]);
    const byName = new Map<string, CodeLink>();
    for (const l of map.requirements[0]?.codeLinks ?? []) byName.set(l.symbol, l);
    const beta = byName.get("beta");
    expect(beta).toEqual({
      symbol: "beta",
      file: "src/a.ts",
      startLine: 6,
      method: "tag",
      score: 1,
    });
    expect(beta !== undefined && "commit" in beta).toBe(false);
    expect(byName.get("alpha")?.method).toBe("commit");
  });

  it("gives overlap links no commit key", () => {
    const requirement = words("spec/R1.1", "stock ledger", "record adjustment");
    const f = file("src/a.ts", { symbols: [sym("recordAdjustment", 2, 4)] });
    const map = link([requirement], index([f]), [], []);
    const first = map.requirements[0]?.codeLinks[0];
    expect(first?.method).toBe("overlap");
    expect(first !== undefined && "commit" in first).toBe(false);
  });

  it("does not report a commit-linked symbol as a zombie", () => {
    const map = link([neutral("spec/R1.1")], index([codeFile()], [A_COMMIT]), [], [TASK_1]);
    expect(map.zombies.map((z) => z.symbol)).not.toContain("alpha");
  });

  it("leaves the symbols of a task with no requirements as zombies", () => {
    const bare = task("spec", 1, "Do it", []);
    const map = link([neutral("spec/R1.1")], index([codeFile()], [A_COMMIT]), [], [bare]);
    expect(map.requirements[0]?.status).toBe("ghost");
    expect(map.zombies.map((z) => z.symbol)).toEqual(["alpha", "beta"]);
  });

  it("links methods and non-exported symbols", () => {
    const f = file("src/a.ts", {
      symbols: [sym("hidden", 2, 4, "function", false), sym("Box.open", 6, 8, "method")],
      blame: [{ startLine: 1, endLine: 9, sha: SHA_A }],
    });
    const map = link([neutral("spec/R1.1")], index([f], [A_COMMIT]), [], [TASK_1]);
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["hidden", "Box.open"]);
  });

  it("drops an unknown task requirement with one diagnostic and links the known ones", () => {
    const tasks = [task("spec", 1, "Do it", [["spec/R1.1", 5], ["spec/R9.9", 6]], 3)];
    const map = link([neutral("spec/R1.1")], index([codeFile()], [A_COMMIT]), [], tasks);
    const diagnostics = map.diagnostics.filter((d) => d.code === "unknown-task-requirement");
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      source: "linker",
      file: ".kiro/specs/spec/tasks.md",
      line: 6,
    });
    expect(map.requirements).toHaveLength(1);
    expect(map.requirements[0]?.codeLinks.length).toBeGreaterThan(0);
  });

  it("emits the unknown task requirement diagnostic even when no commit resolves", () => {
    const tasks = [task("spec", 4, "Nobody committed", [["spec/R7.7", 12]], 10)];
    const map = link([neutral("spec/R1.1")], index([codeFile()]), [], tasks);
    expect(map.diagnostics.filter((d) => d.code === "unknown-task-requirement")).toHaveLength(1);
  });

  it("does not throw on partial data: blame for some files only, an unknown SHA, a task with no requirements", () => {
    const withBlame = codeFile();
    const withoutBlame = file("src/b.ts", { symbols: [sym("gamma", 1, 3, "function", true, "src/b.ts")] });
    const unknownSha = file("src/c.ts", {
      symbols: [sym("delta", 1, 3, "function", true, "src/c.ts")],
      blame: [{ startLine: 1, endLine: 3, sha: SHA_D }],
    });
    const run = (): unknown =>
      link(
        [neutral("spec/R1.1")],
        index(
          [withBlame, withoutBlame, unknownSha, firstTestFile()],
          [A_COMMIT, { sha: SHA_C, subject: "kiro: spec task 5 Gone" }],
        ),
        [],
        [TASK_1, task("spec", 3, "Empty", [])],
      );
    expect(run).not.toThrow();
  });

  it("sorts commit links by file, line and name", () => {
    const f1 = file("src/z.ts", {
      symbols: [sym("zed", 1, 2, "function", true, "src/z.ts")],
      blame: [{ startLine: 1, endLine: 2, sha: SHA_A }],
    });
    const f2 = file("src/a.ts", {
      symbols: [sym("late", 7, 8), sym("early", 1, 2)],
      blame: [{ startLine: 1, endLine: 8, sha: SHA_A }],
    });
    const map = link([neutral("spec/R1.1")], index([f1, f2], [A_COMMIT]), [], [TASK_1]);
    expect(map.requirements[0]?.codeLinks.map((l) => l.symbol)).toEqual(["early", "late", "zed"]);
  });

  it("equals the result without commit data when there is none", () => {
    const requirements = [neutral("spec/R1.1")];
    const plain = link(requirements, index([file("src/a.ts", { symbols: [sym("alpha", 2, 4)] })]));
    const withEmpty = link(
      requirements,
      index([file("src/a.ts", { symbols: [sym("alpha", 2, 4)] })], []),
      [],
      [],
    );
    expect(withEmpty).toEqual(plain);
    expect(JSON.stringify(withEmpty)).toBe(JSON.stringify(plain));
  });
});
