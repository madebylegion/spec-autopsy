import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { readDesignTexts } from "../../src/parser/index.js";

const created: string[] = [];

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "design-reader-"));
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

describe("readDesignTexts", () => {
  it("reads design.md per spec and leaves out a spec without one", async () => {
    const root = tempRoot();
    write(root, ".kiro/specs/alpha/design.md", "# Alpha design\n`foo`\n");
    write(root, ".kiro/specs/alpha/requirements.md", "# req\n");
    write(root, ".kiro/specs/beta/requirements.md", "# req\n");
    const texts = await readDesignTexts(root);
    expect([...texts.keys()]).toEqual(["alpha"]);
    expect(texts.get("alpha")).toBe("# Alpha design\n`foo`\n");
    expect(texts.has("beta")).toBe(false);
  });

  it("gives an empty map when .kiro/specs is missing", async () => {
    const root = tempRoot();
    const texts = await readDesignTexts(root);
    expect(texts.size).toBe(0);
  });

  it("skips an unreadable entry and keeps the others", async () => {
    const root = tempRoot();
    mkdirSync(join(root, ".kiro/specs/broken/design.md"), { recursive: true }); // a directory, not a file
    write(root, ".kiro/specs/good/design.md", "ok");
    write(root, ".kiro/specs/loose-file.txt", "not a spec folder");
    const texts = await readDesignTexts(root);
    expect([...texts.keys()]).toEqual(["good"]);
  });
});
