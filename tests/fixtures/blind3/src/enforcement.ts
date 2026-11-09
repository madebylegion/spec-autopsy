// Enforcement: plate checks and citations.

// enforcement/R1.1
export interface ActivePermit {
  plate: string;
  zone: string;
}

// enforcement/R1.1
export function findActivePermit(permits: ActivePermit[], plate: string, zone: string): ActivePermit | undefined {
  return permits.find((p) => p.plate === plate && p.zone === zone);
}

export function checkPlate(permits: ActivePermit[], plate: string, zone: string): { ok: boolean; citation?: string } {
  const hit = findActivePermit(permits, plate, zone);
  return hit ? { ok: true } : { ok: false, citation: `CITE-${plate}-${zone}` };
}

// enforcement/R2.3
export interface Citation {
  id: string;
  paid: boolean;
}

export function settle(c: Citation): Citation {
  return { ...c, paid: true };
}

export function citationSummaryLine(c: Citation): string {
  return `${c.id} ${c.paid ? "paid" : "open"}`;
}
