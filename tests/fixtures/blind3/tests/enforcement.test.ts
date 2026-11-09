import { describe, it, expect } from "vitest";
import { findActivePermit, checkPlate } from "../src/enforcement.js";

const permits = [{ plate: "AB12CD", zone: "A" }];

describe("enforcement", () => {
  it("looks up the permit for a scanned plate in that zone", () => {
    expect(findActivePermit(permits, "AB12CD", "A")).toBeDefined();
    expect(findActivePermit(permits, "AB12CD", "B")).toBeUndefined();
  });

  it("issues a citation when no active permit is found", () => {
    expect(checkPlate(permits, "ZZ99", "A").ok).toBe(false);
  });
});
