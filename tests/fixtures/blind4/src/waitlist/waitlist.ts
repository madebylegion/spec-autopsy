// Daily waitlist for full days (waitlist/R1.1, waitlist/R1.2).
export const DAILY_QUEUE_CAP = 20;

export interface WaitEntry {
  patientId: string;
  day: string;
  requestedAt: number;
}

function queueFor(list: WaitEntry[], day: string): WaitEntry[] {
  return list.filter((e) => e.day === day).sort((a, b) => a.requestedAt - b.requestedAt);
}

export function joinWaitlist(list: WaitEntry[], patientId: string, day: string, now: number): WaitEntry {
  if (queueFor(list, day).length >= DAILY_QUEUE_CAP) {
    throw new Error("waitlist-full");
  }
  const entry: WaitEntry = { patientId, day, requestedAt: now };
  list.push(entry);
  return entry;
}

// waitlist/R2.1
export function promoteNext(list: WaitEntry[], day: string): WaitEntry | undefined {
  return queueFor(list, day)[0];
}

const OFFER_WINDOW_MINUTES = 15;

export function skipUnanswered(list: WaitEntry[], day: string, minutesWaited: number): WaitEntry | undefined {
  const [first, next] = queueFor(list, day);
  if (first && minutesWaited >= OFFER_WINDOW_MINUTES) {
    list.splice(list.indexOf(first), 1);
    return next;
  }
  return first;
}

export function positionOf(list: WaitEntry[], patientId: string, day: string): number {
  return queueFor(list, day).findIndex((e) => e.patientId === patientId) + 1;
}
