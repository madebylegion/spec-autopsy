import { describe, it, expect } from "vitest";
import { renewalWindowOpen, lateSurchargeRate } from "../src/renewal.js";

describe("renewal", () => {
  it("opens the window 30 days before expiry", () => {
    expect(renewalWindowOpen("2027-01-31", "2027-01-01")).toBe(true);
    expect(renewalWindowOpen("2027-03-01", "2027-01-01")).toBe(false);
  });

  it("adds a 10 percent surcharge inside the grace period (permit-renewal/R2.1)", () => {
    expect(lateSurchargeRate("2027-01-01", "2027-01-08")).toBe(0.1);
  });
});
