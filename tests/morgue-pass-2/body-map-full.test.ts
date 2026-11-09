import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/report/index.js";
import type { Report, ReportRequirement } from "../../src/report/types.js";
import {
  BODY_REGIONS,
  BODY_WIDTH,
  MAP_WIDTH,
  REGION_BOXES,
  ZOMBIE_LABEL_MAX,
  buildMarkers,
  findingKeys,
  middleTruncate,
  regionStates,
} from "../../src/ui/view-model.js";
import { sampleMap, sampleTexts } from "../helpers/report-sample.js";

const ORDER = ["head", "chest", "abdomen", "left-arm", "right-arm", "left-leg", "right-leg"];

function emptyReport(): Report {
  return {
    schemaVersion: 1,
    tool: { name: "spec-autopsy", version: "0.1.0" },
    project: { name: "demo" },
    summary: { requirements: 0, ghost: 0, unproven: 0, proven: 0, zombies: 0, bySpec: {} },
    specs: [],
    findings: [],
    diagnostics: [],
  };
}

function specReport(specCount: number): Report {
  const specs = Array.from({ length: specCount }, (_, i) => ({
    name: `s${i + 1}`,
    requirements: [1, 2].map(
      (n): ReportRequirement => ({
        id: `s${i + 1}/R1.${n}`,
        text: `text ${i + 1}.${n}`,
        status: "proven",
        file: ".kiro/specs/x/requirements.md",
        line: n,
        lastCommit: null,
        codeLinks: [],
        testLinks: [],
      }),
    ),
  }));
  return { ...emptyReport(), specs };
}

function usedCount(report: Report): number {
  return regionStates(report).filter((s) => s.state === "used").length;
}

describe("BODY_REGIONS", () => {
  it("has the 7 distinct regions in drawing order", () => {
    expect(BODY_REGIONS).toHaveLength(7);
    expect(new Set(BODY_REGIONS).size).toBe(7);
    expect([...BODY_REGIONS]).toEqual(ORDER);
  });
});

describe("geometry", () => {
  it("keeps the body 300 wide and the whole drawing 460 wide", () => {
    expect(BODY_WIDTH).toBe(300);
    expect(MAP_WIDTH).toBe(460);
  });

  it("puts the extra limb box to the right of the body, inside the drawing", () => {
    const box = REGION_BOXES["extra-limb"];
    expect(box).toEqual({ x: 312, y: 100, w: 140, h: 490 });
    expect(box.x).toBeGreaterThanOrEqual(BODY_WIDTH);
    expect(box.x + box.w).toBeLessThanOrEqual(MAP_WIDTH);
  });
});

describe("regionStates", () => {
  for (const [specs, used] of [
    [0, 0],
    [1, 1],
    [3, 3],
    [7, 7],
    [9, 7],
  ] as const) {
    it(`gives 7 entries and ${used} used for ${specs} specs`, () => {
      const report = specReport(specs);
      const states = regionStates(report);
      expect(states).toHaveLength(7);
      expect(states.map((s) => s.region)).toEqual(ORDER);
      expect(usedCount(report)).toBe(used);
      states.forEach((s, i) => {
        expect(s.state).toBe(i < used ? "used" : "unused");
      });
    });
  }

  it("marks every region unused for a report with no specs", () => {
    for (const s of regionStates(emptyReport())) {
      expect(s).toEqual({ region: s.region, state: "unused", specs: [], requirementIds: [] });
    }
  });

  it("keeps spec names and requirement ids in report order", () => {
    const states = regionStates(specReport(9));
    expect(states[0]?.specs).toEqual(["s1"]);
    expect(states[0]?.requirementIds).toEqual(["s1/R1.1", "s1/R1.2"]);
    const last = states[6];
    expect(last?.specs).toEqual(["s7", "s8", "s9"]);
    expect(last?.requirementIds).toEqual(
      [7, 8, 9].flatMap((n) => [`s${n}/R1.1`, `s${n}/R1.2`]),
    );
  });

  it("counts a spec with no requirement as used", () => {
    const report = specReport(2);
    const second = report.specs[1];
    if (second === undefined) throw new Error("missing spec");
    second.requirements = [];
    const states = regionStates(report);
    expect(states[1]).toEqual({ region: "chest", state: "used", specs: ["s2"], requirementIds: [] });
    expect(usedCount(report)).toBe(2);
  });

  it("does not change its input", () => {
    const report = specReport(3);
    const before = JSON.stringify(report);
    regionStates(report);
    expect(JSON.stringify(report)).toBe(before);
  });
});

describe("middleTruncate", () => {
  it("leaves short text unchanged", () => {
    expect(middleTruncate("abc", 16)).toBe("abc");
    expect(middleTruncate("abcdefghij", 10)).toBe("abcdefghij");
  });

  it("cuts the middle and keeps both ends", () => {
    expect(middleTruncate("abcdefghij", 5)).toBe("ab…ij");
    expect(middleTruncate("abcdef", 3)).toBe("a…f");
    const cut = middleTruncate("renderTheVeryLongZombieName", ZOMBIE_LABEL_MAX);
    expect(cut).toHaveLength(ZOMBIE_LABEL_MAX);
    expect(cut.startsWith("r")).toBe(true);
    expect(cut.endsWith("e")).toBe(true);
    expect(cut.split("…")).toHaveLength(2);
  });

  it("copes with max below 3", () => {
    expect(middleTruncate("abcdef", 2)).toBe("a…");
    expect(middleTruncate("abcdef", 1)).toBe("…");
    expect(middleTruncate("abcdef", 0)).toBe("");
    expect(middleTruncate("abcdef", -4)).toBe("");
    expect(middleTruncate("ab", 2)).toBe("ab");
  });

  it("copes with empty text", () => {
    expect(middleTruncate("", 0)).toBe("");
    expect(middleTruncate("", 5)).toBe("");
  });

  it("is bounded, deterministic and keeps the ends (property)", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.integer({ min: 0, max: 40 }), (text, max) => {
        const a = middleTruncate(text, max);
        const b = middleTruncate(text, max);
        expect(a).toBe(b);
        expect(a.length).toBeLessThanOrEqual(max);
        if (text.length <= max) {
          expect(a).toBe(text);
        } else if (max >= 3) {
          expect(a).toHaveLength(max);
          expect(a.startsWith(text.charAt(0))).toBe(true);
          expect(a.endsWith(text.charAt(text.length - 1))).toBe(true);
          expect(a.split("…")).toHaveLength(2);
        }
      }),
    );
  });
});

describe("buildMarkers zombies (unchanged)", () => {
  it("keeps the zombie keys and ids of the sample report", () => {
    const report = buildReport(sampleMap(), sampleTexts(), { version: "1.2.3" });
    const keys = findingKeys(report);
    const expected = report.findings
      .filter((f) => f.type === "zombie")
      .map((f) => ({ key: keys.get(f), id: f.title }));
    expect(expected.length).toBeGreaterThan(0);
    const zombies = buildMarkers(report).filter((m) => m.region === "extra-limb");
    expect(zombies.map((m) => ({ key: m.key, id: m.id }))).toEqual(expected);
    for (const m of zombies) expect(m.key).toMatch(/^zombie:\d+$/);
  });
});
