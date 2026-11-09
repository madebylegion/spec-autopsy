// Reminder scheduling (reminders/R1.1, reminders/R1.3).
import type { Appointment } from "../booking/booking.js";
import { padTwo } from "../util/strings.js";

export interface Reminder {
  appointmentId: string;
  sendAt: string; // local time, "YYYY-MM-DDTHH:MM"
}

// reminders/R1.1
export function reminderFor(appt: Appointment): Reminder {
  const d = new Date(`${appt.start}:00Z`);
  d.setUTCHours(d.getUTCHours() - 24);
  const day = `${d.getUTCFullYear()}-${padTwo(d.getUTCMonth() + 1)}-${padTwo(d.getUTCDate())}`;
  const time = `${padTwo(d.getUTCHours())}:${padTwo(d.getUTCMinutes())}`;
  return { appointmentId: appt.id, sendAt: `${day}T${time}` };
}

export function dropReminder(pending: Reminder[], appointmentId: string): Reminder[] {
  return pending.filter((r) => r.appointmentId !== appointmentId);
}
