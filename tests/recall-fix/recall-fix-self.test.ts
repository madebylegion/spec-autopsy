import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { linkProject } from "../../src/linker/index.js";
import type { BodyMap } from "../../src/linker/index.js";
import { parseProject, printRequirement } from "../../src/parser/index.js";
import { buildReport } from "../../src/report/index.js";
import type { Report } from "../../src/report/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");

/** True when git says the history is complete. Any git failure counts as "cannot check". */
function historyIsComplete(): boolean {
  try {
    const out = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim() === "false";
  } catch {
    return false;
  }
}

const IDS = [
  "printer-ubiquitous-gap/R1.1",
  "printer-ubiquitous-gap/R2.1",
  "printer-ubiquitous-gap/R2.3",
  "printer-ubiquitous-gap/R3.1",
  "printer-ubiquitous-gap/R3.2",
  "printer-ubiquitous-gap/R3.4",
  "printer-ubiquitous-gap/R3.5",
];

describe.skipIf(!historyIsComplete())("recall-fix on this repository", () => {
  let map: BodyMap;
  let report: Report;

  beforeAll(async () => {
    map = await linkProject(repoRoot);
    const parsed = await parseProject(repoRoot);
    const texts = new Map(parsed.requirements.map((r) => [r.id, printRequirement(r)]));
    report = buildReport(map, texts, { version: "0.0.0" });
  }, 120_000);

  it("links without a failure", () => {
    expect(map.diagnostics.filter((d) => d.code === "link-failed")).toEqual([]);
  });

  it("leaves printer-ubiquitous-gap/R1.1 out with a defect-description diagnostic", () => {
    expect(map.requirements.find((r) => r.id === "printer-ubiquitous-gap/R1.1")).toBeUndefined();
    const diags = map.diagnostics.filter(
      (d) => d.code === "defect-description" && d.message.includes("printer-ubiquitous-gap/R1.1"),
    );
    expect(diags).toHaveLength(1);
  });

  for (const id of IDS) {
    it(`${id} is absent, not a ghost, or a low-confidence ghost with a reason`, () => {
      const entry = map.requirements.find((r) => r.id === id);
      if (entry === undefined || entry.status !== "ghost") return;
      const finding = report.findings.find((f) => f.type === "ghost" && f.requirementId === id);
      expect(finding, id).toBeDefined();
      expect(finding?.confidence.level, id).toBe("low");
      // A reason beyond the first sentence: a near miss or a contradiction.
      expect(finding?.evidence.length, id).toBeGreaterThanOrEqual(2);
    });
  }
});
