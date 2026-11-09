import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseTasksProject, parseTasksText } from "../../src/parser/index.js";

const OPTS = { specName: "demo", file: ".kiro/specs/demo/tasks.md" };

function ids(text: string): string[] {
  const entries = parseTasksText(text, OPTS);
  return (entries[0]?.requirements ?? []).map((r) => r.id);
}

describe("parseTasksText", () => {
  it("reads [ ], [x] and [-] task lines", () => {
    const text = ["# Plan", "", "- [ ] 1. First", "- [x] 2. Second", "- [-] 3. Third  ", ""].join("\n");
    const entries = parseTasksText(text, OPTS);
    expect(entries.map((e) => [e.number, e.title, e.line])).toEqual([
      [1, "First", 3],
      [2, "Second", 4],
      [3, "Third", 5],
    ]);
    expect(entries[0]).toMatchObject({ spec: "demo", file: OPTS.file, requirements: [] });
  });

  it("gives sub-lines and sub-tasks to the task", () => {
    const text = [
      "- [ ] 1. First",
      "  - do a thing",
      "  - [ ] 1.1 Sub task",
      "    - _Requirements: demo/R1.1_",
      "",
      "- [ ] 2. Second",
      "  - _Requirements: demo/R2.1_",
    ].join("\n");
    const entries = parseTasksText(text, OPTS);
    expect(entries).toHaveLength(2);
    expect(entries[0]?.requirements).toEqual([{ id: "demo/R1.1", line: 4 }]);
    expect(entries[1]?.requirements).toEqual([{ id: "demo/R2.1", line: 7 }]);
  });

  it("ends a task at a first-column heading", () => {
    const text = [
      "- [ ] 1. First",
      "  - _Requirements: demo/R1.1_",
      "## Notes",
      "  - _Requirements: demo/R9.9_",
    ].join("\n");
    expect(ids(text)).toEqual(["demo/R1.1"]);
  });

  it("reads a requirements line with and without the list marker", () => {
    expect(ids("- [ ] 1. T\n  - _Requirements: demo/R1.1_")).toEqual(["demo/R1.1"]);
    expect(ids("- [ ] 1. T\n  * _Requirements: demo/R1.1_")).toEqual(["demo/R1.1"]);
    expect(ids("- [ ] 1. T\n  _Requirements: demo/R1.1, demo/R1.2_")).toEqual([
      "demo/R1.1",
      "demo/R1.2",
    ]);
  });

  it("reads bare numbers as <spec>/R<number>", () => {
    expect(ids("- [ ] 1. T\n  - _Requirements: 1.1, 2.3 other/R4.4_")).toEqual([
      "demo/R1.1",
      "demo/R2.3",
      "other/R4.4",
    ]);
  });

  it("joins several requirements lines", () => {
    const text = "- [ ] 1. T\n  - _Requirements: demo/R1.1_\n  - _Requirements: demo/R2.2, demo/R3.3_";
    const refs = parseTasksText(text, OPTS)[0]?.requirements;
    expect(refs).toEqual([
      { id: "demo/R1.1", line: 2 },
      { id: "demo/R2.2", line: 3 },
      { id: "demo/R3.3", line: 3 },
    ]);
  });

  it("drops duplicate ids, the first wins", () => {
    const text = "- [ ] 1. T\n  - _Requirements: demo/R1.1, 1.1_\n  - _Requirements: demo/R1.1, demo/R1.2_";
    expect(parseTasksText(text, OPTS)[0]?.requirements).toEqual([
      { id: "demo/R1.1", line: 2 },
      { id: "demo/R1.2", line: 3 },
    ]);
  });

  it("gives [] when there is no task line", () => {
    expect(parseTasksText("", OPTS)).toEqual([]);
    expect(parseTasksText("# Title\n\nSome text\n", OPTS)).toEqual([]);
    expect(parseTasksText("  - [ ] 1. indented\n", OPTS)).toEqual([]);
  });

  it("handles CRLF line endings", () => {
    const entries = parseTasksText("- [ ] 1. T\r\n  - _Requirements: demo/R1.1_\r\n", OPTS);
    expect(entries[0]?.requirements).toEqual([{ id: "demo/R1.1", line: 2 }]);
  });
});

describe("parseTasksProject", () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "specautopsy-tasks-"));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("gives [] for a missing .kiro/specs", async () => {
    expect(await parseTasksProject(root)).toEqual([]);
  });

  it("lists two specs by spec name", async () => {
    for (const [name, body] of [
      ["zeta", "- [ ] 1. Z one\n  - _Requirements: 1.1_\n"],
      ["alpha", "- [x] 1. A one\n- [ ] 2. A two\n"],
    ] as const) {
      const dir = join(root, ".kiro", "specs", name);
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, "tasks.md"), body, "utf8");
    }
    // A spec folder without tasks.md is skipped.
    await mkdir(join(root, ".kiro", "specs", "empty"), { recursive: true });

    const entries = await parseTasksProject(root);
    expect(entries.map((e) => `${e.spec}#${e.number}`)).toEqual(["alpha#1", "alpha#2", "zeta#1"]);
    expect(entries[0]?.file).toBe(".kiro/specs/alpha/tasks.md");
    expect(entries[2]?.requirements).toEqual([{ id: "zeta/R1.1", line: 2 }]);
  });

  it("reads the tasks.md of this repository's linker spec", async () => {
    const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
    const entries = (await parseTasksProject(repoRoot)).filter((e) => e.spec === "linker");
    expect(entries.map((e) => e.number)).toEqual([1, 2, 3, 4]);
    expect(entries[0]?.requirements[0]?.id).toBe("linker/R1.3");
    for (const e of entries) {
      expect(e.file).toBe(".kiro/specs/linker/tasks.md");
      expect(e.requirements.length).toBeGreaterThan(0);
    }
  });
});

describe("parseTasksText properties", () => {
  it("never throws", () => {
    fc.assert(
      fc.property(fc.fullUnicodeString(), (s) => {
        parseTasksText(s, OPTS);
      }),
    );
  });

  it("reads back generated ids in the same order", () => {
    const idArb = fc
      .tuple(fc.constantFrom("a", "bb", "c-d"), fc.nat(50), fc.nat(50))
      .map(([s, n, m]) => `${s}/R${n}.${m}`);
    fc.assert(
      fc.property(fc.uniqueArray(idArb, { minLength: 1, maxLength: 8 }), (list) => {
        const text = `- [ ] 1. Task\n  - _Requirements: ${list.join(", ")}_\n`;
        expect(ids(text)).toEqual(list);
      }),
    );
  });
});
