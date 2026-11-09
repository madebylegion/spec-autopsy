// Date helpers.
export function isWeekend(iso: string): boolean {
  const d = new Date(iso).getUTCDay();
  return d === 0 || d === 6;
}
