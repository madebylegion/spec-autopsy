import { describe, it, expect } from "vitest";
import { joinWaitlist, promoteNext, type WaitEntry } from "../../src/waitlist/waitlist.js";

describe("promoteNext", () => {
  it("offers the freed slot to the first waiting patient", () => {
    const list: WaitEntry[] = [];
    joinWaitlist(list, "P2", "2026-03-02", 200);
    joinWaitlist(list, "P1", "2026-03-02", 100);
    expect(promoteNext(list, "2026-03-02")?.patientId).toBe("P1");
  });
});
