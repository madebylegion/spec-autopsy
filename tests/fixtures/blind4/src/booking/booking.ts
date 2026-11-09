// Clinic appointment booking (booking/R1.1, booking/R2.1).
export type AppointmentStatus = "booked" | "cancelled";

export interface Appointment {
  id: string;
  patientId: string;
  start: string; // local time, "YYYY-MM-DDTHH:MM"
  status: AppointmentStatus;
  cancelReason?: string;
}

export const OPENING_HOUR = 8;
export const CLOSING_HOUR = 18;

// booking/R1.1
export function bookSlot(book: Appointment[], patientId: string, start: string): Appointment {
  assertInsideOpeningHours(start);
  assertSlotFree(book, start);
  const appt: Appointment = { id: `A${book.length + 1}`, patientId, start, status: "booked" };
  book.push(appt);
  return appt;
}

function assertSlotFree(book: Appointment[], start: string): void {
  if (book.some((a) => a.start === start && a.status === "booked")) {
    throw new Error("slot-taken");
  }
}

function assertInsideOpeningHours(start: string): void {
  const hour = Number(start.slice(11, 13));
  if (hour < OPENING_HOUR || hour >= CLOSING_HOUR) {
    throw new Error("closed");
  }
}

export function cancelAppointment(book: Appointment[], id: string, reason: string): Appointment {
  const appt = book.find((a) => a.id === id);
  if (!appt) {
    throw new Error("not-found");
  }
  appt.status = "cancelled";
  appt.cancelReason = reason;
  return appt;
}
