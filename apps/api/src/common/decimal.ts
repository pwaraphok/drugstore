import Decimal from 'decimal.js';
import { UnprocessableEntityException } from '@nestjs/common';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

export function d(value: string | number | Decimal | null | undefined): Decimal {
  if (value == null || value === '') {
    throw new UnprocessableEntityException('จำนวนไม่ถูกต้อง');
  }
  let n: Decimal;
  try { n = new Decimal(value); } catch { throw new UnprocessableEntityException('จำนวนไม่ถูกต้อง'); }
  if (!n.isFinite()) {
    throw new UnprocessableEntityException('จำนวนไม่ถูกต้อง');
  }
  return n;
}

export function money(value: string | number | Decimal): string {
  return d(value).toFixed(2);
}

export function qty(value: string | number | Decimal, places = 6): string {
  return d(value).toFixed(places);
}

export function assertPositiveQuantity(value: string, step: string): void {
  const n = d(value);
  if (n.decimalPlaces() > 6 || n.abs().gte('1000000000000')) throw new UnprocessableEntityException('จำนวนเกินขอบเขต');
  if (n.lte(0)) {
    throw Object.assign(new Error('QUANTITY_MUST_BE_POSITIVE'), { code: 'QUANTITY_MUST_BE_POSITIVE' });
  }
  const s = d(step);
  if (s.lte(0)) {
    throw Object.assign(new Error('INVALID_QUANTITY_STEP'), { code: 'INVALID_QUANTITY_STEP' });
  }
  if (!n.div(s).isInteger()) {
    throw Object.assign(new Error('QUANTITY_STEP_MISMATCH'), { code: 'QUANTITY_STEP_MISMATCH' });
  }
}

export function assertNonNegative(value: string, field: string): void {
  if (d(value).lt(0)) {
    throw Object.assign(new Error(`${field}_NEGATIVE`), { code: 'NEGATIVE_NOT_ALLOWED' });
  }
}
