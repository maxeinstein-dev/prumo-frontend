import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// Own share of a budget (src/utils/budgetOwnShare.ts). Invented data only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const O: any = await import(pathToFileURL(frontSrc(process.env.OWN_SHARE_MODULE ?? 'utils/budgetOwnShare.ts')).href);

check('O-a: a budget where others owe part shows the own share and what others owe', () => {
  const map = O.ownShareByBudget([{ budgetId: 'b1', spending: 510, ownSpent: 308.33 }]);
  assert.deepEqual(map.get('b1'), { ownSpent: 308.33, othersOwe: 201.67 });
});

check('O-b: no division (own share equals the spending) is left out, also with float noise below one cent', () => {
  const map = O.ownShareByBudget([
    { budgetId: 'b1', spending: 100, ownSpent: 100 },
    { budgetId: 'b2', spending: 0.3, ownSpent: 0.1 + 0.2 },
  ]);
  assert.equal(map.size, 0);
});

check('O-c: an older API without ownSpent, or an invalid number, is left out; undefined rows give an empty map', () => {
  assert.equal(O.ownShareByBudget([{ budgetId: 'b1', spending: 100 }, { budgetId: 'b2', spending: 100, ownSpent: Number.NaN }]).size, 0);
  assert.equal(O.ownShareByBudget(undefined).size, 0);
});

check('O-d: one cent of difference is enough; a negative own share is floored at zero', () => {
  const map = O.ownShareByBudget([
    { budgetId: 'b1', spending: 10, ownSpent: 9.99 },
    { budgetId: 'b2', spending: 50, ownSpent: -3 },
  ]);
  assert.deepEqual(map.get('b1'), { ownSpent: 9.99, othersOwe: 0.01 });
  assert.deepEqual(map.get('b2'), { ownSpent: 0, othersOwe: 50 });
});

check('O-e: percentage of the limit, zero without a limit; the summary month is the local YYYY-MM', () => {
  assert.equal(O.ownSharePercentage(250, 1000), 25);
  assert.equal(O.ownSharePercentage(250, 0), 0);
  assert.equal(O.summaryMonthOf(new Date(2026, 0, 31)), '2026-01');
  assert.equal(O.summaryMonthOf(new Date(2026, 11, 1)), '2026-12');
});

check('O-f: every number of a budget comes from its summary row: spent, remaining, percentage and status', () => {
  const r = O.budgetRealized(1000, { budgetId: 'b1', spending: 778.97, ownSpent: 678.97 }, true);
  assert.deepEqual(r, { measure: 'WHOLE', spent: 778.97, measured: 778.97, ownSpent: 678.97, remaining: 221.03, percentage: 77.897, status: 'ok' });
  assert.equal(O.budgetRealized(1000, { budgetId: 'b1', spending: 800 }, true).status, 'warning');
  assert.equal(O.budgetRealized(1000, { budgetId: 'b1', spending: 1000 }, true).status, 'reached');
  assert.equal(O.budgetRealized(1000, { budgetId: 'b1', spending: 1000.01 }, true).status, 'exceeded');
  const over = O.budgetRealized(100, { budgetId: 'b1', spending: 130.5, ownSpent: 130.5 }, true);
  assert.deepEqual(over, { measure: 'WHOLE', spent: 130.5, measured: 130.5, remaining: -30.5, percentage: 130.5, status: 'exceeded' });
});

check('O-g: without a row, or with an invalid amount, there is NO number (null): the screen never falls back to a sum of its own', () => {
  assert.equal(O.budgetRealized(1000, undefined, true), null);
  assert.equal(O.budgetRealized(1000, { budgetId: 'b1', spending: Number.NaN }, true), null);
  assert.equal(O.budgetRealized(Number.NaN, { budgetId: 'b1', spending: 10 }, true), null);
});

check('O-h: the own share is never above the spending and never negative; an income budget has none', () => {
  const cases = [
    { spending: 100, ownSpent: 250 },
    { spending: 100, ownSpent: -5 },
    { spending: 0, ownSpent: 0 },
    { spending: 0.1 + 0.2, ownSpent: 0.3 },
    { spending: 510, ownSpent: 308.33 },
  ];
  for (const c of cases) {
    const r = O.budgetRealized(1000, { budgetId: 'b1', ...c }, true);
    if (r.ownSpent !== undefined) {
      assert.ok(r.ownSpent <= r.spent, `own ${r.ownSpent} above spent ${r.spent}`);
      assert.ok(r.ownSpent >= 0);
    }
    assert.equal(Math.round((r.remaining + r.spent) * 100), 100000, 'remaining plus spent is the limit, to the cent');
  }
  assert.equal(O.budgetRealized(1000, { budgetId: 'b1', spending: 100, ownSpent: 250 }, true).ownSpent, undefined, 'an own share above the spending is not a division');
  assert.equal(O.budgetRealized(1000, { budgetId: 'b1', spending: 900, ownSpent: 400 }, false).ownSpent, undefined);
});

check('O-i: a zero limit gives 0%, not a division by zero; rows are found by budget id', () => {
  assert.deepEqual(O.budgetRealized(0, { budgetId: 'b1', spending: 50 }, true), { measure: 'WHOLE', spent: 50, measured: 50, remaining: -50, percentage: 0, status: 'ok' });
  const rows = O.summaryRowsByBudget([{ budgetId: 'b1', spending: 1 }, { budgetId: 'b2', spending: 2 }]);
  assert.equal(rows.get('b2').spending, 2);
  assert.equal(O.summaryRowsByBudget(undefined).size, 0);
});

check('O-k: a budget measured separately (OWN_SHARE) compares the limit with the measured amount of the API, not with the full spending', () => {
  const row = { budgetId: 'b1', spending: 120, ownSpent: 70, measure: 'OWN_SHARE', measured: 70 };
  assert.deepEqual(O.budgetRealized(100, row, true), { measure: 'OWN_SHARE', spent: 120, measured: 70, ownSpent: 70, remaining: 30, percentage: 70, status: 'ok' });
  const together = O.budgetRealized(100, { ...row, measure: 'WHOLE', measured: 120 }, true);
  assert.equal(together.status, 'exceeded');
  assert.equal(together.remaining, -20);
  assert.equal(together.measured, 120);
});

check('O-l: the measured amount is the one the API sends; an older API (no measure, no measured) is measured by the full spending; an income budget is always WHOLE', () => {
  assert.equal(O.budgetRealized(100, { budgetId: 'b1', spending: 120, ownSpent: 70 }, true).measured, 120);
  assert.equal(O.budgetRealized(100, { budgetId: 'b1', spending: 120, ownSpent: 70, measure: 'OWN_SHARE' }, true).measured, 120, 'no measured amount from the API: the screen does not compute one');
  const income = O.budgetRealized(100, { budgetId: 'b1', spending: 120, measure: 'OWN_SHARE', measured: 70 }, false);
  assert.equal(income.measure, 'WHOLE');
  assert.equal(income.measured, 120);
  assert.equal(O.budgetRealized(100, { budgetId: 'b1', spending: 120, measure: 'OWN_SHARE', measured: Number.NaN }, true).measured, 120);
});

check('O-m: the form value of the mode: an income budget is always sent as WHOLE; an expense budget keeps the choice, WHOLE by default', () => {
  assert.equal(O.measureForSave('OWN_SHARE', true), 'OWN_SHARE');
  assert.equal(O.measureForSave('OWN_SHARE', false), 'WHOLE');
  assert.equal(O.measureForSave(undefined, true), 'WHOLE');
  assert.equal(O.measureForSave('anything', true), 'WHOLE');
});

check('O-j: guard: the budgets page and the dashboard widget do not sum transactions themselves', () => {
  for (const file of ['pages/Budgets.tsx', 'components/widgets/BudgetVsRealizedWidget.tsx']) {
    const src = readFileSync(frontSrc(file), 'utf8');
    for (const banned of ['getTotalExpense', 'getTotalIncome', 'getTransactionsByCategory', 'getTransactionsByMonth', 'transactions']) {
      assert.ok(!new RegExp(`\\b${banned}\\b`).test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `${file} must not use ${banned}`);
    }
    assert.ok(src.includes('budgetRealized('), `${file} must take its numbers from budgetRealized`);
  }
});

summary();
