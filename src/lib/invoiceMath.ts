// Pure, side-effect-free calculation helpers for invoices and FX.
// Kept separate from page components specifically so they're easy to
// unit test — this is exactly the kind of accounting-adjacent logic
// where a silent regression (wrong VAT rounding, wrong FX math) is
// costly and hard to notice by eye.

export interface InvoiceLineInput {
  quantity: number;
  unit_price: number;
  discount_pct?: number;
  vat_rate?: number;
}

export interface InvoiceLineTotals {
  subtotal: number;
  vat_amount: number;
  total: number;
}

/** Rounds to 2 decimal places using standard half-up rounding. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Computes subtotal, VAT and total for a single invoice line. */
export function computeLineTotals(line: InvoiceLineInput): InvoiceLineTotals {
  const discountPct = line.discount_pct ?? 0;
  const vatRate = line.vat_rate ?? 0;
  const gross = line.quantity * line.unit_price;
  const subtotal = round2(gross * (1 - discountPct / 100));
  const vat_amount = round2(subtotal * (vatRate / 100));
  return { subtotal, vat_amount, total: round2(subtotal + vat_amount) };
}

/** Sums totals across every line of an invoice. */
export function computeInvoiceTotals(lines: InvoiceLineInput[]): InvoiceLineTotals {
  return lines.reduce<InvoiceLineTotals>(
    (acc, line) => {
      const l = computeLineTotals(line);
      return {
        subtotal: round2(acc.subtotal + l.subtotal),
        vat_amount: round2(acc.vat_amount + l.vat_amount),
        total: round2(acc.total + l.total),
      };
    },
    { subtotal: 0, vat_amount: 0, total: 0 },
  );
}

/** Converts an amount from one currency to another using a given rate. */
export function convertAmount(amount: number, rate: number): number {
  return round2(amount * rate);
}

/**
 * Realized FX gain/loss when an invoice issued at `invoiceRate` is
 * settled at `settlementRate`. Positive = gain, negative = loss, in the
 * tenant's base currency. Mirrors the SQL logic in record_fx_settlement()
 * so the two must be kept in sync if either changes.
 */
export function computeFxGainLoss(invoiceAmount: number, invoiceRate: number, settlementRate: number): number {
  return round2(invoiceAmount * (settlementRate - invoiceRate));
}

/** True if a set of debit/credit transaction lines balances to zero. */
export function isBalancedEntry(lines: { debit: number; credit: number }[]): boolean {
  const totalDebit = round2(lines.reduce((s, l) => s + l.debit, 0));
  const totalCredit = round2(lines.reduce((s, l) => s + l.credit, 0));
  return totalDebit === totalCredit;
}
