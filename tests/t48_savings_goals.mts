import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// Cofrinhos (P03, lote L3): src/utils/savingsGoalsPlan.ts (the plan fields of the goal form and their rules, mirrored from
// the backend's assertPlanConsistent; the body of create/update; the provision's monthly preview, mirrored from
// plannedCentsFor; the "aporte do mês" view; the contribution body, the 409 and the error texts; free and kept money of an
// account; the "Guardar: <nome>" text) plus the `reserve` source in utils/cashFlow.ts and utils/billsChecklist.ts.
// SAVINGS_PLAN_MODULE / CASH_FLOW_MODULE / BILLS_CHECKLIST_MODULE point at mutated copies. Invented data only.
const P: any = await import(pathToFileURL(process.env.SAVINGS_PLAN_MODULE || frontSrc('utils/savingsGoalsPlan.ts')).href);
const CF: any = await import(pathToFileURL(process.env.CASH_FLOW_MODULE || frontSrc('utils/cashFlow.ts')).href);
const B: any = await import(pathToFileURL(process.env.BILLS_CHECKLIST_MODULE || frontSrc('utils/billsChecklist.ts')).href);
const TX: any = await import(pathToFileURL(frontSrc('utils/savingsGoalsTexts.ts')).href);

const TODAY = '2026-11-10';

function draft(over: Record<string, unknown> = {}): any {
  return { kind: 'RESERVE', monthlyContribution: null, contributionDay: null, dueMonth: null, accountId: '', ...over };
}

check('SG-a: a reserve without a monthly contribution has no plan and needs nothing else', () => {
  assert.equal(P.hasPlan(draft()), false);
  assert.deepEqual(P.planErrors(draft()), []);
  assert.deepEqual(P.planErrors(draft({ monthlyContribution: 0 })), []);
});

check('SG-b: a monthly contribution needs the account and the day (the backend refuses it otherwise)', () => {
  const d = draft({ monthlyContribution: 500 });
  assert.equal(P.hasPlan(d), true);
  assert.deepEqual(P.planErrors(d).sort(), ['account', 'day']);
  assert.deepEqual(P.planErrors({ ...d, accountId: 'acc-1', contributionDay: 10 }), []);
});

check('SG-c: a provision needs the due month, the account and the day, even without a monthly value', () => {
  const d = draft({ kind: 'PROVISION' });
  assert.equal(P.hasPlan(d), true);
  assert.deepEqual(P.planErrors(d).sort(), ['account', 'day', 'dueMonth']);
  assert.deepEqual(P.planErrors({ ...d, accountId: 'acc-1', contributionDay: 5, dueMonth: '2027-03' }), []);
});

check('SG-d: the day goes from 1 to 28 (every month has it) and the due month is YYYY-MM', () => {
  const base = { monthlyContribution: 100, accountId: 'acc-1' };
  for (const bad of [0, 29, 31, 2.5, -1]) assert.deepEqual(P.planErrors(draft({ ...base, contributionDay: bad })), ['dayRange'], `day ${bad}`);
  for (const good of [1, 15, 28]) assert.deepEqual(P.planErrors(draft({ ...base, contributionDay: good })), [], `day ${good}`);
  assert.deepEqual(P.planErrors(draft({ kind: 'PROVISION', accountId: 'acc-1', contributionDay: 5, dueMonth: '2027-13' })), ['dueMonth']);
  assert.deepEqual(P.planErrors(draft({ kind: 'PROVISION', accountId: 'acc-1', contributionDay: 5, dueMonth: '27-03' })), ['dueMonth']);
});

check('SG-e: create body omits the empty plan fields; a reserve never sends a due month', () => {
  assert.deepEqual(P.planPayload(draft(), 'create'), { kind: 'RESERVE' });
  assert.deepEqual(P.planPayload(draft({ monthlyContribution: 500, contributionDay: 10, accountId: 'acc-1' }), 'create'), { kind: 'RESERVE', monthlyContribution: 500, contributionDay: 10 });
  // A due month typed before switching back to reserve is dropped (the backend refuses dueMonth on a reserve)
  assert.deepEqual(P.planPayload(draft({ monthlyContribution: 500, contributionDay: 10, dueMonth: '2027-01' }), 'create'), { kind: 'RESERVE', monthlyContribution: 500, contributionDay: 10 });
  assert.deepEqual(P.planPayload(draft({ kind: 'PROVISION', contributionDay: 5, dueMonth: '2027-03' }), 'create'), { kind: 'PROVISION', contributionDay: 5, dueMonth: '2027-03' });
});

check('SG-f: update body sends null to clear what the form left empty', () => {
  assert.deepEqual(P.planPayload(draft(), 'update'), { kind: 'RESERVE', monthlyContribution: null, contributionDay: null, dueMonth: null });
  assert.deepEqual(P.planPayload(draft({ kind: 'PROVISION', contributionDay: 5, dueMonth: '2027-03' }), 'update'), { kind: 'PROVISION', monthlyContribution: null, contributionDay: 5, dueMonth: '2027-03' });
  // Without a plan the day is not kept (it means nothing without a contribution)
  assert.deepEqual(P.planPayload(draft({ contributionDay: 10 }), 'update'), { kind: 'RESERVE', monthlyContribution: null, contributionDay: null, dueMonth: null });
});

check('SG-g: the form reads a goal back (unknown kind is a reserve, numbers from strings)', () => {
  assert.deepEqual(P.planDraftOf({ kind: 'PROVISION', monthlyContribution: '120.50', contributionDay: 7, dueMonth: '2027-02', accountId: 'acc-1' }), { kind: 'PROVISION', monthlyContribution: 120.5, contributionDay: 7, dueMonth: '2027-02', accountId: 'acc-1' });
  assert.deepEqual(P.planDraftOf({}), draft());
  assert.deepEqual(P.planDraftOf({ kind: 'OTHER', monthlyContribution: null, contributionDay: null, dueMonth: null, accountId: null }), draft());
});

check('SG-h: provision preview divides what is missing by the months left, rounded up to the cent; nothing after the due month', () => {
  // 1200 missing, Nov..Feb = 4 months -> 300
  assert.equal(P.provisionMonthlyCents({ targetCents: 150000, currentCents: 30000, monthlyCents: null, dueMonth: '2027-02', month: '2026-11' }), 30000);
  // 1000 / 3 -> 333.34 (rounded up so the target is reached on time)
  assert.equal(P.provisionMonthlyCents({ targetCents: 100000, currentCents: 0, monthlyCents: null, dueMonth: '2027-01', month: '2026-11' }), 33334);
  // the due month itself still counts
  assert.equal(P.provisionMonthlyCents({ targetCents: 100000, currentCents: 0, monthlyCents: null, dueMonth: '2026-11', month: '2026-11' }), 100000);
  assert.equal(P.provisionMonthlyCents({ targetCents: 100000, currentCents: 0, monthlyCents: null, dueMonth: '2026-10', month: '2026-11' }), 0);
  // a typed monthly value wins, capped at what is missing
  assert.equal(P.provisionMonthlyCents({ targetCents: 100000, currentCents: 0, monthlyCents: 20000, dueMonth: '2027-06', month: '2026-11' }), 20000);
  assert.equal(P.provisionMonthlyCents({ targetCents: 100000, currentCents: 95000, monthlyCents: 20000, dueMonth: '2027-06', month: '2026-11' }), 5000);
  assert.equal(P.provisionMonthlyCents({ targetCents: 100000, currentCents: 100000, monthlyCents: null, dueMonth: '2027-06', month: '2026-11' }), 0);
  assert.equal(P.provisionMonthlyCents({ targetCents: 100000, currentCents: 0, monthlyCents: null, dueMonth: null, month: '2026-11' }), 0);
});

check('SG-i: the month of the contribution: pending asks nothing, done offers undo, none asks the amount', () => {
  const pending = P.thisMonthView({ month: '2026-11', status: 'pending', date: '2026-11-15', plannedAmount: 500, contributedAmount: 0 }, TODAY);
  assert.deepEqual(pending, { status: 'pending', plannedCents: 50000, contributedCents: 0, day: '15/11', late: false, mode: 'planned', canUndo: false });
  const late = P.thisMonthView({ month: '2026-11', status: 'pending', date: '2026-11-05', plannedAmount: 500, contributedAmount: 0 }, TODAY);
  assert.equal(late.late, true);
  const done = P.thisMonthView({ month: '2026-11', status: 'done', date: '2026-11-05', plannedAmount: 0, contributedAmount: 500.1 }, TODAY);
  assert.deepEqual(done, { status: 'done', plannedCents: 0, contributedCents: 50010, day: '05/11', late: false, mode: 'ask', canUndo: true });
  const none = P.thisMonthView({ month: '2026-11', status: 'none', date: null, plannedAmount: 0, contributedAmount: 0 }, TODAY);
  assert.deepEqual(none, { status: 'none', plannedCents: 0, contributedCents: 0, day: '', late: false, mode: 'ask', canUndo: false });
  // an answer without thisMonth (old backend) is "none"
  assert.equal(P.thisMonthView(undefined, TODAY).status, 'none');
});

check('SG-j: "Guardar agora" needs a linked account and something still missing', () => {
  assert.equal(P.canContribute({ accountId: 'acc-1', targetAmount: 1000, currentAmount: 999.99 }), true);
  assert.equal(P.canContribute({ accountId: 'acc-1', targetAmount: 1000, currentAmount: 1000 }), false);
  assert.equal(P.canContribute({ accountId: undefined, targetAmount: 1000, currentAmount: 0 }), false);
  assert.equal(P.canContribute({ accountId: '', targetAmount: 1000, currentAmount: 0 }), false);
});

check('SG-k: the contribution body: no amount uses the plan, the date only when given, confirmDuplicate only on the retry', () => {
  assert.deepEqual(P.contributionBody({}), {});
  assert.deepEqual(P.contributionBody({ amountCents: 12345 }), { amount: 123.45 });
  assert.deepEqual(P.contributionBody({ date: '2026-11-15' }), { date: '2026-11-15' });
  assert.deepEqual(P.contributionBody({ date: 'nope' }), {});
  assert.deepEqual(P.contributionBody({ amountCents: 100, confirmDuplicate: true }), { amount: 1, confirmDuplicate: true });
});

check('SG-l: a 409 is the duplicate question; 400 texts by what the backend says', () => {
  assert.equal(P.isDuplicateContribution({ status: 409 }), true);
  assert.equal(P.isDuplicateContribution({ status: 400 }), false);
  assert.equal(P.isDuplicateContribution(null), false);
  assert.equal(P.contributionErrorKey({ status: 400, message: 'This amount would exceed the target. Maximum allowed: 12.5' }), 'goalsErrExceeds');
  assert.equal(P.contributionErrorKey({ status: 400, message: 'Link the goal to an account before putting money in it' }), 'goalsErrNoAccount');
  assert.equal(P.contributionErrorKey({ status: 400, message: 'Nothing planned for this month: inform the amount' }), 'goalsErrNothingPlanned');
  assert.equal(P.contributionErrorKey({ status: 500, message: 'boom' }), 'goalsErrContribute');
  assert.equal(P.contributionErrorKey(undefined), 'goalsErrContribute');
  assert.equal(P.maxAllowedOf({ message: 'This amount would exceed the target. Maximum allowed: 12.5' }), 12.5);
  assert.equal(P.maxAllowedOf({ message: 'other' }), null);
});

check('SG-m: amount typed for a contribution: cents from the mask, never more than what is missing', () => {
  assert.equal(P.parseAmountCents('1.234,56'), 123456);
  assert.equal(P.parseAmountCents('R$ 0,10'), 10);
  assert.equal(P.parseAmountCents(''), 0);
  assert.equal(P.amountError(0, 100000), 'goalsErrAmount');
  assert.equal(P.amountError(100001, 100000), 'goalsErrExceeds');
  assert.equal(P.amountError(100000, 100000), null);
});

check('SG-n: free and kept money of an account, in cents; negative free is flagged', () => {
  const summary = { accounts: [
    { accountId: 'acc-1', name: 'Conta A', type: 'CHECKING', balance: 1200.1, allocated: 1000.2, free: 199.9 },
    { accountId: 'acc-3', name: 'Conta C', type: 'CHECKING', balance: 300, allocated: 450, free: -150 },
  ], totalAllocated: 1450.2 };
  const map = P.splitsByAccount(summary);
  assert.deepEqual(map.get('acc-1'), { balanceCents: 120010, allocatedCents: 100020, freeCents: 19990, negative: false });
  assert.deepEqual(map.get('acc-3'), { balanceCents: 30000, allocatedCents: 45000, freeCents: -15000, negative: true });
  assert.equal(map.get('acc-x'), undefined);
  assert.equal(P.splitsByAccount(undefined).size, 0);
  assert.equal(P.splitsByAccount({ data: summary }).size, 2, 'accepts the envelope too');
});

check('SG-o: the reserve line reads "Guardar: <nome>", whatever the description holds', () => {
  assert.equal(P.reserveText('Guardar: Casamento', 'Casamento'), 'Guardar: Casamento');
  assert.equal(P.reserveText('Casamento', undefined), 'Guardar: Casamento');
  assert.equal(P.reserveText('', 'Viagem'), 'Guardar: Viagem');
  assert.equal(P.reserveText('', undefined), 'Guardar');
});

check('SG-p: the cash flow knows the reserve source (label, order after invoices) and the free/kept split', () => {
  assert.equal(CF.sourceTextKey('reserve'), 'cashFlowSourceReserve');
  const ev = (source: string, sourceId: string) => ({ date: TODAY, description: 'x', amount: -1, source, certainty: 'expected', overdue: false, originalDate: null, sourceId, accountId: 'a', invoiceMonth: null });
  const order = CF.allEvents({ days: [{ date: TODAY, events: [ev('reserve', 'r'), ev('invoice', 'i'), ev('pending', 'p')] }] }).map((e: { source: string }) => e.source);
  assert.deepEqual(order, ['pending', 'invoice', 'reserve']);
  assert.deepEqual(CF.balanceSplit({ startingBalance: 200, allocated: 1000, totalBalance: 1200 }), { free: 200, allocated: 1000, total: 1200 });
  assert.equal(CF.balanceSplit({ startingBalance: 200, allocated: 0, totalBalance: 200 }), null);
  assert.equal(CF.balanceSplit({ startingBalance: 200 }), null, 'old answer without allocated');
  // total computed in cents when the answer has no totalBalance
  assert.deepEqual(CF.balanceSplit({ startingBalance: 0.1, allocated: 0.2 }), { free: 0.1, allocated: 0.2, total: 0.3 });
});

check('SG-q: the bills list shows the reserve as its own kind with the "mark done" action on the event day', () => {
  const evs = [
    { date: '2026-11-15', description: 'Guardar: Casamento', amount: -500, source: 'reserve', certainty: 'expected', overdue: false, originalDate: null, sourceId: 'goal-1', accountId: 'acc-1', invoiceMonth: null },
    { date: TODAY, description: 'Guardar: Seguro', amount: -80, source: 'reserve', certainty: 'expected', overdue: true, originalDate: '2026-11-05', sourceId: 'goal-2', accountId: 'acc-1', invoiceMonth: null },
  ];
  const bills = B.buildBills(evs, TODAY);
  assert.deepEqual(bills.map((b: { kind: string }) => b.kind), ['reserve', 'reserve']);
  assert.equal(B.billSourceTextKey('reserve'), 'billsSourceReserve');
  assert.deepEqual(B.billAction(bills[0]), { type: 'reserve', goalId: 'goal-2', date: TODAY });
  assert.deepEqual(B.billAction(bills[1]), { type: 'reserve', goalId: 'goal-1', date: '2026-11-15' });
});

check('SG-r: texts: every key has Portuguese, the placeholders fill, and pt-BR.json/en-US.json have them', () => {
  assert.equal(TX.goalsText({}, 'goalsReserveFor', { name: 'Casa' }), 'Guardar: Casa');
  assert.equal(TX.goalsText({ goalsReserveFor: 'Keep: {name}' }, 'goalsReserveFor', { name: 'Casa' }), 'Keep: Casa');
  for (const locale of ['pt-BR', 'en-US']) {
    const json = JSON.parse(readFileSync(frontSrc(`i18n/${locale}.json`), 'utf8'));
    const missing = Object.keys(TX.GOALS_TEXTS_PT).filter((k) => typeof json[k] !== 'string');
    assert.deepEqual(missing, [], `${locale} misses keys`);
    for (const k of ['cashFlowSourceReserve', 'billsSourceReserve', 'billsMarkReserveDone']) assert.equal(typeof json[k], 'string', `${locale} ${k}`);
  }
});

summary();
