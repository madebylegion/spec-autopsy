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

describe("precision-fix planted scenarios", () => {
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

  it("proves dispatch/R1.1 through a tag on the Python constant LANE_CEILING", () => {
    const entry = map.requirements.find((r) => r.id === "dispatch/R1.1");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("proven");
    const codeLink = entry?.codeLinks.find((l) => l.symbol === "LANE_CEILING");
    expect(codeLink).toBeDefined();
    expect(codeLink?.method).toBe("tag");
    expect(codeLink?.file).toBe("src/dispatch.py");
    expect(codeLink?.startLine).toBe(5);
  });

  it("proves dispatch/R1.2 through a test-call link to rotate_manifest only", () => {
    const entry = map.requirements.find((r) => r.id === "dispatch/R1.2");
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("proven");
    expect(entry?.codeLinks).toHaveLength(1);
    const codeLink = entry?.codeLinks[0];
    expect(codeLink?.symbol).toBe("rotate_manifest");
    expect(codeLink?.method).toBe("test-call");
    expect(codeLink?.score).toBe(1);
    expect(codeLink?.file).toBe("src/dispatch.py");
    expect(codeLink?.startLine).toBe(8);
    expect(entry?.testLinks.map((t) => t.title)).toEqual(["test_hands_every_bundle_to_night_courier"]);
  });

  it("keeps the findings equal to expected.json", () => {
    const expected = truth.map((e) => `${e.class} ${e.key}`).sort();
    expect(foundIds(map)).toEqual(expected);
  });
});
