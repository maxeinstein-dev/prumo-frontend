import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Projected cash flow page (web): src/utils/cashFlow.ts (full daily series, lowest and first negative day, cents, order and
// grouping of the events, labels by source / certainty / overdue, cash accounts, period) and src/utils/cashFlowTexts.ts
// (placeholders and the locale fallback). CASH_FLOW_MODULE points at a mutated copy for the bite-checks. Invented data only.
// Dates are 'YYYY-MM-DD' strings, so no test depends on the time zone of the machine.
const cfPath = process.env.CASH_FLOW_MODULE || frontSrc('utils/cashFlow.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(cfPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(frontSrc('utils/cashFlowTexts.ts')).href);

const TODAY = '2026-11-10';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ev(over: Record<string, any> = {}): any {
  return {
    date: TODAY, description: 'Item', amount: -10, source: 'pending', certainty: 'confirmed', overdue: false,
    originalDate: null, sourceId: 'id-1', accountId: 'acc-main', invoiceMonth: null, ...over,
  };
}

// A response in the shape of GET /dashboard/cash-flow (the fields the screen reads), built from the day list.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function response(days: number, startingBalance: number, dayList: any[], from = TODAY): any {
  return {
    currency: 'BRL',
    period: { from, to: C.addDays(from, days), days },
    startingBalance,
    days: dayList,
    summary: {},
    unassignedInvoices: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dayOf(date: string, events: any[], endBalance = 0): any {
  const inflow = events.filter((e) => e.amount > 0).reduce((s, e) => s + e.amount, 0);
  const outflow = events.filter((e) => e.amount < 0).reduce((s, e) => s - e.amount, 0);
  return { date, events, inflow, outflow, net: inflow - outflow, endBalance };
}

console.log('\n[CF] projected cash flow');

check('CF-a: full daily series with holes: the balance carries over the days without events', () => {
  const r = response(5, 1000, [
    dayOf('2026-11-12', [ev({ date: '2026-11-12', amount: -300 })]),
    dayOf('2026-11-14', [ev({ date: '2026-11-14', amount: 50.5, source: 'recurrence' })]),
  ]);
  const s = C.buildDailySeries(r);
  assert.deepEqual(s.map((p: { date: string }) => p.date), ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
  assert.deepEqual(s.map((p: { balance: number }) => p.balance), [1000, 1000, 700, 700, 750.5, 750.5]);
  assert.deepEqual(s.map((p: { hasEvents: boolean }) => p.hasEvents), [false, false, true, false, true, false]);
});

check('CF-b: a day without events after a negative day keeps the negative balance', () => {
  const r = response(3, 100, [dayOf('2026-11-11', [ev({ date: '2026-11-11', amount: -250 })])]);
  const s = C.buildDailySeries(r);
  assert.deepEqual(s.map((p: { balance: number }) => p.balance), [100, -150, -150, -150]);
  assert.equal(C.firstNegativeDate(s), '2026-11-11');
});

check('CF-c: period without any event: days + 1 points, all at the starting balance, no negative day', () => {
  const s = C.buildDailySeries(response(90, 2500.25, []));
  assert.equal(s.length, 91);
  assert.equal(s[0].date, TODAY);
  assert.equal(s[90].date, '2027-02-08');
  assert.ok(s.every((p: { balance: number; hasEvents: boolean }) => p.balance === 2500.25 && !p.hasEvents));
  assert.deepEqual(C.lowestPoint(s), { date: TODAY, amount: 2500.25 });
  assert.equal(C.firstNegativeDate(s), null);
});

check('CF-d: money in whole cents: 0.1 + 0.2 - 0.3 is exactly zero, and one cent below zero is negative', () => {
  const r = response(2, 0.1, [
    dayOf('2026-11-10', [ev({ amount: 0.2, source: 'pending' })]),
    dayOf('2026-11-11', [ev({ date: '2026-11-11', amount: -0.3 })]),
  ]);
  const s = C.buildDailySeries(r);
  assert.equal(s[0].balance, 0.3);
  assert.equal(s[1].balance, 0);
  assert.equal(s[2].balance, 0);
  assert.equal(C.firstNegativeDate(s), null);
  const tail = C.buildDailySeries(response(1, 0, [dayOf('2026-11-11', [ev({ date: '2026-11-11', amount: -0.01 })])]));
  assert.equal(C.firstNegativeDate(tail), '2026-11-11');
  assert.equal(C.toCents(0.29), 29);
  assert.equal(C.toCents(1234.56), 123456);
});

check('CF-e: lowest balance: the earliest day on a tie; null for an empty series', () => {
  const s = [
    { date: '2026-11-10', balance: 10, net: 0, hasEvents: false },
    { date: '2026-11-11', balance: -5, net: -15, hasEvents: true },
    { date: '2026-11-12', balance: 20, net: 25, hasEvents: true },
    { date: '2026-11-13', balance: -5, net: 0, hasEvents: true },
  ];
  assert.deepEqual(C.lowestPoint(s), { date: '2026-11-11', amount: -5 });
  assert.equal(C.lowestPoint([]), null);
});

check('CF-f: events after the end of the period do not reach the series', () => {
  const r = response(2, 100, [dayOf('2026-11-13', [ev({ date: '2026-11-13', amount: -999 })])]);
  const s = C.buildDailySeries(r);
  assert.equal(s.length, 3);
  assert.ok(s.every((p: { balance: number }) => p.balance === 100));
});

check('CF-g: the series agrees with the backend endBalance on every day that has events', () => {
  const r = response(10, 500, [
    dayOf('2026-11-10', [ev({ amount: -120.1, overdue: true, originalDate: '2026-11-05' }), ev({ amount: 40, sourceId: 'b' })], 419.9),
    dayOf('2026-11-16', [ev({ date: '2026-11-16', amount: 1000.5, source: 'recurrence' })], 1420.4),
  ]);
  const s = C.buildDailySeries(r);
  for (const day of r.days) {
    const point = s.find((p: { date: string }) => p.date === day.date);
    assert.equal(point.balance, day.endBalance);
  }
});

check('CF-h: events in one order: day, source (pending, recurrence, invoice), description, id, amount', () => {
  const list = [
    ev({ date: '2026-11-12', source: 'invoice', description: 'Fatura', sourceId: 'c' }),
    ev({ date: '2026-11-12', source: 'recurrence', description: 'Salário', sourceId: 'b' }),
    ev({ date: '2026-11-12', source: 'pending', description: 'Mercado', sourceId: 'z' }),
    ev({ date: '2026-11-10', source: 'invoice', description: 'Fatura antiga', sourceId: 'a' }),
    ev({ date: '2026-11-12', source: 'pending', description: 'Mercado', sourceId: 'y', amount: -5 }),
    ev({ date: '2026-11-12', source: 'pending', description: 'Mercado', sourceId: 'y', amount: -50 }),
  ];
  const r = response(5, 0, [dayOf('2026-11-10', [list[3]]), dayOf('2026-11-12', list.slice(0, 3).concat(list.slice(4)))]);
  const sorted = C.allEvents({ days: [r.days[1], r.days[0]] }).map((e: { date: string; source: string; description: string; sourceId: string; amount: number }) => `${e.date}|${e.source}|${e.description}|${e.sourceId}|${e.amount}`);
  assert.deepEqual(sorted, [
    '2026-11-10|invoice|Fatura antiga|a|-10',
    '2026-11-12|pending|Mercado|y|-50',
    '2026-11-12|pending|Mercado|y|-5',
    '2026-11-12|pending|Mercado|z|-10',
    '2026-11-12|recurrence|Salário|b|-10',
    '2026-11-12|invoice|Fatura|c|-10',
  ]);
});

check('CF-i: grouping by day: groups in date order, inflow, outflow and net in money without float drift', () => {
  const events = [
    ev({ date: '2026-11-12', amount: 0.1, source: 'recurrence', sourceId: 'r' }),
    ev({ date: '2026-11-12', amount: 0.2, source: 'recurrence', sourceId: 's' }),
    ev({ date: '2026-11-12', amount: -0.3, source: 'pending', sourceId: 'p' }),
    ev({ date: '2026-11-11', amount: -7.25, sourceId: 'q' }),
  ];
  const groups = C.groupEventsByDay(events);
  assert.deepEqual(groups.map((g: { date: string }) => g.date), ['2026-11-11', '2026-11-12']);
  assert.equal(groups[0].outflow, 7.25);
  assert.equal(groups[0].net, -7.25);
  assert.equal(groups[1].inflow, 0.3);
  assert.equal(groups[1].outflow, 0.3);
  assert.equal(groups[1].net, 0);
  assert.equal(groups[1].events.length, 3);
  assert.deepEqual(groups[1].events.map((e: { sourceId: string }) => e.sourceId), ['p', 'r', 's']);
});

check('CF-j: date helpers cut the strings (no time zone): addDays across months and leap years; labels; invalid input', () => {
  assert.equal(C.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(C.addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(C.addDays('2027-02-28', 1), '2027-03-01');
  assert.equal(C.addDays('2026-11-10', 0), '2026-11-10');
  assert.equal(C.shortDate('2026-11-09'), '09/11');
  assert.equal(C.longDate('2026-11-09'), '09/11/2026');
  assert.equal(C.monthLabel('2026-11'), '11/2026');
  assert.equal(C.shortDate('09/11/2026'), '');
  assert.equal(C.shortDate(null), '');
  assert.equal(C.longDate(undefined), '');
  assert.equal(C.monthLabel('2026-1'), '');
  assert.equal(C.isDayKey('2026-02-30x'), false);
});

check('CF-k: labels by source, certainty and overdue; the overdue badge needs an original day', () => {
  assert.equal(C.sourceTextKey('pending'), 'cashFlowSourcePending');
  assert.equal(C.sourceTextKey('recurrence'), 'cashFlowSourceRecurrence');
  assert.equal(C.sourceTextKey('invoice'), 'cashFlowSourceInvoice');
  assert.equal(C.certaintyTextKey('estimated'), 'cashFlowCertaintyEstimated');
  assert.equal(C.certaintyTextKey('expected'), 'cashFlowCertaintyExpected');
  assert.equal(C.certaintyTextKey('confirmed'), 'cashFlowCertaintyConfirmed');
  assert.equal(C.isEstimated({ certainty: 'estimated' }), true);
  assert.equal(C.isEstimated({ certainty: 'expected' }), false);
  assert.deepEqual(C.overdueDetail({ overdue: true, originalDate: '2026-11-05' }), { date: '05/11' });
  assert.equal(C.overdueDetail({ overdue: false, originalDate: '2026-11-05' }), null);
  assert.equal(C.overdueDetail({ overdue: true, originalDate: null }), null);
  assert.equal(C.reasonTextKey('no_payer_account'), 'cashFlowUnassignedNoPayer');
  assert.equal(C.reasonTextKey('no_due_date'), 'cashFlowUnassignedNoDue');
});

check('CF-l: estimated notice: none at zero, singular for one, plural with the count', () => {
  assert.equal(C.estimatedNotice(0), null);
  assert.deepEqual(C.estimatedNotice(1), { key: 'cashFlowEstimatedOne', vars: { count: 1 } });
  assert.deepEqual(C.estimatedNotice(3), { key: 'cashFlowEstimatedMany', vars: { count: 3 } });
});

check('CF-m: tone of an amount: income, expense, neutral at zero', () => {
  assert.equal(C.eventTone(12.5), 'income');
  assert.equal(C.eventTone(-0.01), 'expense');
  assert.equal(C.eventTone(0), 'neutral');
});

check('CF-n: texts: the locale value wins, Portuguese fills a missing key, placeholders are filled', () => {
  assert.equal(T.cashFlowText({ cashFlowRetry: 'Try again' }, 'cashFlowRetry'), 'Try again');
  assert.equal(T.cashFlowText({}, 'cashFlowRetry'), 'Tentar de novo');
  assert.equal(T.cashFlowText(undefined, 'cashFlowRetry'), 'Tentar de novo');
  assert.equal(T.cashFlowText({}, 'cashFlowOnDate', { date: '09/11' }), 'em 09/11');
  assert.equal(T.cashFlowText({}, 'cashFlowEstimatedMany', { count: 4 }), '4 eventos são estimados: o valor não é firme.');
  assert.equal(T.cashFlowText({}, 'cashFlowOnDate', {}), 'em {date}');
  assert.equal(T.cashFlowText({ cashFlowOnDate: 'on {date}' }, 'cashFlowOnDate', { date: '09/11' }), 'on 09/11');
});

check('CF-o: cash accounts: active checking, savings and cash only; cards, investments and inactive ones are out', () => {
  const accounts = [
    { id: 'a', name: 'Conta', type: 'CHECKING', isActive: true },
    { id: 'b', name: 'Poupança', type: 'SAVINGS', isActive: true },
    { id: 'c', name: 'Cartão', type: 'CREDIT', isActive: true },
    { id: 'd', name: 'Carteira', type: 'CASH', isActive: true },
    { id: 'e', name: 'Corretora', type: 'INVESTMENT', isActive: true },
    { id: 'f', name: 'Antiga', type: 'CHECKING', isActive: false },
  ];
  assert.deepEqual(C.cashAccounts(accounts).map((a: { id: string }) => a.id), ['a', 'b', 'd']);
});

check('CF-p: the period: 30, 60 or 90 are kept; anything else is the default of 90', () => {
  assert.equal(C.normalizePeriod(30), 30);
  assert.equal(C.normalizePeriod(60), 60);
  assert.equal(C.normalizePeriod(90), 90);
  assert.equal(C.normalizePeriod(45), 30);
  assert.equal(C.normalizePeriod('30'), 30);
  assert.equal(C.normalizePeriod(undefined), 30);
  assert.deepEqual(C.CASH_FLOW_PERIODS, [30, 60, 90]);
});

check('CF-q: the first negative day is the first point below zero, not the lowest one', () => {
  const s = [
    { date: '2026-11-10', balance: 5, net: 0, hasEvents: false },
    { date: '2026-11-11', balance: -20, net: -25, hasEvents: true },
    { date: '2026-11-12', balance: -90, net: -70, hasEvents: true },
  ];
  assert.equal(C.firstNegativeDate(s), '2026-11-11');
  assert.deepEqual(C.lowestPoint(s), { date: '2026-11-12', amount: -90 });
});
