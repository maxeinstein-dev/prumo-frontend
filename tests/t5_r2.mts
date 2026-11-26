import assert from 'node:assert/strict';
import { CLOSED, CONFIRM_CTX, INV_CTX, M, OPEN, check, defaultSelection, mkPreview, mkRow, show } from './harness.mts';

const { invoiceForRows, invoiceForSelection, INVOICE_REASON, buildConfirmPayload, confirmBlocker } = M;

console.log('\n[R2-1] no invoice from the server -> no promise of a payment');

const card = (o: Record<string, unknown> = {}) => mkRow({ status: 'new', amount: 80, ...o });
const rows = [card(), card({ amount: 20.5 })];
const sel = defaultSelection(rows);

check('hasInvoice false: nothing is recorded, the reason says why, the amount is still reported', () => {
  const inv = invoiceForSelection(rows, sel, CLOSED, { ...INV_CTX, hasInvoice: false });
  show('invoice', inv);
  assert.equal(inv.willPay, false);
  assert.equal(inv.reason, INVOICE_REASON.noInvoice);
  assert.equal(inv.cents, 10050);
  assert.equal(inv.canPay, true);
});

check('a context without hasInvoice fails closed (nothing is promised)', () => {
  const { hasInvoice: omitted, ...legacy } = INV_CTX;
  void omitted;
  assert.equal(invoiceForSelection(rows, sel, CLOSED, legacy).willPay, false);
});

check('reason precedence: open month > option off > no invoice > already paid > account problem', () => {
  const noInv = { ...INV_CTX, hasInvoice: false, alreadyPaid: true };
  assert.equal(invoiceForSelection(rows, sel, OPEN, noInv).reason, INVOICE_REASON.openMonth);
  assert.equal(invoiceForSelection(rows, sel, { ...CLOSED, payInvoice: false }, noInv).reason, INVOICE_REASON.optionOff);
  assert.equal(invoiceForSelection(rows, sel, CLOSED, noInv).reason, INVOICE_REASON.noInvoice);
  assert.equal(invoiceForSelection(rows, sel, CLOSED, { ...INV_CTX, alreadyPaid: true }).reason, INVOICE_REASON.alreadyPaid);
  assert.equal(invoiceForSelection(rows, sel, CLOSED, { ...INV_CTX, sourceAccountId: 'acc-card2' }).reason, INVOICE_REASON.sourceIsCard);
});

check('buildConfirmPayload: preview.invoice null -> willPay false even with a closed month and credit rows', () => {
  const preview = mkPreview(rows, { invoice: null });
  const built = buildConfirmPayload(preview, sel, {}, CONFIRM_CTX);
  show('invoice', built.totals.invoice);
  assert.equal(built.totals.invoice.willPay, false);
  assert.equal(built.totals.invoice.reason, INVOICE_REASON.noInvoice);
  assert.equal(built.rowsSent.length, 2); // rows are still sent: only the invoice promise changes
});

check('buildConfirmPayload: a CHECKING account chosen as the card -> server sends no invoice -> willPay false', () => {
  const preview = mkPreview(rows, { invoice: null, accounts: { income: 'acc-main', bills: 'acc-main', credit: 'acc-main', debit: 'acc-main' } });
  const built = buildConfirmPayload(preview, sel, {}, CONFIRM_CTX);
  assert.equal(built.totals.invoice.willPay, false);
});

check('buildConfirmPayload: with an invoice the footer and the request agree (derived from the rows sent)', () => {
  const preview = mkPreview(rows);
  const built = buildConfirmPayload(preview, sel, {}, CONFIRM_CTX);
  const direct = invoiceForRows(built.rowsSent, preview.options, { ...INV_CTX, alreadyPaid: false, hasInvoice: true });
  assert.deepEqual(built.totals.invoice, direct);
  assert.equal(built.totals.invoice.willPay, true);
  assert.equal(built.totals.invoice.cents, 10050);
});

console.log('\n[invoice sum] integer cents, no float drift');

check('float-trap amounts add up exactly (1.005 rounds half-up to 101 cents)', () => {
  const amounts = [0.57, 1.15, 4.35, 8.28, 19.99, 1.005];
  const list = amounts.map((amount) => card({ amount }));
  const inv = invoiceForSelection(list, defaultSelection(list), CLOSED, INV_CTX);
  const parts = amounts.map((a) => M.toCents(a));
  show('per-row cents', parts);
  assert.deepEqual(parts, [57, 115, 435, 828, 1999, 101]);
  assert.equal(inv.cents, 57 + 115 + 435 + 828 + 1999 + 101);
  assert.equal(inv.amount, 3535 / 100);
});

check('0.1 + 0.2 style sums stay at exact cents', () => {
  const list = [card({ amount: 0.1 }), card({ amount: 0.2 })];
  assert.equal(invoiceForSelection(list, defaultSelection(list), CLOSED, INV_CTX).cents, 30);
});

console.log('\n[R2-2] a failed confirm leaves the preview stale');

check('confirmBlocker(needsRefresh) blocks first, with its own code; without it nothing changes', () => {
  const preview = mkPreview(rows);
  const built = buildConfirmPayload(preview, sel, {}, CONFIRM_CTX);
  assert.equal(confirmBlocker(built, false), null);
  const blocked = confirmBlocker(built, true);
  show('blocker', blocked);
  assert.equal(blocked.code, 'needs-refresh');
  assert.ok(blocked.message.includes('Atualize a pré-visualização'));
  assert.equal(confirmBlocker(null, true).code, 'needs-refresh');
  const noMonth = buildConfirmPayload(mkPreview(rows, { month: null }), sel, {}, CONFIRM_CTX);
  assert.equal(confirmBlocker(noMonth, true).code, 'needs-refresh');
  assert.equal(confirmBlocker(noMonth, false).code, 'no-month');
});

check('the partial-import notice tells to refresh and to check the month invoice', () => {
  show('notice', M.PARTIAL_IMPORT_NOTICE);
  assert.ok(M.PARTIAL_IMPORT_NOTICE.includes('atualize a pré-visualização'));
  assert.ok(M.PARTIAL_IMPORT_NOTICE.includes('só soma as linhas importadas na mesma confirmação'));
});

console.log('\n[R2-3] category choices are per household');

const choices = (o: object) => o as Record<string, unknown>;
const DEFAULT_CHOICE = { kind: 'default' };
const SAUDE_KEY = 'EXPENSE' + String.fromCharCode(124) + 'saude';
const LAZER_KEY = 'EXPENSE' + String.fromCharCode(124) + 'lazer';

check('households never see each other choices; an unknown household sees none', () => {
  const raw = JSON.stringify({
    h1: { [SAUDE_KEY]: { kind: 'system', categoryName: 'HEALTHCARE' } },
    h2: { [SAUDE_KEY]: DEFAULT_CHOICE, [LAZER_KEY]: { kind: 'create', name: 'Lazer' } },
  });
  assert.deepEqual(M.parseSavedCategoryChoices(raw, 'h1'), { [SAUDE_KEY]: { kind: 'system', categoryName: 'HEALTHCARE' } });
  assert.deepEqual(Object.keys(M.parseSavedCategoryChoices(raw, 'h2')).sort(), [LAZER_KEY, SAUDE_KEY].sort());
  assert.deepEqual(M.parseSavedCategoryChoices(raw, 'h3'), {});
});

check('the old flat shape is not read as anyone choices', () => {
  const legacy = JSON.stringify({ [SAUDE_KEY]: { kind: 'system', categoryName: 'HEALTHCARE' } });
  assert.deepEqual(M.parseSavedCategoryChoices(legacy, 'h1'), {});
  assert.deepEqual(M.parseSavedCategoryChoices(legacy, SAUDE_KEY), {});
});

check('malformed household values are ignored: arrays, strings, null, broken JSON, nothing saved', () => {
  const bad = [JSON.stringify({ h1: [1] }), JSON.stringify({ h1: 'x' }), JSON.stringify({ h1: null }), '{broken', '', null, undefined];
  for (const raw of bad) {
    assert.deepEqual(M.parseSavedCategoryChoices(raw, 'h1'), {});
  }
});

check('merge adds to the household and leaves the others alone; the household own old choices survive', () => {
  const raw = JSON.stringify({ h1: { a: DEFAULT_CHOICE }, h2: { z: DEFAULT_CHOICE } });
  const merged = JSON.parse(M.mergeSavedCategoryChoices(raw, 'h1', choices({ b: { kind: 'create', name: 'B' } })));
  show('merged', merged);
  assert.deepEqual(merged, { h1: { a: DEFAULT_CHOICE, b: { kind: 'create', name: 'B' } }, h2: { z: DEFAULT_CHOICE } });
  const overwrite = JSON.parse(M.mergeSavedCategoryChoices(raw, 'h1', choices({ a: { kind: 'create', name: 'A2' } })));
  assert.deepEqual(overwrite.h1, { a: { kind: 'create', name: 'A2' } });
  assert.deepEqual(overwrite.h2, { z: DEFAULT_CHOICE });
});

check('merge over a corrupt or non-object value starts over without throwing', () => {
  const stringRoot = JSON.stringify('x');
  for (const raw of ['{corrupt', '[]', stringRoot, 'null', '']) {
    assert.deepEqual(JSON.parse(M.mergeSavedCategoryChoices(raw, 'h1', choices({ k: DEFAULT_CHOICE }))), { h1: { k: DEFAULT_CHOICE } });
  }
  const bad = JSON.stringify({ h1: 'garbage', h2: { y: DEFAULT_CHOICE } });
  assert.deepEqual(
    JSON.parse(M.mergeSavedCategoryChoices(bad, 'h1', choices({ k: DEFAULT_CHOICE }))),
    { h1: { k: DEFAULT_CHOICE }, h2: { y: DEFAULT_CHOICE } },
  );
});

console.log('\n[R3] an absent invoice fails closed like null');

check('buildConfirmPayload: the invoice key missing or undefined -> nothing is promised', () => {
  const missing = mkPreview(rows);
  delete missing.invoice;
  const explicit = mkPreview(rows, { invoice: undefined });
  for (const preview of [missing, explicit]) {
    const built = buildConfirmPayload(preview, sel, {}, CONFIRM_CTX);
    assert.equal(built.totals.invoice.willPay, false);
    assert.equal(built.totals.invoice.reason, INVOICE_REASON.noInvoice);
    assert.equal(built.rowsSent.length, 2);
  }
});

check('confirmBlocker takes the needsRefresh flag explicitly (false -> only the limits apply)', () => {
  const built = buildConfirmPayload(mkPreview(rows), sel, {}, CONFIRM_CTX);
  assert.equal(confirmBlocker(built, false), null);
  assert.equal(confirmBlocker(built, true).code, 'needs-refresh');
});
