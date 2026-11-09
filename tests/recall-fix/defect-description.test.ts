import { describe, expect, it } from "vitest";
import { link } from "../../src/linker/link.js";
import { TASK_1, file, index, neutral, sym, words } from "./link-helpers.js";

describe("defect-description requirements", () => {
  const flagged = neutral("spec/R1.1", 7, { defectDescription: true });
  const normal = neutral("spec/R2.1", 12);

  it("leaves a flagged requirement out of the requirements and the counts", () => {
    const map = link([flagged, normal], index([]), [], []);
    expect(map.requirements.map((r) => r.id)).toEqual(["spec/R2.1"]);
    expect(map.counts).toEqual({ requirements: 1, ghost: 1, unproven: 0, proven: 0, zombies: 0 });
  });

  it("emits one defect-description diagnostic with the file and the line", () => {
    const map = link([flagged, normal], index([]), [], []);
    const diags = map.diagnostics.filter((d) => d.code === "defect-description");
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({
      source: "linker",
      code: "defect-description",
      file: ".kiro/specs/spec/requirements.md",
      line: 7,
    });
    expect(diags[0]?.message).toContain("spec/R1.1");
  });

  it("emits no unknown-task-requirement when a task lists the flagged requirement", () => {
    const map = link([flagged, normal], index([]), [], [TASK_1]);
    expect(map.diagnostics.filter((d) => d.code === "unknown-task-requirement")).toEqual([]);
    expect(map.diagnostics.filter((d) => d.code === "defect-description")).toHaveLength(1);
  });

  it("still reports an id that no requirement has", () => {
    const map = link([normal], index([]), [], [TASK_1]);
    expect(map.diagnostics.filter((d) => d.code === "unknown-task-requirement")).toHaveLength(1);
  });

  it("emits no diagnostic and keeps the requirement when nothing is flagged", () => {
    const map = link([neutral("spec/R1.1", 7)], index([]), [], []);
    expect(map.requirements.map((r) => r.id)).toEqual(["spec/R1.1"]);
    expect(map.diagnostics.filter((d) => d.code === "defect-description")).toEqual([]);
  });

  it("does not let a flagged requirement link a symbol by word overlap", () => {
    const defect = { ...words("spec/R1.1", "stock ledger", "record adjustment", 7), defectDescription: true as const };
    const code = file("src/b.ts", {
      symbols: [sym("recordStockAdjustment", 1, 3, "function", true, "src/b.ts")],
    });
    const map = link([defect], index([code]), [], []);
    expect(map.requirements).toEqual([]);
    expect(map.zombies.map((z) => z.symbol)).toEqual(["recordStockAdjustment"]);
  });
});
