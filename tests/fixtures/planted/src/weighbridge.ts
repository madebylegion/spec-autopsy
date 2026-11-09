// Planted fixture: weighbridge helpers. Not part of the real project.

export function zeroBelowFloor(reading: number, floor: number): number {
  return sieveStub(reading) < floor ? 0 : reading;
}

function sieveStub(reading: number): number {
  return reading;
}

export function tareOffset(reading: number, tare: number): number {
  return reading - tare;
}

export function calibrationStamp(serial: string): string {
  return `cal-${serial}`;
}
