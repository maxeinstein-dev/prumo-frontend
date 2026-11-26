import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P18 L3: fração do gasto no crédito (Início) e parcelas que faltam (Cartões). Lógica pura de utils/creditVsDebit.ts.
// Dados inventados. CREDIT_VS_DEBIT_MODULE aponta para uma cópia alterada do módulo (sabotagem).
const modPath = process.env.CREDIT_VS_DEBIT_MODULE || frontSrc('utils/creditVsDebit.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(modPath).href);

console.log('\n[crédito × débito] utils/creditVsDebit.ts');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const month = (m: string, credit: number, other: number): any => {
  const total = Math.round((credit + other) * 100) / 100;
  return { month: m, credit, other, total, creditShare: total > 0 ? Math.round((credit / total) * 10000) / 10000 : null };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const response = (months: any[]): any => ({ basis: 'own-share', months, totals: month('x', 0, 0) });

check('creditShareLine: the current month (the last one) in whole percent, and the months before it, oldest first', () => {
  const line = S.creditShareLine(response([
    month('2026-08', 900, 100), month('2026-09', 750, 250), month('2026-10', 600, 400), month('2026-11', 290, 210),
  ]), 'pt-BR');
  assert.equal(line.current.percent, '58%');
  assert.equal(line.current.month, '2026-11');
  assert.deepEqual(line.previous.map((p: { label: string; percent: string }) => [p.label, p.percent]), [['ago', '90%'], ['set', '75%'], ['out', '60%']]);
});

check('creditShareLine: a month with no spending shows a dash, never 0% nor NaN', () => {
  const line = S.creditShareLine(response([month('2026-10', 500, 500), month('2026-11', 0, 0)]), 'pt-BR');
  assert.equal(line.current.percent, '–');
  assert.equal(line.current.share, null);
  assert.equal(line.previous[0].percent, '50%');
});

check('creditShareLine: nothing to show when no month has spending, or without data', () => {
  assert.equal(S.creditShareLine(response([month('2026-10', 0, 0), month('2026-11', 0, 0)]), 'pt-BR'), null);
  assert.equal(S.creditShareLine(response([]), 'pt-BR'), null);
  assert.equal(S.creditShareLine(undefined, 'pt-BR'), null);
});

check('creditShareLine: trend down (good) or up (bad) against the month before, only when both have spending', () => {
  assert.equal(S.creditShareLine(response([month('2026-10', 600, 400), month('2026-11', 290, 210)]), 'pt-BR').trend, 'down');
  assert.equal(S.creditShareLine(response([month('2026-10', 100, 900), month('2026-11', 290, 210)]), 'pt-BR').trend, 'up');
  assert.equal(S.creditShareLine(response([month('2026-10', 580, 420), month('2026-11', 290, 210)]), 'pt-BR').trend, 'same');
  assert.equal(S.creditShareLine(response([month('2026-10', 0, 0), month('2026-11', 290, 210)]), 'pt-BR').trend, null);
});

check('creditShareLine: 100% and 0% read as such; 99.6% rounds to 100%', () => {
  assert.equal(S.creditShareLine(response([month('2026-11', 50, 0)]), 'pt-BR').current.percent, '100%');
  assert.equal(S.creditShareLine(response([month('2026-11', 0, 50)]), 'pt-BR').current.percent, '0%');
  assert.equal(S.creditShareLine(response([month('2026-11', 996, 4)]), 'pt-BR').current.percent, '100%');
});

check('installmentsLeftLine: amount in cents, count, last invoice as MM/AAAA, and singular for one purchase', () => {
  assert.deepEqual(S.installmentsLeftLine({ outstanding: 2954.02, activeCount: 6, lastMonth: '2027-06' }),
    { cents: 295402, count: 6, lastLabel: '06/2027', one: false });
  assert.equal(S.installmentsLeftLine({ outstanding: 84.1, activeCount: 1, lastMonth: '2026-12' }).one, true);
});

check('installmentsLeftLine: nothing when no parcel is left, or when the route has no installments block', () => {
  assert.equal(S.installmentsLeftLine({ outstanding: 0, activeCount: 0, lastMonth: null }), null);
  assert.equal(S.installmentsLeftLine(undefined), null);
  assert.equal(S.installmentsLeftLine(null), null);
  assert.equal(S.installmentsLeftLine({ outstanding: -1, activeCount: 1, lastMonth: '2026-12' }), null);
});
