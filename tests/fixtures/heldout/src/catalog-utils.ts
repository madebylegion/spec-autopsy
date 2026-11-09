export const DEFAULT_LOCALE = 'en-GB';

export function formatIsbn(raw: string): string {
  const digits = raw.replace(/[^0-9X]/gi, '');
  if (digits.length !== 13) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9, 12)}-${digits.slice(12)}`;
}
