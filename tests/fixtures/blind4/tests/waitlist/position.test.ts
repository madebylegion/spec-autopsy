import { describe, it, expect } from "vitest";
import { joinWaitlist, positionOf, type WaitEntry } from "../../src/waitlist/waitlist.js";

describe("positionOf", () => {
  it("tells a patient their place in the queue", () => {
    const list: WaitEntry[] = [];
    joinWaitlist(list, "P1", "2026-03-02", 100);
    joinWaitlist(list, "P2", "2026-03-02", 200);
    expect(positionOf(list, "P2", "2026-03-02")).toBe(2);
  });
});
