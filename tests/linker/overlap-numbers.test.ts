import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { overlapScore, overlaps, tokenise } from "../../src/linker/overlap.js";

describe("tokenise numbers", () => {
  it("keeps a number of 2 or more digits", () => {
    expect(tokenise("a fee of 40 credits for each day")).toEqual(["fee", "40", "credit", "day"]);
  });

  it("keeps 10, 21 and 007 and drops a single digit", () => {
    expect(tokenise("10 21 007 5")).toEqual(["10", "21", "007"]);
  });

  it("strips the trailing s only for a token with letters", () => {
    expect(tokenise("100s")).toEqual(["100"]);
    expect(tokenise("10s")).toEqual(["10s"]);
  });

  it("splits camelCase around a number and keeps the number", () => {
    expect(tokenise("limit_40Credits")).toEqual(["limit", "40", "credit"]);
  });

  it("removes duplicate numbers", () => {
    expect(tokenise("40 and 40 again")).toEqual(["40", "again"]);
  });
});

describe("numbers in links", () => {
  it("a shared number counts as a shared word", () => {
    const req = tokenise("The ledger SHALL cap the fee at 40 credits");
    const title = tokenise("caps fee at 40");
    expect(req).toContain("40");
    expect(title).toContain("40");
    expect(overlaps(req, title)).toBe(true);
  });

  it("a pair at 2 of 5 (0.40) becomes 3 of 5 (0.60) and links with a shared number", () => {
    const without = [tokenise("alpha beta gamma delta omega"), tokenise("alpha beta sigma kappa theta")] as const;
    expect(overlapScore(without[0], without[1])).toBeCloseTo(0.4, 10);
    expect(overlaps(without[0], without[1])).toBe(false);

    const withNumber = [tokenise("alpha beta gamma delta 40"), tokenise("alpha beta sigma kappa 40")] as const;
    expect(withNumber[0]).toHaveLength(5);
    expect(withNumber[1]).toHaveLength(5);
    expect(overlapScore(withNumber[0], withNumber[1])).toBeCloseTo(0.6, 10);
    expect(overlaps(withNumber[0], withNumber[1])).toBe(true);
  });

  it("a number on one side only never creates a link by itself", () => {
    const a = tokenise("alpha 40 gamma");
    const b = tokenise("sigma kappa theta");
    expect(overlaps(a, b)).toBe(false);
    expect(overlapScore(a, b)).toBe(0);
  });

  it("a number alone is one shared word, which is below the minimum of 2", () => {
    expect(overlaps(tokenise("alpha 40 gamma"), tokenise("sigma 40 kappa"))).toBe(false);
  });
});

const chars = [..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-.s"];
const text = fc.array(fc.constantFrom(...chars), { maxLength: 40 }).map((a) => a.join(""));

describe("tokenise properties with numbers", () => {
  it("never throws and is idempotent", () => {
    fc.assert(
      fc.property(text, (s) => {
        const once = tokenise(s);
        expect(tokenise(once.join(" "))).toEqual(once);
      }),
    );
  });

  it("overlapScore stays within 0..1 and is symmetric", () => {
    fc.assert(
      fc.property(text, text, (x, y) => {
        const a = tokenise(x);
        const b = tokenise(y);
        const score = overlapScore(a, b);
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
        expect(overlapScore(b, a)).toBe(score);
      }),
    );
  });
});
