// Permit application, fees and limits.

// permit-issue/R1.1
export interface Permit {
  number: string;
  plate: string;
  zone: string;
  status: "pending" | "active" | "expired";
  fee: number;
  expires: string;
}

let counter = 0;

// permit-issue/R1.1
export function createApplication(plate: string, zone: string, fee: number): Permit {
  counter += 1;
  return {
    number: `P-${String(counter).padStart(6, "0")}`,
    plate,
    zone,
    status: "pending",
    fee,
    expires: "2027-01-01",
  };
}

export function isPlausiblePlate(plate: string): boolean {
  return /^[A-Z0-9]{2,8}$/i.test(plate);
}

const TARIFF: Record<string, number> = { A: 120, B: 80, C: 45 };

export function zoneFee(zone: string): number {
  return TARIFF[zone] ?? 0;
}

export function seniorPrice(fee: number, age: number): number {
  return age >= 65 ? fee / 2 : fee;
}

export function canHoldAnother(active: number): boolean {
  return active < 2;
}

export function permitToCsvRow(p: Permit): string {
  return [p.number, p.plate, p.zone, p.status].join(",");
}
