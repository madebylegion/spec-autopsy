// Math helpers used by the ts-basic fixture.

export function add(a: number, b: number): number {
  return a + b;
}

function hidden(x: number): number {
  return x * 2;
}

export const twice = (x: number): number => x * 2;

const LIMIT = 100;

export interface Point {
  x: number;
  y: number;
}

type Id = string;

export enum Color {
  Red,
  Green,
}

export class Calculator {
  total = 0;

  add(n: number): number {
    this.total += n;
    return this.total;
  }

  reset(): void {
    this.total = 0;
  }
}

class Internal {
  run(): void {}
}

function listed(): string {
  return "listed";
}

export { hidden as shown, LIMIT };

export { thing } from "./other.js";

export default function main(): void {
  // entry point
}
