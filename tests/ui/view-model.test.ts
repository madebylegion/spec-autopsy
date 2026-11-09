import { describe, expect, it } from "vitest";
import { validateReport } from "../../src/report/validate-report.js";
import type { Finding, FindingType, Report } from "../../src/report/types.js";
import {
  applyFilters,
  cardText,
  clampTitle,
  regionForSpec,
  sortFindings,
  stateFromLoad,
  typeCounts,
} from "../../src/ui/view-model.js";
import type { Filters } from "../../src/ui/view-model.js";

function finding(
  type: FindingType,
  level: "high" | "medium" | "low",
  file: string,
  line: number,
  title: string = `${type} ${file}:${line}`,
): Finding {
  const score = level === "high" ? 0.9 : level === "medium" ? 0.6 : 0.3;
  return {
    type,
    requirementId: type === "zombie" ? null : `spec/R1.${line}`,
    title,
    file,
    line,
    evidence: [`cause of ${title}`, "second sentence"],
    confidence: { score, level },
  };
}

function report(findings: Finding[], specNames: string[] = []): Report {
  return {
    schemaVersion: 1,
    tool: { name: "spec-autopsy", version: "0.1.0" },
    project: { name: "demo" },
    summary: {
      requirements: 0,
      ghost: 0,
      unproven: 0,
      proven: 0,
      zombies: 0,
      bySpec: {},
    },
    specs: specNames.map((name) => ({ name, requirements: [] })),
    findings,
    diagnostics: [],
  };
}

const ALL_ON: Filters = { ghost: true, zombie: true, unproven: true, lowOnly: false };

describe("sortFindings", () => {
  it("orders ghost, unproven, zombie", () => {
    const sorted = sortFindings([
      finding("zombie", "high", "a.ts", 1),
      finding("unproven", "high", "a.ts", 1),
      finding("ghost", "high", "a.ts", 1),
    ]);
    expect(sorted.map((f) => f.type)).toEqual(["ghost", "unproven", "zombie"]);
  });

  it("orders by level high to low inside a type", () => {
    const sorted = sortFindings([
      finding("ghost", "low", "a.ts", 1),
      finding("ghost", "high", "z.ts", 9),
      finding("ghost", "medium", "a.ts", 2),
    ]);
    expect(sorted.map((f) => f.confidence.level)).toEqual(["high", "medium", "low"]);
  });

  it("orders by file by code unit, then by numeric line", () => {
    const sorted = sortFindings([
      finding("ghost", "high", "b.ts", 1),
      finding("ghost", "high", "B.ts", 5),
      finding("ghost", "high", "a.ts", 10),
      finding("ghost", "high", "a.ts", 2),
    ]);
    expect(sorted.map((f) => `${f.file}:${f.line}`)).toEqual([
      "B.ts:5",
      "a.ts:2",
      "a.ts:10",
      "b.ts:1",
    ]);
  });

  it("is stable for equal keys and does not change its input", () => {
    const input = [
      finding("ghost", "high", "a.ts", 1, "first"),
      finding("ghost", "high", "a.ts", 1, "second"),
      finding("ghost", "high", "a.ts", 1, "third"),
    ];
    const copy = [...input];
    expect(sortFindings(input).map((f) => f.title)).toEqual(["first", "second", "third"]);
    expect(input).toEqual(copy);
  });

  it("sorts 300 findings without throwing", () => {
    const types: FindingType[] = ["zombie", "ghost", "unproven"];
    const levels = ["low", "high", "medium"] as const;
    const many: Finding[] = [];
    for (let i = 0; i < 300; i++) {
      many.push(
        finding(types[i % 3] as FindingType, levels[i % 3] as "low", `f${i % 7}.ts`, (i % 50) + 1),
      );
    }
    const sorted = sortFindings(many);
    expect(sorted).toHaveLength(300);
    expect(sorted[0]?.type).toBe("ghost");
    expect(sorted[299]?.type).toBe("zombie");
  });
});

describe("filters and counts", () => {
  const list = [
    finding("ghost", "low", "a.ts", 1),
    finding("ghost", "high", "a.ts", 2),
    finding("unproven", "medium", "b.ts", 1),
    finding("zombie", "low", "c.ts", 1),
  ];

  it("keeps everything when all toggles are on", () => {
    expect(applyFilters(list, ALL_ON)).toHaveLength(4);
  });

  it("drops a type when its toggle is off", () => {
    expect(applyFilters(list, { ...ALL_ON, ghost: false }).map((f) => f.type)).toEqual([
      "unproven",
      "zombie",
    ]);
  });

  it("keeps only low confidence when lowOnly is on", () => {
    const result = applyFilters(list, { ...ALL_ON, lowOnly: true });
    expect(result.every((f) => f.confidence.level === "low")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("returns nothing when every type toggle is off", () => {
    expect(applyFilters(list, { ghost: false, zombie: false, unproven: false, lowOnly: false })).toEqual([]);
  });

  it("counts each type", () => {
    expect(typeCounts(list)).toEqual({ ghost: 2, unproven: 1, zombie: 1 });
    expect(typeCounts([])).toEqual({ ghost: 0, unproven: 0, zombie: 0 });
  });
});

describe("clampTitle", () => {
  it("leaves a short title unchanged", () => {
    expect(clampTitle("short title")).toBe("short title");
  });

  it("cuts a long title on a word and adds three dots", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`);
    const text = words.join(" ");
    const out = clampTitle(text, 50);
    expect(out.endsWith("...")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(50);
    const body = out.slice(0, -3);
    expect(text.startsWith(body)).toBe(true);
    expect(text.charAt(body.length)).toBe(" ");
  });

  it("hard-cuts a long text without spaces", () => {
    const out = clampTitle("x".repeat(500), 40);
    expect(out).toBe(`${"x".repeat(37)}...`);
  });
});

describe("cardText", () => {
  it("builds the fields of a ghost card", () => {
    const f = finding("ghost", "high", "src/a.ts", 12, "Do the thing");
    expect(cardText(f)).toEqual({
      id: "spec/R1.12",
      title: "Do the thing",
      clamped: "Do the thing",
      where: "src/a.ts:12",
      confidence: "high 0.90",
      cause: "cause of Do the thing",
    });
  });

  it("uses the symbol as id for a zombie and keeps the full title", () => {
    const long = "word ".repeat(100).trim();
    const f = finding("zombie", "low", "src/z.ts", 3, long);
    const text = cardText(f);
    expect(text.id).toBe(long);
    expect(text.title).toBe(long);
    expect(text.clamped.length).toBeLessThan(long.length);
    expect(text.confidence).toBe("low 0.30");
  });
});

describe("regionForSpec", () => {
  const regionsFor = (count: number): string[] =>
    Array.from({ length: count }, (_, i) => regionForSpec(i));

  it("uses the first region for 1 spec", () => {
    expect(regionsFor(1)).toEqual(["head"]);
  });

  it("uses all seven regions for 7 specs", () => {
    expect(regionsFor(7)).toEqual([
      "head",
      "chest",
      "abdomen",
      "left-arm",
      "right-arm",
      "left-leg",
      "right-leg",
    ]);
  });

  it("gives specs from 8 on the last region for 12 specs", () => {
    const regions = regionsFor(12);
    expect(regions.slice(0, 7)).toEqual(regionsFor(7));
    expect(regions.slice(7)).toEqual(Array(5).fill("right-leg"));
  });
});

describe("stateFromLoad", () => {
  const validReport = report([finding("ghost", "high", "a.ts", 1)], ["spec"]);

  it("gives an error that says how to make a report when missing", () => {
    const state = stateFromLoad({ status: "missing" });
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.lines).toContain("Run npm run autopsy to make one.");
    }
  });

  it("gives an error for a JSON parse failure", () => {
    expect(stateFromLoad({ status: "json-error" }).kind).toBe("error");
  });

  it("gives an error with the first validator errors when invalid", () => {
    const result = validateReport({ schemaVersion: 1 });
    const state = stateFromLoad({ status: "validated", result });
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.lines.length).toBeGreaterThan(0);
      expect(state.lines.length).toBeLessThanOrEqual(5);
      expect(state.title).not.toMatch(/newer/);
    }
  });

  it("says newer for a newer schema version", () => {
    const result = validateReport({ ...validReport, schemaVersion: 2 });
    const state = stateFromLoad({ status: "validated", result });
    expect(state.kind).toBe("error");
    if (state.kind === "error") {
      expect(state.title).toMatch(/newer/);
      expect(state.lines[0]).toMatch(/newer/);
    }
  });

  it("gives empty for a valid report with no findings", () => {
    const result = validateReport(report([]));
    const state = stateFromLoad({ status: "validated", result });
    expect(state.kind).toBe("empty");
  });

  it("gives ready for a valid report with findings", () => {
    const result = validateReport(validReport);
    expect(result.ok).toBe(true);
    const state = stateFromLoad({ status: "validated", result });
    expect(state.kind).toBe("ready");
  });

  it("handles a report with 0 specs", () => {
    const result = validateReport(report([finding("zombie", "medium", "z.ts", 1)], []));
    const state = stateFromLoad({ status: "validated", result });
    expect(state.kind).toBe("ready");
  });
});
