import { describe, expect, it } from "vitest";
import type { Report } from "../../src/report/types.js";
import {
  chipStates,
  effectiveFilters,
  linkMessage,
  linkedKey,
  markerKeyForTag,
  scrollBehavior,
  tagKeyForMarker,
} from "../../src/ui/view-model.js";
import type { ChipCounts, Filters, MapMarker } from "../../src/ui/view-model.js";

const ALL_ON: Filters = { ghost: true, zombie: true, unproven: true, lowOnly: false };
const COUNTS: ChipCounts = { ghost: 2, zombie: 3, unproven: 4, low: 1 };

function report(): Report {
  return {
    schemaVersion: 1,
    tool: { name: "spec-autopsy", version: "0.1.0" },
    project: { name: "demo" },
    summary: { requirements: 0, ghost: 0, unproven: 0, proven: 0, zombies: 1, bySpec: {} },
    specs: [],
    findings: [
      {
        type: "zombie",
        requirementId: null,
        title: "orphanHelper",
        file: "src/a.ts",
        line: 3,
        evidence: ["No spec asked for it."],
        confidence: { score: 0.5, level: "medium" },
      },
      {
        type: "zombie",
        requirementId: null,
        title: "strayFn",
        file: "src/b.ts",
        line: 9,
        evidence: ["No spec asked for it."],
        confidence: { score: 0.4, level: "low" },
      },
    ],
    diagnostics: [],
  };
}

function marker(key: string): MapMarker {
  return {
    key,
    id: key,
    status: "ghost",
    region: "head",
    x: 0,
    y: 0,
    cell: 10,
    name: `${key}, ghost`,
    level: "high",
  };
}

describe("chipStates", () => {
  it("lists the four chips in a fixed order with their labels and counts", () => {
    const chips = chipStates(ALL_ON, COUNTS);
    expect(chips.map((c) => c.key)).toEqual(["ghost", "zombie", "unproven", "low"]);
    expect(chips.map((c) => c.count)).toEqual([2, 3, 4, 1]);
    expect(chips.map((c) => c.label.startsWith("Ghosts"))).toEqual([true, false, false, false]);
  });

  it("labels the low confidence chip off and on", () => {
    expect(chipStates(ALL_ON, COUNTS)[3]?.label).toBe("Low confidence only: off");
    expect(chipStates({ ...ALL_ON, lowOnly: true }, COUNTS)[3]?.label).toBe("Low confidence only: on");
  });

  it("makes a chip with count 0 disabled and not pressed, even when the stored flag is true", () => {
    const chips = chipStates({ ...ALL_ON, lowOnly: true }, { ghost: 0, zombie: 0, unproven: 5, low: 0 });
    expect(chips.map((c) => c.disabled)).toEqual([true, true, false, true]);
    expect(chips.map((c) => c.pressed)).toEqual([false, false, true, false]);
  });

  it("makes pressed follow the stored flag when the count is above 0", () => {
    const chips = chipStates({ ghost: false, zombie: true, unproven: false, lowOnly: true }, COUNTS);
    expect(chips.map((c) => c.pressed)).toEqual([false, true, false, true]);
    expect(chips.every((c) => !c.disabled)).toBe(true);
  });
});

describe("effectiveFilters", () => {
  it("turns a stale low-only off when there is no low finding", () => {
    const stored: Filters = { ...ALL_ON, lowOnly: true };
    const effective = effectiveFilters(stored, { ...COUNTS, low: 0 });
    expect(effective).toEqual({ ...ALL_ON, lowOnly: false });
  });

  it("keeps low-only when a low finding exists", () => {
    const stored: Filters = { ...ALL_ON, lowOnly: true };
    expect(effectiveFilters(stored, COUNTS)).toEqual(stored);
  });

  it("does not change its input", () => {
    const stored: Filters = { ...ALL_ON, lowOnly: true };
    const copy = { ...stored };
    const effective = effectiveFilters(stored, { ...COUNTS, low: 0 });
    expect(stored).toEqual(copy);
    expect(effective).not.toBe(stored);
  });
});

describe("tagKeyForMarker and markerKeyForTag", () => {
  const tags = new Set(["alpha/R1.1", "zombie:0"]);
  const markers = [marker("alpha/R1.1"), marker("alpha/R1.2"), marker("zombie:0")];

  it("maps a requirement and a zombie key to themselves when the tag exists", () => {
    expect(tagKeyForMarker("alpha/R1.1", tags)).toBe("alpha/R1.1");
    expect(tagKeyForMarker("zombie:0", tags)).toBe("zombie:0");
  });

  it("gives null for a proven requirement without a tag, a hidden tag and an unknown key", () => {
    expect(tagKeyForMarker("alpha/R1.2", tags)).toBeNull();
    expect(tagKeyForMarker("alpha/R1.1", new Set())).toBeNull();
    expect(tagKeyForMarker("nope", tags)).toBeNull();
  });

  it("finds the marker of a tag and gives null for an unknown tag", () => {
    expect(markerKeyForTag("alpha/R1.1", markers)).toBe("alpha/R1.1");
    expect(markerKeyForTag("zombie:0", markers)).toBe("zombie:0");
    expect(markerKeyForTag("zombie:7", markers)).toBeNull();
    expect(markerKeyForTag("alpha/R1.1", [])).toBeNull();
  });
});

describe("linkedKey", () => {
  it("prefers hover, then focus, then pinned", () => {
    expect(linkedKey({ hover: "a", focus: "b", pinned: "c" })).toBe("a");
    expect(linkedKey({ hover: null, focus: "b", pinned: "c" })).toBe("b");
    expect(linkedKey({ hover: null, focus: null, pinned: "c" })).toBe("c");
    expect(linkedKey({ hover: "a", focus: null, pinned: "c" })).toBe("a");
  });

  it("gives null when all three are null", () => {
    expect(linkedKey({ hover: null, focus: null, pinned: null })).toBeNull();
  });
});

describe("linkMessage", () => {
  it("names a requirement by the part after the last slash", () => {
    expect(linkMessage("map", "morgue-pass-2/R2.1", report())).toBe("Showing R2.1 on the map");
    expect(linkMessage("tag", "morgue-pass-2/R2.1", report())).toBe("Showing the toe tag of R2.1");
    expect(linkMessage("no-tag", "morgue-pass-2/R2.1", report())).toBe("R2.1 has no toe tag on the page");
  });

  it("uses a requirement id without a slash as it is", () => {
    expect(linkMessage("map", "R2.1", report())).toBe("Showing R2.1 on the map");
  });

  it("names a zombie by its symbol", () => {
    expect(linkMessage("tag", "zombie:1", report())).toBe("Showing the toe tag of strayFn");
    expect(linkMessage("map", "zombie:0", report())).toBe("Showing orphanHelper on the map");
  });

  it("falls back to the key for an unknown zombie index", () => {
    expect(linkMessage("no-tag", "zombie:9", report())).toBe("zombie:9 has no toe tag on the page");
  });
});

describe("scrollBehavior", () => {
  it("is auto under reduced motion and smooth otherwise", () => {
    expect(scrollBehavior(true)).toBe("auto");
    expect(scrollBehavior(false)).toBe("smooth");
  });
});
