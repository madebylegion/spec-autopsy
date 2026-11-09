import { appendFile, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseArgs, runAutopsy } from "../../src/cli/autopsy.js";
import { validateReport } from "../../src/report/index.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const planted = join(here, "..", "fixtures", "planted");
const packageJson = join(here, "..", "..", "package.json");
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

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe("autopsy CLI", () => {
  let dir: string;
  let other: string | undefined;

  beforeEach(async () => {
    dir = await buildFixtureRepo(planted);
    other = undefined;
  }, 60_000);

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    if (other !== undefined) await rm(other, { recursive: true, force: true });
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

  it("writes .autopsy/report.json that validates and carries the package version", async () => {
    await runAutopsy(dir);
    const text = await readFile(join(dir, ".autopsy", "report.json"), "utf8");
    expect(text.endsWith("\n")).toBe(true);
    const parsed: unknown = JSON.parse(text);
    const result = validateReport(parsed);
    expect(result.ok).toBe(true);
    const pkg = JSON.parse(await readFile(packageJson, "utf8")) as { version: string };
    if (result.ok) {
      expect(result.report.tool.version).toBe(pkg.version);
      expect(result.report.findings.length).toBe(13);
    }
  }, 60_000);

  it("--json writes to the given path (creating folders) and not to the default", async () => {
    const target = join(dir, "out", "nested", "morgue.json");
    await runAutopsy(dir, { jsonPath: target });
    const parsed: unknown = JSON.parse(await readFile(target, "utf8"));
    expect(validateReport(parsed).ok).toBe(true);
    expect(await exists(join(dir, ".autopsy", "report.json"))).toBe(false);
    expect(await exists(join(dir, ".autopsy", "last.json"))).toBe(true);
  }, 60_000);

  it("keeps the printed text and last.json the same with and without --json", async () => {
    other = await buildFixtureRepo(planted);
    const plain = await runAutopsy(dir);
    const withJson = await runAutopsy(other, { jsonPath: join(other, "r.json") });
    expect(withJson).toBe(plain);
    const a = await readFile(join(dir, ".autopsy", "last.json"), "utf8");
    const b = await readFile(join(other, ".autopsy", "last.json"), "utf8");
    expect(b).toBe(a);
  }, 120_000);

  it("parses the root and --json from the arguments", () => {
    expect(parseArgs([])).toEqual({ root: "." });
    expect(parseArgs(["proj"])).toEqual({ root: "proj" });
    expect(parseArgs([".", "--json", "x/r.json"])).toEqual({ root: ".", jsonPath: "x/r.json" });
    expect(parseArgs(["--json", "r.json", "proj"])).toEqual({ root: "proj", jsonPath: "r.json" });
    expect(() => parseArgs(["--json"])).toThrow();
  });
});
