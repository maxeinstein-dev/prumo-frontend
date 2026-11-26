import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// View model of the credit card statement panel (utils/invoiceStatement.ts). STATEMENT_MODULE points at a mutated copy
// for the bite-checks.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(process.env.STATEMENT_MODULE || frontSrc('utils/invoiceStatement.ts')).href);

console.log('\n[IS] statement view of an invoice');

const november = {
  previousBalance: 2000.370000000012, currentExpenses: 500.25, currentPayments: 0, total: 2500.620000000012, isPaid: false,
  statementTotal: 500.25, outstandingFromPrevious: 2000.37, debtTotal: 2500.62,
  closingDate: '2026-11-02', dueDate: '2026-11-09', state: 'open',
  forecast: {
    applicable: true, total: 162.9, expectedClosingTotal: 663.15,
    items: [
      { recurringTransactionId: 'a', description: 'Ebn *Spotify', date: '2026-10-08', amount: 12.9, followsLastAmount: true },
      { recurringTransactionId: 'b', description: 'Jim.Com* Curso Exemplo', date: '2026-10-19', amount: 150, followsLastAmount: false },
    ],
  },
};

check('IS-a: November: statement, open amount, debt, dates and state kept apart', () => {
  const v = S.buildInvoiceStatement(november);
  assert.equal(v.statementTotal, 500.25);
  assert.equal(v.outstanding, 2000.37);
  assert.equal(v.debtTotal, 2500.62);
  assert.equal(v.payments, 0);
  assert.equal(v.state, 'open');
  assert.equal(v.closingLabel, '02/11');
  assert.equal(v.dueLabel, '09/11');
});

check('IS-b: forecast lists each item with dd/MM and adds posted + forecast = expected at closing', () => {
  const f = S.buildInvoiceStatement(november).forecast;
  assert.deepEqual(f.items.map((i: any) => [i.description, i.dateLabel, i.amount, i.estimated]),
    [['Ebn *Spotify', '08/10', 12.9, true], ['Jim.Com* Curso Exemplo', '19/10', 150, false]]);
  assert.equal(f.total, 162.9);
  assert.equal(f.posted, 500.25);
  assert.equal(f.expectedClosingTotal, 663.15);
});

check('IS-c: a closed invoice has no forecast and reads "fechou em"', () => {
  const v = S.buildInvoiceStatement({ ...november, state: 'closed', closingDate: '2026-10-02', dueDate: '2026-10-09',
    forecast: { applicable: false, items: november.forecast.items, total: 162.9, expectedClosingTotal: 663.15 } });
  assert.equal(v.forecast, null, 'closed: nothing is expected any more, even if items came');
  assert.equal(v.state, 'closed');
  assert.deepEqual([v.closingLabel, v.dueLabel], ['02/10', '09/10']);
});

check('IS-d: an open invoice with nothing to forecast shows no forecast block', () => {
  assert.equal(S.buildInvoiceStatement({ ...november, forecast: { applicable: true, items: [], total: 0, expectedClosingTotal: 500.25 } }).forecast, null);
});

check('IS-e: an older backend (legacy fields only) still builds a panel: paid -> paid, else no badge (state unknown)', () => {
  const legacy = { previousBalance: 100, currentExpenses: 50, currentPayments: 150, total: 0, isPaid: true };
  const v = S.buildInvoiceStatement(legacy);
  assert.equal(v.state, 'paid');
  assert.equal(v.statementTotal, 50);
  assert.equal(v.outstanding, 100);
  assert.equal(v.payments, 150);
  assert.equal(v.debtTotal, 0, 'previous + statement - payments');
  assert.deepEqual([v.closingLabel, v.dueLabel], [null, null]);
  assert.equal(S.buildInvoiceStatement({ ...legacy, isPaid: false, currentPayments: 0 }).state, null, 'unknown: the badge is hidden');
  assert.equal(S.buildInvoiceStatement({ ...legacy, isPaid: false, currentPayments: 200 }).debtTotal, 0, 'never negative');
});

check('IS-f: dates are cut from the string, never moved by the time zone; junk gives an empty label', () => {
  assert.equal(S.dayMonthLabel('2026-11-02'), '02/11');
  assert.equal(S.dayMonthLabel('2026-11-02T00:00:00.000Z'), '02/11');
  assert.equal(S.dayMonthLabel('2026-01-01T03:00:00.000Z'), '01/01');
  for (const bad of [null, undefined, '', 'x', '2026-1-2']) assert.equal(S.dayMonthLabel(bad), '');
});

check('IS-g: forecast total sums whole cents (0.1 + 0.2 = 0.3) and an income recurrence stays negative', () => {
  const v = S.buildInvoiceStatement({ ...november, forecast: { applicable: true, total: 0, expectedClosingTotal: 0, items: [
    { description: 'a', date: '2026-10-08', amount: 0.1 }, { description: 'b', date: '2026-10-09', amount: 0.2 },
    { description: 'c', date: '2026-10-10', amount: -50 } ] } });
  assert.equal(v.forecast.total, -49.7);
  assert.equal(v.forecast.expectedClosingTotal, 450.55);
  const sevens = S.buildInvoiceStatement({ ...november, statementTotal: 0, forecast: { applicable: true, total: 0, expectedClosingTotal: 0, items: [1, 2, 3].map((n) => ({ description: 'x', date: `2026-10-0${n}`, amount: 0.07 })) } });
  assert.equal(sevens.forecast.total, 0.21);
});

check('IS-h: null input gives no view; payments are shown separately from the statement', () => {
  assert.equal(S.buildInvoiceStatement(null), null);
  const v = S.buildInvoiceStatement({ ...november, currentPayments: 2000.37, debtTotal: 500.25, state: 'open' });
  assert.equal(v.payments, 2000.37);
  assert.equal(v.statementTotal, 500.25);
  assert.equal(v.debtTotal, 500.25);
});

check('IS-i: one-cent residues are not shown (outstanding, payments, debt); a paid statement owes 0', () => {
  const v = S.buildInvoiceStatement({ previousBalance: 0.01, currentExpenses: 50, currentPayments: 0.01, total: 50.02, isPaid: false, state: 'open' });
  assert.equal(v.outstanding, 0);
  assert.equal(v.payments, 0);
  assert.equal(v.debtTotal, 50, 'legacy view: previous + statement - payments with residues dropped');
  const paid = S.buildInvoiceStatement({ ...november, state: 'paid', isPaid: true, debtTotal: 5 });
  assert.equal(paid.debtTotal, 0);
  assert.equal(S.buildInvoiceStatement({ ...november, state: 'closed', debtTotal: 0.01 }).debtTotal, 0, 'a lone cent is not a debt');
  assert.equal(S.buildInvoiceStatement({ ...november, state: 'closed', debtTotal: 0.02 }).debtTotal, 0.02, 'two cents are');
});
