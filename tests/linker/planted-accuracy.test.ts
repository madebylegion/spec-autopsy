import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { linkProject } from "../../src/linker/index.js";
import { scoreAgainstTruth } from "../../src/linker/accuracy.js";
import type { AccuracyReport, BodyMap, TruthEntry } from "../../src/linker/types.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const CLASSES = ["ghost", "zombie", "unproven", "overall"] as const;

const tempDirs: string[] = [];

afterAll(async () => {
  for (const dir of tempDirs) await rm(dir, { recursive: true, force: true });
});

/** Links the built temporary repository when the fixture has a commits.json, the directory itself otherwise. */
async function linkFixture(dir: string): Promise<BodyMap> {
  if (!existsSync(join(dir, "commits.json"))) return linkProject(dir);
  const built = await buildFixtureRepo(dir);
  tempDirs.push(built);
  return linkProject(built);
}

async function loadTruth(root: string): Promise<TruthEntry[]> {
  const raw: unknown = JSON.parse(await readFile(join(root, "expected.json"), "utf8"));
  if (!Array.isArray(raw)) throw new Error(`${root}/expected.json is not a list`);
  return raw as TruthEntry[];
}

function printReport(fixture: string, report: AccuracyReport): void {
  for (const cls of CLASSES) {
    const s = report[cls];
    console.log(`linker accuracy [${fixture}] ${cls}: precision=${s.precision} recall=${s.recall}`);
  }
}

function expectSane(report: AccuracyReport): void {
  for (const cls of CLASSES) {
    const s = report[cls];
    for (const value of [s.precision, s.recall]) {
      expect(typeof value).toBe("number");
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  }
}

/** Finding keys of a body map, as `class` plus key, in the same form as the truth. */
function foundEntries(map: BodyMap): TruthEntry[] {
  const out: TruthEntry[] = [];
  for (const r of map.requirements) {
    if (r.status === "ghost" || r.status === "unproven") out.push({ class: r.status, key: r.id });
  }
  for (const z of map.zombies) out.push({ class: "zombie", key: `${z.file}#${z.symbol}` });
  return out;
}

describe("linker accuracy on the planted fixture", () => {
  it("reports sane numbers and overall precision and recall of at least 0.8", async () => {
    const root = join(here, "..", "fixtures", "planted");
    const map = await linkFixture(root);
    const report = scoreAgainstTruth(map, await loadTruth(root));
    printReport("planted", report);
    expectSane(report);
    expect(report.overall.precision).toBeGreaterThanOrEqual(0.8);
    expect(report.overall.recall).toBeGreaterThanOrEqual(0.8);
  }, 120_000);
});

describe("linker accuracy on the held-out fixture", () => {
  it("reports sane numbers (no floor is asserted)", async () => {
    const root = join(here, "..", "fixtures", "heldout");
    const map = await linkFixture(root);
    const truth = await loadTruth(root);
    const report = scoreAgainstTruth(map, truth);
    printReport("heldout", report);

    const id = (e: TruthEntry): string => `${e.class} ${e.key}`;
    const truthIds = new Set(truth.map(id));
    const foundIds = new Set(foundEntries(map).map(id));
    const falsePositives = [...foundIds].filter((k) => !truthIds.has(k)).sort();
    const misses = [...truthIds].filter((k) => !foundIds.has(k)).sort();
    console.log(`linker accuracy [heldout] false positives: ${falsePositives.length}`);
    for (const k of falsePositives) console.log(`linker accuracy [heldout] false positive: ${k}`);
    console.log(`linker accuracy [heldout] misses: ${misses.length}`);
    for (const k of misses) console.log(`linker accuracy [heldout] miss: ${k}`);

    expectSane(report);
  }, 120_000);
});
