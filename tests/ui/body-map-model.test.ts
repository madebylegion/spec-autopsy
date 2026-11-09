import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/report/index.js";
import type { Report, ReportRequirement } from "../../src/report/types.js";
import {
  REGION_BOXES,
  applyFilters,
  buildMarkers,
  detailFor,
  findingKeys,
  gridPositions,
  groupByRegion,
  markerName,
  markerVisible,
  pathParts,
} from "../../src/ui/view-model.js";
import type { Box, Filters, MapMarker } from "../../src/ui/view-model.js";
import { sampleMap, sampleTexts } from "../helpers/report-sample.js";

const ALL_ON: Filters = { ghost: true, zombie: true, unproven: true, lowOnly: false };
const ALL_OFF: Filters = { ghost: false, zombie: false, unproven: false, lowOnly: false };
const EPS = 1e-9;

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

function sampleReport(): Report {
  return buildReport(sampleMap(), sampleTexts(), { version: "1.2.3" });
}

function insideBox(x: number, y: number, cell: number, box: Box): boolean {
  const half = cell / 2;
  return (
    x - half >= box.x - EPS &&
    x + half <= box.x + box.w + EPS &&
    y - half >= box.y - EPS &&
    y + half <= box.y + box.h + EPS
  );
}

describe("groupByRegion", () => {
  it("puts 1 spec in the head with its markers in order", () => {
    expect(groupByRegion(specReport(1))).toEqual([
      { region: "head", specs: ["s1"], requirementIds: ["s1/R1.1", "s1/R1.2"] },
    ]);
  });

  it("gives 7 specs the seven regions in order", () => {
    const groups = groupByRegion(specReport(7));
    expect(groups.map((g) => g.region)).toEqual([
      "head",
      "chest",
      "abdomen",
      "left-arm",
      "right-arm",
      "left-leg",
      "right-leg",
    ]);
    expect(groups.map((g) => g.specs)).toEqual([["s1"], ["s2"], ["s3"], ["s4"], ["s5"], ["s6"], ["s7"]]);
  });

  it("merges specs 7 to 12 into the right leg and keeps report order", () => {
    const groups = groupByRegion(specReport(12));
    expect(groups).toHaveLength(7);
    const last = groups[6];
    expect(last?.region).toBe("right-leg");
    expect(last?.specs).toEqual(["s7", "s8", "s9", "s10", "s11", "s12"]);
    expect(last?.requirementIds).toEqual(
      [7, 8, 9, 10, 11, 12].flatMap((n) => [`s${n}/R1.1`, `s${n}/R1.2`]),
    );
  });

  it("gives no group for a report with no specs", () => {
    expect(groupByRegion(specReport(0))).toEqual([]);
  });
});

describe("gridPositions", () => {
  const counts = [0, 1, 2, 3, 5, 13, 40, 100];

  for (const [region, box] of Object.entries(REGION_BOXES)) {
    it(`keeps every cell inside the ${region} box`, () => {
      for (const count of counts) {
        const grid = gridPositions(count, box);
        expect(grid.points).toHaveLength(count);
        if (count > 0) expect(grid.cell).toBeGreaterThan(0);
        for (const p of grid.points) expect(insideBox(p.x, p.y, grid.cell, box)).toBe(true);
        const seen = new Set(grid.points.map((p) => `${p.x.toFixed(6)},${p.y.toFixed(6)}`));
        expect(seen.size).toBe(count);
      }
    });
  }

  it("reads left to right, then top to bottom", () => {
    const grid = gridPositions(4, { x: 0, y: 0, w: 40, h: 40 });
    expect(grid.points[0]?.y).toBe(grid.points[1]?.y);
    expect(grid.points[0]?.x ?? 0).toBeLessThan(grid.points[1]?.x ?? 0);
    expect(grid.points[2]?.y ?? 0).toBeGreaterThan(grid.points[0]?.y ?? 0);
  });

  it("returns nothing for 0, a negative or a non-finite count", () => {
    const box = { x: 0, y: 0, w: 10, h: 10 };
    expect(gridPositions(0, box).points).toEqual([]);
    expect(gridPositions(-3, box).points).toEqual([]);
    expect(gridPositions(Number.NaN, box).points).toEqual([]);
  });
});

describe("buildMarkers", () => {
  const rep = sampleReport();
  const markers = buildMarkers(rep);

  it("makes one marker per requirement and one per zombie, with unique keys", () => {
    expect(markers).toHaveLength(8 + 3);
    expect(new Set(markers.map((m) => m.key)).size).toBe(markers.length);
  });

  it("keeps report order inside a region and puts each spec in its region", () => {
    const head = markers.filter((m) => m.region === "head").map((m) => m.id);
    const chest = markers.filter((m) => m.region === "chest").map((m) => m.id);
    expect(head).toEqual(["alpha/R1.1", "alpha/R1.2", "alpha/R1.3"]);
    expect(chest).toEqual(["beta/R1.1", "beta/R1.2", "beta/R1.3", "beta/R1.4", "beta/R1.5"]);
  });

  it("puts every marker inside its region box", () => {
    for (const m of markers) {
      expect(insideBox(m.x, m.y, m.cell, REGION_BOXES[m.region])).toBe(true);
    }
  });

  it("puts the zombies in the extra limb strip, keyed by finding index", () => {
    const zombies = markers.filter((m) => m.region === "extra-limb");
    expect(zombies.map((m) => m.id)).toEqual(["helper", "Widget", "Shape"]);
    for (const m of zombies) {
      expect(m.status).toBe("zombie");
      const index = Number(m.key.slice("zombie:".length));
      expect(rep.findings[index]?.type).toBe("zombie");
      expect(rep.findings[index]?.title).toBe(m.id);
    }
  });

  it("names each marker '<id>, <status>'", () => {
    expect(markerName("alpha/R1.1", "ghost")).toBe("alpha/R1.1, ghost");
    for (const m of markers) expect(m.name).toBe(`${m.id}, ${m.status}`);
    const byId = new Map(markers.map((m) => [m.id, m]));
    expect(byId.get("alpha/R1.1")?.name).toBe("alpha/R1.1, ghost");
    expect(byId.get("alpha/R1.2")?.name).toBe("alpha/R1.2, unproven");
    expect(byId.get("beta/R1.4")?.name).toBe("beta/R1.4, proven");
    expect(byId.get("helper")?.name).toBe("helper, zombie");
  });

  it("is deterministic", () => {
    expect(buildMarkers(rep)).toEqual(markers);
  });

  it("gives nothing for an empty report or a report with no specs", () => {
    expect(buildMarkers(emptyReport())).toEqual([]);
    expect(buildMarkers(specReport(0))).toEqual([]);
  });

  it("keys findings by requirement id, or by zombie index", () => {
    const keys = findingKeys(rep);
    expect(keys.size).toBe(rep.findings.length);
    rep.findings.forEach((f, i) => {
      expect(keys.get(f)).toBe(f.requirementId ?? `zombie:${i}`);
    });
  });
});

describe("markerVisible and filters with every toggle off", () => {
  const rep = sampleReport();
  const markers = buildMarkers(rep);
  const find = (id: string): MapMarker => {
    const found = markers.find((m) => m.id === id);
    if (found === undefined) throw new Error(`no marker ${id}`);
    return found;
  };

  it("hides every finding marker when all type toggles are off, but keeps proven", () => {
    expect(markerVisible(find("alpha/R1.1"), ALL_OFF)).toBe(false);
    expect(markerVisible(find("alpha/R1.2"), ALL_OFF)).toBe(false);
    expect(markerVisible(find("helper"), ALL_OFF)).toBe(false);
    expect(markerVisible(find("beta/R1.4"), ALL_OFF)).toBe(true);
    expect(applyFilters(rep.findings, ALL_OFF)).toEqual([]);
  });

  it("shows everything with all toggles on", () => {
    expect(markers.every((m) => markerVisible(m, ALL_ON))).toBe(true);
  });

  it("follows one type toggle", () => {
    const onlyGhost: Filters = { ...ALL_OFF, ghost: true };
    for (const m of markers) {
      expect(markerVisible(m, onlyGhost)).toBe(m.status === "ghost" || m.status === "proven");
    }
  });

  it("with the low confidence toggle keeps only low findings and hides proven", () => {
    const low: Filters = { ...ALL_ON, lowOnly: true };
    for (const m of markers) {
      expect(markerVisible(m, low)).toBe(m.status !== "proven" && m.level === "low");
    }
    expect(markerVisible(find("beta/R1.4"), low)).toBe(false);
  });
});

describe("detailFor", () => {
  const rep = sampleReport();
  const requirement = (id: string): ReportRequirement => {
    for (const spec of rep.specs) for (const r of spec.requirements) if (r.id === id) return r;
    throw new Error(`no requirement ${id}`);
  };

  it("gives a proven requirement its links and no confidence or evidence", () => {
    const detail = detailFor(rep, "beta/R1.4");
    const req = requirement("beta/R1.4");
    expect(detail).not.toBeNull();
    expect(detail?.kind).toBe("requirement");
    expect(detail?.heading).toBe("beta/R1.4");
    expect(detail?.status).toBe("proven");
    expect(detail?.spec).toBe("beta");
    expect(detail?.text).toBe(req.text);
    expect(detail?.file).toBe(req.file);
    expect(detail?.line).toBe(req.line);
    expect(detail?.confidence).toBeNull();
    expect(detail?.evidence).toEqual([]);
    expect(detail?.codeLinks).toHaveLength(1);
    expect(detail?.codeLinks[0]).toContain("src/b.ts:20 renewB");
    expect(detail?.codeLinks[0]).toContain("overlap");
    expect(detail?.testLinks).toHaveLength(1);
    expect(detail?.testLinks[0]).toContain("tests/b.test.ts:3 renews");
    expect(detail?.testLinks[0]).toContain("commit fedcba9");
    expect(detail?.lastCommit).toBeNull();
  });

  it("gives a ghost all its evidence sentences and the full text", () => {
    const detail = detailFor(rep, "alpha/R1.1");
    const finding = rep.findings.find((f) => f.requirementId === "alpha/R1.1");
    expect(finding).toBeDefined();
    expect(detail?.status).toBe("ghost");
    expect(detail?.text).toBe("The parser SHALL read files.");
    expect(detail?.evidence).toEqual(finding?.evidence);
    expect(detail?.evidence.length).toBeGreaterThan(0);
    expect(detail?.confidence).toBe(
      `${finding?.confidence.level} ${finding?.confidence.score.toFixed(2)}`,
    );
    expect(detail?.codeLinks).toEqual([]);
    expect(detail?.testLinks).toEqual([]);
  });

  it("shows the method, the commit SHA and the last commit of an unproven requirement", () => {
    const detail = detailFor(rep, "alpha/R1.2");
    expect(detail?.status).toBe("unproven");
    expect(detail?.codeLinks[0]).toContain("src/commit.ts:4 parseA");
    expect(detail?.codeLinks[0]).toContain("commit abcdef1");
    expect(detail?.lastCommit).toBe("task 1 (Ada, 2026-01-02T03:04:05Z)");
  });

  it("gives a zombie its symbol, place and evidence", () => {
    const marker = buildMarkers(rep).find((m) => m.id === "helper");
    expect(marker).toBeDefined();
    const detail = detailFor(rep, marker?.key ?? "");
    const finding = rep.findings.find((f) => f.type === "zombie" && f.title === "helper");
    expect(detail?.kind).toBe("zombie");
    expect(detail?.heading).toBe("helper");
    expect(detail?.status).toBe("zombie");
    expect(detail?.spec).toBeNull();
    expect(detail?.file).toBe("src/commit.ts");
    expect(detail?.line).toBe(20);
    expect(detail?.evidence).toEqual(finding?.evidence);
    expect(detail?.codeLinks).toEqual([]);
  });

  it("returns null for an unknown key, a bad zombie index, or an empty report", () => {
    expect(detailFor(rep, "nope/R9.9")).toBeNull();
    expect(detailFor(rep, "zombie:999")).toBeNull();
    expect(detailFor(rep, "zombie:0")).toBeNull();
    expect(detailFor(rep, "")).toBeNull();
    expect(detailFor(emptyReport(), "alpha/R1.1")).toBeNull();
  });
});

describe("pathParts", () => {
  it("splits only after a slash and joins back to the path", () => {
    const path = ".kiro/specs/printer-ubiquitous-gap/requirements.md";
    const parts = pathParts(path);
    expect(parts).toEqual([".kiro/", "specs/", "printer-ubiquitous-gap/", "requirements.md"]);
    expect(parts.join("")).toBe(path);
  });

  it("handles a bare file name, a trailing slash and an empty path", () => {
    expect(pathParts("file.ts")).toEqual(["file.ts"]);
    expect(pathParts("dir/")).toEqual(["dir/"]);
    expect(pathParts("")).toEqual([]);
  });
});
