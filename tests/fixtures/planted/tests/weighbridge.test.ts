import { zeroBelowFloor } from "../src/weighbridge.js";

declare function it(title: string, fn: () => void): void;

it("kilo output keeps two decimals", () => {
  zeroBelowFloor(12.34, 0);
});

it("existing readings keep their value", () => {
  zeroBelowFloor(5, 0);
});

it("noise under the floor reads zero", () => {
  zeroBelowFloor(0.1, 1);
});
