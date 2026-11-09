import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildReport, validateReport } from "../../src/report/index.js";
import { sampleMap, sampleTexts } from "../helpers/report-sample.js";

/** A built report as plain JSON data, safe to mutate. */
function plain(): Record<string, any> {
  return JSON.parse(JSON.stringify(buildReport(sampleMap(), sampleTexts(), { version: "1.0.0" })));
}

function errorsOf(value: unknown): string[] {
  const result = validateReport(value);
  if (result.ok) throw new Error("expected the report to be rejected");
  return result.errors;
}

describe("validateReport", () => {
  it("accepts a built report", () => {
    const result = validateReport(plain());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.report.schemaVersion).toBe(1);
  });

  it("accepts the report of an empty body map", () => {
    const report = buildReport(
      {
        root: "/x/empty",
        requirements: [],
        zombies: [],
        diagnostics: [],
        counts: { requirements: 0, ghost: 0, unproven: 0, proven: 0, zombies: 0 },
      },
      new Map(),
      { version: "0.0.1" },
    );
    expect(validateReport(JSON.parse(JSON.stringify(report))).ok).toBe(true);
  });

  it("rejects schemaVersion 2 and says the report is newer", () => {
    const report = plain();
    report["schemaVersion"] = 2;
    const errors = errorsOf(report);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/newer/);
  });

  it("rejects schemaVersion 0", () => {
    const report = plain();
    report["schemaVersion"] = 0;
    const errors = errorsOf(report);
    expect(errors[0]).toContain("schemaVersion");
    expect(errors[0]).not.toMatch(/newer/);
  });

  it("rejects a missing top-level key and names it", () => {
    const report = plain();
    delete report["diagnostics"];
    expect(errorsOf(report).join("\n")).toContain("diagnostics");
  });

  it("rejects a finding with line 0 and names the path", () => {
    const report = plain();
    report["findings"][0].line = 0;
    expect(errorsOf(report).join("\n")).toContain("findings[0].line");
  });

  it("rejects a confidence score outside 0..1", () => {
    const report = plain();
    report["findings"][1].confidence.score = 1.5;
    expect(errorsOf(report).join("\n")).toContain("findings[1].confidence.score");
  });

  it("rejects a finding with no evidence sentence", () => {
    const report = plain();
    report["findings"][2].evidence = [];
    expect(errorsOf(report).join("\n")).toContain("findings[2].evidence");
  });

  it("rejects an unknown status and an unknown type", () => {
    const report = plain();
    report["specs"][0].requirements[0].status = "dead";
    report["findings"][0].type = "ghoul";
    const text = errorsOf(report).join("\n");
    expect(text).toContain("specs[0].requirements[0].status");
    expect(text).toContain("findings[0].type");
  });

  it("rejects a level that disagrees with the score", () => {
    const report = plain();
    report["findings"][0].confidence = { score: 0.9, level: "low" };
    expect(errorsOf(report).join("\n")).toContain("findings[0].confidence.level");
  });

  it("rejects a non-object, null and an array", () => {
    for (const value of [42, "report", true, undefined, null, [], [plain()]]) {
      const errors = errorsOf(value);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.every((e) => typeof e === "string")).toBe(true);
    }
  });

  it("reports at most 5 errors", () => {
    expect(errorsOf({}).length).toBeLessThanOrEqual(5);
    expect(errorsOf({}).length).toBeGreaterThan(0);
  });

  it("does not throw on a throwing getter", () => {
    const value = {
      get schemaVersion(): number {
        throw new Error("boom");
      },
    };
    expect(validateReport(value).ok).toBe(false);
  });
});

/** Every path (array of keys) to a value inside `root`, objects and arrays included. */
function paths(root: unknown): Array<Array<string | number>> {
  const out: Array<Array<string | number>> = [];
  const walk = (value: unknown, path: Array<string | number>): void => {
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        out.push([...path, i]);
        walk(item, [...path, i]);
      });
    } else if (typeof value === "object" && value !== null) {
      for (const [key, item] of Object.entries(value)) {
        out.push([...path, key]);
        walk(item, [...path, key]);
      }
    }
  };
  walk(root, []);
  return out;
}

function mutate(
  report: Record<string, any>,
  pick: number,
  replacement: unknown,
  remove: boolean,
): unknown {
  const all = paths(report);
  const path = all[pick % all.length];
  if (path === undefined) return replacement;
  let target: any = report;
  for (const step of path.slice(0, -1)) target = target[step];
  const last = path[path.length - 1] as string | number;
  if (remove) {
    if (Array.isArray(target)) target.splice(last as number, 1);
    else delete target[last];
  } else {
    target[last] = replacement;
  }
  return report;
}

describe("validateReport properties", () => {
  it("never throws on arbitrary values", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        const result = validateReport(value);
        if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
      }),
    );
  });

  it("never throws on arbitrary JSON values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const result = validateReport(value);
        expect(typeof result.ok).toBe("boolean");
        if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
      }),
    );
  });

  it("never throws on mutated built reports", () => {
    fc.assert(
      fc.property(fc.nat(10_000), fc.anything(), fc.boolean(), (pick, replacement, remove) => {
        const mutated = mutate(plain(), pick, replacement, remove);
        const result = validateReport(mutated);
        if (!result.ok) {
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.length).toBeLessThanOrEqual(5);
        }
      }),
    );
  });
});
