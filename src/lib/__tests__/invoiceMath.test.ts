import { describe, it, expect } from 'vitest';
import {
  round2,
  computeLineTotals,
  computeInvoiceTotals,
  convertAmount,
  computeFxGainLoss,
  isBalancedEntry,
} from '../invoiceMath';

describe('round2', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10);
    expect(round2(1234.5)).toBe(1234.5);
  });
});

describe('computeLineTotals', () => {
  it('computes a simple line with no discount or VAT', () => {
    const result = computeLineTotals({ quantity: 2, unit_price: 100 });
    expect(result).toEqual({ subtotal: 200, vat_amount: 0, total: 200 });
  });

  it('applies a discount before VAT', () => {
    const result = computeLineTotals({ quantity: 1, unit_price: 1000, discount_pct: 10, vat_rate: 18 });
    // 1000 - 10% = 900 subtotal, VAT 18% of 900 = 162, total 1062
    expect(result.subtotal).toBe(900);
    expect(result.vat_amount).toBe(162);
    expect(result.total).toBe(1062);
  });

  it('handles fractional quantities (e.g. weight-based products)', () => {
    const result = computeLineTotals({ quantity: 2.5, unit_price: 4000, vat_rate: 18 });
    expect(result.subtotal).toBe(10000);
    expect(result.vat_amount).toBe(1800);
  });
});

describe('computeInvoiceTotals', () => {
  it('sums multiple lines correctly', () => {
    const result = computeInvoiceTotals([
      { quantity: 1, unit_price: 500, vat_rate: 18 },
      { quantity: 3, unit_price: 200, vat_rate: 18 },
    ]);
    // line1: 500 + 90 vat = 590 ; line2: 600 + 108 vat = 708
    expect(result.subtotal).toBe(1100);
    expect(result.vat_amount).toBe(198);
    expect(result.total).toBe(1298);
  });

  it('returns zeros for an empty invoice', () => {
    expect(computeInvoiceTotals([])).toEqual({ subtotal: 0, vat_amount: 0, total: 0 });
  });
});

describe('convertAmount', () => {
  it('converts using the given FX rate', () => {
    expect(convertAmount(100, 610)).toBe(61000);
    expect(convertAmount(61000, 1 / 610)).toBe(100);
  });
});

describe('computeFxGainLoss', () => {
  it('is zero when the rate did not move', () => {
    expect(computeFxGainLoss(1000, 610, 610)).toBe(0);
  });

  it('is positive (a gain) when the foreign currency strengthened', () => {
    // Invoiced at 610, settled at 615 -> gained value in base currency
    expect(computeFxGainLoss(1000, 610, 615)).toBe(5000);
  });

  it('is negative (a loss) when the foreign currency weakened', () => {
    expect(computeFxGainLoss(1000, 610, 600)).toBe(-10000);
  });
});

describe('isBalancedEntry', () => {
  it('accepts a balanced double-entry', () => {
    expect(isBalancedEntry([{ debit: 1000, credit: 0 }, { debit: 0, credit: 1000 }])).toBe(true);
  });

  it('rejects an unbalanced entry', () => {
    expect(isBalancedEntry([{ debit: 1000, credit: 0 }, { debit: 0, credit: 900 }])).toBe(false);
  });

  it('accepts a balanced multi-line entry', () => {
    expect(isBalancedEntry([
      { debit: 590, credit: 0 },
      { debit: 0, credit: 500 },
      { debit: 0, credit: 90 },
    ])).toBe(true);
  });
});
