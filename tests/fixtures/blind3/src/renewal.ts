// Permit renewal: window, extension, grace period.

const DAY = 86_400_000;

function daysUntil(expiry: string, today: string): number {
  return Math.round((Date.parse(expiry) - Date.parse(today)) / DAY);
}

export function renewalWindowOpen(expiry: string, today: string): boolean {
  const d = daysUntil(expiry, today);
  return d <= 30 && d >= 0;
}

export function renewPermit(expiry: string): string {
  const d = new Date(Date.parse(expiry));
  d.setUTCMonth(d.getUTCMonth() + 12);
  return d.toISOString().slice(0, 10);
}

// permit-renewal/R2.1
export function lateSurchargeRate(expiry: string, today: string): number {
  const late = -daysUntil(expiry, today);
  return late > 0 && late <= 14 ? 0.1 : 0;
}

export function requiresNewApplication(expiry: string, today: string): boolean {
  return -daysUntil(expiry, today) > 14;
}

export const DEFAULT_LOCALE = "en-GB";
