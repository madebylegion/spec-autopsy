import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { linkProject } from "../../src/linker/index.js";
import type { BodyMap, TruthEntry } from "../../src/linker/types.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const planted = join(here, "..", "fixtures", "planted");

/** Finding keys of a body map, as `class key`. */
function foundIds(map: BodyMap): string[] {
  const out: string[] = [];
  for (const r of map.requirements) {
    if (r.status === "ghost" || r.status === "unproven") out.push(`${r.status} ${r.id}`);
  }
  for (const z of map.zombies) out.push(`zombie ${z.file}#${z.symbol}`);
  return out.sort();
}

describe("constraint-reqs planted scenario", () => {
  let built = "";
  let map: BodyMap;
  let truth: TruthEntry[];

  beforeAll(async () => {
    built = await buildFixtureRepo(planted);
    map = await linkProject(built);
    truth = JSON.parse(await readFile(join(planted, "expected.json"), "utf8")) as TruthEntry[];
  }, 120_000);

  afterAll(async () => {
    if (built !== "") await rm(built, { recursive: true, force: true });
  });

  // constraint-reqs/R4.4
  it("proves kerb-style/R1.1 through a tagged test alone, with no code link, and keeps the 14 findings", () => {
    const entry = map.requirements.find((r) => r.id === "kerb-style/R1.1");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("proven");
    expect(entry?.codeLinks).toEqual([]);
    expect(entry?.testLinks).toHaveLength(1);
    const testLink = entry?.testLinks[0];
    expect(testLink?.method).toBe("tag");
    expect(testLink?.file).toBe("tests/test_kerb.py");
    // The `def` sits on line 2, under the tag comment on line 1.
    expect(testLink?.line).toBe(2);

    const expected = truth.map((e) => `${e.class} ${e.key}`).sort();
    expect(foundIds(map)).toEqual(expected);
    expect(foundIds(map)).toHaveLength(14);
  });
});
