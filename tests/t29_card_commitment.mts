import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Card commitment panel (web): src/utils/cardCommitment.ts (month choices, rows in cents, bars, heaviest and over-income
// marks, summary, empty check, percent text) and src/utils/cardCommitmentTexts.ts (placeholders, locale fallback, and
// every key present in both i18n files). CARD_COMMITMENT_MODULE points at a mutated copy for the bite-checks.
// Invented data only: amounts and months are made up.
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

// Fixture (invented): four months with posted/forecast/income; one month of zeros; one tie-free heaviest month.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FIXTURE: any = {
  accountId: 'acc-card-test',
  months: [
    month({ month: '2026-11', posted: 1200.1, forecast: 300.21, expectedIncome: 6000 }),
    month({ month: '2026-12', posted: 800, forecast: 0, expectedIncome: 0 }),
    month({ month: '2027-01', posted: 0, forecast: 0, expectedIncome: 5000 }),
    month({ month: '2027-02', posted: 2000, forecast: 500, expectedIncome: 2000 }),
  ],
  totals: { posted: 4000.1, forecast: 800.21, expectedTotal: 4800.31, expectedIncome: 13000, incomeShare: 0.3693 },
};

console.log('\n[CC] card commitment panel');

check('CC-a: month choices: 3, 6 and 12 are kept; anything else is the default of 6', () => {
  assert.equal(K.normalizeMonths(3), 3);
  assert.equal(K.normalizeMonths(6), 6);
  assert.equal(K.normalizeMonths(12), 12);
  assert.equal(K.normalizeMonths(5), 6);
  assert.equal(K.normalizeMonths(0), 6);
  assert.equal(K.normalizeMonths(13), 6);
  assert.deepEqual([...K.COMMITMENT_MONTH_OPTIONS], [3, 6, 12]);
});

check('CC-b: month label is MM/yyyy cut from the string; invalid input is empty', () => {
  assert.equal(K.monthLabel('2026-11'), '11/2026');
  assert.equal(K.monthLabel('2027-02'), '02/2027');
  assert.equal(K.monthLabel('2026-1'), '');
  assert.equal(K.monthLabel(null), '');
  assert.equal(K.monthLabel(undefined), '');
});

check('CC-c: rows keep the order of the route; posted and forecast split the total, in cents', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.deepEqual(rows.map((r: { label: string }) => r.label), ['11/2026', '12/2026', '01/2027', '02/2027']);
  assert.equal(rows[0].postedCents, 120010);
  assert.equal(rows[0].forecastCents, 30021);
  assert.equal(rows[0].totalCents, 150031);
  assert.equal(rows[0].total, 1500.31);
  assert.equal(Math.round((rows[0].posted + rows[0].forecast) * 100), 150031);
});

check('CC-d: the share is total / income in cents, rounded to 4 decimals; no income gives null', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.equal(rows[0].share, 0.2501);
  assert.equal(rows[1].share, null);
  assert.equal(rows[2].share, 0);
  assert.equal(rows[3].share, 1.25);
});

check('CC-e: bars are percents of the heaviest month: posted first, expected stacked on top', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  // heaviest is 02/2027 at 2500.00: posted 2000 (80%), forecast 500 (20%)
  assert.equal(rows[3].postedBar, 80);
  assert.equal(rows[3].forecastBar, 20);
  // 11/2026 at 1500.31: posted 1200.10 (48%), forecast 300.21 stacked to 60% in total
  assert.equal(rows[0].postedBar, 48);
  assert.equal(rows[0].forecastBar, 12);
  assert.equal(rows[2].postedBar, 0);
  assert.equal(rows[2].forecastBar, 0);
});

check('CC-f: the heaviest month is the one with the biggest total, and only one; over-income is above 100% of income', () => {
  const rows = K.buildCommitmentRows(FIXTURE);
  assert.deepEqual(rows.map((r: { heaviest: boolean }) => r.heaviest), [false, false, false, true]);
  assert.deepEqual(rows.map((r: { overIncome: boolean }) => r.overIncome), [false, false, false, true]);
});

check('CC-g: a total equal to the income is not over income (exactly 100%)', () => {
  const rows = K.buildCommitmentRows({
    months: [month({ month: '2027-03', posted: 1000, forecast: 0, expectedIncome: 1000 })],
  });
  assert.equal(rows[0].share, 1);
  assert.equal(rows[0].overIncome, false);
});

check('CC-h: on a tie for the biggest total, the first month is the heaviest', () => {
  const rows = K.buildCommitmentRows({
    months: [
      month({ month: '2026-11', posted: 900, forecast: 100 }),
      month({ month: '2026-12', posted: 600, forecast: 400 }),
    ],
  });
  assert.deepEqual(rows.map((r: { heaviest: boolean }) => r.heaviest), [true, false]);
});

check('CC-i: all-zero months have no heaviest month, no bars and an empty state', () => {
  const rows = K.buildCommitmentRows({ months: [month({ month: '2026-11' }), month({ month: '2026-12' })] });
  assert.deepEqual(rows.map((r: { heaviest: boolean }) => r.heaviest), [false, false]);
  assert.deepEqual(rows.map((r: { postedBar: number; forecastBar: number }) => [r.postedBar, r.forecastBar]), [[0, 0], [0, 0]]);
  assert.equal(K.commitmentState(rows), 'empty');
  assert.equal(K.summarizeCommitment(rows).heaviestLabel, null);
});

check('CC-j: no months, or no response at all, is the empty state', () => {
  assert.deepEqual(K.buildCommitmentRows({ months: [] }), []);
  assert.deepEqual(K.buildCommitmentRows(null), []);
  assert.deepEqual(K.buildCommitmentRows(undefined), []);
  assert.equal(K.commitmentState(K.buildCommitmentRows(null)), 'empty');
});

check('CC-k: a filled period is "filled" as soon as one month has a commitment', () => {
  assert.equal(K.commitmentState(K.buildCommitmentRows(FIXTURE)), 'filled');
});

check('CC-l: float noise does not drift: 0.1 + 0.2 is exactly 0.3 in the row and the summary', () => {
  const rows = K.buildCommitmentRows({ months: [month({ month: '2026-11', posted: 0.1, forecast: 0.2, expectedIncome: 0.3 })] });
  assert.equal(rows[0].total, 0.3);
  assert.equal(rows[0].share, 1);
  const s = K.summarizeCommitment(rows);
  assert.equal(s.total, 0.3);
  assert.equal(s.income, 0.3);
});

check('CC-m: the summary sums the rows in cents and agrees with the route totals', () => {
  const s = K.summarizeCommitment(K.buildCommitmentRows(FIXTURE));
  assert.equal(s.posted, 4000.1);
  assert.equal(s.forecast, 800.21);
  assert.equal(s.total, 4800.31);
  assert.equal(s.income, 13000);
  assert.equal(s.share, 0.3693);
  assert.equal(s.total, FIXTURE.totals.expectedTotal);
  assert.equal(s.income, FIXTURE.totals.expectedIncome);
  assert.equal(s.heaviestLabel, '02/2027');
});

check('CC-n: the summary share is null when no month has income', () => {
  const s = K.summarizeCommitment(K.buildCommitmentRows({ months: [month({ posted: 100 })] }));
  assert.equal(s.share, null);
  assert.equal(s.heaviestLabel, '11/2026');
});

check('CC-o: percent text in pt-BR and en-US, whole percent; nothing to show without a share', () => {
  const clean = (text: string) => text.replace(/\s/g, '');
  assert.equal(clean(K.percentText(0.2501, 'pt-BR')), '25%');
  assert.equal(clean(K.percentText(0.2501, 'en-US')), '25%');
  assert.equal(clean(K.percentText(1.25, 'en-US')), '125%');
  assert.equal(K.percentText(null, 'pt-BR'), '');
  assert.equal(K.percentText(undefined, 'pt-BR'), '');
  assert.equal(K.percentText(Number.NaN, 'pt-BR'), '');
});

check('CC-p: texts: the locale value wins, Portuguese fills a missing key, placeholders are filled', () => {
  assert.equal(TX.cardCommitmentText({ cardCommitTitle: 'Card commitment' }, 'cardCommitTitle'), 'Card commitment');
  assert.equal(TX.cardCommitmentText({}, 'cardCommitTitle'), TX.CARD_COMMITMENT_TEXTS_PT.cardCommitTitle);
  assert.equal(TX.cardCommitmentText(null, 'cardCommitRetry'), 'Tentar de novo');
  assert.equal(TX.cardCommitmentText({}, 'cardCommitMonthsOption', { count: 6 }), '6 meses');
  assert.equal(TX.cardCommitmentText({}, 'cardCommitHeaviestMonth', { month: '02/2027' }), 'Mês mais pesado: 02/2027');
  assert.equal(TX.cardCommitmentText({}, 'cardCommitShareOfIncome', { share: '25%', other: 'x' }), '25% da renda esperada');
});

check('CC-q: every Portuguese key exists in pt-BR.json and en-US.json (no key shows its name)', () => {
  const pt = JSON.parse(readFileSync(frontSrc('i18n/pt-BR.json'), 'utf8'));
  const en = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'));
  for (const key of Object.keys(TX.CARD_COMMITMENT_TEXTS_PT)) {
    assert.equal(typeof pt[key], 'string', `pt-BR.json lacks ${key}`);
    assert.equal(typeof en[key], 'string', `en-US.json lacks ${key}`);
  }
});

check('CC-r: the rise warning is the first later month bigger than the first month; none when equal, smaller or alone', () => {
  const up = K.buildCommitmentRows({
    months: [
      month({ month: '2026-11', posted: 600, forecast: 400 }),
      month({ month: '2026-12', posted: 500, forecast: 0 }),
      month({ month: '2027-01', posted: 700, forecast: 500 }),
    ],
  });
  assert.equal(K.firstRiseRow(up)?.label, '01/2027');
  assert.equal(K.firstRiseRow(up)?.total, 1200);
  const equal = K.buildCommitmentRows({
    months: [month({ month: '2026-11', posted: 1000 }), month({ month: '2026-12', posted: 1000 })],
  });
  assert.equal(K.firstRiseRow(equal), null);
  const down = K.buildCommitmentRows({
    months: [month({ month: '2026-11', posted: 1000 }), month({ month: '2026-12', posted: 300 })],
  });
  assert.equal(K.firstRiseRow(down), null);
  const zeroFirst = K.buildCommitmentRows({
    months: [month({ month: '2026-11' }), month({ month: '2026-12', posted: 500 })],
  });
  assert.equal(K.firstRiseRow(zeroFirst), null);
  assert.equal(K.firstRiseRow(K.buildCommitmentRows({ months: [month({ posted: 900 })] })), null);
  assert.equal(K.firstRiseRow([]), null);
});

check('CC-s: installments, recurrences and purchases add up to posted, cent by cent; a route without the parts counts them as zero', () => {
  const split = K.buildCommitmentRows({
    months: [
      month({ month: '2026-11', posted: 1200.1, postedInstallments: 700.05, postedRecurrences: 300, postedPurchases: 200.05, forecast: 300.21, expectedIncome: 6000 }),
      month({ month: '2026-12', posted: 800, postedInstallments: 0, postedRecurrences: 800, postedPurchases: 0 }),
    ],
  });
  assert.equal(split[0].installmentsCents + split[0].recurrencesCents + split[0].purchasesCents, split[0].postedCents);
  assert.equal(split[0].installments, 700.05);
  assert.equal(split[0].recurrences, 300);
  assert.equal(split[0].purchases, 200.05);
  assert.equal(split[1].recurrences, 800);
  assert.equal(split[1].total, 800);
  const old = K.buildCommitmentRows(FIXTURE);
  assert.equal(old[0].installments, 0);
  assert.equal(old[0].posted, 1200.1);
});
