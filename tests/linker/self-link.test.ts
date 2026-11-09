import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { linkProject } from "../../src/linker/index.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("linkProject", () => {
  it("links this repository and every finding carries its evidence", async () => {
    const map = await linkProject(repoRoot);

    const ids = map.requirements.map((r) => r.id);
    expect(ids.some((id) => id.startsWith("linker/"))).toBe(true);
    expect(ids.some((id) => id.startsWith("indexer/"))).toBe(true);

    for (const r of map.requirements) {
      if (r.status === "ghost" || r.status === "unproven") {
        expect(r.id.length).toBeGreaterThan(0);
        expect(r.file.length).toBeGreaterThan(0);
        expect(r.line).toBeGreaterThanOrEqual(1);
      }
    }
    for (const z of map.zombies) {
      expect(z.symbol.length).toBeGreaterThan(0);
      expect(z.file.length).toBeGreaterThan(0);
      expect(z.line).toBeGreaterThanOrEqual(1);
    }
    for (const d of map.diagnostics) {
      expect(["parser", "indexer", "linker"]).toContain(d.source);
      expect(d.code.length).toBeGreaterThan(0);
      expect(d.message.length).toBeGreaterThan(0);
      expect(d.file.length).toBeGreaterThan(0);
    }
    expect(map.diagnostics.some((d) => d.code === "link-failed")).toBe(false);
    expect(map.counts.requirements).toBe(map.requirements.length);
    expect(map.counts.zombies).toBe(map.zombies.length);
  }, 120_000);

  it("gives an empty body map for a directory with no .kiro and no sources", async () => {
    const dir = await mkdtemp(join(tmpdir(), "specautopsy-empty-"));
    try {
      const map = await linkProject(dir);
      expect(map.root).toBe(dir);
      expect(map.requirements).toEqual([]);
      expect(map.zombies).toEqual([]);
      expect(map.counts).toEqual({ requirements: 0, ghost: 0, unproven: 0, proven: 0, zombies: 0 });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
