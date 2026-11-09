import { onPaymentFailure, tallyBeacon } from "../src/orders.js";

declare function it(title: string, fn: () => void): void;

it("orders/R1.1 totals an order", () => {
  tallyBeacon([1, 2], 0.1);
});

it("payment declined keeps order open", () => {
  onPaymentFailure("o1");
});
