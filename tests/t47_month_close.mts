import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Month close page (P02-L3): src/utils/monthClose.ts (month arithmetic, signed money input, difference in cents, the state of
// a conference, where each blocker leads) and src/utils/monthCloseTexts.ts (placeholders, locale fallback).
// MONTH_CLOSE_MODULE points at a mutated copy for the bite-checks. Invented data only; days are 'YYYY-MM-DD' strings.
const mPath = process.env.MONTH_CLOSE_MODULE || frontSrc('utils/monthClose.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const M: any = await import(pathToFileURL(mPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(frontSrc('utils/monthCloseTexts.ts')).href);

check('P02 shiftMonth crosses the year both ways', () => {
  assert.equal(M.shiftMonth('2026-01', -1), '2025-12');
  assert.equal(M.shiftMonth('2026-12', 1), '2027-01');
  assert.equal(M.shiftMonth('2026-10', 0), '2026-10');
  assert.equal(M.shiftMonth('2026-03', -14), '2025-01');
});

check('P02 the default month is the last complete one', () => {
  assert.equal(M.defaultCloseMonth('2026-11-12'), '2026-10');
  assert.equal(M.defaultCloseMonth('2026-01-01'), '2025-12');
});

check('P02 monthRange gives the first and the real last day', () => {
  assert.deepEqual(M.monthRange('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(M.monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
  assert.deepEqual(M.monthRange('2026-10'), { start: '2026-10-01', end: '2026-10-31' });
});

check('P02 the informed balance accepts a sign, comma or dot decimals and thousands dots', () => {
  assert.equal(M.parseInformedBalance('1234,56'), 1234.56);
  assert.equal(M.parseInformedBalance('1.234,56'), 1234.56);
  assert.equal(M.parseInformedBalance(' -50,10 '), -50.1);
  assert.equal(M.parseInformedBalance('-1.000'), -1000);
  assert.equal(M.parseInformedBalance('0'), 0);
  assert.equal(M.parseInformedBalance('1234.5'), 1234.5);
});

check('P02 the informed balance refuses what is not money', () => {
  for (const bad of ['', '  ', 'abc', '1,234,56', '12,345', '--5', '5-', '+5', '1e3', '-']) assert.equal(M.parseInformedBalance(bad), null, bad);
});

check('P02 the difference is exact in cents (no binary drift)', () => {
  assert.equal(M.differenceCents(800.1, 800), 10);
  assert.equal(M.differenceCents(0.3, 0.1 + 0.2), 0);
  assert.equal(M.differenceCents(-10, 5.55), -1555);
  assert.equal(M.differenceCents(1000, 1000), 0);
  assert.equal(M.differenceCents(0.29, 0), 29); // 0.29 * 100 is 28.999999999999996 in binary
  assert.equal(M.differenceCents(1.15, 0), 115);
});

const conf = (over = {}) => ({ informedBalance: 100, systemBalance: 100, difference: 0, closedAt: '2026-11-10T12:00:00.000Z', closedByUserId: 'u', changedSince: false, ...over });

check('P02 a conference is none, matching, differing or changed (changed wins)', () => {
  assert.equal(M.conferenceState(null), 'none');
  assert.equal(M.conferenceState(conf()), 'matches');
  assert.equal(M.conferenceState(conf({ difference: 0.01 })), 'differs');
  assert.equal(M.conferenceState(conf({ difference: -3, changedSince: true })), 'changed');
  assert.equal(M.conferenceState(conf({ changedSince: true })), 'changed');
});

check('P02 each blocker leads to the place that solves it', () => {
  const ctx = { month: '2026-02', accountId: 'acc-1' };
  assert.equal(M.blockerHref('pending_entries', ctx), '/app/transactions?startDate=2026-02-01&endDate=2026-02-28&paid=pending');
  assert.equal(M.blockerHref('uncategorized', ctx), '/app/transactions?startDate=2026-02-01&endDate=2026-02-28');
  assert.equal(M.blockerHref('pending_captures', ctx), '/app/captures');
  assert.equal(M.blockerHref('review_queue', ctx), '/app/credit-cards?card=acc-1&month=2026-02');
  assert.equal(M.blockerHref('invoice_open', ctx), '/app/credit-cards?card=acc-1&month=2026-02');
  assert.equal(M.blockerHref('review_queue', { month: '2026-02' }), null);
});

check('P02 the month is ok only when everything is, and the pending count adds every block', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {
    month: '2026-10', ok: false,
    accounts: [{ accountId: 'a', blockers: [{ code: 'pending_entries', count: 2 }], ok: false }, { accountId: 'b', blockers: [], ok: true }],
    cards: [{ accountId: 'c', blockers: [{ code: 'review_queue', count: 3 }], ok: false }],
    general: { ok: false, blockers: [{ code: 'uncategorized', count: 1 }] },
  };
  assert.equal(M.blockerTotal(data), 6);
  data.accounts = [data.accounts[1]];
  data.cards = [];
  data.general = { ok: true, blockers: [] };
  assert.equal(M.blockerTotal(data), 0);
});

check('P02 texts fill placeholders and fall back to Portuguese', () => {
  assert.equal(T.monthCloseText({}, 'monthCloseConferredOn', { date: '10/11' }), 'Conferido em 10/11');
  assert.equal(T.monthCloseText({ monthCloseConferredOn: 'Checked {date}' }, 'monthCloseConferredOn', { date: '10/11' }), 'Checked 10/11');
  assert.equal(T.monthCloseText(null, 'monthCloseTitle'), 'Fechamento do mês');
});

check('P02 every blocker code has a text', () => {
  for (const code of ['pending_entries', 'invoice_open', 'review_queue', 'uncategorized', 'pending_captures']) {
    const key = M.blockerTextKey(code);
    assert.ok(key in T.MONTH_CLOSE_TEXTS_PT, `${code} -> ${key}`);
  }
});
