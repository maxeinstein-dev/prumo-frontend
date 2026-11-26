import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Budget status of the web (utils/budgetStatus.ts): the same rule as the server (budget-status.ts): whole cents,
// exactly at the limit is "reached", above it "exceeded", from 80% "warning". BUDGET_STATUS_MODULE: a mutated copy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const B: any = await import(pathToFileURL(process.env.BUDGET_STATUS_MODULE || frontSrc('utils/budgetStatus.ts')).href);

console.log('\n[BS] status do orçamento');

check('BS-a: under 80% ok; from 80% warning; exactly the limit reached; above it exceeded', () => {
  assert.equal(B.budgetStatusOf(0, 500), 'ok');
  assert.equal(B.budgetStatusOf(399.99, 500), 'ok');
  assert.equal(B.budgetStatusOf(400, 500), 'warning');
  assert.equal(B.budgetStatusOf(499.99, 500), 'warning');
  assert.equal(B.budgetStatusOf(500, 500), 'reached');
  assert.equal(B.budgetStatusOf(500.01, 500), 'exceeded');
});

check('BS-b: compares cents: 0.1 + 0.2 against 0.30 is reached, not exceeded', () => {
  assert.equal(B.budgetStatusOf(0.1 + 0.2, 0.3), 'reached');
  assert.equal(B.budgetStatusOf(850, 850), 'reached');
});

check('BS-c: a limit of zero or less is never reached or exceeded', () => {
  assert.equal(B.budgetStatusOf(10, 0), 'ok');
  assert.equal(B.budgetStatusOf(10, -5), 'ok');
});
