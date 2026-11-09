import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { readProjectName, runAutopsy } from "../../src/cli/autopsy.js";
import { buildFixtureRepo } from "../helpers/build-fixture-repo.js";

const here = dirname(fileURLToPath(import.meta.url));
const planted = join(here, "..", "fixtures", "planted");

describe("project name from package.json", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
  });

  async function emptyDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), "project-name-"));
    dirs.push(dir);
    return dir;
  }

  it("reads the name", async () => {
    const dir = await emptyDir();
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "spec-autopsy" }), "utf8");
    expect(await readProjectName(dir)).toBe("spec-autopsy");
  });

  it("gives undefined when package.json is missing, invalid or has no usable name", async () => {
    const dir = await emptyDir();
    expect(await readProjectName(dir)).toBeUndefined();
    await writeFile(join(dir, "package.json"), "{ not json", "utf8");
    expect(await readProjectName(dir)).toBeUndefined();
    await writeFile(join(dir, "package.json"), JSON.stringify({ version: "1.0.0" }), "utf8");
    expect(await readProjectName(dir)).toBeUndefined();
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "  " }), "utf8");
    expect(await readProjectName(dir)).toBeUndefined();
    await writeFile(join(dir, "package.json"), JSON.stringify({ name: 42 }), "utf8");
    expect(await readProjectName(dir)).toBeUndefined();
    await writeFile(join(dir, "package.json"), "null", "utf8");
    expect(await readProjectName(dir)).toBeUndefined();
  });

  it("puts the package.json name in the report, else the folder name", async () => {
    const dir = await buildFixtureRepo(planted);
    dirs.push(dir);
    const reportPath = join(dir, ".autopsy", "report.json");

    await runAutopsy(dir);
    const without = JSON.parse(await readFile(reportPath, "utf8")) as {
      schemaVersion: number;
      project: { name: string };
    };
    expect(without.project.name).toBe(basename(dir));

    await writeFile(join(dir, "package.json"), JSON.stringify({ name: "demo-pkg" }), "utf8");
    await runAutopsy(dir);
    const withName = JSON.parse(await readFile(reportPath, "utf8")) as {
      schemaVersion: number;
      project: { name: string };
    };
    expect(withName.project.name).toBe("demo-pkg");
    expect(withName.schemaVersion).toBe(1);
  }, 60_000);
});
