import { appendFile, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runAutopsy } from "../../src/cli/autopsy.js";

const here = dirname(fileURLToPath(import.meta.url));
const planted = join(here, "..", "fixtures", "planted");
const PLANTED_GHOSTS = ["stock/R1.4", "stock/R2.1", "orders/R2.2", "orders/R2.3"];

function newGhostIds(output: string): string[] {
  const lines = output.split("\n");
  const start = lines.findIndex((l) => l.startsWith("New ghosts"));
  if (start === -1) return [];
  const ids: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.startsWith("  ")) break;
    ids.push(line.trim().split(/\s+/)[0] ?? "");
  }
  return ids;
}

describe("autopsy CLI", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "autopsy-"));
    await cp(planted, dir, { recursive: true });
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lists the planted ghosts on the first run, with evidence", async () => {
    const out = await runAutopsy(dir);
    expect(newGhostIds(out).sort()).toEqual([...PLANTED_GHOSTS].sort());
    expect(out).toMatch(/orders\/R2\.2 {2}\.kiro\/specs\/orders\/requirements\.md:\d+ {2}.*SHALL/);
    const saved = JSON.parse(await readFile(join(dir, ".autopsy", "last.json"), "utf8")) as {
      counts: { ghost: number };
    };
    expect(saved.counts.ghost).toBe(PLANTED_GHOSTS.length);
  }, 60_000);

  it("says 'No new ghosts' on a second run with no change", async () => {
    await runAutopsy(dir);
    const out = await runAutopsy(dir);
    expect(out).toContain("No new ghosts");
    expect(newGhostIds(out)).toEqual([]);
  }, 60_000);

  it("lists exactly the one new ghost after a requirement with no code is added", async () => {
    await runAutopsy(dir);
    await runAutopsy(dir);
    await appendFile(
      join(dir, ".kiro", "specs", "orders", "requirements.md"),
      "4. WHEN a fossil is unearthed, the archaeology vault SHALL catalogue the specimen with a carbon dating stamp.\n",
    );
    const out = await runAutopsy(dir);
    expect(newGhostIds(out)).toEqual(["orders/R2.4"]);
    expect(out).toContain("carbon dating stamp");
  }, 60_000);
});
