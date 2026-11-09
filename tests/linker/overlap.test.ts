import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Requirement } from "../../src/parser/index.js";
import {
  overlapScore,
  overlaps,
  requirementTokens,
  sharedCount,
  STOPWORDS,
  symbolTokens,
  THRESHOLD,
  tokenise,
} from "../../src/linker/overlap.js";

describe("tokenise", () => {
  it("splits camelCase", () => {
    expect(tokenise("getUserName")).toEqual(["get", "user", "name"]);
    expect(tokenise("parseHTTPRequest")).toEqual(["parse", "http", "request"]);
  });

  it("splits snake_case", () => {
    expect(tokenise("parse_http_request")).toEqual(["parse", "http", "request"]);
  });

  it("treats the dot in Class.method as a separator", () => {
    expect(tokenise("Parser.parseFile")).toEqual(["parser", "parse", "file"]);
    expect(symbolTokens("Parser.parseFile")).toEqual(["parser", "parse", "file"]);
  });

  it("drops stopwords", () => {
    expect(tokenise("The system shall record the stock")).toEqual(["system", "record", "stock"]);
    expect(STOPWORDS.has("shall")).toBe(true);
  });

  it("drops tokens shorter than 3 characters", () => {
    expect(tokenise("id ab xyz")).toEqual(["xyz"]);
  });

  it("strips one trailing s", () => {
    expect(tokenise("orders items")).toEqual(["order", "item"]);
  });

  it("keeps tokens ending in ss and 3-character tokens", () => {
    expect(tokenise("class glass bus")).toEqual(["class", "glass", "bus"]);
  });

  it("drops a token that becomes a stopword after stripping", () => {
    expect(tokenise("ands")).toEqual([]);
  });

  it("removes duplicates, keeping the first", () => {
    expect(tokenise("stock Stock STOCK stocks")).toEqual(["stock"]);
  });

  it("returns nothing for empty input", () => {
    expect(tokenise("")).toEqual([]);
    expect(tokenise("   ")).toEqual([]);
  });
});

describe("requirementTokens", () => {
  it("joins system, response, trigger, state, condition and feature", () => {
    const req: Requirement = {
      id: "x/R1.1",
      pattern: "event-driven",
      trigger: "a change",
      system: "stock",
      response: "record the adjustment reason",
      file: "r.md",
      line: 1,
    };
    expect(requirementTokens(req)).toEqual(["stock", "record", "adjustment", "reason", "change"]);
  });
});

describe("overlap score", () => {
  it("THRESHOLD is 0.5", () => {
    expect(THRESHOLD).toBe(0.5);
  });

  it("counts shared tokens", () => {
    expect(sharedCount(["a1b", "c2d"], ["c2d", "e3f"])).toBe(1);
    expect(sharedCount([], ["x"])).toBe(0);
  });

  it("is 0 for empty input", () => {
    expect(overlapScore([], ["abc"])).toBe(0);
    expect(overlapScore(["abc"], [])).toBe(0);
    expect(overlapScore([], [])).toBe(0);
  });

  it("does not link 1 shared token of 1", () => {
    expect(overlapScore(["stock"], ["stock"])).toBe(1);
    expect(overlaps(["stock"], ["stock"])).toBe(false);
  });

  it("links 2 shared tokens of 2", () => {
    expect(overlaps(["stock", "record"], ["record", "stock", "extra"])).toBe(true);
  });

  it("does not link at score 0.4", () => {
    const a = ["alpha", "bravo", "charlie", "delta", "echo"];
    const b = ["alpha", "bravo", "foxtrot", "golf", "hotel"];
    expect(overlapScore(a, b)).toBeCloseTo(0.4, 10);
    expect(overlaps(a, b)).toBe(false);
  });

  it("links at score exactly 0.5", () => {
    const a = ["alpha", "bravo", "charlie", "delta"];
    const b = ["alpha", "bravo", "foxtrot", "golf"];
    expect(overlapScore(a, b)).toBe(0.5);
    expect(overlaps(a, b)).toBe(true);
  });

  it("ignores duplicates in the inputs", () => {
    expect(overlapScore(["abc", "abc"], ["abc"])).toBe(1);
  });
});

describe("overlap properties", () => {
  it("tokenise never throws and is idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = tokenise(s);
        expect(tokenise(once.join(" "))).toEqual(once);
      }),
      { numRuns: 300 },
    );
  });

  it("overlapScore is within 0..1 and symmetric", () => {
    fc.assert(
      fc.property(fc.array(fc.string()), fc.array(fc.string()), (a, b) => {
        const score = overlapScore(a, b);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
        expect(overlapScore(b, a)).toBe(score);
      }),
      { numRuns: 300 },
    );
  });
});
