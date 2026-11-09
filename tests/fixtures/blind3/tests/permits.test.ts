import { describe, it, expect } from "vitest";
import { createApplication, isPlausiblePlate, zoneFee, canHoldAnother } from "../src/permits.js";

describe("permit application", () => {
  it("creates a pending permit with a unique number (permit-issue/R1.1)", () => {
    const a = createApplication("AB12CD", "A", 120);
    const b = createApplication("XY99ZZ", "A", 120);
    expect(a.status).toBe("pending");
    expect(a.number).not.toBe(b.number);
  });

  it("rejects a plate with symbols or a bad length", () => {
    expect(isPlausiblePlate("AB-12!")).toBe(false);
    expect(isPlausiblePlate("A")).toBe(false);
    expect(isPlausiblePlate("AB12CD")).toBe(true);
  });

  it("charges the tariff of the requested zone, permit-issue/R2.1", () => {
    expect(zoneFee("B")).toBe(80);
  });

  it("refuses a third active permit", () => {
    expect(canHoldAnother(2)).toBe(false);
    expect(canHoldAnother(1)).toBe(true);
  });
});
