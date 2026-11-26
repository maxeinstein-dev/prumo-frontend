import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// A budget that repeats month after month (src/utils/budgetPeriod.ts). Invented data only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = await import(pathToFileURL(frontSrc(process.env.BUDGET_PERIOD_MODULE ?? 'utils/budgetPeriod.ts')).href);

check('BP-a: month keys: local YYYY-MM, the month before across a year, and the MM/YYYY label', () => {
  assert.equal(P.monthKeyOfDate(new Date(2026, 11, 31)), '2026-12');
  assert.equal(P.previousMonthKey('2027-01'), '2026-12');
  assert.equal(P.previousMonthKey('2026-12'), '2026-11');
  assert.equal(P.monthLabel('2026-11'), '11/2026');
});

check('BP-b: the list of a month is the budgets the server says are in force, in the order given; a budget without id is never listed', () => {
  const budgets = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, {}];
  assert.deepEqual(P.budgetsInForce(budgets, new Set(['c', 'a'])).map((b: { id: string }) => b.id), ['a', 'c']);
  assert.deepEqual(P.budgetsInForce(budgets, new Set()), []);
});

check('BP-c: editing in its own month edits the budget; inherited from an earlier month it becomes a new budget for the month shown', () => {
  const own = { id: 'b1', month: new Date(2026, 11, 1), amount: 100 };
  assert.equal(P.editTarget(own, '2026-12', new Date(2026, 11, 15)), own);
  const inherited = P.editTarget({ id: 'b1', month: new Date(2026, 10, 1), amount: 100 }, '2026-11', new Date(2027, 0, 20));
  assert.equal(inherited.id, undefined);
  assert.equal(inherited.amount, 100);
  assert.equal(P.monthKeyOfDate(inherited.month), '2027-01');
  assert.equal(inherited.month.getDate(), 1);
});

check('BP-d: removing in its own month deletes; inherited, it ends in the month before the one shown', () => {
  assert.deepEqual(P.removalFor('2026-12', '2026-12'), { kind: 'delete' });
  assert.deepEqual(P.removalFor('2026-11', '2027-01'), { kind: 'end', endMonth: '2026-12-01' });
  assert.deepEqual(P.removalFor(undefined, '2027-01'), { kind: 'delete' });
});

check('BP-e: guard: the budgets page and the dashboard widget do not filter budgets by month themselves', () => {
  for (const file of ['pages/Budgets.tsx', 'components/widgets/BudgetVsRealizedWidget.tsx']) {
    const src = readFileSync(frontSrc(file), 'utf8');
    assert.ok(src.includes('budgetsInForce('), `${file} must list the budgets in force from the server`);
    assert.ok(!/startOfMonth\(b(udget)?\.month\)/.test(src), `${file} must not compare the budget month with the month shown`);
  }
});

summary();
