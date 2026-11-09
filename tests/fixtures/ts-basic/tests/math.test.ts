export {};
declare function describe(title: string, fn: () => void): void;
declare function test(title: string, fn: () => void): void;
declare const it: {
  (title: string, fn: () => void): void;
  each(table: unknown[]): (title: string, fn: () => void) => void;
};

const dynamicTitle = "dynamic";

describe("math suite", () => {
  it("adds numbers", () => {});
  test("subtracts numbers", () => {});
  it.each([1, 2])("each case", () => {});
  it(dynamicTitle, () => {});
  it(`template title`, () => {});
});
