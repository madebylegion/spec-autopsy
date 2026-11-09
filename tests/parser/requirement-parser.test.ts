import { describe, expect, it } from "vitest";
import { parseRequirementsText } from "../../src/parser/requirement-parser.js";

const options = { specName: "demo", file: ".kiro/specs/demo/requirements.md" };

const SAMPLE = [
  "# Requirements Document",
  "",
  "### Requirement 1: First",
  "",
  "#### Acceptance Criteria",
  "",
  "1. The parser SHALL read files.",
  "2. WHEN a file is found, THEN the parser SHALL parse it.",
  "",
  "### Requirement 2: Second",
  "",
  "1. IF the file is bad, THEN the parser SHALL report it.",
].join("\n");

describe("parseRequirementsText", () => {
  it("assigns IDs from the numbers in the file, with file and line", () => {
    const { requirements, diagnostics } = parseRequirementsText(SAMPLE, options);
    expect(diagnostics).toEqual([]);
    expect(requirements.map((r) => r.id)).toEqual(["demo/R1.1", "demo/R1.2", "demo/R2.1"]);
    expect(requirements.map((r) => r.line)).toEqual([7, 8, 12]);
    expect(requirements.every((r) => r.file === options.file)).toBe(true);
    expect(requirements[1]?.pattern).toBe("event-driven");
    expect(requirements[1]?.trigger).toBe("a file is found");
  });

  it("keeps the ID unchanged when the statement text is edited", () => {
    const edited = SAMPLE.replace("The parser SHALL read files.", "The reader SHALL load every file.");
    const before = parseRequirementsText(SAMPLE, options).requirements[0];
    const after = parseRequirementsText(edited, options).requirements[0];
    expect(before?.id).toBe("demo/R1.1");
    expect(after?.id).toBe("demo/R1.1");
    expect(after?.system).toBe("reader");
  });

  it("keeps IDs when unrelated lines are inserted", () => {
    const shifted = SAMPLE.replace("### Requirement 2", "Some prose.\n\nMore prose.\n\n### Requirement 2");
    const ids = parseRequirementsText(shifted, options).requirements.map((r) => r.id);
    expect(ids).toEqual(["demo/R1.1", "demo/R1.2", "demo/R2.1"]);
  });

  it("keeps the first duplicate and reports duplicate-id on the second", () => {
    const text = ["### Requirement 1", "1. The a SHALL one.", "1. The b SHALL two."].join("\n");
    const { requirements, diagnostics } = parseRequirementsText(text, options);
    expect(requirements).toHaveLength(1);
    expect(requirements[0]?.system).toBe("a");
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: "duplicate-id", file: options.file, line: 3 }),
    ]);
  });

  it("reports missing-shall", () => {
    const text = ["### Requirement 1", "1. The parser reads files."].join("\n");
    const result = parseRequirementsText(text, options);
    expect(result.requirements).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing-shall", file: options.file, line: 2 }),
    ]);
  });

  it("reports missing-system", () => {
    const text = ["### Requirement 1", "1. Parsers SHALL read files."].join("\n");
    const result = parseRequirementsText(text, options);
    expect(result.requirements).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "missing-system", file: options.file, line: 2 }),
    ]);
  });

  it("reports empty-response", () => {
    const text = ["### Requirement 1", "1. The parser SHALL"].join("\n");
    const result = parseRequirementsText(text, options);
    expect(result.requirements).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "empty-response", file: options.file, line: 2 }),
    ]);
  });

  it("reports unnumbered-statement outside code fences only", () => {
    const text = [
      "### Requirement 1",
      "WHEN x happens, THEN the parser SHALL act.",
      "```",
      "WHEN inside a fence, THEN the parser SHALL be ignored.",
      "```",
      "1. The parser SHALL work.",
    ].join("\n");
    const result = parseRequirementsText(text, options);
    expect(result.requirements.map((r) => r.id)).toEqual(["demo/R1.1"]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({ code: "unnumbered-statement", file: options.file, line: 2 }),
    ]);
  });

  it("ignores numbered lines before any requirement heading and inside fences", () => {
    const text = [
      "1. The parser SHALL be ignored.",
      "### Requirement 1",
      "```",
      "1. The parser SHALL be ignored too.",
      "```",
    ].join("\n");
    const result = parseRequirementsText(text, options);
    expect(result.requirements).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("returns an empty result for empty input", () => {
    expect(parseRequirementsText("", options)).toEqual({ requirements: [], diagnostics: [] });
  });

  it("handles CRLF line endings", () => {
    const result = parseRequirementsText(SAMPLE.replace(/\n/g, "\r\n"), options);
    expect(result.requirements.map((r) => r.line)).toEqual([7, 8, 12]);
  });

  it("gives every diagnostic a message and a 1-based line", () => {
    const text = ["### Requirement 1", "1. nothing here", "WHILE x", "2. The a SHALL"].join("\n");
    const { diagnostics } = parseRequirementsText(text, options);
    expect(diagnostics.length).toBe(3);
    for (const d of diagnostics) {
      expect(d.message.length).toBeGreaterThan(0);
      expect(d.file).toBe(options.file);
      expect(d.line).toBeGreaterThanOrEqual(1);
    }
  });
});
