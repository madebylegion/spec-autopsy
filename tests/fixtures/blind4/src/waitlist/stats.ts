import type { WaitEntry } from "./waitlist.js";

// Number of waiting patients per day, for a wall display.
export function queueSizesByDay(list: WaitEntry[]): Record<string, number> {
  const sizes: Record<string, number> = {};
  for (const e of list) {
    sizes[e.day] = (sizes[e.day] ?? 0) + 1;
  }
  return sizes;
}
