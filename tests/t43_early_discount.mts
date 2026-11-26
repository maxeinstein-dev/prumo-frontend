import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// Desconto por pagar antes do vencimento (lote DE2): valor com desconto no formulário, validação igual à do backend,
// aviso "Pague até {data} e economize", destaque dos três dias, regra do botão "Pagar agora", mensagens do 409, e a conta
// paga antes (data 28/11, referente a dezembro) nas contas a pagar. Dados inventados.
// EARLY_DISCOUNT_MODULE / BILLS_CHECKLIST_MODULE apontam para uma cópia alterada do módulo (bite-checks).
const edPath = process.env.EARLY_DISCOUNT_MODULE || frontSrc('utils/earlyDiscount.ts');
const bcPath = process.env.BILLS_CHECKLIST_MODULE || frontSrc('utils/billsChecklist.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E: any = await import(pathToFileURL(edPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const B: any = await import(pathToFileURL(bcPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(frontSrc('utils/earlyDiscountTexts.ts')).href);

console.log('\n[desconto antecipado] utils/earlyDiscount.ts');

// ---- valor com desconto --------------------------------------------------------------------------------

check('discountedCents: fixed takes the value off; percent is rounded UP to the cent', () => {
  assert.equal(E.discountedCents(25000, 'FIXED', 30), 22000);
  assert.equal(E.discountedCents(12995, 'PERCENT', 5), 12346); // 129.95 - 5% = 123.4525 -> 123.46
  assert.equal(E.discountedCents(10000, 'PERCENT', 10), 9000); // exact: nothing to round
  assert.equal(E.discountedCents(1001, 'PERCENT', 50), 501); // 5.005 -> 5.01
});

check('discountedCents: a percentage with cents (2,5%) stays exact in basis points', () => {
  assert.equal(E.discountedCents(40000, 'PERCENT', 2.5), 39000);
  assert.equal(E.discountedCents(12995, 'PERCENT', 0.1), 12983); // 12982.005 -> up
});

// ---- leitura do valor digitado -------------------------------------------------------------------------

check('parseDiscountValue: comma or dot decimal, thousands dot, at most 2 decimals; anything else is null', () => {
  assert.equal(E.parseDiscountValue('40'), 40);
  assert.equal(E.parseDiscountValue('40,5'), 40.5);
  assert.equal(E.parseDiscountValue('40.50'), 40.5);
  assert.equal(E.parseDiscountValue(' 1.234,56 '), 1234.56);
  assert.equal(E.parseDiscountValue('5,555'), null);
  assert.equal(E.parseDiscountValue(''), null);
  assert.equal(E.parseDiscountValue('abc'), null);
  assert.equal(E.parseDiscountValue('-3'), null);
});

// ---- validação (espelho do backend) --------------------------------------------------------------------

const draft = (day: string, type: string, value: string) => ({ day, type, value });

check('validateDraft: three blank fields mean "no discount" (payload null)', () => {
  assert.deepEqual(E.validateDraft(draft('', 'FIXED', ''), 250), { ok: true, payload: null });
  assert.deepEqual(E.validateDraft(draft('  ', 'PERCENT', ' '), 250), { ok: true, payload: null });
});

check('validateDraft: a complete discount gives the payload with numbers', () => {
  assert.deepEqual(E.validateDraft(draft('8', 'FIXED', '30'), 250), { ok: true, payload: { earlyDiscountDay: 8, earlyDiscountType: 'FIXED', earlyDiscountValue: 30 } });
  assert.deepEqual(E.validateDraft(draft('31', 'PERCENT', '5,5'), 129.95), { ok: true, payload: { earlyDiscountDay: 31, earlyDiscountType: 'PERCENT', earlyDiscountValue: 5.5 } });
});

check('validateDraft: day and value must come together; a half-filled discount is refused', () => {
  assert.deepEqual(E.validateDraft(draft('8', 'FIXED', ''), 250), { ok: false, field: 'value', key: 'earlyDiscountIncomplete' });
  assert.deepEqual(E.validateDraft(draft('', 'FIXED', '30'), 250), { ok: false, field: 'day', key: 'earlyDiscountIncomplete' });
});

check('validateDraft: the day is a whole number from 1 to 31', () => {
  for (const day of ['0', '32', '8.5', 'x', '-1']) {
    assert.deepEqual(E.validateDraft(draft(day, 'FIXED', '30'), 250), { ok: false, field: 'day', key: 'earlyDiscountDayInvalid' }, day);
  }
  assert.equal(E.validateDraft(draft('1', 'FIXED', '30'), 250).ok, true);
});

check('validateDraft: a discount needs an amount above zero', () => {
  assert.deepEqual(E.validateDraft(draft('8', 'FIXED', '30'), 0), { ok: false, field: 'value', key: 'earlyDiscountAmountNeeded' });
  assert.deepEqual(E.validateDraft(draft('8', 'PERCENT', '5'), -10), { ok: false, field: 'value', key: 'earlyDiscountAmountNeeded' });
});

check('validateDraft: percent is between 0 and 100, both excluded', () => {
  for (const value of ['0', '100', '120']) {
    assert.deepEqual(E.validateDraft(draft('8', 'PERCENT', value), 250), { ok: false, field: 'value', key: 'earlyDiscountPercentRange' }, value);
  }
  assert.equal(E.validateDraft(draft('8', 'PERCENT', '99,99'), 250).ok, true);
});

check('validateDraft: fixed is above zero and below the amount', () => {
  assert.deepEqual(E.validateDraft(draft('8', 'FIXED', '0'), 250), { ok: false, field: 'value', key: 'earlyDiscountFixedPositive' });
  assert.deepEqual(E.validateDraft(draft('8', 'FIXED', '250'), 250), { ok: false, field: 'value', key: 'earlyDiscountFixedTooBig' });
  assert.deepEqual(E.validateDraft(draft('8', 'FIXED', '300'), 250), { ok: false, field: 'value', key: 'earlyDiscountFixedTooBig' });
  assert.equal(E.validateDraft(draft('8', 'FIXED', '249,99'), 250).ok, true);
});

check('validateDraft: a value that is not a number (or has 3 decimals) is refused', () => {
  assert.deepEqual(E.validateDraft(draft('8', 'FIXED', 'abc'), 250), { ok: false, field: 'value', key: 'earlyDiscountValueInvalid' });
  assert.deepEqual(E.validateDraft(draft('8', 'PERCENT', '5,555'), 250), { ok: false, field: 'value', key: 'earlyDiscountValueInvalid' });
});

check('validateDraft: a percentage that rounds up to the full amount takes no effect and is refused', () => {
  // 0,01% of 0,50: 0,5 - 0,00005 = 0,49995 -> rounds up to 0,50 = unchanged
  assert.deepEqual(E.validateDraft(draft('8', 'PERCENT', '0,01'), 0.5), { ok: false, field: 'value', key: 'earlyDiscountNoEffect' });
});

// ---- o que o formulário manda ---------------------------------------------------------------------------

check('discountFields: create sends nothing without a discount; update clears the three with null', () => {
  const none = E.validateDraft(draft('', 'FIXED', ''), 250);
  assert.deepEqual(E.discountFields(none, 'create'), {});
  assert.deepEqual(E.discountFields(none, 'update'), { earlyDiscountDay: null, earlyDiscountType: null, earlyDiscountValue: null });
  const some = E.validateDraft(draft('8', 'FIXED', '30'), 250);
  assert.deepEqual(E.discountFields(some, 'create'), { earlyDiscountDay: 8, earlyDiscountType: 'FIXED', earlyDiscountValue: 30 });
  assert.deepEqual(E.discountFields(some, 'update'), { earlyDiscountDay: 8, earlyDiscountType: 'FIXED', earlyDiscountValue: 30 });
});

check('discountFields: an invalid draft never sends anything', () => {
  const bad = E.validateDraft(draft('8', 'FIXED', ''), 250);
  assert.deepEqual(E.discountFields(bad, 'create'), {});
  assert.deepEqual(E.discountFields(bad, 'update'), {});
});

check('draftFromRecurrence: reads the stored columns back into the form; blank when it has none', () => {
  assert.deepEqual(E.draftFromRecurrence({ earlyDiscountDay: 8, earlyDiscountType: 'PERCENT', earlyDiscountValue: 5.5 }), { day: '8', type: 'PERCENT', value: '5,5' });
  assert.deepEqual(E.draftFromRecurrence({ earlyDiscountDay: 8, earlyDiscountType: 'FIXED', earlyDiscountValue: 30 }), { day: '8', type: 'FIXED', value: '30' });
  assert.deepEqual(E.draftFromRecurrence({}), E.emptyDraft());
  assert.deepEqual(E.draftFromRecurrence({ earlyDiscountDay: null, earlyDiscountType: null, earlyDiscountValue: null }), E.emptyDraft());
});

check('discountPreview: the discounted amount and the savings in cents, only for a valid discount', () => {
  assert.deepEqual(E.discountPreview(draft('8', 'PERCENT', '5'), 129.95), { fullCents: 12995, discountedCents: 12346, savingsCents: 649 });
  assert.deepEqual(E.discountPreview(draft('8', 'FIXED', '30'), 250), { fullCents: 25000, discountedCents: 22000, savingsCents: 3000 });
  assert.equal(E.discountPreview(draft('8', 'FIXED', '300'), 250), null);
  assert.equal(E.discountPreview(draft('', 'FIXED', ''), 250), null);
});

// ---- o aviso -------------------------------------------------------------------------------------------

console.log('\n[desconto antecipado] aviso e botão');

const quote = (limitDate: string, savings = 30) => ({ limitDate, fullAmount: 250, discountedAmount: 250 - savings, savings });

check('earlyDiscountNotice: up to and including the limit day the notice shows; the day after it is gone', () => {
  assert.notEqual(E.earlyDiscountNotice(quote('2026-12-08'), '2026-12-08'), null);
  assert.equal(E.earlyDiscountNotice(quote('2026-12-08'), '2026-12-09'), null);
  assert.equal(E.earlyDiscountNotice(undefined, '2026-12-01'), null);
  assert.equal(E.earlyDiscountNotice(null, '2026-12-01'), null);
});

check('earlyDiscountNotice: carries the limit date, the savings in cents and the days left', () => {
  const n = E.earlyDiscountNotice(quote('2026-12-08', 40.25), '2026-12-02');
  assert.equal(n.limitDate, '2026-12-08');
  assert.equal(n.savingsCents, 4025);
  assert.equal(n.daysLeft, 6);
});

check('earlyDiscountNotice: the highlight is on the three days before the limit and on the limit day, not before', () => {
  const urgent = (today: string) => E.earlyDiscountNotice(quote('2026-12-08'), today).urgent;
  assert.equal(urgent('2026-12-04'), false); // 4 days left
  assert.equal(urgent('2026-12-05'), true); // 3 days left
  assert.equal(urgent('2026-12-06'), true);
  assert.equal(urgent('2026-12-07'), true);
  assert.equal(urgent('2026-12-08'), true); // last day
});

check('earlyDiscountNotice: counts days across a month and year boundary without a time zone shift', () => {
  assert.equal(E.earlyDiscountNotice(quote('2027-01-02'), '2026-12-30').daysLeft, 3);
  assert.equal(E.earlyDiscountNotice(quote('2027-01-02'), '2026-12-30').urgent, true);
  assert.equal(E.earlyDiscountNotice(quote('2026-03-01'), '2026-02-27').daysLeft, 2);
});

check('earlyDiscountNotice: a quote or a day that is not a day key gives no notice, never NaN', () => {
  assert.equal(E.earlyDiscountNotice(quote('soon'), '2026-12-01'), null);
  assert.equal(E.earlyDiscountNotice(quote('2026-12-08'), 'today'), null);
});

check('noticeLines: "Pague até {data} e economize R$ X" with the money formatted by the caller; hint only when highlighted', () => {
  const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;
  const far = E.noticeLines(E.earlyDiscountNotice(quote('2026-12-08', 40.25), '2026-12-01'), (d: string) => d.slice(8) + '/' + d.slice(5, 7), fmt, undefined);
  assert.equal(far.text, 'Pague até 08/12 e economize R$ 40,25');
  assert.equal(far.hint, null);
  assert.equal(far.urgent, false);
  const last = E.noticeLines(E.earlyDiscountNotice(quote('2026-12-08'), '2026-12-08'), (d: string) => d.slice(8) + '/' + d.slice(5, 7), fmt, undefined);
  assert.equal(last.hint, 'Último dia com desconto');
  assert.equal(last.urgent, true);
  const near = E.noticeLines(E.earlyDiscountNotice(quote('2026-12-08'), '2026-12-06'), (d: string) => d.slice(8) + '/' + d.slice(5, 7), fmt, undefined);
  assert.equal(near.hint, 'Faltam 2 dias');
  const one = E.noticeLines(E.earlyDiscountNotice(quote('2026-12-08'), '2026-12-07'), (d: string) => d.slice(8) + '/' + d.slice(5, 7), fmt, undefined);
  assert.equal(one.hint, 'Falta 1 dia');
});

check('canPayNow: the button shows only when the API says canPayNow is true', () => {
  assert.equal(E.canPayNow({ ...quote('2026-12-08'), recurringId: 'r1', occurrenceDate: '2026-12-10', canPayNow: true }), true);
  assert.equal(E.canPayNow({ ...quote('2026-12-08'), recurringId: 'r1', occurrenceDate: '2027-01-10', canPayNow: false }), false);
  assert.equal(E.canPayNow({ ...quote('2026-12-08'), recurringId: 'r1', occurrenceDate: '2026-12-10' }), false);
  assert.equal(E.canPayNow({ ...quote('2026-12-08'), recurringId: 'r1', occurrenceDate: '2026-12-10', canPayNow: 'yes' }), false);
  assert.equal(E.canPayNow(undefined), false);
  assert.equal(E.canPayNow(null), false);
});

check('payNextErrorKey: 409 and 400 become their own message, anything else the generic one', () => {
  assert.equal(E.payNextErrorKey(409), 'earlyPayConflict');
  assert.equal(E.payNextErrorKey(400), 'earlyPayInactive');
  assert.equal(E.payNextErrorKey(500), 'earlyPayError');
  assert.equal(E.payNextErrorKey(undefined), 'earlyPayError');
});

check('texts: placeholders are filled and Portuguese is the fallback', () => {
  assert.equal(T.earlyDiscountText({}, 'earlyDiscountNotice', { date: '08/12', amount: 'R$ 1,00' }), 'Pague até 08/12 e economize R$ 1,00');
  assert.equal(T.earlyDiscountText({ earlyDiscountNotice: 'Pay by {date}, save {amount}' }, 'earlyDiscountNotice', { date: '08/12', amount: '$1' }), 'Pay by 08/12, save $1');
  assert.equal(T.earlyDiscountText(null, 'earlyPayNow'), 'Pagar agora');
});

// ---- contas a pagar ------------------------------------------------------------------------------------

console.log('\n[desconto antecipado] contas a pagar');

const disc = (over: Record<string, unknown> = {}) => ({
  limitDate: '2026-12-08',
  fullAmount: 250,
  discountedAmount: 220,
  savings: 30,
  recurringId: 'r-cond',
  occurrenceDate: '2026-12-10',
  canPayNow: true,
  ...over,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ev = (over: Record<string, unknown> = {}): any => ({
  date: '2026-12-10',
  description: 'Conta de teste',
  amount: -220,
  source: 'recurrence',
  certainty: 'expected',
  overdue: false,
  originalDate: null,
  sourceId: 'r-cond',
  accountId: 'a1',
  invoiceMonth: null,
  ...over,
});

check('buildBills: the discount of the event stays on the bill (amount is the discounted one)', () => {
  const [bill] = B.buildBills([ev({ earlyDiscount: disc() })], '2026-12-02');
  assert.equal(bill.amountCents, 22000);
  assert.equal(bill.earlyDiscount.recurringId, 'r-cond');
  const [plain] = B.buildBills([ev()], '2026-12-02');
  assert.equal(plain.earlyDiscount, null);
});

check('billAction: a recurrence bill with canPayNow pays through pay-next, with the recurrence id', () => {
  const [bill] = B.buildBills([ev({ earlyDiscount: disc() })], '2026-12-02');
  assert.deepEqual(B.billAction(bill, new Map()), { type: 'payNext', recurringId: 'r-cond' });
  // even when the list of recurrences did not load: the API already said it can be paid now
  assert.deepEqual(B.billAction(bill, undefined), { type: 'payNext', recurringId: 'r-cond' });
});

check('billAction: with a discount but canPayNow false there is no button (a later month), and nothing falls back to execute', () => {
  const [bill] = B.buildBills([ev({ date: '2026-12-10', earlyDiscount: disc({ canPayNow: false }) })], '2026-12-02');
  const rec = new Map([['r-cond', { frequency: 'MONTHLY', nextRunAt: '2026-12-10T00:00:00.000Z' }]]);
  assert.deepEqual(B.billAction(bill, rec), { type: 'execute', confirm: false }); // same as a bill without discount
  const later = new Map([['r-cond', { frequency: 'MONTHLY', nextRunAt: '2026-11-10T00:00:00.000Z' }]]);
  assert.deepEqual(B.billAction(bill, later), { type: 'none', reason: 'later' });
});

check('billAction: after the limit the event has no discount and the action is the usual one', () => {
  const [bill] = B.buildBills([ev({ amount: -250 })], '2026-12-09');
  const rec = new Map([['r-cond', { frequency: 'MONTHLY', nextRunAt: '2026-12-10T00:00:00.000Z' }]]);
  assert.deepEqual(B.billAction(bill, rec), { type: 'execute', confirm: false });
});

check('billAction: a pending entry or an invoice never turns into pay-next, whatever the event carries', () => {
  const [pending] = B.buildBills([ev({ source: 'pending', sourceId: 'p1', earlyDiscount: disc() })], '2026-12-02');
  assert.deepEqual(B.billAction(pending, new Map()), { type: 'pay', confirm: false });
});

// A conta paga antes: o lançamento tem data 28/11 e mês de referência dezembro (competenceMonth).
const aheadTx = (over: Record<string, unknown> = {}) => ({
  id: 'ahead',
  type: 'EXPENSE',
  paid: true,
  recurringTransactionId: 'r-cond',
  date: '2026-11-28T00:00:00.000Z',
  competenceMonth: '2026-12',
  ...over,
});
const REC = new Map([['r-cond', { frequency: 'MONTHLY', nextRunAt: '2026-12-10T00:00:00.000Z', competenceOffsetMonths: null }]]);
const novTx = { id: 'nov', type: 'EXPENSE', paid: true, recurringTransactionId: 'r-cond', date: '2026-11-10T00:00:00.000Z', competenceMonth: null };

check('paidIds: a bill paid ahead on 28/11 for December counts once, in December, and not in November', () => {
  const nov = B.paidIds([novTx, aheadTx()], '2026-11-01', '2026-11-30', new Set(), REC);
  assert.deepEqual([...nov].sort(), ['nov']);
  const dec = B.paidIds([novTx, aheadTx()], '2026-12-01', '2026-12-31', new Set(), REC);
  assert.deepEqual([...dec].sort(), ['ahead']);
});

check('paidIds: the same occurrence is never counted in both months (no double count at the month change)', () => {
  const list = [novTx, aheadTx()];
  const a = B.paidIds(list, '2026-11-01', '2026-11-30', new Set(), REC);
  const b = B.paidIds(list, '2026-12-01', '2026-12-31', new Set(), REC);
  assert.equal([...a].filter((id) => b.has(id)).length, 0);
});

check('paidIds: a row with no reference month still counts by its date; one with the same month as the date too', () => {
  const ids = B.paidIds(
    [
      { ...novTx, id: 'a', competenceMonth: undefined },
      { ...novTx, id: 'b', competenceMonth: '2026-11' },
      { ...novTx, id: 'c', date: '2026-12-01', competenceMonth: undefined },
    ],
    '2026-11-01',
    '2026-11-30',
    new Set(),
    REC,
  );
  assert.deepEqual([...ids].sort(), ['a', 'b']);
});

check('paidIds: a recurrence WITH an offset (paid 25/09, refers to October) keeps counting in September, by its date', () => {
  const offset = new Map([['r-off', { frequency: 'MONTHLY', nextRunAt: '2026-10-25T00:00:00.000Z', competenceOffsetMonths: 1 }]]);
  const t = { id: 'off', type: 'EXPENSE', paid: true, recurringTransactionId: 'r-off', date: '2026-09-25T00:00:00.000Z', competenceMonth: '2026-10' };
  assert.deepEqual([...B.paidIds([t], '2026-09-01', '2026-09-30', new Set(), offset)], ['off']);
  assert.equal(B.paidIds([t], '2026-10-01', '2026-10-31', new Set(), offset).size, 0);
});

check('paidIds: a recurrence that is not in the map (unknown) counts by its date, as before', () => {
  const t = aheadTx();
  assert.deepEqual([...B.paidIds([t], '2026-11-01', '2026-11-30', new Set(), new Map())], ['ahead']);
  assert.deepEqual([...B.paidIds([t], '2026-11-01', '2026-11-30')], ['ahead']);
  assert.equal(B.paidIds([t], '2026-12-01', '2026-12-31').size, 0);
});

check('recurrenceMap keeps the offset of the recurrence (null when none)', () => {
  const m = B.recurrenceMap([{ id: 'a', frequency: 'MONTHLY', nextRunAt: '2026-11-12T00:00:00.000Z', competenceOffsetMonths: 2 }, { id: 'b', frequency: 'MONTHLY', nextRunAt: '2026-11-12T00:00:00.000Z' }]);
  assert.equal(m.get('a').competenceOffsetMonths, 2);
  assert.equal(m.get('b').competenceOffsetMonths, null);
});

check('paidIds: the ones just marked on this screen still count, by id, once', () => {
  const ids = B.paidIds([aheadTx()], '2026-12-01', '2026-12-31', new Set(['ahead', 'fresh']), REC);
  assert.deepEqual([...ids].sort(), ['ahead', 'fresh']);
});

check('paidWindowStart: the paid-expenses query starts 31 days before the month, so a bill paid ahead for it is fetched', () => {
  assert.equal(B.paidWindowStart('2026-12-01'), '2026-10-31');
  assert.equal(B.paidWindowStart('2026-12-17'), '2026-10-31');
  assert.equal(B.paidWindowStart('2026-03-05'), '2026-01-29');
});

check('December view: the occurrence paid ahead is not open (the API moved the recurrence on) and the counter reads it as paid', () => {
  // After the payment the recurrence runs on January 10: the December answer has no event for it.
  const bills = B.buildBills([ev({ date: '2027-01-10', amount: -250 })], '2026-12-01');
  assert.equal(bills.length, 0);
  const paid = B.paidIds([novTx, aheadTx()], '2026-12-01', '2026-12-31', new Set(), REC);
  assert.deepEqual(B.billsProgress(bills, paid.size), { paid: 1, total: 1 });
});

check('November view: both occurrences of the recurrence are not shown paid twice (one paid in November, one for December)', () => {
  const bills = B.buildBills([], '2026-11-29');
  const paid = B.paidIds([novTx, aheadTx()], '2026-11-01', '2026-11-30', new Set(), REC);
  assert.deepEqual(B.billsProgress(bills, paid.size), { paid: 1, total: 1 });
});

summary();
