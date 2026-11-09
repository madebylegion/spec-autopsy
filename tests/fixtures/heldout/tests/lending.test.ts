import { describe, expect, it } from 'vitest';
import { checkOutBook, overdueCharge } from '../src/lending.js';
import { formatIsbn } from '../src/catalog-utils.js';

describe('lending', () => {
  // lending/R1.1
  it('records a loan due 21 days after checkout', () => {
    const loan = checkOutBook(0, 2, 'm1', '9780000000002', new Date('2026-01-01T00:00:00Z'));
    expect(loan.dueDate.toISOString()).toBe('2026-01-22T00:00:00.000Z');
  });

  it('rejects a new loan when the member has five active loans', () => {
    expect(() => checkOutBook(5, 2, 'm1', '9780000000002', new Date())).toThrow('loan-limit-reached');
  });

  it('charges 25 cents per late day', () => {
    const due = new Date('2026-01-22T00:00:00Z');
    expect(overdueCharge(due, new Date('2026-01-25T00:00:00Z'))).toBe(75);
    expect(overdueCharge(due, due)).toBe(0);
  });
});

describe('catalog', () => {
  it('formats a thirteen digit ISBN with hyphens', () => {
    expect(formatIsbn('9780306406157')).toBe('978-0-30640-615-7');
  });
});
