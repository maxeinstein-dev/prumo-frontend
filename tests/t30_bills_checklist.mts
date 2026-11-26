import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// "Contas a pagar" checklist (web): src/utils/billsChecklist.ts (which events are bills, month window, overdue, day pills,
// filter, total in cents, the action of each kind, the paid counter, the recurrence map) and src/utils/billsChecklistTexts.ts
// (placeholders, fallback, keys in the locale files). BILLS_CHECKLIST_MODULE points at a mutated copy for the bite-checks.
// Invented data only. Days are 'YYYY-MM-DD' strings, so no test depends on the time zone of the machine.
const modPath = process.env.BILLS_CHECKLIST_MODULE || frontSrc('utils/billsChecklist.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const B: any = await import(pathToFileURL(modPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TX: any = await import(pathToFileURL(frontSrc('utils/billsChecklistTexts.ts')).href);

const TODAY = '2026-11-10';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ev(over: Record<string, any> = {}): any {
  return {
    date: TODAY, description: 'Item', amount: -10, source: 'pending', certainty: 'confirmed', overdue: false,
    originalDate: null, sourceId: 'id-1', accountId: 'acc-main', invoiceMonth: null, ...over,
  };
}

check('B-a: only outflows are bills (income and zero amounts stay out)', () => {
  const bills = B.buildBills([ev({ amount: 500, sourceId: 'in' }), ev({ amount: 0, sourceId: 'zero' }), ev({ amount: -12.5, sourceId: 'out' })], TODAY);
  assert.deepEqual(bills.map((b: { sourceId: string }) => b.sourceId), ['out']);
  assert.equal(bills[0].amountCents, 1250);
});

check('B-b: the window is today to the end of the month; later months stay out', () => {
  const bills = B.buildBills([
    ev({ date: '2026-11-30', sourceId: 'last' }),
    ev({ date: '2026-12-01', sourceId: 'next' }),
    ev({ date: '2026-12-20', sourceId: 'far' }),
  ], TODAY);
  assert.deepEqual(bills.map((b: { sourceId: string }) => b.sourceId), ['last']);
  assert.equal(B.monthEnd('2026-11-10'), '2026-11-30');
  assert.equal(B.monthEnd('2028-02-03'), '2028-02-29');
  assert.equal(B.monthEnd('2026-12-31'), '2026-12-31');
  assert.equal(B.monthStart('2026-11-10'), '2026-11-01');
});

check('B-c: an overdue bill is kept, listed first and remembers its original due day', () => {
  const bills = B.buildBills([
    ev({ date: '2026-11-12', sourceId: 'later' }),
    ev({ date: TODAY, overdue: true, originalDate: '2026-11-03', sourceId: 'late' }),
  ], TODAY);
  assert.deepEqual(bills.map((b: { sourceId: string }) => b.sourceId), ['late', 'later']);
  assert.equal(bills[0].overdue, true);
  assert.equal(bills[0].dueDate, '2026-11-03');
  assert.equal(bills[1].dueDate, '2026-11-12');
});

check('B-d: the total sums in whole cents (no float drift)', () => {
  const bills = B.buildBills([ev({ amount: -0.1, sourceId: 'a' }), ev({ amount: -0.2, sourceId: 'b' }), ev({ amount: -10.07, sourceId: 'c' })], TODAY);
  assert.equal(B.billsTotalCents(bills), 1037);
});

check('B-e: day pills group the not-overdue bills by day, in order; overdue ones form one pill', () => {
  const bills = B.buildBills([
    ev({ date: '2026-11-15', amount: -30, sourceId: 'a' }),
    ev({ date: '2026-11-12', amount: -20, sourceId: 'b' }),
    ev({ date: '2026-11-15', amount: -5, sourceId: 'c' }),
    ev({ date: TODAY, overdue: true, originalDate: '2026-11-02', amount: -7, sourceId: 'd' }),
    ev({ date: TODAY, overdue: true, originalDate: '2026-11-04', amount: -3, sourceId: 'e' }),
  ], TODAY);
  const pills = B.buildDayPills(bills);
  assert.deepEqual(pills.days, [
    { date: '2026-11-12', count: 1, totalCents: 2000 },
    { date: '2026-11-15', count: 2, totalCents: 3500 },
  ]);
  assert.deepEqual(pills.overdue, { count: 2, totalCents: 1000 });
  assert.equal(B.buildDayPills([]).overdue, null);
  assert.equal(B.dayNumber('2026-11-05'), '05');
  assert.equal(B.dayNumber('nope'), '');
});

check('B-f: the filter picks a day, the overdue ones or all; a vanished day falls back to all', () => {
  const bills = B.buildBills([
    ev({ date: '2026-11-15', sourceId: 'a' }),
    ev({ date: '2026-11-12', sourceId: 'b' }),
    ev({ date: TODAY, overdue: true, originalDate: '2026-11-02', sourceId: 'c' }),
  ], TODAY);
  const ids = (f: string) => B.filterBills(bills, f).map((b: { sourceId: string }) => b.sourceId);
  assert.deepEqual(ids('all'), ['c', 'b', 'a']);
  assert.deepEqual(ids('overdue'), ['c']);
  assert.deepEqual(ids('2026-11-12'), ['b']);
  assert.deepEqual(ids(TODAY), []); // the overdue bill is listed today but belongs to the overdue pill, not to the day pill
  assert.equal(B.normalizeFilter('2026-11-12', bills), '2026-11-12');
  assert.equal(B.normalizeFilter('2026-11-20', bills), 'all');
  const none = B.buildBills([ev({ date: '2026-11-12' })], TODAY);
  assert.equal(B.normalizeFilter('overdue', none), 'all');
});

check('B-g: a line just marked is hidden by its key until the answer catches up', () => {
  const events = [ev({ sourceId: 'a', amount: -10 }), ev({ sourceId: 'b', amount: -20 })];
  const all = B.buildBills(events, TODAY);
  const hidden = new Set([all.find((b: { sourceId: string }) => b.sourceId === 'a').key]);
  assert.deepEqual(B.buildBills(events, TODAY, hidden).map((b: { sourceId: string }) => b.sourceId), ['b']);
});

check('B-h: a pending entry offers "pay", through the confirmation when its value is an estimate', () => {
  assert.deepEqual(B.billAction({ kind: 'pending', sourceId: 'x', dueDate: TODAY, estimated: false }), { type: 'pay', confirm: false });
  assert.deepEqual(B.billAction({ kind: 'pending', sourceId: 'x', dueDate: TODAY, estimated: true }), { type: 'pay', confirm: true });
});

check('B-i: an invoice is never paid here: the action is to go to the card', () => {
  assert.deepEqual(B.billAction({ kind: 'invoice', sourceId: 'card', dueDate: TODAY, estimated: false }), { type: 'invoice' });
});

check('B-j: an unknown source has no control, whatever the amount or the certainty', () => {
  const bills = B.buildBills([ev({ source: 'salary_batch', sourceId: 'z', amount: -99, certainty: 'estimated' })], TODAY);
  assert.equal(bills.length, 1);
  assert.equal(bills[0].kind, 'unknown');
  assert.deepEqual(B.billAction(bills[0]), { type: 'none', reason: 'unknown' });
  assert.equal(B.billSourceTextKey('unknown'), 'billsSourceOther');
  assert.equal(B.billKind('whatever'), 'unknown');
});

check('B-k: a recurrence line is markable only when monthly and the line is the next run', () => {
  const rec = new Map([
    ['r-month', { frequency: 'MONTHLY', nextRunAt: '2026-11-12T00:00:00.000Z' }],
    ['r-week', { frequency: 'WEEKLY', nextRunAt: '2026-11-12T00:00:00.000Z' }],
  ]);
  const line = (sourceId: string, dueDate: string, estimated = false) => ({ kind: 'recurrence', sourceId, dueDate, estimated });
  assert.deepEqual(B.billAction(line('r-month', '2026-11-12'), rec), { type: 'execute', confirm: false });
  assert.deepEqual(B.billAction(line('r-month', '2026-11-12', true), rec), { type: 'execute', confirm: true });
  assert.deepEqual(B.billAction(line('r-month', '2026-12-12'), rec), { type: 'none', reason: 'later' }); // not the next run
  assert.deepEqual(B.billAction(line('r-week', '2026-11-12'), rec), { type: 'none', reason: 'later' }); // no once-per-month guard
  assert.deepEqual(B.billAction(line('r-unknown', '2026-11-12'), rec), { type: 'none', reason: 'later' });
  assert.deepEqual(B.billAction(line('r-month', '2026-11-12'), undefined), { type: 'none', reason: 'later' });
});

check('B-l: the paid counter takes the month\'s paid expenses born from a recurrence, plus the ones marked here, by id', () => {
  const tx = (id: string, over: Record<string, unknown> = {}) => ({ id, type: 'EXPENSE', paid: true, recurringTransactionId: 'r1', date: '2026-11-05T00:00:00.000Z', ...over });
  const ids = B.paidIds([
    tx('t1'),
    tx('t2', { recurringTransactionId: null }), // no recurrence: not in the set
    tx('t3', { paid: false }), // pending
    tx('t4', { type: 'INCOME' }),
    tx('t5', { date: '2026-10-31T00:00:00.000Z' }), // other month
    tx('t6', { date: '2026-12-01T00:00:00.000Z' }),
    tx('t7', { date: '2026-11-30' }),
  ], '2026-11-01', '2026-11-30', new Set(['t1', 'm1']));
  assert.deepEqual([...ids].sort(), ['m1', 't1', 't7']);
});

check('B-m: the progress is "paid of paid + still to pay"', () => {
  const bills = B.buildBills([ev({ sourceId: 'a' }), ev({ sourceId: 'b' }), ev({ sourceId: 'c' })], TODAY);
  assert.deepEqual(B.billsProgress(bills, 5), { paid: 5, total: 8 });
  assert.deepEqual(B.billsProgress([], 0), { paid: 0, total: 0 });
  assert.deepEqual(B.billsProgress(bills, -2), { paid: 0, total: 3 });
});

check('B-n: the recurrence map reads an array or an envelope and skips inactive or broken items', () => {
  const list = [
    { id: 'a', frequency: 'MONTHLY', nextRunAt: '2026-11-12T00:00:00.000Z', isActive: true },
    { id: 'b', frequency: 'WEEKLY', nextRunAt: '2026-11-13T00:00:00.000Z', isActive: false },
    { id: 'c', frequency: 'MONTHLY' },
    null,
  ];
  assert.deepEqual([...B.recurrenceMap(list).keys()], ['a']);
  assert.deepEqual([...B.recurrenceMap({ data: list }).keys()], ['a']);
  assert.equal(B.recurrenceMap(undefined).size, 0);
});

check('B-o: texts fill placeholders and fall back to Portuguese', () => {
  assert.equal(TX.billsText({}, 'billsPaidCounter', { paid: 3, total: 8 }), '3 de 8 pagas');
  assert.equal(TX.billsText({ billsPaidCounter: '{paid} of {total} paid' }, 'billsPaidCounter', { paid: 3, total: 8 }), '3 of 8 paid');
  assert.equal(TX.billsText(null, 'billsTitle'), 'Contas a pagar');
  assert.equal(TX.billsText({}, 'billsMarkPaid', { other: 'x' }), 'Marcar {name} como paga');
});

check('B-p: every Portuguese key exists in pt-BR.json and en-US.json (no key shows its name)', () => {
  const pt = JSON.parse(readFileSync(frontSrc('i18n/pt-BR.json'), 'utf8'));
  const en = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'));
  for (const key of Object.keys(TX.BILLS_TEXTS_PT)) {
    assert.equal(typeof pt[key], 'string', `pt-BR.json lacks ${key}`);
    assert.equal(typeof en[key], 'string', `en-US.json lacks ${key}`);
  }
});

check('B-q: a bill not due yet is paid today; a bill due today or overdue keeps its day', () => {
  assert.equal(B.earlyPaymentDay('2026-11-17', TODAY), TODAY);
  assert.equal(B.earlyPaymentDay('2026-11-11', TODAY), TODAY);
  assert.equal(B.earlyPaymentDay(TODAY, TODAY), null);
  assert.equal(B.earlyPaymentDay('2026-11-03', TODAY), null);
  assert.equal(B.earlyPaymentDay('garbage', TODAY), null);
  // The dueDate the checklist hands over: a future line keeps its day, an overdue one carries the original day
  const [future, late] = B.buildBills([ev({ date: '2026-11-17', sourceId: 'f' }), ev({ date: TODAY, overdue: true, originalDate: '2026-11-03', sourceId: 'l' })], TODAY).reverse();
  assert.equal(B.earlyPaymentDay(future.dueDate, TODAY), TODAY);
  assert.equal(B.earlyPaymentDay(late.dueDate, TODAY), null);
});

summary();
