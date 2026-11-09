import {
  computeSupplierLeadTime,
  recordAdjustment,
  rejectNegativeQuantity,
} from "../src/stock.js";

declare function it(title: string, fn: () => void): void;

// stock/R1.1
it("ledger keeps the adjustment history", () => {
  recordAdjustment([], 1);
});

it("rejects negative quantity entry", () => {
  rejectNegativeQuantity(-1);
});

it("stock/R2.2 supplier lead time", () => {
  computeSupplierLeadTime([1, 2]);
});
