// Planted fixture: stock helpers. Not part of the real project.

// stock/R1.1
export function recordAdjustment(ledger: number[], delta: number): number[] {
  return [...ledger, delta];
}

export function rejectNegativeQuantity(quantity: number): boolean {
  return quantity < 0;
}

// stock/R1.3
export function markShortfall(level: number, point: number): boolean {
  return level < point;
}

export function computeSupplierLeadTime(days: number[]): number {
  return days.reduce((sum, day) => sum + day, 0);
}

export function updateOnHandQuantity(current: number, received: number): number {
  return roundToUnit(current + received);
}

export function buildReorderAlertSummaryReport(lines: string[]): string {
  return lines.join("\n");
}

export function recordStockAdjustmentReasons(reasons: string[]): string {
  return reasons.join(", ");
}

export function legacyCsvExport(rows: string[][]): string {
  return rows.map((row) => row.join(",")).join("\n");
}

function roundToUnit(value: number): number {
  return Math.round(value);
}
