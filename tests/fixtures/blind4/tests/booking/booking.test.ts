import { describe, it, expect } from "vitest";
import { bookSlot, type Appointment } from "../../src/booking/booking.js";

describe("bookSlot", () => {
  it("booking/R1.1 creates an appointment with status booked", () => {
    const book: Appointment[] = [];
    const appt = bookSlot(book, "P1", "2026-03-02T09:30");
    expect(appt.status).toBe("booked");
    expect(book).toHaveLength(1);
  });

  it("rejects a second booking for the same slot", () => {
    const book: Appointment[] = [];
    bookSlot(book, "P1", "2026-03-02T09:30");
    expect(() => bookSlot(book, "P2", "2026-03-02T09:30")).toThrow("slot-taken");
  });
});
