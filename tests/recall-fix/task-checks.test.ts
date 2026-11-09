import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readCheckedTasks } from "../../src/parser/index.js";

const created: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "task-checks-"));
  created.push(dir);
  return dir;
}

function write(root: string, rel: string, text: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text);
}

afterAll(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("readCheckedTasks", () => {
  it("lists only [x] tasks as <spec>#<N>, not [ ] or [-]", async () => {
    const root = tempRoot();
    write(
      root,
      ".kiro/specs/alpha/tasks.md",
      [
        "# Plan",
        "- [x] 1. Done task",
        "  - _Requirements: alpha/R1.1_",
        "- [ ] 2. Open task",
        "- [-] 3. Running task",
        "- [x] 4. Another done task",
        "",
      ].join("\n"),
    );
    write(root, ".kiro/specs/beta/tasks.md", "- [x] 1. Beta done\n");
    const checked = await readCheckedTasks(root);
    expect([...checked].sort()).toEqual(["alpha#1", "alpha#4", "beta#1"]);
  });

  it("handles CRLF line endings", async () => {
    const root = tempRoot();
    write(root, ".kiro/specs/alpha/tasks.md", "- [x] 1. One\r\n- [ ] 2. Two\r\n");
    const checked = await readCheckedTasks(root);
    expect([...checked]).toEqual(["alpha#1"]);
  });

  it("ignores a spec without tasks.md", async () => {
    const root = tempRoot();
    write(root, ".kiro/specs/alpha/requirements.md", "# req\n");
    const checked = await readCheckedTasks(root);
    expect(checked.size).toBe(0);
  });

  it("gives an empty set when the specs folder is missing", async () => {
    const root = tempRoot();
    const checked = await readCheckedTasks(root);
    expect(checked.size).toBe(0);
  });
});
