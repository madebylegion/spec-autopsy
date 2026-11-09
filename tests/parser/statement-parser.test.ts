import { describe, expect, it } from "vitest";
import { parseStatement } from "../../src/parser/statement-parser.js";

function ok(text: string) {
  const result = parseStatement(text);
  if (!result.ok) throw new Error(`expected ok, got ${result.code}`);
  return result.statement;
}

describe("parseStatement patterns", () => {
  it("parses the ubiquitous pattern", () => {
    expect(ok("The parser SHALL return ids.")).toEqual({
      pattern: "ubiquitous",
      system: "parser",
      response: "return ids.",
    });
  });

  it("parses the event-driven pattern", () => {
    expect(ok("WHEN a file is saved, the indexer SHALL refresh")).toEqual({
      pattern: "event-driven",
      trigger: "a file is saved",
      system: "indexer",
      response: "refresh",
    });
  });

  it("parses the state-driven pattern", () => {
    expect(ok("WHILE the repo is dirty, the report SHALL warn")).toEqual({
      pattern: "state-driven",
      state: "the repo is dirty",
      system: "report",
      response: "warn",
    });
  });

  it("parses the unwanted pattern", () => {
    expect(ok("IF the file is missing, THEN the parser SHALL emit a diagnostic")).toEqual({
      pattern: "unwanted",
      condition: "the file is missing",
      system: "parser",
      response: "emit a diagnostic",
    });
  });

  it("parses the optional pattern", () => {
    expect(ok("WHERE a UI is built, the linker SHALL export JSON")).toEqual({
      pattern: "optional",
      feature: "a UI is built",
      system: "linker",
      response: "export JSON",
    });
  });

  it("parses a complex statement and stores every clause", () => {
    expect(
      ok("WHILE idle, WHERE tracing is on, WHEN a request arrives, IF it is invalid, THEN the server SHALL reject it"),
    ).toEqual({
      pattern: "complex",
      state: "idle",
      feature: "tracing is on",
      trigger: "a request arrives",
      condition: "it is invalid",
      system: "server",
      response: "reject it",
    });
  });

  it("parses two clauses as complex", () => {
    const s = ok("WHEN x happens, IF y holds, the system SHALL act");
    expect(s.pattern).toBe("complex");
    expect(s.trigger).toBe("x happens");
    expect(s.condition).toBe("y holds");
  });
});

describe("parseStatement keywords", () => {
  it("accepts upper, lower and mixed case keywords", () => {
    const upper = ok("WHEN a thing happens, THEN the system SHALL act");
    const lower = ok("when a thing happens, then the system shall act");
    const mixed = ok("When a thing happens, Then the system Shall act");
    expect(lower).toEqual(upper);
    expect(mixed).toEqual(upper);
    expect(upper.pattern).toBe("event-driven");
    expect(upper.trigger).toBe("a thing happens");
  });

  it("gives the same result with and without THEN", () => {
    expect(ok("WHEN a thing happens, THEN the system SHALL act")).toEqual(
      ok("WHEN a thing happens, the system SHALL act"),
    );
    expect(ok("WHEN a thing happens THEN the system SHALL act")).toEqual(
      ok("WHEN a thing happens, the system SHALL act"),
    );
  });

  it("uses the text after the last 'the' as the system", () => {
    const s = ok("WHEN the user clicks the button, THEN the parser SHALL run");
    expect(s.trigger).toBe("the user clicks the button");
    expect(s.system).toBe("parser");
  });
});

describe("parseStatement whitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    const s = ok("  WHEN   a   thing\thappens ,   THEN  the   big   system   SHALL   do    it  ");
    expect(s).toEqual({
      pattern: "event-driven",
      trigger: "a thing happens",
      system: "big system",
      response: "do it",
    });
  });
});

describe("parseStatement failures", () => {
  it("reports missing-shall", () => {
    expect(parseStatement("The parser returns ids")).toEqual({ ok: false, code: "missing-shall" });
  });

  it("reports empty-response", () => {
    expect(parseStatement("The parser SHALL ")).toEqual({ ok: false, code: "empty-response" });
  });

  it("reports missing-system when there is no 'the'", () => {
    expect(parseStatement("Parser SHALL work")).toEqual({ ok: false, code: "missing-system" });
  });

  it("reports missing-system when nothing follows the last 'the'", () => {
    expect(parseStatement("WHEN x, THEN the SHALL work")).toEqual({ ok: false, code: "missing-system" });
  });

  it("does not throw on empty input", () => {
    expect(parseStatement("")).toEqual({ ok: false, code: "missing-shall" });
  });
});
