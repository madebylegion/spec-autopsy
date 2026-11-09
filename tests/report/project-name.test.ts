import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/report/index.js";
import { sampleMap, sampleTexts } from "../helpers/report-sample.js";

describe("buildReport project name", () => {
  it("uses the given project name instead of the folder name", () => {
    const report = buildReport(sampleMap(), sampleTexts(), {
      version: "1.2.3",
      projectName: "spec-autopsy",
    });
    expect(report.project).toEqual({ name: "spec-autopsy" });
    expect(report.schemaVersion).toBe(1);
  });

  it("falls back to the base name of the root when no name is given", () => {
    const report = buildReport(sampleMap(), sampleTexts(), { version: "1.2.3" });
    expect(report.project.name).toBe("my-app");
  });

  it("falls back to the base name when the given name is blank", () => {
    const report = buildReport(sampleMap(), sampleTexts(), { version: "1.2.3", projectName: "   " });
    expect(report.project.name).toBe("my-app");
  });

  it("keeps the same key order and is deterministic with a project name", () => {
    const options = { version: "1.2.3", projectName: "spec-autopsy" };
    const a = JSON.stringify(buildReport(sampleMap(), sampleTexts(), options));
    const b = JSON.stringify(buildReport(sampleMap(), sampleTexts(), options));
    expect(a).toBe(b);
    expect(Object.keys(JSON.parse(a) as object)).toEqual([
      "schemaVersion",
      "tool",
      "project",
      "summary",
      "specs",
      "findings",
      "diagnostics",
    ]);
  });
});
