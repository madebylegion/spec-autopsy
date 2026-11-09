import { describe, it, expect } from "vitest";
import { bookSlot, cancelAppointment, type Appointment } from "../../src/booking/booking.js";

describe("cancelAppointment", () => {
  it("frees the slot after a cancellation so it can be booked again", () => {
    // booking/R2.1
    const book: Appointment[] = [];
    const first = bookSlot(book, "P1", "2026-03-02T10:00");
    cancelAppointment(book, first.id, "feeling better");
    expect(first.status).toBe("cancelled");
    expect(bookSlot(book, "P2", "2026-03-02T10:00").status).toBe("booked");
  });

  it("records why the appointment was cancelled", () => {
    const book: Appointment[] = [];
    const appt = bookSlot(book, "P1", "2026-03-02T11:00");
    cancelAppointment(book, appt.id, "moved away");
    expect(appt.cancelReason).toBe("moved away");
  });
});
