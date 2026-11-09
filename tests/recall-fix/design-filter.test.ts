import { describe, expect, it } from "vitest";
import { isNamedInDesign } from "../../src/linker/design-filter.js";

describe("isNamedInDesign", () => {
  it("matches a backticked name", () => {
    expect(isNamedInDesign("The fix is `zeroBelowFloor` in one file.", "zeroBelowFloor")).toBe(true);
  });

  it("matches a plain whole word", () => {
    expect(isNamedInDesign("Call zeroBelowFloor now", "zeroBelowFloor")).toBe(true);
    expect(isNamedInDesign("(zeroBelowFloor)", "zeroBelowFloor")).toBe(true);
    expect(isNamedInDesign("zeroBelowFloor.", "zeroBelowFloor")).toBe(true);
    expect(isNamedInDesign("zeroBelowFloor", "zeroBelowFloor")).toBe(true);
  });

  it("is case-sensitive", () => {
    expect(isNamedInDesign("call zerobelowfloor", "zeroBelowFloor")).toBe(false);
    expect(isNamedInDesign("call ZeroBelowFloor", "zeroBelowFloor")).toBe(false);
  });

  it("does not match a substring of a longer identifier", () => {
    expect(isNamedInDesign("zeroBelowFloorExtra", "zeroBelowFloor")).toBe(false);
    expect(isNamedInDesign("xzeroBelowFloor", "zeroBelowFloor")).toBe(false);
    expect(isNamedInDesign("$zeroBelowFloor", "zeroBelowFloor")).toBe(false);
    expect(isNamedInDesign("zeroBelowFloor_2", "zeroBelowFloor")).toBe(false);
    expect(isNamedInDesign("link", "linker")).toBe(false);
    expect(isNamedInDesign("linker", "link")).toBe(false);
  });

  it("finds a whole-word occurrence after a failed one", () => {
    expect(isNamedInDesign("zeroBelowFloorExtra and then zeroBelowFloor", "zeroBelowFloor")).toBe(true);
  });

  it("accepts the whole dotted name or the part after the last dot", () => {
    expect(isNamedInDesign("see Box.open here", "Box.open")).toBe(true);
    expect(isNamedInDesign("see `open` here", "Box.open")).toBe(true);
    expect(isNamedInDesign("see reopen here", "Box.open")).toBe(false);
    expect(isNamedInDesign("see Box here", "Box.open")).toBe(false);
  });

  it("is false for an empty text or an empty name", () => {
    expect(isNamedInDesign("", "alpha")).toBe(false);
    expect(isNamedInDesign("alpha", "")).toBe(false);
    expect(isNamedInDesign("", "")).toBe(false);
  });
});
