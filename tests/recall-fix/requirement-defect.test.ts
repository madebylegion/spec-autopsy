import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseRequirementsText } from "../../src/parser/index.js";

const OPTIONS = { specName: "fix", file: ".kiro/specs/fix/requirements.md" };

const BUGFIX = [
  "# Bugfix Requirements",
  "",
  "## Requirement 1: Current Behavior (Defect)",
  "",
  "1. WHEN a reading is taken, THE scale SHALL print three decimals.",
  "2. THE scale SHALL drift under load.",
  "",
  "## Requirement 2: Expected Behavior (Correct)",
  "",
  "1. THE scale SHALL print two decimals.",
  "",
  "## Requirement 3: Unchanged Behavior (Regression Prevention)",
  "",
  "1. THE scale SHALL keep its tare setting.",
  "",
].join("\n");

function flagged(text: string): string[] {
  return parseRequirementsText(text, OPTIONS)
    .requirements.filter((r) => r.defectDescription === true)
    .map((r) => r.id);
}

describe("defectDescription flag", () => {
  it("flags the Current behavior requirements of the bugfix template only", () => {
    const result = parseRequirementsText(BUGFIX, OPTIONS);
    expect(result.requirements.map((r) => r.id)).toEqual([
      "fix/R1.1",
      "fix/R1.2",
      "fix/R2.1",
      "fix/R3.1",
    ]);
    expect(flagged(BUGFIX)).toEqual(["fix/R1.1", "fix/R1.2"]);
    for (const r of result.requirements) {
      if (r.id.startsWith("fix/R1.")) expect(r.defectDescription).toBe(true);
      else expect("defectDescription" in r).toBe(false);
    }
  });

  it("does not flag without an expected or unchanged heading", () => {
    const text = BUGFIX.split("\n")
      .filter((l) => !/Expected|Unchanged|^1\. THE scale SHALL (print two|keep)/.test(l))
      .join("\n");
    expect(parseRequirementsText(text, OPTIONS).requirements.length).toBe(2);
    expect(flagged(text)).toEqual([]);
  });

  it("does not count a heading inside a code fence", () => {
    const text = [
      "## Requirement 1: Current Behavior",
      "1. THE scale SHALL drift.",
      "```",
      "## Requirement 2: Expected Behavior",
      "```",
    ].join("\n");
    expect(flagged(text)).toEqual([]);
  });

  it("matches Current Behaviour in any case", () => {
    const text = [
      "## Requirement 1: CURRENT BEHAVIOUR",
      "1. THE scale SHALL drift.",
      "## Requirement 2: unchanged behaviour",
      "1. THE scale SHALL keep tare.",
    ].join("\n");
    expect(flagged(text)).toEqual(["fix/R1.1"]);
  });

  it("keeps the exact shape of an ordinary requirement", () => {
    const result = parseRequirementsText("## Requirement 1: Tare\n1. THE scale SHALL tare.\n", OPTIONS);
    expect(result.requirements).toEqual([
      {
        id: "fix/R1.1",
        pattern: "ubiquitous",
        system: "scale",
        response: "tare.",
        file: OPTIONS.file,
        line: 2,
      },
    ]);
    expect(Object.keys(result.requirements[0] ?? {})).not.toContain("defectDescription");
  });
});

describe("defectDescription properties", () => {
  it("never throws on any string", () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        expect(() => parseRequirementsText(text, OPTIONS)).not.toThrow();
      }),
    );
  });

  it("adds no defectDescription to a text without an expected or unchanged heading", () => {
    const lineArb = fc.constantFrom(
      "## Requirement 1: Current Behavior",
      "## Requirement 2: Something else",
      "1. THE scale SHALL work.",
      "2. WHEN idle, THE scale SHALL sleep.",
      "### Notes",
      "```",
      "",
    );
    fc.assert(
      fc.property(fc.array(lineArb, { maxLength: 12 }), fc.string(), (lines, extra) => {
        const text = `${lines.join("\n")}\n${extra}`;
        fc.pre(!/(expected|unchanged)\s+behaviou?r/i.test(text));
        const result = parseRequirementsText(text, OPTIONS);
        expect(result.requirements.some((r) => "defectDescription" in r)).toBe(false);
      }),
    );
  });
});
