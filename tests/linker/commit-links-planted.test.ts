import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkProject } from "../../src/linker/index.js";
import type { BodyMap, TruthEntry } from "../../src/linker/types.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const planted = join(here, "..", "fixtures", "planted");
const CHAIN_ONLY = ["stock/R3.1", "stock/R3.2", "orders/R3.1"];

function findings(map: BodyMap): string[] {
  const out: string[] = [];
  for (const r of map.requirements) {
    if (r.status === "ghost" || r.status === "unproven") out.push(`${r.status} ${r.id}`);
  }
  for (const z of map.zombies) out.push(`zombie ${z.file}#${z.symbol}`);
  return out.sort();
}

describe("commit links on the planted fixture", () => {
  let built: string;
  let plain: string;
  let withGit: BodyMap;
  let withoutGit: BodyMap;
  let truth: string[];

  beforeAll(async () => {
    built = await buildFixtureRepo(planted);
    plain = await mkdtemp(join(tmpdir(), "planted-plain-"));
    await cp(planted, plain, { recursive: true });
    withGit = await linkProject(built);
    withoutGit = await linkProject(plain);
    const raw = JSON.parse(await readFile(join(planted, "expected.json"), "utf8")) as TruthEntry[];
    truth = raw.map((e) => `${e.class} ${e.key}`).sort();
  }, 120_000);

  afterAll(async () => {
    await rm(built, { recursive: true, force: true });
    await rm(plain, { recursive: true, force: true });
  });

  it("proves the three chain-only requirements through commit links alone", () => {
    for (const id of CHAIN_ONLY) {
      const entry = withGit.requirements.find((r) => r.id === id);
      expect(entry, id).toBeDefined();
      expect(entry?.status, id).toBe("proven");
      expect(entry?.codeLinks.length, id).toBeGreaterThan(0);
      expect(entry?.testLinks.length, id).toBeGreaterThan(0);
      for (const l of entry?.codeLinks ?? []) {
        expect(l.method).toBe("commit");
        expect(l.commit).toMatch(/^[0-9a-f]{40}$/);
      }
      for (const l of entry?.testLinks ?? []) {
        expect(l.method).toBe("commit");
        expect(l.commit).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it("keeps the 4 ghosts, 4 unproven and 5 zombies of expected.json", () => {
    expect(withGit.diagnostics.filter((d) => d.code === "link-failed")).toEqual([]);
    expect(withGit.diagnostics.filter((d) => d.code === "unknown-task-requirement")).toEqual([]);
    expect(findings(withGit)).toEqual(truth);
    expect(withGit.counts.ghost).toBe(4);
    expect(withGit.counts.unproven).toBe(4);
    expect(withGit.counts.zombies).toBe(5);
  });

  it("handles the same tree without git: no commit links, the chain-only requirements are ghosts", () => {
    expect(withoutGit.diagnostics.filter((d) => d.code === "link-failed")).toEqual([]);
    for (const r of withoutGit.requirements) {
      for (const l of [...r.codeLinks, ...r.testLinks]) {
        expect(l.method).not.toBe("commit");
        expect("commit" in l).toBe(false);
      }
    }
    for (const id of CHAIN_ONLY) {
      expect(withoutGit.requirements.find((r) => r.id === id)?.status, id).toBe("ghost");
    }
  });
});
