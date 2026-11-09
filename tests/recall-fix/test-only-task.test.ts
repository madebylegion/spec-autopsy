import { describe, expect, it } from "vitest";
import { link } from "../../src/linker/link.js";
import {
  COMMIT_A,
  SHA_A,
  SHA_B,
  TASK_1,
  file,
  index,
  neutral,
  owned,
  sym,
  testFile,
} from "./link-helpers.js";

function testsOwnedBy(sha: string) {
  return testFile("tests/a.test.ts", [{ title: "first works", line: 3 }], { blame: [owned(sha, 1, 5)] });
}

describe("test-only tasks", () => {
  it("proves a listed requirement that has a commit test link and no code link", () => {
    const map = link([neutral("spec/R1.1", 7)], index([testsOwnedBy(SHA_A)], [COMMIT_A], [SHA_A]), [], [TASK_1]);
    const entry = map.requirements[0];
    expect(entry?.status).toBe("proven");
    expect(entry?.testOnlyCommit).toBe(SHA_A);
    expect(entry?.codeLinks).toEqual([]);
    expect(entry?.testLinks.map((l) => l.method)).toEqual(["commit"]);
    expect(map.counts).toMatchObject({ requirements: 1, ghost: 0, unproven: 0, proven: 1 });
    const diags = map.diagnostics.filter((d) => d.code === "test-only-task");
    expect(diags).toEqual([
      {
        source: "linker",
        code: "test-only-task",
        message: "spec/R1.1: implemented by test-only task commit aaaaaaa",
        file: ".kiro/specs/spec/requirements.md",
        line: 7,
      },
    ]);
  });

  it("leaves a requirement with no test link a ghost", () => {
    const map = link([neutral("spec/R1.1", 7)], index([testsOwnedBy(SHA_B)], [COMMIT_A], [SHA_A]), [], [TASK_1]);
    const entry = map.requirements[0];
    expect(entry?.status).toBe("ghost");
    expect(entry?.testOnlyCommit).toBeUndefined();
    expect(map.diagnostics.filter((d) => d.code === "test-only-task")).toEqual([]);
  });

  it("does not treat a mixed commit as test-only", () => {
    const code = file("src/a.ts", { symbols: [sym("alpha", 2, 4)], blame: [owned(SHA_A, 1, 5)] });
    const map = link(
      [neutral("spec/R1.1", 7)],
      index([code, testsOwnedBy(SHA_A)], [COMMIT_A]),
      [],
      [TASK_1],
    );
    const entry = map.requirements[0];
    expect(entry?.status).toBe("proven");
    expect("testOnlyCommit" in (entry ?? {})).toBe(false);
    expect(map.diagnostics.filter((d) => d.code === "test-only-task")).toEqual([]);
  });

  it("leaves the classifier alone when the requirement has a code link", () => {
    const tagged = file("src/t.ts", {
      symbols: [sym("tagged", 2, 4, "function", true, "src/t.ts")],
      comments: [{ line: 1, text: "// spec/R1.1" }],
    });
    const map = link(
      [neutral("spec/R1.1", 7)],
      index([tagged, testsOwnedBy(SHA_A)], [COMMIT_A], [SHA_A]),
      [],
      [TASK_1],
    );
    const entry = map.requirements[0];
    expect(entry?.status).toBe("proven");
    expect("testOnlyCommit" in (entry ?? {})).toBe(false);
    expect(map.diagnostics.filter((d) => d.code === "test-only-task")).toEqual([]);
  });

  it("changes nothing when testOnlyCommits is unset or empty", () => {
    const unset = link([neutral("spec/R1.1", 7)], index([testsOwnedBy(SHA_A)], [COMMIT_A]), [], [TASK_1]);
    const empty = link([neutral("spec/R1.1", 7)], index([testsOwnedBy(SHA_A)], [COMMIT_A], []), [], [TASK_1]);
    expect(unset.requirements[0]?.status).toBe("ghost");
    expect(empty).toEqual(unset);
    expect(unset.diagnostics.filter((d) => d.code === "test-only-task")).toEqual([]);
  });
});
