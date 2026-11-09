import { describe, it, expect } from "vitest";
import { joinWaitlist, type WaitEntry } from "../../src/waitlist/waitlist.js";

describe("joinWaitlist", () => {
  it("waitlist/R1.1 keeps patients in the order they asked", () => {
    const list: WaitEntry[] = [];
    joinWaitlist(list, "P2", "2026-03-02", 200);
    joinWaitlist(list, "P1", "2026-03-02", 100);
    expect(list.map((e) => e.patientId).sort()).toEqual(["P1", "P2"]);
    expect(list.find((e) => e.patientId === "P1")?.requestedAt).toBe(100);
  });
});
