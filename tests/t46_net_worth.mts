import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Net worth page: src/utils/netWorth.ts (series, variation, composition groups, estimate flags, valuation form) and
// src/utils/netWorthTexts.ts. NET_WORTH_MODULE points at a mutated copy for the bite-checks. Invented data only.
const path = process.env.NET_WORTH_MODULE || frontSrc('utils/netWorth.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const N: any = await import(pathToFileURL(path).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(frontSrc('utils/netWorthTexts.ts')).href);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const month = (m: string, over: Record<string, any> = {}): any => ({
  month: m, cash: 0, investments: 0, reserves: 0, fgts: 0, cardDebt: 0, total: 0,
  savings: { income: 0, expense: 0, surplus: 0, contributed: 0, rate: null }, ...over,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const data = (months: any[], composition: any[] = []): any => ({ currency: 'BRL', incomeBasis: 'realized', months, composition });

console.log('\n[NW] net worth page');

check('NW-a: month labels in Portuguese, short and with the year', () => {
  assert.equal(N.monthLabel('2026-10'), 'out/26');
  assert.equal(N.monthLabel('2027-01'), 'jan/27');
  assert.equal(N.monthLabel('2026-03', true), 'março de 2026');
});

check('NW-b: the headline is the last month; the variation is against the one before, in reais and percent', () => {
  const d = data([month('2026-09', { total: 1000 }), month('2026-10', { total: 1250 })]);
  assert.equal(N.latest(d).month, '2026-10');
  assert.deepEqual(N.variation(d), { amount: 250, percent: 25 });
});

check('NW-c: no variation with a single month, and no percent when the month before was zero or negative', () => {
  assert.equal(N.variation(data([month('2026-10', { total: 5 })])), null);
  assert.deepEqual(N.variation(data([month('2026-09', { total: 0 }), month('2026-10', { total: 300 })])), { amount: 300, percent: null });
  assert.deepEqual(N.variation(data([month('2026-09', { total: -100 }), month('2026-10', { total: 50 })])), { amount: 150, percent: null });
});

check('NW-d: money in whole cents: the variation of 0.1 + 0.2 is not 0.30000000000000004', () => {
  const d = data([month('2026-09', { total: 0.1 }), month('2026-10', { total: 0.3 })]);
  assert.equal(N.variation(d).amount, 0.2);
});

check('NW-e: the chart series keeps the order of the months and carries the total and the label', () => {
  const s = N.chartSeries(data([month('2026-09', { total: 10 }), month('2026-10', { total: 20 })]));
  assert.deepEqual(s, [{ month: '2026-09', label: 'set/26', total: 10 }, { month: '2026-10', label: 'out/26', total: 20 }]);
});

check('NW-f: composition groups by kind, in the order of the screen; reserves and cards only when they exist', () => {
  const items = [
    { kind: 'fgts', id: 'f', name: 'Empresa', amount: 900, estimated: true, valuationDate: null },
    { kind: 'cash', id: 'a', name: 'Conta', amount: 100, estimated: false, valuationDate: null },
    { kind: 'investment', id: 'i', name: 'Corretora', amount: 500, estimated: false, valuationDate: '2026-10-31' },
    { kind: 'card', id: 'k', name: 'Cartao', amount: -50, estimated: false, valuationDate: null },
  ];
  const groups = N.compositionGroups(items);
  assert.deepEqual(groups.map((g: { kind: string }) => g.kind), ['cash', 'investment', 'fgts', 'card']);
  assert.equal(groups[0].total, 100);
  assert.equal(groups[3].total, -50);
  assert.equal(groups[2].estimated, true);
  assert.equal(groups[1].estimated, false);
});

check('NW-g: the sum of the groups is the sum of the items (what the user adds by hand)', () => {
  const items = [
    { kind: 'cash', id: 'a', name: 'A', amount: 0.1, estimated: false, valuationDate: null },
    { kind: 'cash', id: 'b', name: 'B', amount: 0.2, estimated: false, valuationDate: null },
    { kind: 'card', id: 'k', name: 'K', amount: -0.3, estimated: false, valuationDate: null },
  ];
  assert.equal(N.compositionGroups(items).reduce((s: number, g: { total: number }) => s + g.total, 0), 0);
});

check('NW-h: the estimate notice lists what is estimated, in words, and is absent when nothing is', () => {
  const none = data([month('2026-10')], [{ kind: 'cash', id: 'a', name: 'A', amount: 1, estimated: false, valuationDate: null }]);
  assert.deepEqual(N.estimatedKinds(none), []);
  const some = data([month('2026-10')], [
    { kind: 'investment', id: 'i', name: 'I', amount: 1, estimated: true, valuationDate: null },
    { kind: 'fgts', id: 'f', name: 'F', amount: 1, estimated: true, valuationDate: null },
    { kind: 'fgts', id: 'g', name: 'G', amount: 1, estimated: true, valuationDate: null },
  ]);
  assert.deepEqual(N.estimatedKinds(some), ['investment', 'fgts']);
});

check('NW-i: savings rate as a percent text; no income means no rate (a dash, never 0%)', () => {
  assert.equal(N.rateText(0.62), '62%');
  assert.equal(N.rateText(0.1234), '12,3%');
  assert.equal(N.rateText(-0.05), '-5%');
  assert.equal(N.rateText(null), '—');
});

check('NW-j: the savings month to show is the current one when it has income, else the last with income', () => {
  const d = data([
    month('2026-09', { savings: { income: 100, expense: 50, surplus: 50, contributed: 0, rate: 0.5 } }),
    month('2026-10', { savings: { income: 200, expense: 50, surplus: 150, contributed: 10, rate: 0.75 } }),
    month('2026-11'),
  ]);
  assert.equal(N.savingsMonth(d).month, '2026-10');
  assert.equal(N.savingsMonth(data([month('2026-11')])), null);
});

check('NW-k: the valuation form: amount in cents typed, date valid and not in the future', () => {
  const ok = N.valuationBody({ date: '2026-10-31', cents: 1050050 }, '2026-11-12');
  assert.deepEqual(ok, { ok: true, body: { date: '2026-10-31', amount: 10500.5 } });
  assert.deepEqual(N.valuationBody({ date: '2026-10-31', cents: 0 }, '2026-11-12'), { ok: true, body: { date: '2026-10-31', amount: 0 } });
  assert.deepEqual(N.valuationBody({ date: '2026-10-31', cents: null }, '2026-11-12'), { ok: false, error: 'amount' });
  assert.deepEqual(N.valuationBody({ date: '2026-10-31', cents: -5 }, '2026-11-12'), { ok: false, error: 'amount' });
  assert.deepEqual(N.valuationBody({ date: '2026-02-31', cents: 5 }, '2026-11-12'), { ok: false, error: 'date' });
  assert.deepEqual(N.valuationBody({ date: '', cents: 5 }, '2026-11-12'), { ok: false, error: 'date' });
  assert.deepEqual(N.valuationBody({ date: '2026-11-13', cents: 5 }, '2026-11-12'), { ok: false, error: 'future' });
  assert.equal(N.valuationBody({ date: '2026-11-12', cents: 5 }, '2026-11-12').ok, true);
});

check('NW-l: the suggested date of the value is the last day of the last closed month', () => {
  assert.equal(N.suggestedValuationDate('2026-11-12'), '2026-10-31');
  assert.equal(N.suggestedValuationDate('2026-03-01'), '2026-02-28');
  assert.equal(N.suggestedValuationDate('2026-01-15'), '2025-12-31');
});

check('NW-m: only investment accounts take a value; inactive ones and cards stay out', () => {
  const list = [
    { id: '1', type: 'INVESTMENT', name: 'A', isActive: true },
    { id: '2', type: 'CHECKING', name: 'B', isActive: true },
    { id: '3', type: 'INVESTMENT', name: 'C', isActive: false },
    { id: '4', type: 'CREDIT', name: 'D', isActive: true },
  ];
  assert.deepEqual(N.investmentAccounts(list).map((a: { id: string }) => a.id), ['1']);
});

check('NW-n: texts fill the placeholders and fall back to Portuguese', () => {
  assert.equal(T.netWorthText({}, 'netWorthTitle'), 'Patrimônio');
  assert.equal(T.netWorthText({ netWorthTitle: 'Net worth' }, 'netWorthTitle'), 'Net worth');
  assert.match(T.netWorthText({}, 'netWorthSavingsBasis', { month: 'out/26' }), /out\/26/);
});
