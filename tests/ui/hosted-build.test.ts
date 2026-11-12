import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { validateReport } from "../../src/report/validate-report.js";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const committed = join(root, "src/ui/public/report.json");

function hasReport(dir: string): boolean {
  return existsSync(join(dir, "report.json"));
}

describe("hosted build", () => {
  it("commits a valid demo report with requirements", () => {
    const parsed: unknown = JSON.parse(readFileSync(committed, "utf8"));
    const result = validateReport(parsed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const total = result.report.specs.reduce(
        (n, spec) => n + spec.requirements.length,
        0,
      );
      expect(total).toBeGreaterThanOrEqual(1);
    }
  });

  it("does not git-ignore the demo report", async () => {
    let code: number | string | undefined;
    try {
      await run("git", ["check-ignore", "-q", "src/ui/public/report.json"], {
        cwd: root,
      });
      code = 0;
    } catch (error) {
      code = (error as { code?: number | string }).code;
    }
    expect(code).toBe(1);
  });

  it("hasReport is false on an empty directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "autopsy-empty-"));
    try {
      expect(hasReport(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("a fresh vite build ships report.json and index.html", async () => {
    const out = mkdtempSync(join(tmpdir(), "autopsy-build-"));
    try {
      await run(
        join(root, "node_modules/.bin/vite"),
        ["build", "--outDir", out, "--emptyOutDir"],
        { cwd: root },
      );
      expect(hasReport(out)).toBe(true);
      expect(existsSync(join(out, "index.html"))).toBe(true);
      expect(
        readFileSync(join(out, "report.json")).equals(readFileSync(committed)),
      ).toBe(true);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  }, 60_000);
});
