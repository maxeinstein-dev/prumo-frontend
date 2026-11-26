import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CLOSED, CONFIRM_CTX, INV_CTX, M, OPEN, frontSrc, check, defaultSelection, mkPreview, mkRow, show } from './harness.mts';

const wbPath =
  process.env.MAXFIN_WORKBOOK_MODULE || frontSrc('utils/maxfinWorkbook.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W: any = await import(pathToFileURL(wbPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const { invoiceForSelection, INVOICE_REASON } = M;

console.log('\n[C1] negative sheet values are credits: the invoice is purchases minus refunds');

const buy = (amount: number, o: Record<string, Any> = {}) => mkRow({ section: 'credit', type: 'EXPENSE', amount, ...o });
const refund = (amount: number, o: Record<string, Any> = {}) =>
  mkRow({ section: 'credit', type: 'INCOME', amount, description: 'Estorno', notes: 'valor negativo na planilha: lançado como crédito', ...o });
const inv = (rows: Any[], options = CLOSED, ctx: Any = INV_CTX) => invoiceForSelection(rows, defaultSelection(rows), options, ctx);

check('refund smaller than the purchases: net 250.00 is paid, with purchases and refunds reported apart', () => {
  const out = inv([buy(300), refund(50)]);
  show('invoice', out);
  assert.equal(out.cents, 25000);
  assert.equal(out.amount, 250);
  assert.equal(out.purchaseCents, 30000);
  assert.equal(out.refundCents, 5000);
  assert.equal(out.rowCount, 2);
  assert.equal(out.willPay, true);
  assert.equal(out.reason, null);
});

check('refund equal to the purchases: net 0, nothing is paid, the reason names the credits', () => {
  const out = inv([buy(300), refund(300)]);
  show('invoice', { cents: out.cents, willPay: out.willPay, reason: out.reason });
  assert.equal(out.cents, 0);
  assert.equal(out.willPay, false);
  assert.equal(out.reason, INVOICE_REASON.creditsCover);
  assert.equal(INVOICE_REASON.creditsCover, 'os créditos igualam ou superam as compras selecionadas');
});

check('refund larger than the purchases: negative net, nothing is paid, same reason', () => {
  const out = inv([buy(100), refund(150)]);
  show('invoice', { cents: out.cents, amount: out.amount, willPay: out.willPay, reason: out.reason });
  assert.equal(out.cents, -5000);
  assert.equal(out.amount, -50);
  assert.equal(out.willPay, false);
  assert.equal(out.reason, INVOICE_REASON.creditsCover);
});

check('only refunds selected: the credits reason, not "nenhuma compra"; no credit row at all keeps "nenhuma compra"', () => {
  assert.equal(inv([refund(20)]).reason, INVOICE_REASON.creditsCover);
  assert.equal(inv([refund(20)]).rowCount, 1);
  const rows = [buy(10), refund(5)];
  const none = invoiceForSelection(rows, {}, CLOSED, INV_CTX);
  assert.equal(none.reason, INVOICE_REASON.noCardRows);
  assert.equal(none.rowCount, 0);
});

check('integer cents: 0.30 of purchases against 0.10 + 0.20 of refunds nets exactly 0', () => {
  assert.notEqual(0.3 - (0.1 + 0.2), 0, 'the float difference would not be zero');
  const out = inv([buy(0.3), refund(0.1), refund(0.2)]);
  assert.equal(out.cents, 0);
  assert.equal(out.reason, INVOICE_REASON.creditsCover);
  const net = inv([buy(0.3), buy(1.005), refund(0.1)]);
  assert.equal(net.cents, 30 + 101 - 10);
});

check('the earlier reasons keep their precedence over the credits reason', () => {
  const rows = [buy(100), refund(150)];
  assert.equal(inv(rows, OPEN).reason, INVOICE_REASON.openMonth);
  assert.equal(inv(rows, { ...CLOSED, payInvoice: false }).reason, INVOICE_REASON.optionOff);
  assert.equal(inv(rows, CLOSED, { ...INV_CTX, hasInvoice: false }).reason, INVOICE_REASON.noInvoice);
  assert.equal(inv(rows, CLOSED, { ...INV_CTX, alreadyPaid: true }).reason, INVOICE_REASON.alreadyPaid);
  assert.equal(inv(rows, CLOSED, { ...INV_CTX, sourceAccountId: 'acc-card2' }).reason, INVOICE_REASON.sourceIsCard);
});

check('refunds of other blocks and unsendable refunds never touch the invoice', () => {
  const billsCredit = mkRow({ section: 'bills', accountId: 'acc-main', type: 'INCOME', amount: 40 });
  const dupRefund = refund(70, { status: 'duplicate' });
  const rows = [buy(100), billsCredit, dupRefund];
  const out = invoiceForSelection(rows, { ...defaultSelection(rows), [M.rowKey(dupRefund)]: true }, CLOSED, INV_CTX);
  assert.equal(out.cents, 10000);
  assert.equal(out.refundCents, 0);
  assert.equal(out.rowCount, 1);
});

console.log('\n[C2] footer totals follow the row type; the request keeps it');

check('buildConfirmPayload: a card refund counts as receita, an income-block negative as despesa; invoice is the net', () => {
  const back = mkRow({ section: 'income', accountId: 'acc-main', type: 'EXPENSE', amount: 15, description: 'Devolução' });
  const salary = mkRow({ section: 'income', accountId: 'acc-main', type: 'INCOME', amount: 1000 });
  const rows = [buy(300), refund(50), back, salary];
  const built = M.buildConfirmPayload(mkPreview(rows), defaultSelection(rows), {}, CONFIRM_CTX);
  const t = built.totals;
  show('totals', { ...t, invoice: { cents: t.invoice.cents, willPay: t.invoice.willPay } });
  assert.equal(t.incomeCount, 2);
  assert.equal(t.incomeTotal, 1050);
  assert.equal(t.expenseCount, 2);
  assert.equal(t.expenseTotal, 315);
  assert.equal(t.invoice.cents, 25000);
  assert.equal(t.invoice.willPay, true);
  const sentRefund = built.payload.rows.find((r: Any) => r.description === 'Estorno');
  assert.equal(sentRefund.type, 'INCOME');
  assert.equal(sentRefund.amount, 50);
  assert.equal(sentRefund.section, 'credit');
});

check('reversedRowKind: credits in the expense blocks, expenses in the income block, null otherwise', () => {
  const cases: Array<[string, string, string | null]> = [
    ['credit', 'INCOME', 'credit'], ['bills', 'INCOME', 'credit'], ['debit', 'INCOME', 'credit'], ['income', 'EXPENSE', 'debit'],
    ['income', 'INCOME', null], ['credit', 'EXPENSE', null], ['bills', 'EXPENSE', null],
  ];
  for (const [section, type, kind] of cases) assert.equal(M.reversedRowKind({ section, type }), kind, `${section}/${type}`);
});

check('toSignedCents keeps the sign with the same rounding as toCents', () => {
  const values = [-12.345, -0.1, 0, 1.005, 250];
  show('signed cents', values.map((v) => [v, M.toSignedCents(v)]));
  assert.deepEqual(values.map((v) => M.toSignedCents(v)), [-1235, -10, 0, 101, 25000]);
});

console.log('\n[C3] workbook: invoices recorded follow the same per-month rule');

check('a month whose refunds cover its purchases records no invoice; the others add their net', () => {
  const mk = (key: string, rows: Any[]) => {
    const [year, month] = key.split('-').map(Number);
    return mkPreview(rows, { month: { year, month }, monthKey: key });
  };
  const months = [mk('2026-07', [buy(300), refund(50)]), mk('2026-08', [buy(100), refund(100)]), mk('2026-09', [buy(80.1), refund(0.1)])];
  const plan = W.buildWorkbookPlan({ months }, W.reconcileWorkbookSelection({}, {}, months), {}, CONFIRM_CTX);
  show('per month', plan.steps.map((s: Any) => [s.label, s.totals.invoice.cents, s.totals.invoice.willPay, s.totals.invoice.reason]));
  assert.deepEqual(plan.steps.map((s: Any) => s.totals.invoice.willPay), [true, false, true]);
  assert.equal(plan.steps[1].totals.invoice.reason, INVOICE_REASON.creditsCover);
  assert.equal(plan.totals.invoiceCount, 2);
  assert.equal(plan.totals.invoiceCents, 25000 + 8000);
  assert.equal(plan.totals.invoiceTotal, 330);
  assert.equal(plan.totals.incomeCents, 5000 + 10000 + 10);
  assert.equal(plan.totals.expenseCents, 30000 + 10000 + 8010);
});
