import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P09-A: the card commitment panel says when an invoice is already paid or closed (the `state` the route sends per month),
// and a paid month gets neither the "heaviest" mark nor the "above income" mark. The amounts are the route's, untouched.
// src/utils/cardCommitment.ts (commitmentBadge, buildCommitmentRows, summarizeCommitment) and the badge texts.
// CARD_COMMITMENT_MODULE points at a mutated copy for the bite-checks. Invented data only.
const ccPath = process.env.CARD_COMMITMENT_MODULE || frontSrc('utils/cardCommitment.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const K: any = await import(pathToFileURL(ccPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TX: any = await import(pathToFileURL(frontSrc('utils/cardCommitmentTexts.ts')).href);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function month(over: Record<string, any> = {}): any {
  return {
    month: '2026-11', closingDate: '2026-11-02', dueDate: '2026-11-09', state: 'open',
    posted: 0, forecast: 0, expectedTotal: 0, expectedIncome: 0, incomeShare: null, ...over,
  };
}

// Invented: the paid month is the biggest one and above its income; the closed one is above its income too.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FIXTURE: any = {
  accountId: 'acc-card-test',
  months: [
    month({ month: '2026-11', state: 'paid', posted: 3000, forecast: 0, expectedIncome: 2000 }),
    month({ month: '2026-12', state: 'closed', posted: 2500, forecast: 0, expectedIncome: 2000 }),
    month({ month: '2027-01', state: 'open', posted: 1000, forecast: 400.5, expectedIncome: 5000 }),
    month({ month: '2027-02', state: 'open', posted: 900, forecast: 0, expectedIncome: 5000 }),
  ],
  totals: { posted: 7400, forecast: 400.5, expectedTotal: 7800.5, expectedIncome: 14000, incomeShare: 0.5572 },
};

console.log('\n[CS] card commitment: paid and closed invoices');

check('CS-a: badge per state: paid and closed get one; open and unknown states get none', () => {
  assert.equal(K.commitmentBadge('paid'), 'paid');
  assert.equal(K.commitmentBadge('closed'), 'closed');
  assert.equal(K.commitmentBadge('open'), null);
  assert.equal(K.commitmentBadge('overdue'), null);
  assert.equal(K.commitmentBadge(''), null);
  assert.equal(K.commitmentBadge(undefined), null);
});

check('CS-b: each row carries the badge of its month', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.deepEqual(rows.map((r: { badge: string | null }) => r.badge), ['paid', 'closed', null, null]);
});

check('CS-c: a paid month is never the heaviest; the heaviest is the biggest of the others', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.equal(rows[0].heaviest, false);
  assert.equal(rows[1].heaviest, true);
  assert.equal(rows.filter((r: { heaviest: boolean }) => r.heaviest).length, 1);
  assert.equal(K.summarizeCommitment(rows).heaviestLabel, '12/2026');
});

check('CS-d: a paid month is never above income; a closed one still is', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.equal(rows[0].overIncome, false);
  assert.equal(rows[1].overIncome, true);
  assert.equal(rows[2].overIncome, false);
});

check('CS-e: the paid month keeps the amounts and share the route sent (the screen does not recompute them away)', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.equal(rows[0].totalCents, 300000);
  assert.equal(rows[0].share, 1.5);
  assert.equal(rows[2].totalCents, 140050);
  const summary = K.summarizeCommitment(rows);
  assert.equal(summary.totalCents, 780050);
});

check('CS-f: bars still scale to the biggest month, the paid one included', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.equal(rows[0].postedBar + rows[0].forecastBar, 100);
  assert.equal(rows[3].postedBar, 30);
});

check('CS-g: when every month with a commitment is paid, nothing is the heaviest', () => {
  const rows = K.buildCommitmentRows({
    months: [month({ month: '2026-11', state: 'paid', posted: 500, expectedIncome: 100 }), month({ month: '2026-12' })],
  });
  assert.deepEqual(rows.map((r: { heaviest: boolean }) => r.heaviest), [false, false]);
  assert.equal(K.summarizeCommitment(rows).heaviestLabel, null);
  assert.equal(K.commitmentState(rows), 'filled');
});

// (t29 CC checks that every text key is in both i18n files.)
check('CS-h: badge texts in Portuguese', () => {
  assert.equal(TX.cardCommitmentText({}, 'cardCommitPaid'), 'Paga');
  assert.equal(TX.cardCommitmentText({}, 'cardCommitClosed'), 'Fechada');
});
