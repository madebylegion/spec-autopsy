import { describe, expect, it } from "vitest";
import { parseRequirementsText } from "../../src/parser/requirement-parser.js";
import { printRequirement } from "../../src/parser/requirement-printer.js";
import type { Requirement } from "../../src/parser/types.js";

function req(partial: Partial<Requirement>): Requirement {
  return {
    id: "demo/R1.1",
    pattern: "ubiquitous",
    system: "parser",
    response: "parse files",
    file: "a.md",
    line: 1,
    ...partial,
  };
}

describe("printRequirement", () => {
  it("prints a ubiquitous requirement", () => {
    expect(printRequirement(req({}))).toBe("The parser SHALL parse files");
  });

  it("prints and re-parses a ubiquitous requirement", () => {
    const printed = printRequirement(req({}));
    const result = parseRequirementsText(`### Requirement 1: T\n\n1. ${printed}\n`, {
      specName: "demo",
      file: "demo.md",
    });
    expect(result.diagnostics).toEqual([]);
    expect(result.requirements).toHaveLength(1);
    const parsed = result.requirements[0] as Requirement;
    expect(parsed.pattern).toBe("ubiquitous");
    expect(parsed.system).toBe("parser");
    expect(parsed.response).toBe("parse files");
    expect(parsed.state).toBeUndefined();
    expect(parsed.feature).toBeUndefined();
    expect(parsed.trigger).toBeUndefined();
    expect(parsed.condition).toBeUndefined();
  });

  it("prints an event-driven requirement", () => {
    expect(printRequirement(req({ pattern: "event-driven", trigger: "a file changes" }))).toBe(
      "WHEN a file changes, THEN the parser SHALL parse files",
    );
  });

  it("prints a state-driven requirement", () => {
    expect(printRequirement(req({ pattern: "state-driven", state: "idle" }))).toBe(
      "WHILE idle, THEN the parser SHALL parse files",
    );
  });

  it("prints an unwanted-behaviour requirement", () => {
    expect(printRequirement(req({ pattern: "unwanted", condition: "input is empty" }))).toBe(
      "IF input is empty, THEN the parser SHALL parse files",
    );
  });

  it("prints an optional-feature requirement", () => {
    expect(printRequirement(req({ pattern: "optional", feature: "git is present" }))).toBe(
      "WHERE git is present, THEN the parser SHALL parse files",
    );
  });

  it("prints a complex requirement with clauses in canonical order", () => {
    expect(
      printRequirement(
        req({ pattern: "complex", condition: "bad", trigger: "run", state: "busy", feature: "extra" }),
      ),
    ).toBe("WHILE busy, WHERE extra, WHEN run, IF bad, THEN the parser SHALL parse files");
  });
});
