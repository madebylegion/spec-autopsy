import { describe, it, expect } from "vitest";
import { reminderFor } from "../../src/reminders/reminders.js";

describe("reminderFor", () => {
  it("schedules the reminder 24 hours before the start", () => {
    // reminders/R1.1
    const r = reminderFor({ id: "A1", patientId: "P1", start: "2026-03-02T09:30", status: "booked" });
    expect(r).toEqual({ appointmentId: "A1", sendAt: "2026-03-01T09:30" });
  });
});
