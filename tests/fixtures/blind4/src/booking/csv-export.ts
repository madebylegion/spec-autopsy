import type { Appointment } from "./booking.js";

export function exportAppointmentsCsv(book: Appointment[]): string {
  const rows = book.map((a) => [a.id, a.patientId, a.start, a.status].join(","));
  return ["id,patient,start,status", ...rows].join("\n");
}
