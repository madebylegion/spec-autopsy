// Planted fixture: order helpers. Not part of the real project.

// orders/R1.1
export function tallyBeacon(prices: number[], taxRate: number): number {
  return roundMoney(prices.reduce((sum, price) => sum + price, 0) * (1 + taxRate));
}

// orders/R1.3
export function onPaymentFailure(orderId: string): string {
  return `held:${orderId}`;
}

// orders/R1.4
export class HoldRegistry {
  private holds = new Set<string>();

  clear(): void {
    this.holds.clear();
  }
}

export function applyCouponDiscount(total: number, percent: number): number {
  return roundMoney(total * (1 - percent / 100));
}

export const OrderDebugFlags = { verbose: false };

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
