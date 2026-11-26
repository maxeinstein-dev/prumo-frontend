import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Forecast strategies of a recurrence: utils/businessDays.ts (Brazilian calendar), utils/forecastStrategy.ts (the client twin of the
// server's expectedAmountFor, texts, form draft, "dias implícitos") and the hint of utils/confirmReceipt.ts.
// BUSINESS_DAYS_MODULE / FORECAST_MODULE / CONFIRM_RECEIPT_MODULE point at mutated copies (bite-checks).
// BACKEND_DIR (absolute path of a backend checkout) switches on the parity check against the server's own implementation.
// Invented data only.
const bdPath = process.env.BUSINESS_DAYS_MODULE || frontSrc('utils/businessDays.ts');
const fsPath = process.env.FORECAST_MODULE || frontSrc('utils/forecastStrategy.ts');
const crPath = process.env.CONFIRM_RECEIPT_MODULE || frontSrc('utils/confirmReceipt.ts');
const calcPath = process.env.CALCULATIONS_MODULE || frontSrc('utils/calculations.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BD: any = await import(pathToFileURL(bdPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = await import(pathToFileURL(fsPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(crPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const K: any = await import(pathToFileURL(calcPath).href);

console.log('\n[calendar] utils/businessDays.ts');

check('Easter (Meeus/Gauss) of 2024-2030 against the published dates, always a Sunday between 22/03 and 25/04', () => {
  const known: Record<number, string> = { 2024: '2024-03-31', 2025: '2025-04-20', 2026: '2026-04-05', 2027: '2027-03-28', 2028: '2028-04-16', 2029: '2029-04-01', 2030: '2030-04-21' };
  for (const [year, day] of Object.entries(known)) assert.equal(BD.easterSunday(Number(year)), day, year);
  for (let year = 1990; year <= 2100; year += 1) {
    const day: string = BD.easterSunday(year);
    assert.equal(new Date(`${day}T00:00:00Z`).getUTCDay(), 0, `${year} is a Sunday`);
    assert.ok(day >= `${year}-03-22` && day <= `${year}-04-25`, `${year} within range`);
  }
});

check('reference data: november/2026 has 19 business days (02/11 Monday and 20/11 Friday are holidays, 15/11 is a Sunday), december/2026 has 22', () => {
  assert.equal(BD.businessDaysInMonth('2026-11'), 19);
  assert.equal(BD.businessDaysInMonth('2026-12'), 22);
});

check('other months of 2026: january 21, february 20 (18 with Carnaval), april 20 (Good Friday and Tiradentes), june 22 (21 with Corpus Christi), october 21', () => {
  assert.equal(BD.businessDaysInMonth('2026-01'), 21);
  assert.equal(BD.businessDaysInMonth('2026-02'), 20);
  assert.equal(BD.businessDaysInMonth('2026-02', { optionalHolidays: ['CARNIVAL'] }), 18);
  assert.equal(BD.businessDaysInMonth('2026-04'), 20);
  assert.equal(BD.businessDaysInMonth('2026-06'), 22);
  assert.equal(BD.businessDaysInMonth('2026-06', { optionalHolidays: ['CORPUS_CHRISTI'] }), 21);
  assert.equal(BD.businessDaysInMonth('2026-10'), 21);
  // Corpus Christi is Thursday 04/06/2026 (Easter + 60): a day without voucher on the Wednesday takes a second day, not the same one
  assert.equal(BD.businessDaysInMonth('2026-06', { optionalHolidays: ['CORPUS_CHRISTI'], nonWorkingDays: ['2026-06-03'] }), 20);
});

check('20/11 is a national holiday only from 2024; Good Friday moves with Easter (29/03/2024, 18/04/2025)', () => {
  assert.equal(BD.businessDaysInMonth('2023-11'), 20);
  assert.equal(BD.businessDaysInMonth('2024-11'), 19);
  assert.equal(BD.businessDaysInMonth('2024-03'), 20); // 21 weekdays minus 29/03
  assert.equal(BD.businessDaysInMonth('2025-04'), 20); // 22 weekdays minus 18/04 and 21/04
});

check('"dias sem vale": MM-DD every year, YYYY-MM-DD only that year, weekends and holidays take nothing more', () => {
  assert.equal(BD.businessDaysInMonth('2026-06', { nonWorkingDays: ['06-24'] }), 21);
  assert.equal(BD.businessDaysInMonth('2027-06', { nonWorkingDays: ['06-24'] }), BD.businessDaysInMonth('2027-06') - 1);
  assert.equal(BD.businessDaysInMonth('2026-07', { nonWorkingDays: ['2026-07-08'] }), BD.businessDaysInMonth('2026-07') - 1);
  assert.equal(BD.businessDaysInMonth('2027-07', { nonWorkingDays: ['2026-07-08'] }), BD.businessDaysInMonth('2027-07'));
  assert.equal(BD.businessDaysInMonth('2026-06', { nonWorkingDays: ['06-20'] }), 22); // a Saturday
  assert.equal(BD.businessDaysInMonth('2026-11', { nonWorkingDays: ['11-20', '2026-11-20'] }), 19); // already a holiday
});

check('a malformed month has no business days; the validity of a "dia sem vale"', () => {
  assert.equal(BD.businessDaysInMonth('2026-13'), 0);
  assert.equal(BD.businessDaysInMonth(''), 0);
  for (const ok of ['06-24', '02-29', '2026-07-08']) assert.equal(BD.isValidNonWorkingDay(ok), true, ok);
  for (const bad of ['13-01', '04-31', '2026-02-29', '6-24', '24/06', '']) assert.equal(BD.isValidNonWorkingDay(bad), false, bad);
});

console.log('\n[twin] utils/forecastStrategy.ts: explainExpected / expectedAmountOf');
const hist = (...amounts: number[]) => amounts.map((amount, i) => ({ amount, date: `2026-0${9 - i}-05` }));

check('LAST and FIXED carry the recurrence amount, whatever the history; an unknown strategy is LAST', () => {
  assert.equal(F.expectedAmountOf({ amount: 100 }, 'INCOME', hist(1, 2), '2026-10'), 100);
  assert.equal(F.expectedAmountOf({ amount: 100, forecastStrategy: 'LAST' }, 'INCOME', hist(1), '2026-10'), 100);
  assert.equal(F.expectedAmountOf({ amount: 250, forecastStrategy: 'FIXED' }, 'INCOME', hist(999, 1), '2026-10'), 250);
  assert.equal(F.expectedAmountOf({ amount: 100, forecastStrategy: 'NOPE' }, 'INCOME', hist(1), '2026-10'), 100);
  assert.equal(F.expectedAmountOf({ amount: 100, forecastStrategy: null }, 'INCOME', hist(1), '2026-10'), 100);
});

check('CONSERVATIVE income: the SMALLEST of the last 6 (default); only the window counts', () => {
  const h = hist(700, 650, 800, 720, 690, 710, 100, 900);
  assert.equal(F.windowOf({}, 'INCOME'), 6);
  assert.equal(F.expectedAmountOf({ amount: 500, forecastStrategy: 'CONSERVATIVE' }, 'INCOME', h, '2026-10'), 650);
  assert.deepEqual(F.explainExpected({ amount: 500, forecastStrategy: 'CONSERVATIVE' }, 'INCOME', h, '2026-10').usedValues, [700, 650, 800, 720, 690, 710]);
});

check('CONSERVATIVE expense: the LARGEST of the last 3 (default); income and expense pick opposite ends of the same history', () => {
  const h = hist(100, 120, 110, 900);
  assert.equal(F.windowOf({}, 'EXPENSE'), 3);
  assert.equal(F.expectedAmountOf({ amount: 500, forecastStrategy: 'CONSERVATIVE' }, 'EXPENSE', h, '2026-10'), 120);
  const same = hist(300, 100, 200);
  assert.equal(F.expectedAmountOf({ amount: 1, forecastStrategy: 'CONSERVATIVE', forecastWindow: 3 }, 'INCOME', same, '2026-10'), 100);
  assert.equal(F.expectedAmountOf({ amount: 1, forecastStrategy: 'CONSERVATIVE', forecastWindow: 3 }, 'EXPENSE', same, '2026-10'), 300);
});

check('CONSERVATIVE: N per recurrence, fewer confirmed than N uses those, none falls back to the amount, junk values ignored', () => {
  const base = { amount: 500, forecastStrategy: 'CONSERVATIVE' };
  assert.equal(F.expectedAmountOf({ ...base, forecastWindow: 1 }, 'INCOME', hist(300, 100, 200), '2026-10'), 300);
  assert.equal(F.expectedAmountOf({ ...base, forecastWindow: 2 }, 'INCOME', hist(300, 100, 200), '2026-10'), 100);
  assert.equal(F.expectedAmountOf({ ...base, forecastWindow: 12 }, 'INCOME', hist(400, 350), '2026-10'), 350);
  assert.equal(F.expectedAmountOf(base, 'INCOME', [], '2026-10'), 500);
  assert.equal(F.explainExpected(base, 'INCOME', [], '2026-10').fellBack, true);
  assert.equal(F.expectedAmountOf(base, 'INCOME', hist(0, Number.NaN, 420, -5), '2026-10'), 420);
  assert.equal(F.windowOf({ forecastWindow: 99 }, 'INCOME'), 36);
  assert.equal(F.windowOf({ forecastWindow: 0 }, 'INCOME'), 6);
  assert.equal(F.expectedAmountOf({ ...base }, 'EXPENSE', hist(0.1, 0.2, 0.3), '2026-10'), 0.3);
});

check('PER_BUSINESS_DAY: 36,00 x 19 = 684,00 (november/2026), x 22 = 792,00 (december/2026); the reference month decides', () => {
  const r = { amount: 1, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 };
  assert.equal(F.expectedAmountOf(r, 'INCOME', [], '2026-11'), 684);
  assert.equal(F.expectedAmountOf(r, 'INCOME', [], '2026-12'), 792);
  assert.equal(F.expectedAmountOf(r, 'INCOME', [], '2026-10'), 36 * 21);
  assert.deepEqual(F.explainExpected(r, 'INCOME', [], '2026-11'), {
    amount: 684, strategy: 'PER_BUSINESS_DAY', businessDays: 19, safetyBusinessDays: 0, countedBusinessDays: 19, dailyRate: 36,
  });
});

check('PER_BUSINESS_DAY: margin discounts days and never goes below zero; days without voucher and optional holidays count; cents without drift', () => {
  const r = { amount: 1, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 };
  assert.equal(F.expectedAmountOf({ ...r, safetyBusinessDays: 2 }, 'INCOME', [], '2026-11'), 36 * 17);
  assert.equal(F.expectedAmountOf({ ...r, safetyBusinessDays: 19 }, 'INCOME', [], '2026-11'), 0);
  assert.equal(F.expectedAmountOf({ ...r, safetyBusinessDays: 40 }, 'INCOME', [], '2026-11'), 0);
  assert.equal(F.expectedAmountOf({ ...r, safetyBusinessDays: -3 }, 'INCOME', [], '2026-11'), 684);
  assert.equal(F.expectedAmountOf({ ...r, nonWorkingDays: ['06-24', '07-08'] }, 'INCOME', [], '2026-06'), 36 * 21);
  assert.equal(F.expectedAmountOf({ ...r, optionalHolidays: ['CARNIVAL'] }, 'INCOME', [], '2026-02'), 36 * 18);
  assert.equal(F.expectedAmountOf({ ...r, dailyRate: 36.35 }, 'INCOME', [], '2026-11'), 690.65);
  assert.equal(F.expectedAmountOf({ ...r, dailyRate: 0.1 }, 'INCOME', [], '2026-12'), 2.2);
});

check('PER_BUSINESS_DAY without a rate or with a bad month falls back to the amount; the history never moves it', () => {
  const r = { amount: 700, forecastStrategy: 'PER_BUSINESS_DAY' };
  assert.equal(F.expectedAmountOf({ ...r, dailyRate: null }, 'INCOME', [], '2026-11'), 700);
  assert.equal(F.expectedAmountOf({ ...r, dailyRate: 0 }, 'INCOME', [], '2026-11'), 700);
  assert.equal(F.expectedAmountOf({ ...r, dailyRate: 36 }, 'INCOME', [], ''), 700);
  assert.equal(F.expectedAmountOf({ ...r, dailyRate: 36 }, 'INCOME', hist(1, 2, 3), '2026-11'), 684);
});

check('the confirm-receipt module keeps the same single entry point: expectedAmountFor(recurrence, history, referenceMonth)', () => {
  assert.equal(C.expectedAmountFor({ amount: 640 }, [{ amount: 600, date: '2026-09-25' }], '2026-11'), 640);
  assert.equal(C.expectedAmountFor({ amount: 640 }), 640);
  assert.equal(C.expectedAmountFor({ amount: 1, type: 'INCOME', forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 }, [], '2026-11'), 684);
  assert.equal(C.expectedAmountFor({ amount: 1, type: 'INCOME', forecastStrategy: 'CONSERVATIVE' }, hist(700, 650, 800), '2026-11'), 650);
  assert.equal(C.expectedAmountFor({ amount: 1, type: 'EXPENSE', forecastStrategy: 'CONSERVATIVE' }, hist(100, 120, 110), '2026-11'), 120);
  assert.equal(C.expectedAmountFor({ amount: 1, forecastStrategy: 'CONSERVATIVE' }, hist(10, 30, 20), '2026-11'), 30, 'no type: an expense');
});

console.log('\n[parity] the twin against the server implementation');
const backendDir = process.env.BACKEND_DIR;
const serverModule = backendDir ? `${backendDir}/src/modules/recurring-transactions/expected-amount.ts` : '';
if (!backendDir || !existsSync(serverModule)) {
  console.log('  skip parity: set BACKEND_DIR to a backend checkout that has expected-amount.ts with the strategies');
} else {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const S: any = await import(pathToFileURL(serverModule).href);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const SC: any = await import(pathToFileURL(`${backendDir}/src/modules/recurring-transactions/br-calendar.ts`).href);

  check('business days of every month 2023-2031, with every combination of optional holidays and a list of days without voucher', () => {
    const optionalSets: string[][] = [[], ['CARNIVAL'], ['CORPUS_CHRISTI'], ['CARNIVAL', 'CORPUS_CHRISTI']];
    const daySets: string[][] = [[], ['06-24', '07-08'], ['2026-11-03', '12-24', '02-29'], ['01-01', '11-20']];
    let compared = 0;
    for (let year = 2023; year <= 2031; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        const key = `${year}-${String(month).padStart(2, '0')}`;
        for (const optionalHolidays of optionalSets) {
          for (const nonWorkingDays of daySets) {
            assert.equal(BD.businessDaysInMonth(key, { optionalHolidays, nonWorkingDays }), SC.businessDaysInMonth(key, { optionalHolidays, nonWorkingDays }), `${key} ${optionalHolidays} ${nonWorkingDays}`);
            compared += 1;
          }
        }
      }
    }
    assert.equal(compared, 9 * 12 * 16);
    for (let year = 1990; year <= 2100; year += 1) assert.equal(BD.easterSunday(year), SC.easterSunday(year), String(year));
  });

  check('the amount of every strategy over a grid of recurrences, histories and months', () => {
    const histories = [[], hist(700), hist(700, 650, 800), hist(100, 120, 110, 900), hist(300, 100, 200, 50, 60, 70, 80, 90)];
    let compared = 0;
    for (const strategy of ['LAST', 'FIXED', 'CONSERVATIVE', 'PER_BUSINESS_DAY']) {
      for (const type of ['INCOME', 'EXPENSE']) {
        for (const forecastWindow of [null, 1, 2, 4, 50]) {
          for (const history of histories) {
            for (const month of ['2026-02', '2026-11', '2026-12', '2027-01', '']) {
              const fields = {
                amount: 123.45, forecastStrategy: strategy, forecastWindow, dailyRate: 36.35, safetyBusinessDays: 2,
                nonWorkingDays: ['06-24', '2026-11-03'], optionalHolidays: ['CARNIVAL'],
              };
              const server = S.explainExpectedAmount({ ...fields, type }, history, month);
              const client = F.explainExpected(fields, type, history, month);
              for (const field of ['amount', 'strategy', 'businessDays', 'safetyBusinessDays', 'countedBusinessDays', 'dailyRate', 'window', 'usedValues', 'fellBack']) {
                assert.deepEqual(client[field], server[field], `${strategy} ${type} N=${forecastWindow} ${month} ${field}`);
              }
              compared += 1;
            }
          }
        }
      }
    }
    assert.equal(compared, 4 * 2 * 5 * 5 * 5);
  });
}

console.log('\n[texts] how an expected amount was reached');

check('how it was calculated: per day, with and without margin, singular day; conservative with fewer values than asked; fixed; last', () => {
  const perDay = F.explainExpected({ amount: 1, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 }, 'INCOME', [], '2026-11');
  assert.equal(F.howCalculated(perDay, 'INCOME'), '19 dias úteis × R$ 36,00');
  const margin = F.explainExpected({ amount: 1, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36, safetyBusinessDays: 2 }, 'INCOME', [], '2026-11');
  assert.equal(F.howCalculated(margin, 'INCOME'), '19 dias úteis − 2 de margem = 17 dias × R$ 36,00');
  assert.equal(F.howCalculated({ amount: 36, strategy: 'PER_BUSINESS_DAY', businessDays: 1, countedBusinessDays: 1, safetyBusinessDays: 0, dailyRate: 36 }, 'INCOME'), '1 dia útil × R$ 36,00');
  const noRate = F.explainExpected({ amount: 700, forecastStrategy: 'PER_BUSINESS_DAY' }, 'INCOME', [], '2026-11');
  assert.equal(F.howCalculated(noRate, 'INCOME'), 'sem valor por dia: usa o valor cadastrado');
  const cons = F.explainExpected({ amount: 500, forecastStrategy: 'CONSERVATIVE', forecastWindow: 3 }, 'INCOME', hist(700, 650, 800, 50), '2026-11');
  assert.equal(F.howCalculated(cons, 'INCOME'), 'menor dos últimos 3 recebidos: R$ 700,00, R$ 650,00, R$ 800,00');
  const few = F.explainExpected({ amount: 500, forecastStrategy: 'CONSERVATIVE' }, 'INCOME', hist(400, 350), '2026-11');
  assert.equal(F.howCalculated(few, 'INCOME'), 'menor dos 2 recebidos até agora (olha até 6): R$ 400,00, R$ 350,00');
  const expense = F.explainExpected({ amount: 80, forecastStrategy: 'CONSERVATIVE' }, 'EXPENSE', hist(100, 120, 110), '2026-11');
  assert.equal(F.howCalculated(expense, 'EXPENSE'), 'maior dos últimos 3 pagos: R$ 100,00, R$ 120,00, R$ 110,00');
  const none = F.explainExpected({ amount: 500, forecastStrategy: 'CONSERVATIVE' }, 'INCOME', [], '2026-11');
  assert.equal(F.howCalculated(none, 'INCOME'), 'ainda sem valores confirmados: usa o valor cadastrado');
  assert.equal(F.howCalculated({ amount: 1, strategy: 'FIXED' }, 'INCOME'), 'valor fixo');
  assert.equal(F.howCalculated({ amount: 1, strategy: 'LAST' }, 'INCOME'), 'último valor');
});

check('the list line: "Previsão de 11/2026: R$ 684,00 (19 dias úteis × R$ 36,00)"; the plain strategies say only the amount; nothing without a forecast', () => {
  const perDay = { ...F.explainExpected({ amount: 1, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 }, 'INCOME', [], '2026-11'), referenceMonth: '2026-11' };
  assert.equal(F.nextForecastText(perDay, 'INCOME'), 'Previsão de 11/2026: R$ 684,00 (19 dias úteis × R$ 36,00)');
  assert.equal(F.nextForecastText({ amount: 500, strategy: 'LAST', referenceMonth: '2026-11' }, 'INCOME'), 'Previsão de 11/2026: R$ 500,00');
  assert.equal(F.nextForecastText({ amount: 500, strategy: 'FIXED' }, 'INCOME'), 'Previsão: R$ 500,00');
  assert.equal(F.nextForecastText(null, 'INCOME'), null);
  assert.equal(F.nextForecastText(undefined, 'INCOME'), null);
});

check('the list takes the server forecast when it sends one, else the twin without history; the next reference month crosses the year', () => {
  const server = { amount: 650, strategy: 'CONSERVATIVE', referenceMonth: '2026-11', window: 6, usedValues: [700, 650, 800] };
  assert.equal(F.forecastDetailOf({ amount: 500, forecastStrategy: 'CONSERVATIVE', forecast: server }, 'INCOME', '2026-11'), server);
  const own = F.forecastDetailOf({ amount: 1, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 }, 'INCOME', '2026-12');
  assert.equal(own.amount, 792);
  assert.equal(own.referenceMonth, '2026-12');
  assert.equal(F.nextReferenceMonth('2026-10-25', 1), '2026-11');
  assert.equal(F.nextReferenceMonth(new Date(2026, 11, 5), 1), '2027-01');
  assert.equal(F.nextReferenceMonth(new Date(2026, 11, 5), null), '2026-12');
});

check('what a confirmed value does to each strategy, in the difference hint of the dialog', () => {
  const hint = (strategy: string | undefined, follows = false) => C.differenceHint(60000, 64000, 'INCOME', follows, undefined, strategy);
  assert.equal(hint(undefined, true), 'Esperado R$ 600,00, recebido R$ 640,00; as próximas ocorrências passam a usar R$ 640,00.');
  assert.equal(hint('LAST'), 'Esperado R$ 600,00, recebido R$ 640,00.');
  assert.equal(hint('CONSERVATIVE'), 'Esperado R$ 600,00, recebido R$ 640,00; este valor entra no histórico da previsão conservadora.');
  assert.equal(hint('FIXED'), 'Esperado R$ 600,00, recebido R$ 640,00; a previsão dos próximos meses continua o valor fixo.');
  assert.equal(hint('PER_BUSINESS_DAY'), 'Esperado R$ 600,00, recebido R$ 640,00; a previsão dos próximos meses continua pelo valor por dia útil.');
  assert.equal(C.differenceHint(60000, 60000, 'INCOME', false, undefined, 'FIXED'), null);
  assert.equal(C.differenceHint(60000, null, 'INCOME', false, undefined, 'FIXED'), null);
});

console.log('\n[form] the draft of "Como prever o valor"');

check('"dias sem vale" typed as 24/06, 08/07/2026: parsed to MM-DD / YYYY-MM-DD, sorted, no duplicates, invalid pieces reported', () => {
  assert.deepEqual(F.parseNonWorkingText('24/06, 08/07; 24/06/2026\n31/04 xx 24/06'), { days: ['06-24', '07-08', '2026-06-24'], invalid: ['31/04', 'xx'] });
  assert.deepEqual(F.parseNonWorkingText(''), { days: [], invalid: [] });
  assert.deepEqual(F.parseNonWorkingText('29/02'), { days: ['02-29'], invalid: [] });
  assert.deepEqual(F.parseNonWorkingText('29/02/2026'), { days: [], invalid: ['29/02/2026'] });
  assert.equal(F.nonWorkingDayText('06-24'), '24/06');
  assert.equal(F.nonWorkingDayText('2026-07-08'), '08/07/2026');
});

check('validation checks only the fields of the chosen strategy', () => {
  const d = F.emptyForecastDraft();
  assert.equal(F.validateForecast({ ...d, windowText: '99', safetyText: '99', nonWorkingText: 'xx' }, 'weekly').ok, true, 'LAST ignores every parameter');
  assert.equal(F.validateForecast({ ...d, strategy: 'FIXED', windowText: '99' }, 'daily').ok, true);
  const cons = { ...d, strategy: 'CONSERVATIVE' };
  assert.equal(F.validateForecast({ ...cons, windowText: '' }, 'monthly').ok, true, 'blank = the default of the kind');
  assert.equal(F.validateForecast({ ...cons, windowText: '6' }, 'weekly').ok, true, 'conservative works for any frequency');
  for (const bad of ['0', '37', 'ab', '1.5']) assert.equal(F.validateForecast({ ...cons, windowText: bad }, 'monthly').errors.window, 'Informe um número de 1 a 36.', bad);
  const perDay = { ...d, strategy: 'PER_BUSINESS_DAY', dailyRateCents: 3600 };
  assert.equal(F.validateForecast(perDay, 'monthly').ok, true);
  assert.equal(F.validateForecast(perDay, 'MONTHLY').ok, true);
  assert.equal(F.validateForecast({ ...perDay, dailyRateCents: null }, 'monthly').errors.dailyRate, 'Informe o valor por dia útil.');
  assert.equal(F.validateForecast({ ...perDay, dailyRateCents: 0 }, 'monthly').ok, false);
  assert.equal(F.validateForecast({ ...perDay, safetyText: '32' }, 'monthly').errors.safety, 'Informe um número de 0 a 31.');
  assert.equal(F.validateForecast({ ...perDay, safetyText: '31' }, 'monthly').ok, true);
  assert.match(F.validateForecast({ ...perDay, nonWorkingText: '24/06, 31/04' }, 'monthly').errors.nonWorking, /Data inválida: 31\/04/);
  assert.match(F.validateForecast(perDay, 'weekly').errors.frequency, /só vale para recorrência mensal/);
});

check('request fields: only the chosen strategy carries values, switching leaves nothing stale', () => {
  const leftovers = { ...F.emptyForecastDraft(), windowText: '4', dailyRateCents: 3600, safetyText: '2', nonWorkingText: '24/06', carnival: true, corpusChristi: true };
  const neutral = { forecastWindow: null, dailyRate: null, safetyBusinessDays: 0, nonWorkingDays: [], optionalHolidays: [] };
  assert.deepEqual(F.forecastPayload({ ...leftovers, strategy: 'LAST' }), { forecastStrategy: 'LAST', ...neutral });
  assert.deepEqual(F.forecastPayload({ ...leftovers, strategy: 'FIXED' }), { forecastStrategy: 'FIXED', ...neutral });
  assert.deepEqual(F.forecastPayload({ ...leftovers, strategy: 'CONSERVATIVE' }), { forecastStrategy: 'CONSERVATIVE', ...neutral, forecastWindow: 4 });
  assert.deepEqual(F.forecastPayload({ ...leftovers, strategy: 'CONSERVATIVE', windowText: '' }).forecastWindow, null);
  assert.deepEqual(F.forecastPayload({ ...leftovers, strategy: 'PER_BUSINESS_DAY' }), {
    forecastStrategy: 'PER_BUSINESS_DAY', forecastWindow: null, dailyRate: 36, safetyBusinessDays: 2, nonWorkingDays: ['06-24'], optionalHolidays: ['CARNIVAL', 'CORPUS_CHRISTI'],
  });
  assert.deepEqual(F.forecastPayload({ ...leftovers, strategy: 'PER_BUSINESS_DAY', safetyText: '', carnival: false }).optionalHolidays, ['CORPUS_CHRISTI']);
  assert.equal(F.forecastPayload({ ...leftovers, strategy: 'PER_BUSINESS_DAY', safetyText: '' }).safetyBusinessDays, 0);
});

check('the draft of a stored recurrence and back: the payload reproduces what the server sent; an older server means the last value', () => {
  const stored = { amount: 684, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36, safetyBusinessDays: 2, nonWorkingDays: ['06-24', '2026-07-08'], optionalHolidays: ['CARNIVAL'] };
  const draft = F.draftFromRecurrence(stored);
  assert.deepEqual(draft, { strategy: 'PER_BUSINESS_DAY', windowText: '', dailyRateCents: 3600, safetyText: '2', nonWorkingText: '24/06, 08/07/2026', carnival: true, corpusChristi: false });
  assert.deepEqual(F.forecastPayload(draft), { forecastStrategy: 'PER_BUSINESS_DAY', forecastWindow: null, dailyRate: 36, safetyBusinessDays: 2, nonWorkingDays: ['06-24', '2026-07-08'], optionalHolidays: ['CARNIVAL'] });
  assert.equal(F.draftFromRecurrence({ amount: 100, forecastStrategy: 'CONSERVATIVE', forecastWindow: 4 }).windowText, '4');
  assert.deepEqual(F.draftFromRecurrence({ amount: 100 }), F.emptyForecastDraft(), 'a recurrence that existed before the strategies stays on the last value');
  assert.deepEqual(F.draftFromRecurrence(null), F.emptyForecastDraft());
});

check('the amount stored on a per-day recurrence is the forecast of the next month (a day of the rate when there is none)', () => {
  const draft = { ...F.emptyForecastDraft(), strategy: 'PER_BUSINESS_DAY', dailyRateCents: 3600 };
  assert.equal(F.referenceAmountForPerDay(draft, '2026-11'), 684);
  assert.equal(F.referenceAmountForPerDay({ ...draft, safetyText: '40' }, '2026-11'), 36, 'all days discounted: one day of the rate, the server needs a non-zero amount');
  assert.equal(F.referenceAmountForPerDay({ ...draft, dailyRateCents: null }, '2026-11'), 0);
  assert.equal(F.amountLabelFor('LAST', 'Valor'), 'Valor');
  assert.equal(F.amountLabelFor('FIXED', 'Valor'), 'Valor fixo');
  assert.equal(F.amountLabelFor('CONSERVATIVE', 'Valor'), 'Valor inicial (usado até haver valores confirmados)');
});

console.log('\n[confirm] days implied by the received amount');

check('implied days = received ÷ rate, to two decimals; none without a usable amount or rate', () => {
  assert.equal(F.impliedDays(64800, 3600), 18);
  assert.equal(F.impliedDays(68400, 3600), 19);
  assert.equal(F.impliedDays(70200, 3600), 19.5);
  assert.equal(F.impliedDays(10000, 3000), 3.33);
  assert.equal(F.impliedDays(null, 3600), null);
  assert.equal(F.impliedDays(0, 3600), null);
  assert.equal(F.impliedDays(64800, null), null);
  assert.equal(F.impliedDays(64800, 0), null);
  assert.equal(F.formatDays(18), '18');
  assert.equal(F.formatDays(19.5), '19,5');
  assert.equal(F.formatDays(3.33), '3,33');
});

check('the note under the amount: same days says nothing more; fewer days suggests a day without voucher or a new rate; more days the opposite', () => {
  const same = F.impliedDaysNote(68400, 3600, 19, 19, '2026-11');
  assert.deepEqual(same, { implied: '19 dias (R$ 684,00 ÷ R$ 36,00)', matches: true, suggestion: null });
  const fewer = F.impliedDaysNote(64800, 3600, 19, 19, '2026-11');
  assert.equal(fewer.implied, '18 dias (R$ 648,00 ÷ R$ 36,00)');
  assert.equal(fewer.matches, false);
  assert.equal(fewer.suggestion, 'O cálculo usou 19 dias úteis de 11/2026. Se algum dia não teve vale, cadastre-o como dia sem vale; se o valor do dia mudou, ajuste o valor por dia.');
  const more = F.impliedDaysNote(70200, 3600, 19, 19, '2026-11');
  assert.equal(more.implied, '19,5 dias (R$ 702,00 ÷ R$ 36,00)');
  assert.equal(more.suggestion, 'O cálculo usou 19 dias úteis de 11/2026. Se um dia que você descontou foi pago, retire-o dos dias sem vale; se o valor do dia mudou, ajuste o valor por dia.');
  const margin = F.impliedDaysNote(64800, 3600, 17, 19, '2026-11');
  assert.match(margin.suggestion, /^O cálculo usou 17 dias \(19 dias úteis menos a margem\)\. /);
  assert.equal(F.impliedDaysNote(3600, 3600, 1, 1, '2026-11').implied, '1 dia (R$ 36,00 ÷ R$ 36,00)');
  assert.equal(F.impliedDaysNote(null, 3600, 19, 19, '2026-11'), null);
  assert.equal(F.impliedDaysNote(64800, null, 19, 19, '2026-11'), null);
});

check('the explanation of an occurrence: how it was calculated and the data the days note needs; nothing for the plain last value', () => {
  const perDay = { amount: 1, forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 };
  assert.deepEqual(F.confirmExplanation(perDay, 'INCOME', '2026-11'), {
    strategy: 'PER_BUSINESS_DAY', how: '19 dias úteis × R$ 36,00 (11/2026)', todayCents: 68400,
    perDay: { rateCents: 3600, countedDays: 19, businessDays: 19, referenceMonth: '2026-11' },
  });
  const margin = F.confirmExplanation({ ...perDay, safetyBusinessDays: 2 }, 'INCOME', '2026-11');
  assert.deepEqual(margin.perDay, { rateCents: 3600, countedDays: 17, businessDays: 19, referenceMonth: '2026-11' });
  assert.equal(F.confirmExplanation({ amount: 100 }, 'INCOME', '2026-11'), null);
  assert.equal(F.confirmExplanation({ amount: 100, forecastStrategy: 'LAST' }, 'INCOME', '2026-11'), null);
  assert.equal(F.confirmExplanation(null, 'INCOME', '2026-11'), null);
  const fixed = F.confirmExplanation({ amount: 250, forecastStrategy: 'FIXED' }, 'INCOME', '2026-11');
  assert.equal(fixed.how, 'valor fixo (11/2026)');
  assert.equal(fixed.perDay, null);
  const cons = F.confirmExplanation({ amount: 500, forecastStrategy: 'CONSERVATIVE' }, 'INCOME', '2026-11');
  assert.equal(cons.how, 'conservador: menor dos últimos 6 recebidos');
  assert.equal(cons.todayCents, null, 'the client has no history: it cannot say what today would give');
  assert.equal(F.confirmExplanation({ amount: 80, forecastStrategy: 'CONSERVATIVE', forecastWindow: 4 }, 'EXPENSE', '2026-11').how, 'conservador: maior dos últimos 4 pagos');
  const noRate = F.confirmExplanation({ amount: 700, forecastStrategy: 'PER_BUSINESS_DAY' }, 'INCOME', '2026-11');
  assert.equal(noRate.perDay, null);
  assert.equal(noRate.todayCents, 70000);
});

console.log('\n[month views] projected occurrences carry the strategy amount (utils/calculations.ts)');

const monthly = (over: Record<string, unknown>) => ({
  id: 'r1', description: 'Vale', amount: 100, type: 'INCOME', category: 'Salário', frequency: 'monthly', isActive: true,
  startDate: new Date(2026, 0, 5), nextDueDate: new Date(2026, 10, 5), accountId: 'a', ...over,
});

check('a per-day recurrence projects 36,00 x the business days of the month, not the registered 100 (nov 684, dec 792)', () => {
  const r = monthly({ forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36 });
  assert.deepEqual(K.getRecurringTransactionsForMonth([r], new Date(2026, 10, 15)).map((t: { amount: number }) => t.amount), [684]);
  assert.deepEqual(K.getRecurringTransactionsForMonth([r], new Date(2026, 11, 15)).map((t: { amount: number }) => t.amount), [792]);
});

check('the reference month is the month of the occurrence plus the offset (a voucher dated in november that counts for december: 22 days)', () => {
  const r = monthly({ forecastStrategy: 'PER_BUSINESS_DAY', dailyRate: 36, competenceOffsetMonths: 1 });
  assert.deepEqual(K.getRecurringTransactionsForMonth([r], new Date(2026, 10, 15)).map((t: { amount: number }) => t.amount), [792]);
});

check('last value and fixed project their amount; an older recurrence without a strategy is the last value', () => {
  assert.deepEqual(K.getRecurringTransactionsForMonth([monthly({})], new Date(2026, 10, 15)).map((t: { amount: number }) => t.amount), [100]);
  assert.deepEqual(K.getRecurringTransactionsForMonth([monthly({ forecastStrategy: 'FIXED', amount: 250 })], new Date(2026, 10, 15)).map((t: { amount: number }) => t.amount), [250]);
});

check('conservative: the server forecast for its own reference month, the registered amount (an approximation) for any other month', () => {
  const r = monthly({ forecastStrategy: 'CONSERVATIVE', amount: 500, forecast: { strategy: 'CONSERVATIVE', amount: 650, referenceMonth: '2026-11' } });
  assert.deepEqual(K.getRecurringTransactionsForMonth([r], new Date(2026, 10, 15)).map((t: { amount: number }) => t.amount), [650]);
  assert.deepEqual(K.getRecurringTransactionsForMonth([r], new Date(2026, 11, 15)).map((t: { amount: number }) => t.amount), [500]);
  assert.equal(F.projectedOccurrenceAmount({ amount: 500, forecastStrategy: 'CONSERVATIVE' }, 'INCOME', '2026-11-05', null), 500, 'no server forecast: the amount');
});
