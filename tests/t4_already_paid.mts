import assert from 'node:assert/strict';
import { M, check, mkRow, show } from './harness.mts';

console.log('\n[already paid] the invoice of a month is recorded once');

const { invoiceForSelection, INVOICE_REASON } = M;
const rows = [mkRow({ status: 'changed', amount: 13.9 })];
const sel = { [M.rowKey(rows[0])]: true };
const options = { closedMonth: true, payInvoice: true, generateFutureInstallments: false };
const ctx = {
  sourceAccountId: 'bills',
  creditAccountId: 'card',
  hasInvoice: true,
  accounts: [
    { id: 'bills', type: 'CHECKING' },
    { id: 'card', type: 'CREDIT' },
  ],
};

check('without an existing payment the invoice is recorded', () => {
  const normal = invoiceForSelection(rows, sel, options, ctx);
  assert.equal(normal.willPay, true);
  assert.equal(normal.reason, null);
});

check('with an existing payment it is NOT recorded, with the reason; the amount is still reported', () => {
  const paid = invoiceForSelection(rows, sel, options, { ...ctx, alreadyPaid: true });
  show('invoice', paid);
  assert.equal(paid.willPay, false);
  assert.equal(paid.reason, INVOICE_REASON.alreadyPaid);
  assert.equal(paid.cents, 1390);
});

check('an open month and the option off keep their own reasons first', () => {
  assert.equal(invoiceForSelection(rows, sel, { ...options, closedMonth: false }, { ...ctx, alreadyPaid: true }).reason, INVOICE_REASON.openMonth);
  assert.equal(invoiceForSelection(rows, sel, { ...options, payInvoice: false }, { ...ctx, alreadyPaid: true }).reason, INVOICE_REASON.optionOff);
});
