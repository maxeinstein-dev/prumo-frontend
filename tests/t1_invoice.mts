import assert from 'node:assert/strict';
import { ACCOUNTS, CLOSED, INV_CTX, M, OPEN, check, defaultSelection, mkPreview, mkRow, show } from './harness.mts';

console.log('\n[F1] invoice computed from the credit rows that will be sent');

const inst = (number: number, total: number, prepaid: number) => ({
  number, total, prepaid, baseDescription: 'x', installmentId: `i-${number}-${total}`, futureCount: total - number,
});
const notebook = mkRow({ description: 'Notebook 3/10', amount: 300, status: 'new', installment: inst(3, 10, 0) });
const curso = mkRow({ description: 'Curso 2/12 +1', amount: 200, status: 'new', installment: inst(2, 12, 1) });
const mercado = mkRow({ description: 'Mercado', amount: 450.5, status: 'changed' });
const rows = [notebook, curso, mercado];
const k = (r: unknown) => M.rowKey(r);
const invoice = (sel: Record<string, boolean>, options = CLOSED, ctx = INV_CTX, list = rows) =>
  M.invoiceForSelection(list, sel, options, ctx);

check('default selection ticks the two new rows and not the changed one', () => {
  const sel = defaultSelection(rows);
  show('selected', [sel[k(notebook)], sel[k(curso)], sel[k(mercado)]]);
  assert.deepEqual([sel[k(notebook)], sel[k(curso)], sel[k(mercado)]], [true, true, false]);
});

check('closed month, default selection -> amount 500.00 and willPay', () => {
  const inv = invoice(defaultSelection(rows));
  show('invoice', inv);
  assert.equal(inv.cents, 50000);
  assert.equal(inv.amount, 500);
  assert.equal(inv.rowCount, 2);
  assert.equal(inv.willPay, true);
  assert.equal(inv.reason, null);
});

check('server number (all credit new/changed rows = 950.50) differs from what is recorded', () => {
  const server = mkPreview(rows).invoice;
  server.amount = 950.5;
  const inv = invoice(defaultSelection(rows));
  show('server amount (cents) vs computed (cents)', [M.toCents(server.amount), inv.cents]);
  assert.notEqual(M.toCents(server.amount), inv.cents);
});

check('ticking Mercado -> 950.50', () => {
  const sel = { ...defaultSelection(rows), [k(mercado)]: true };
  const inv = invoice(sel);
  show('invoice', { cents: inv.cents, amount: inv.amount, rowCount: inv.rowCount, willPay: inv.willPay });
  assert.equal(inv.cents, 95050);
  assert.equal(inv.amount, 950.5);
  assert.equal(inv.willPay, true);
});

check('unticking every credit row -> willPay false, reason names the cause', () => {
  const sel = Object.fromEntries(rows.map((r) => [k(r), false]));
  const inv = invoice(sel);
  show('invoice', inv);
  assert.equal(inv.willPay, false);
  assert.equal(inv.cents, 0);
  assert.equal(inv.reason, 'nenhuma compra de cartão selecionada');
});

check('a ticked legacy-duplicate credit row is included in the sum', () => {
  const legacy = mkRow({ description: 'Posto', amount: 80.25, status: 'legacy-duplicate' });
  const list = [...rows, legacy];
  const sel = { ...defaultSelection(list), [k(legacy)]: true };
  const inv = invoice(sel, CLOSED, INV_CTX, list);
  show('invoice', { cents: inv.cents, rowCount: inv.rowCount });
  assert.equal(inv.cents, 50000 + 8025);
  assert.equal(inv.rowCount, 3);
  // and it is NOT included while unticked (default)
  assert.equal(invoice(defaultSelection(list), CLOSED, INV_CTX, list).cents, 50000);
});

check('a duplicate row is never included, even when forced to true', () => {
  const dup = mkRow({ description: 'Netflix', amount: 55.9, status: 'duplicate' });
  const list = [...rows, dup];
  const sel = { ...defaultSelection(list), [k(dup)]: true };
  const inv = invoice(sel, CLOSED, INV_CTX, list);
  show('invoice', { cents: inv.cents, rowCount: inv.rowCount });
  assert.equal(inv.cents, 50000);
  assert.equal(inv.rowCount, 2);
});

check('rows of other sections never count toward the invoice', () => {
  const bill = mkRow({ section: 'bills', accountId: 'acc-main', description: 'Aluguel', amount: 1500, status: 'new' });
  const list = [...rows, bill];
  assert.equal(invoice(defaultSelection(list), CLOSED, INV_CTX, list).cents, 50000);
});

check('replaces-future credit row (default ticked) counts', () => {
  const rf = mkRow({ description: 'TV 4/10', amount: 100, status: 'replaces-future' });
  const list = [...rows, rf];
  const inv = invoice(defaultSelection(list), CLOSED, INV_CTX, list);
  show('invoice', { cents: inv.cents, rowCount: inv.rowCount });
  assert.equal(inv.cents, 60000);
});

check('integer-cent parity with Math.round(Math.abs(a)*100+1e-6) for 1.005 and 0.1+0.2', () => {
  for (const a of [1.005, 0.1 + 0.2, 450.5, 0.29, 19.99, 1234567.89, -12.34]) {
    assert.equal(M.toCents(a), Math.round(Math.abs(a) * 100 + 1e-6));
  }
  const r1 = mkRow({ description: 'a', amount: 1.005 });
  const r2 = mkRow({ description: 'b', amount: 0.1 + 0.2 });
  const list = [r1, r2];
  const inv = invoice(defaultSelection(list), CLOSED, INV_CTX, list);
  show('toCents(1.005), toCents(0.1+0.2), invoice', [M.toCents(1.005), M.toCents(0.1 + 0.2), inv.cents, inv.amount]);
  assert.equal(M.toCents(1.005), 101);
  assert.equal(M.toCents(0.1 + 0.2), 30);
  assert.equal(inv.cents, 131);
  assert.equal(inv.amount, 1.31);
});

check('open month -> willPay false with reason "mês aberto"', () => {
  const inv = invoice(defaultSelection(rows), OPEN);
  show('invoice', { willPay: inv.willPay, reason: inv.reason, cents: inv.cents });
  assert.equal(inv.willPay, false);
  assert.equal(inv.reason, 'mês aberto');
});

check('closed month with payInvoice off -> reason "opção desligada"', () => {
  const inv = invoice(defaultSelection(rows), { ...CLOSED, payInvoice: false });
  assert.equal(inv.willPay, false);
  assert.equal(inv.reason, 'opção desligada');
});

check('bills account is a CREDIT account -> canPay false, "a conta de contas fixas é um cartão"', () => {
  const inv = invoice(defaultSelection(rows), CLOSED, { ...INV_CTX, sourceAccountId: 'acc-card2' });
  show('invoice', { canPay: inv.canPay, willPay: inv.willPay, reason: inv.reason });
  assert.equal(inv.canPay, false);
  assert.equal(inv.willPay, false);
  assert.equal(inv.reason, 'a conta de contas fixas é um cartão');
});

check('bills account is the card itself -> canPay false', () => {
  const inv = invoice(defaultSelection(rows), CLOSED, { ...INV_CTX, sourceAccountId: 'acc-card', creditAccountId: 'acc-card' });
  assert.equal(inv.canPay, false);
  assert.ok(inv.reason);
});

check('bills account missing from the accounts list -> canPay false', () => {
  const inv = invoice(defaultSelection(rows), CLOSED, { ...INV_CTX, sourceAccountId: 'ghost' });
  assert.equal(inv.canPay, false);
  assert.equal(inv.willPay, false);
  assert.equal(inv.reason, 'a conta de contas fixas não foi encontrada');
});

check('canPay true for a regular non-credit source account', () => {
  const inv = invoice(defaultSelection(rows));
  assert.equal(inv.canPay, true);
  assert.equal(ACCOUNTS.find((a) => a.id === 'acc-main')?.type, 'CHECKING');
});
