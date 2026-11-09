interface Loan {
  memberId: string;
  isbn: string;
  dueDate: Date;
}

const LOAN_DAYS = 21;
const MAX_ACTIVE_LOANS = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// lending/R1.3
export function assertCopyAvailable(copiesAvailable: number): void {
  if (copiesAvailable < 1) {
    throw new Error('out-of-copies');
  }
}

export function enforceLoanLimit(activeLoans: number): void {
  if (activeLoans >= MAX_ACTIVE_LOANS) {
    throw new Error('loan-limit-reached');
  }
}

// lending/R1.1
export function checkOutBook(
  activeLoans: number,
  copiesAvailable: number,
  memberId: string,
  isbn: string,
  today: Date,
): Loan {
  enforceLoanLimit(activeLoans);
  assertCopyAvailable(copiesAvailable);
  return { memberId, isbn, dueDate: new Date(today.getTime() + LOAN_DAYS * DAY_MS) };
}

export function overdueCharge(dueDate: Date, returnedOn: Date): number {
  const lateMs = returnedOn.getTime() - dueDate.getTime();
  if (lateMs <= 0) return 0;
  return Math.ceil(lateMs / DAY_MS) * 25;
}
