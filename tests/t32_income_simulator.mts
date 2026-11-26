import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// "Renda" simulator and yearly calendar (web): src/utils/incomeSimulator.ts (form, validation, request bodies, the
// composition the API answers, the raise defaults, the current x simulated comparison, the error keys) and
// src/utils/incomeCalendar.ts (events by payment month, month and year totals, estimated split, past/current months).
// Invented data only: employers, amounts, names and dates are made up. Days are 'YYYY-MM-DD' strings.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(frontSrc('utils/incomeSimulator.ts')).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(frontSrc('utils/incomeCalendar.ts')).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TX: any = await import(pathToFileURL(frontSrc('utils/incomeTexts.ts')).href);

const TODAY = '2026-11-11';

// ---- Fixtures (invented) ---------------------------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function line(over: Record<string, any> = {}): any {
  return { key: 'k1', label: 'Vale Exemplo', amount: '200', kind: 'EARNING', inInssBase: false, inIrrfBase: false, inFgtsBase: false, ...over };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function form(over: Record<string, any> = {}): any {
  return { mode: 'net', amount: '3.000,50', date: '2026-11-11', dependents: '2', workedDays: '', lines: [], bracketMethod: 'DEDUCTION', rounding: 'TRUNCATE', ...over };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function payrollOut(over: Record<string, any> = {}): any {
  return {
    tables: { inss: 'inss-2026', irrf: 'irrf-2026', fgts: 'fgts-2026' },
    warnings: [],
    method: { bracket: 'deduction', rounding: 'truncate' },
    salary: 3000,
    extraEarnings: 200,
    fixedDeductions: 150,
    bases: { inss: 3000, irrfIncome: 3200, irrf: 2700.5, fgts: 3200 },
    inss: 300.5,
    irrf: { deduction: 'legal', deductionAmount: 600.5, taxBeforeReduction: 150.25, reduction: 50.25, tax: 100 },
    irrfAmount: 100,
    fgts: 256,
    net: 2649.5,
    ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function employment(over: Record<string, any> = {}): any {
  return {
    id: 'emp-1',
    dependents: 2,
    salaries: [
      { id: 's1', amount: 3000, startDate: '2025-01-01' },
      { id: 's2', amount: 3500, startDate: '2026-12-01' },
    ],
    items: [
      {
        id: 'i-fixed',
        name: 'Vale Exemplo',
        kind: 'EARNING',
        calcMode: 'FIXED_MONTHLY',
        inInssBase: false,
        inIrrfBase: false,
        inFgtsBase: true,
        values: [{ id: 'v1', amount: 200, startDate: '2025-01-01' }],
      },
      {
        id: 'i-day',
        name: 'Diaria Exemplo',
        kind: 'EARNING',
        calcMode: 'PER_BUSINESS_DAY',
        inInssBase: false,
        inIrrfBase: false,
        inFgtsBase: false,
        values: [{ id: 'v2', amount: 40, startDate: '2025-01-01' }],
      },
      {
        id: 'i-plan',
        name: 'Plano Exemplo',
        kind: 'DEDUCTION',
        calcMode: 'FIXED_MONTHLY',
        inInssBase: false,
        inIrrfBase: false,
        inFgtsBase: false,
        values: [
          { id: 'v3', amount: 90, startDate: '2025-01-01' },
          { id: 'v4', amount: 150, startDate: '2026-06-01' },
        ],
      },
      {
        id: 'i-later',
        name: 'Futuro Exemplo',
        kind: 'EARNING',
        calcMode: 'FIXED_MONTHLY',
        inInssBase: false,
        inIrrfBase: false,
        inFgtsBase: false,
        values: [{ id: 'v5', amount: 70, startDate: '2027-01-01' }],
      },
    ],
    ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function set(over: Record<string, any> = {}): any {
  return { employmentId: 'emp-1', salary: [], thirteenth: [], vacations: [], birthdayWithdrawals: [], fgts: { basis: null, months: [] }, benefits: [], ...over };
}

// ---- Request bodies ------------------------------------------------------------------------------------------------

check('S-a: the amount goes to gross in net mode and to targetNet in gross mode; the day and worked days only when filled', () => {
  const net = S.simBody(form({ mode: 'net' }));
  assert.equal(net.gross, 3000.5, 'gross of the net mode');
  assert.equal(net.targetNet, undefined, 'no target net in net mode');
  const gross = S.simBody(form({ mode: 'gross' }));
  assert.equal(gross.targetNet, 3000.5, 'target net of the gross mode');
  assert.equal(gross.gross, undefined, 'no gross in gross mode');
  assert.equal(net.date, '2026-11-11');
  assert.equal(net.dependents, 2);
  assert.equal('workedDays' in net, false, 'empty worked days are not sent');
  const blank = S.simBody(form({ date: '', workedDays: '' }));
  assert.equal('date' in blank, false, 'an empty date is left to the API (today)');
  assert.equal(S.simBody(form({ workedDays: '18' })).workedDays, 18);
});

check('S-b: a deduction has no base flags in the body (the API ignores them); an earning keeps its flags', () => {
  const body = S.simBody(
    form({
      lines: [
        line({ key: 'a', label: 'Vale', amount: '200', kind: 'EARNING', inFgtsBase: true }),
        line({ key: 'b', label: 'Plano', amount: '150', kind: 'DEDUCTION', inInssBase: true, inIrrfBase: true, inFgtsBase: true }),
      ],
    }),
  );
  assert.deepEqual(body.items[0], { label: 'Vale', amount: 200, kind: 'EARNING', inInssBase: false, inIrrfBase: false, inFgtsBase: true });
  assert.deepEqual(body.items[1], { label: 'Plano', amount: 150, kind: 'DEDUCTION', inInssBase: false, inIrrfBase: false, inFgtsBase: false });
});

check('S-c: withGross sets the gross and drops the target net; the body it came from is not changed', () => {
  const body = S.simBody(form({ mode: 'gross', amount: '2500' }));
  const next = S.withGross(body, 3000);
  assert.equal(next.gross, 3000);
  assert.equal('targetNet' in next, false);
  assert.equal(body.targetNet, 2500, 'the original body keeps its target');
});

// ---- Validation ----------------------------------------------------------------------------------------------------

check('S-d: dependents 0..20, worked days 0..30, a real day, a positive amount with at most two decimals', () => {
  assert.equal(S.validateSim(form({ dependents: '20' })).valid, true);
  assert.equal(S.validateSim(form({ dependents: '21' })).errors.dependents, 'incomeErrDependents');
  assert.equal(S.validateSim(form({ dependents: '-1' })).errors.dependents, 'incomeErrDependents');
  assert.equal(S.validateSim(form({ workedDays: '30' })).valid, true);
  assert.equal(S.validateSim(form({ workedDays: '31' })).errors.workedDays, 'incomeSimErrWorkedDays');
  assert.equal(S.validateSim(form({ workedDays: '' })).valid, true, 'empty worked days is the whole month');
  assert.equal(S.validateSim(form({ date: '2026-02-30' })).errors.date, 'incomeErrDate');
  assert.equal(S.validateSim(form({ date: '' })).valid, true, 'an empty date is allowed');
  assert.equal(S.validateSim(form({ amount: '0' })).errors.amount, 'incomeErrAmountPositive');
  assert.equal(S.validateSim(form({ amount: '' })).errors.amount, 'incomeErrAmountPositive');
  assert.equal(S.validateSim(form({ amount: '12,345' })).errors.amount, 'incomeErrAmount');
  assert.equal(S.validateSim(form({ amount: '1.234,56' })).valid, true);
});

check('S-e: a line needs a label up to 100 characters and a positive amount; more than 30 lines is refused', () => {
  const blankLabel = S.validateSim(form({ lines: [line({ label: '   ' })] }));
  assert.equal(blankLabel.valid, false);
  assert.equal(blankLabel.lineErrors.k1.label, 'incomeErrName');
  const longLabel = S.validateSim(form({ lines: [line({ label: 'x'.repeat(101) })] }));
  assert.equal(longLabel.lineErrors.k1.label, 'incomeErrName');
  const noAmount = S.validateSim(form({ lines: [line({ amount: '' })] }));
  assert.equal(noAmount.lineErrors.k1.amount, 'incomeErrAmountPositive');
  const many = Array.from({ length: 31 }, (_, i) => line({ key: `n${i}` }));
  assert.equal(S.validateSim(form({ lines: many })).errors.lines, 'incomeSimErrLines');
  assert.equal(S.validateSim(form({ lines: many.slice(0, 30) })).valid, true);
});

// ---- The answer ----------------------------------------------------------------------------------------------------

check('S-f: the composition in cents: gross is the prorated salary plus the extra earnings; the bases and the INSS/IRRF values', () => {
  const comp = S.compositionOf(payrollOut());
  assert.equal(comp.salaryCents, 300000);
  assert.equal(comp.extraEarningsCents, 20000);
  assert.equal(comp.grossCents, 320000, 'bruto = salario + proventos extras');
  assert.equal(comp.inss.baseCents, 300000);
  assert.equal(comp.inss.valueCents, 30050);
  assert.equal(comp.irrf.incomeCents, 320000);
  assert.equal(comp.irrf.baseCents, 270050);
  assert.equal(comp.irrf.valueCents, 10000);
  assert.equal(comp.irrf.deduction, 'legal');
  assert.equal(comp.irrf.deductionCents, 60050);
  assert.equal(comp.fixedDeductionsCents, 15000);
  assert.equal(comp.netCents, 264950);
  assert.equal(comp.fgtsCents, 25600);
});

check('S-g: a projected table is flagged; each warning code gives one text key, in the order of the API', () => {
  const warnings = [
    { code: 'projection_old_table', tax: 'irrf', tableId: 'irrf-2026' },
    { code: 'before_first_table', tax: 'fgts', tableId: 'fgts-2025' },
    { code: 'projection_old_table', tax: 'inss', tableId: 'inss-2026' },
  ];
  const comp = S.compositionOf(payrollOut({ warnings }));
  assert.equal(comp.projection, true);
  assert.deepEqual(comp.warningKeys, ['incomeWarnProjection', 'incomeWarnBeforeTable']);
  const plain = S.compositionOf(payrollOut());
  assert.equal(plain.projection, false);
  assert.deepEqual(plain.warningKeys, []);
});

check('S-h: the error of a simulation: "out of reach" has its own text; other 400 is the shape refused; the rest is generic', () => {
  assert.equal(S.simulationErrorKey({ status: 400, message: 'That net is out of reach' }), 'incomeSimErrOutOfReach');
  assert.equal(S.simulationErrorKey({ status: 400, message: 'Validation failed' }), 'incomeSimErrInvalid');
  assert.equal(S.simulationErrorKey({ status: 500, message: 'boom' }), 'incomeSimErrGeneric');
  assert.equal(S.simulationErrorKey(undefined), 'incomeSimErrGeneric');
});

// ---- Raise defaults and comparison ---------------------------------------------------------------------------------

check('S-i: a raise starts with the gross in force today, the dependents and the FIXED monthly items in force (not the per-day ones)', () => {
  const start = S.raiseStart(employment(), TODAY);
  assert.equal(start.baselineGross, 3000, 'the salary in force today, not the one that starts in December');
  assert.equal(start.form.mode, 'net');
  assert.equal(start.form.amount, '3000,00');
  assert.equal(start.form.dependents, '2');
  assert.equal(start.form.date, TODAY);
  assert.deepEqual(
    start.form.lines.map((l: { label: string }) => l.label),
    ['Vale Exemplo', 'Plano Exemplo'],
    'per-day item and the item whose value starts later are out',
  );
  assert.equal(start.form.lines[1].amount, '150,00', 'the latest value that starts on or before today (150 from June), not the first one');
  assert.equal(start.form.lines[1].kind, 'DEDUCTION');
  assert.equal(start.form.lines[0].inFgtsBase, true, 'the base flags of the item carry over');
  assert.equal(start.form.bracketMethod, 'DEDUCTION');
  assert.equal(start.form.rounding, 'TRUNCATE');
});

check('S-j: a job with no salary in force today has no baseline and an empty amount', () => {
  const start = S.raiseStart(employment({ salaries: [{ id: 's9', amount: 4000, startDate: '2027-01-01' }] }), TODAY);
  assert.equal(start.baselineGross, null);
  assert.equal(start.form.amount, '');
});

check('S-k: the comparison is simulated minus current, in cents (negative when it goes down); exact only at zero', () => {
  const up = S.compareNet(264950, 271080);
  assert.deepEqual(up, { currentCents: 264950, simulatedCents: 271080, differenceCents: 6130 });
  const down = S.compareNet(264950, 260000);
  assert.equal(down.differenceCents, -4950);
  assert.equal(S.isExactNet(0), true);
  assert.equal(S.isExactNet(1), false, 'one cent over is not exact');
});

// ---- Calendar ------------------------------------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function yearSet(): any[] {
  return [
    set({
      salary: [
        { competence: '2026-10', paymentDate: '2026-11-05', gross: 3000, net: 2500.5, estimated: false },
        { competence: '2026-11', paymentDate: '2026-12-05', gross: 3000, net: 2600, estimated: true },
      ],
      thirteenth: [{ year: 2026, installment: 1, date: '2026-11-30', net: 1000.25, estimated: false }],
      vacations: [{ id: 'v1', paymentDate: '2026-12-20', net: 3000, estimated: false, period: { start: '2026-12-01', end: '2026-12-30', days: 30, estimated: false } }],
      birthdayWithdrawals: [{ year: 2026, date: '2026-11-20', amount: 800, source: 'table', balance: 5000, tableId: null }],
      benefits: [
        { itemId: 'i1', name: 'Vale Exemplo', referenceMonth: '2026-11', paymentDate: '2026-11-25', amount: 400.1, countedDays: 20, isAvailableCash: false },
        { itemId: 'i1', name: 'Vale Exemplo', referenceMonth: '2026-12', paymentDate: '2027-01-25', amount: 390, countedDays: 19, isAvailableCash: true },
      ],
    }),
  ];
}

check('S-l: each event sits in the month of its PAYMENT date (salary of October paid on 5 November is a November entry)', () => {
  const year = C.buildCalendarYear(yearSet(), 2026, TODAY);
  const nov = year.months[10];
  assert.equal(nov.month, '2026-11');
  assert.deepEqual(
    nov.entries.map((e: { kind: string }) => e.kind),
    ['salary', 'birthday', 'benefit', 'thirteenth'],
    'by payment date: 5, 20, 25 and 30 November',
  );
  assert.equal(nov.entries[0].competence, '2026-10');
  const dec = year.months[11];
  assert.deepEqual(dec.entries.map((e: { kind: string }) => e.kind), ['salary', 'vacation']);
  assert.equal(dec.entries[1].periodStart, '2026-12-01');
  assert.equal(dec.entries[1].periodDays, 30);
});

check('S-m: a payment in the next year is not in this year (the 2027 benefit stays out of 2026)', () => {
  const year = C.buildCalendarYear(yearSet(), 2026, TODAY);
  assert.equal(year.months.flatMap((m: { entries: unknown[] }) => m.entries).length, 6);
  assert.equal(year.months[0].entries.length, 0);
  const next = C.buildCalendarYear(yearSet(), 2027, TODAY);
  assert.equal(next.months[0].entries.length, 1, 'the benefit paid on 25 January 2027');
});

check('S-m2: a recorded birthday withdrawal (asked with includePast) is not estimated; a forecast one is', () => {
  const sets = [
    set({
      birthdayWithdrawals: [
        { year: 2026, date: '2026-05-07', amount: 700.4, source: 'recorded', balance: 0, tableId: null, past: true },
        { year: 2027, date: '2027-05-07', amount: 900, source: 'table', balance: 6000, tableId: null, past: false },
      ],
    }),
  ];
  const may = C.buildCalendarYear(sets, 2026, TODAY).months[4];
  assert.equal(may.past, true);
  assert.equal(may.totalCents, 70040);
  assert.equal(may.estimatedCents, 0, 'a real withdrawal is not an estimate');
  assert.equal(may.firmCents, 70040);
  const next = C.buildCalendarYear(sets, 2027, TODAY).months[4];
  assert.equal(next.estimatedCents, 90000);
});

check('S-m3: two recorded withdrawals on the same day are two entries with different keys', () => {
  const sets = [
    set({
      birthdayWithdrawals: [
        { year: 2026, date: '2026-05-07', amount: 700.4, source: 'recorded', balance: 0, tableId: null, past: true },
        { year: 2026, date: '2026-05-07', amount: 50.1, source: 'recorded', balance: 0, tableId: null, past: true },
      ],
    }),
  ];
  const may = C.buildCalendarYear(sets, 2026, TODAY).months[4];
  assert.equal(may.entries.length, 2);
  assert.notEqual(may.entries[0].key, may.entries[1].key);
  assert.equal(may.totalCents, 75050);
});

check('S-n: month totals sum in cents and split the estimated part from the rest; the year adds the months', () => {
  const year = C.buildCalendarYear(yearSet(), 2026, TODAY);
  const nov = year.months[10];
  // 2500,50 + 800,00 + 400,10 + 1000,25 = 4700,85
  assert.equal(nov.totalCents, 470085);
  // estimated: the birthday withdrawal (800,00) and the benefit (400,10); the salary and the 13th are not estimated here
  assert.equal(nov.estimatedCents, 120010);
  assert.equal(nov.firmCents, 350075);
  const dec = year.months[11];
  assert.equal(dec.totalCents, 560000, 'salary 2.600,00 estimated plus vacation 3.000,00');
  assert.equal(dec.estimatedCents, 260000);
  assert.equal(year.totalCents, 1030085);
  assert.equal(year.estimatedCents, 380010);
  assert.equal(year.firmCents, 650075);
});

check('S-o: months before the current one are past, the current one is current, the rest are neither', () => {
  const year = C.buildCalendarYear(yearSet(), 2026, TODAY);
  assert.equal(year.months[0].past, true, 'January');
  assert.equal(year.months[9].past, true, 'October');
  assert.equal(year.months[10].past, false);
  assert.equal(year.months[10].current, true, 'November is the current month');
  assert.equal(year.months[11].past, false);
  assert.equal(year.months[11].current, false);
  assert.equal(C.yearHasPast(2026, TODAY), true);
  assert.equal(C.yearHasPast(2026, '2026-01-05'), false, 'in January the year has no past month yet');
  assert.equal(C.yearHasPast(2027, TODAY), false);
  assert.deepEqual(C.yearRange(2026), { from: '2026-01-01', to: '2026-12-31' });
});

check('S-p: entries of a month are in date order, then by kind; an empty month is empty with zero totals', () => {
  const year = C.buildCalendarYear(yearSet(), 2026, TODAY);
  const dates = year.months[10].entries.map((e: { date: string }) => e.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.equal(year.months[5].entries.length, 0);
  assert.deepEqual([year.months[5].totalCents, year.months[5].estimatedCents, year.months[5].firmCents], [0, 0, 0]);
});

// ---- Texts ---------------------------------------------------------------------------------------------------------

check('S-q: every text key the simulator and the calendar use exists in the Portuguese set and in both locale files', () => {
  const files = [
    'utils/incomeSimulator.ts',
    'utils/incomeCalendar.ts',
    'components/income/SimulatorPanel.tsx',
    'pages/IncomeSimulator.tsx',
    'pages/IncomeCalendar.tsx',
    'pages/Income.tsx',
    'pages/IncomeDetail.tsx',
  ];
  const keys = new Set<string>();
  for (const rel of files) {
    const src = readFileSync(frontSrc(rel), 'utf8');
    for (const m of src.matchAll(/'(income(?:Sim|Calendar|Err|Warn|Event|Scope|Raise|Simulator|Entry)[A-Za-z]*)'/g)) keys.add(m[1]);
    for (const m of src.matchAll(/tx\(\s*'([A-Za-z]+)'/g)) keys.add(m[1]);
  }
  const pt = JSON.parse(readFileSync(frontSrc('i18n/pt-BR.json'), 'utf8'));
  const en = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'));
  const missing: string[] = [];
  for (const key of keys) {
    if (!(key in TX.INCOME_TEXTS_PT)) missing.push(`${key} (not in INCOME_TEXTS_PT)`);
    else if (typeof pt[key] !== 'string' || typeof en[key] !== 'string') missing.push(`${key} (not in a locale file)`);
  }
  assert.deepEqual(missing, [], 'missing text keys');
  assert.ok(keys.size > 60, `expected the simulator and calendar keys, found ${keys.size}`);
});

check('S-r: the Portuguese text of a placeholder is filled by name; a missing name stays visible', () => {
  assert.equal(TX.incomeText(undefined, 'incomeSimTables', { inss: 'A', irrf: 'B', fgts: 'C' }), 'Tabelas usadas: INSS A, IRRF B, FGTS C');
  assert.equal(TX.incomeText(undefined, 'incomeCalendarVacation', { start: '01/12', end: '30/12' }), 'Férias de 01/12 a 30/12, {days} dias');
});

summary();
