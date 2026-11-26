import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc, summary } from './harness.mts';

// "Renda" area (web): src/utils/income.ts (grouping by person, month totals, upcoming events, benefit breakdown, FGTS
// helpers, API error keys), src/utils/incomeForms.ts (form rules and request bodies), src/utils/incomeTexts.ts (keys in
// the locale files), and the payroll origin of the cash flow and of the bills checklist. INCOME_MODULE and
// INCOME_FORMS_MODULE / CASH_FLOW_MODULE / BILLS_CHECKLIST_MODULE point at mutated copies for the bite-checks.
// Invented data only: employers, people, accounts and amounts are made up. Days are 'YYYY-MM-DD' strings.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const load = async (envName: string, rel: string): Promise<any> =>
  import(pathToFileURL(process.env[envName] || frontSrc(rel)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const I: any = await load('INCOME_MODULE', 'utils/income.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = await load('INCOME_FORMS_MODULE', 'utils/incomeForms.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TX: any = await import(pathToFileURL(frontSrc('utils/incomeTexts.ts')).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CFT: any = await import(pathToFileURL(frontSrc('utils/cashFlowTexts.ts')).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await load('CASH_FLOW_MODULE', 'utils/cashFlow.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BILLS: any = await load('BILLS_CHECKLIST_MODULE', 'utils/billsChecklist.ts');

const TODAY = '2026-11-11';

// ---- Fixtures (invented) ---------------------------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function employment(over: Record<string, any> = {}): any {
  return {
    id: 'emp-1', householdId: 'hh-1', personId: 'p-1', regime: 'CLT', employer: 'Empresa Exemplo', admissionDate: '2024-03-10',
    endDate: null, dependents: 0, payDay: 5, accountId: 'acc-main', recurringTransactionId: 'rec-salary', bracketMethod: 'DEDUCTION',
    rounding: 'TRUNCATE', thirteenthFirstMonth: 6, thirteenthFirstDay: 30, thirteenthSecondMonth: 12, thirteenthSecondDay: 20,
    uf: 'SP', city: 'Cidade Exemplo', optionalHolidaysOff: true, isActive: true, createdAt: '', updatedAt: '',
    salaries: [], items: [], vacations: [], fgtsBalances: [], fgtsWithdrawals: [], fgtsModes: [], ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function benefit(over: Record<string, any> = {}): any {
  return {
    itemId: 'item-1', name: 'Vale', referenceMonth: '2026-11', paymentDate: '2026-10-25', ratePerDay: 40, weekdays: 21,
    holidayDays: 1, vacationDays: 0, marginDays: 0, countedDays: 20, amount: 800, estimated: true, isAvailableCash: true,
    accountId: null, recurringTransactionId: null, holidays: [{ date: '2026-11-02', name: 'Finados', level: 'national', optional: false }],
    warnings: [], ...over,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function set(over: Record<string, any> = {}): any {
  return { employmentId: 'emp-1', salary: [], thirteenth: [], vacations: [], birthdayWithdrawals: [], fgts: { basis: null, months: [] }, benefits: [], ...over };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function salaryEv(over: Record<string, any> = {}): any {
  return { competence: '2026-10', paymentDate: '2026-11-05', gross: 3000, workedDays: 30, vacationDays: 0, net: 2500.5, estimated: false, payroll: {}, ...over };
}

const PEOPLE = [
  { id: 'p-1', name: 'Pessoa A', userId: 'user-a', isActive: true },
  { id: 'p-2', name: 'Pessoa B', userId: null, isActive: true },
  { id: 'p-3', name: 'Pessoa C', userId: 'user-c', isActive: true },
];

// ---- Money and dates ---------------------------------------------------------------------------------------------------

check('I-a: money text reads comma and dot decimals, and refuses more than two decimals or junk', () => {
  assert.equal(F.parseMoneyText('1234,56'), 1234.56);
  assert.equal(F.parseMoneyText('1.234,50'), 1234.5);
  assert.equal(F.parseMoneyText('1234.5'), 1234.5);
  assert.equal(F.parseMoneyText(' 36 '), 36);
  assert.equal(F.parseMoneyText('0,1'), 0.1);
  assert.equal(F.parseMoneyText('1,234'), null);
  assert.equal(F.parseMoneyText('10,005'), null);
  assert.equal(F.parseMoneyText('abc'), null);
  assert.equal(F.parseMoneyText(''), null);
  assert.equal(F.formatMoneyText(36), '36,00');
  assert.equal(F.formatMoneyText(null), '');
});

check('I-b: a day text must be a real calendar day', () => {
  assert.equal(F.parseDayText('2026-02-28'), '2026-02-28');
  assert.equal(F.parseDayText('2026-02-30'), null);
  assert.equal(F.parseDayText('2024-02-29'), '2024-02-29');
  assert.equal(F.parseDayText('2026-13-01'), null);
  assert.equal(F.parseDayText('28/02/2026'), null);
});

check('I-c: month and day arithmetic stays on the calendar (no time zone shift)', () => {
  assert.deepEqual(I.monthRange('2026-02'), { from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(I.monthRange('2028-02'), { from: '2028-02-01', to: '2028-02-29' });
  assert.equal(I.addMonthKey('2026-12', 1), '2027-01');
  assert.equal(I.addMonthKey('2027-01', -1), '2026-12');
  assert.equal(I.addDayKey('2026-12-31', 1), '2027-01-01');
  assert.equal(I.shortDay('2026-11-05'), '05/11');
  assert.equal(I.longDay('2026-11-05'), '05/11/2026');
  assert.equal(I.shortDay('nope'), '');
});

// ---- People and employments -----------------------------------------------------------------------------------------

check('I-d: employments group by owner in the order of the people; orphans go last; couple view needs two owners', () => {
  const groups = I.groupEmploymentsByPerson(PEOPLE, [
    employment({ id: 'e-b', personId: 'p-2' }),
    employment({ id: 'e-x', personId: null }),
    employment({ id: 'e-a', personId: 'p-1' }),
    employment({ id: 'e-a2', personId: 'p-1' }),
  ]);
  assert.deepEqual(groups.map((g: { personId: string | null }) => g.personId), ['p-1', 'p-2', null]);
  assert.deepEqual(groups[0].employments.map((e: { id: string }) => e.id), ['e-a', 'e-a2']);
  assert.equal(I.isCoupleView(groups), true);
  assert.equal(I.isCoupleView(I.groupEmploymentsByPerson(PEOPLE, [employment({ personId: 'p-1' })])), false);
  assert.equal(I.isCoupleView(I.groupEmploymentsByPerson(PEOPLE, [employment({ personId: null })])), false);
});

check('I-e: "Só eu" finds my person by the user id and asks the API for that person; "Casal" asks for everyone', () => {
  assert.equal(I.findMyPersonId(PEOPLE, 'user-a'), 'p-1');
  assert.equal(I.findMyPersonId(PEOPLE, 'user-zz'), null);
  assert.equal(I.findMyPersonId(PEOPLE, null), null);
  assert.equal(I.scopePersonId('mine', 'p-1'), 'p-1');
  assert.equal(I.scopePersonId('mine', null), undefined);
  assert.equal(I.scopePersonId('couple', 'p-1'), undefined);
});

check('I-f: the status of an employment: inactive, ended (end date before today), or active', () => {
  assert.equal(I.employmentStatus({ isActive: false, endDate: null }, TODAY), 'inactive');
  assert.equal(I.employmentStatus({ isActive: true, endDate: '2026-10-01' }, TODAY), 'ended');
  assert.equal(I.employmentStatus({ isActive: true, endDate: '2026-11-11' }, TODAY), 'active');
  assert.equal(I.employmentStatus({ isActive: true, endDate: null }, TODAY), 'active');
  assert.deepEqual(I.thirteenthDays(employment()), { first: '30/06', second: '20/12' });
});

check('I-g: values in force: the latest start not after the day; before the first, nothing', () => {
  const salaries = [{ id: 's2', amount: 3200, startDate: '2026-03-01' }, { id: 's1', amount: 3000, startDate: '2025-01-01' }];
  assert.equal(I.salaryInForce(salaries, '2026-02-28').amount, 3000);
  assert.equal(I.salaryInForce(salaries, '2026-03-01').amount, 3200);
  assert.equal(I.salaryInForce(salaries, '2024-12-31'), null);
  const values = [{ id: 'v1', amount: 40, startDate: '2026-01-01' }, { id: 'v2', amount: 45, startDate: '2026-11-01' }];
  assert.equal(I.valueInForce(values, '2026-10-31').amount, 40);
  assert.equal(I.valueInForce(values, '2026-11-01').amount, 45);
});

check('I-h: a recurrence already held elsewhere is in use; the employment being edited is not', () => {
  const list = [employment({ id: 'e1', recurringTransactionId: 'r-1', items: [{ id: 'i1', recurringTransactionId: 'r-2' }] }), employment({ id: 'e2', recurringTransactionId: 'r-3' })];
  assert.deepEqual([...I.recurrencesInUse(list)].sort(), ['r-1', 'r-2', 'r-3']);
  assert.deepEqual([...I.recurrencesInUse(list, 'e1')].sort(), ['r-3']);
});

// ---- Month totals and upcoming events -------------------------------------------------------------------------------

check('I-i: month totals sum the salary paid in the month and the benefits paid in it, in whole cents', () => {
  const a = set({ salary: [salaryEv({ paymentDate: '2026-11-05', net: 2500.5 }), salaryEv({ paymentDate: '2026-12-05', net: 9999 })], benefits: [benefit({ paymentDate: '2026-11-25', amount: 0.1 }), benefit({ paymentDate: '2026-10-25', amount: 800 })] });
  const b = set({ employmentId: 'emp-2', salary: [salaryEv({ paymentDate: '2026-11-05', net: 1000.2 })] });
  const totals = I.monthTotals([a, b], '2026-11');
  assert.equal(totals.salaryCents, 250050 + 100020);
  assert.equal(totals.benefitsCents, 10);
  assert.equal(totals.totalCents, 350070 + 10);
  assert.deepEqual(I.monthTotals([], '2026-11'), { salaryCents: 0, benefitsCents: 0, totalCents: 0 });
});

check('I-j: upcoming events are the 13th, vacations, birthday withdrawals and benefits from today, by date', () => {
  const a = set({
    thirteenth: [{ year: 2026, installment: 2, date: '2026-12-20', net: 1000, estimated: false, thirteenth: {} }],
    vacations: [{ id: 'v1', paymentDate: '2026-12-30', net: 3000, estimated: true }, { id: 'v0', paymentDate: '2026-11-01', net: 1, estimated: true }],
    birthdayWithdrawals: [{ year: 2027, date: '2027-05-07', amount: 500, source: 'table', balance: 0, tableId: null }],
    benefits: [benefit({ paymentDate: '2026-11-25', amount: 700, name: 'Vale', countedDays: 18, isAvailableCash: false }), benefit({ paymentDate: '2026-11-01', amount: 9 })],
  });
  const list = I.upcomingEvents([a], TODAY);
  assert.deepEqual(list.map((e: { kind: string }) => e.kind), ['benefit', 'thirteenth', 'vacation', 'birthday']);
  assert.equal(list[0].amountCents, 70000);
  assert.equal(list[0].availableCash, false);
  assert.equal(list[0].days, 18);
  assert.equal(list[1].installment, 2);
  assert.equal(list[2].amountCents, 300000);
  assert.equal(list[3].amountCents, 50000);
  assert.ok(list.every((e: { date: string }) => e.date >= TODAY));
});

// ---- Benefit paid per business day ---------------------------------------------------------------------------------

check('I-k: the business-day breakdown and the warnings without repeats', () => {
  const b = benefit({
    warnings: [
      { code: 'unconfirmed_holiday', date: '2026-12-08', message: 'x' },
      { code: 'unconfirmed_holiday', date: '2026-12-08', message: 'x' },
      { code: 'no_city_table', message: 'y' },
    ],
  });
  const view = I.benefitBreakdown(b);
  assert.equal(view.weekdays, 21);
  assert.equal(view.holidayDays, 1);
  assert.equal(view.countedDays, 20);
  assert.equal(view.amountCents, 80000);
  assert.deepEqual(view.warnings.map((w: { code: string }) => w.code), ['unconfirmed_holiday', 'no_city_table']);
  assert.equal(I.benefitWarningKey('no_state_table'), 'incomeWarnNoState');
  assert.equal(I.benefitWarningKey('no_city_table'), 'incomeWarnNoCity');
  assert.equal(I.benefitWarningKey('unconfirmed_holiday'), 'incomeWarnUnconfirmed');
  assert.equal(I.benefitWarningKey('something_new'), 'incomeWarnUnknown');
});

check('I-l: the benefit of a reference month is found by item and reference month, not by payment date', () => {
  const list = [benefit({ itemId: 'i1', referenceMonth: '2026-10', paymentDate: '2026-11-25' }), benefit({ itemId: 'i1', referenceMonth: '2026-11', paymentDate: '2026-12-25' })];
  assert.equal(I.benefitForReference(list, 'i1', '2026-11').paymentDate, '2026-12-25');
  assert.equal(I.benefitForReference(list, 'i2', '2026-11'), null);
});

check('I-m: the last real launch is the latest income of the recurrence; the difference is real minus expected', () => {
  const txs = [
    { id: 't1', type: 'INCOME', amount: 700, date: '2026-09-25', recurringTransactionId: 'r-1' },
    { id: 't2', type: 'INCOME', amount: 612.5, date: '2026-10-25', recurringTransactionId: 'r-1' },
    { id: 't3', type: 'EXPENSE', amount: 99, date: '2026-11-01', recurringTransactionId: 'r-1' },
    { id: 't4', type: 'INCOME', amount: 5, date: '2026-11-02', recurringTransactionId: 'r-other' },
  ];
  assert.deepEqual(I.lastRealLaunch(txs, 'r-1'), { amountCents: 61250, date: '2026-10-25' });
  assert.equal(I.lastRealLaunch(txs, 'r-none'), null);
  assert.equal(I.realMinusExpected(61250, 80000), -18750);
});

// ---- FGTS -----------------------------------------------------------------------------------------------------------

check('I-n: the deposit of a month sums salary, 13th and vacation; the mode in force follows the dated history', () => {
  const fgts = { basis: null, months: [{ month: '2026-11', salaryDeposit: 240.5, thirteenthDeposit: 0, vacationDeposit: 100, withdrawals: 0, forecastWithdrawal: 0, accumulated: 1 }] };
  assert.equal(I.fgtsDepositOfMonth(fgts, '2026-11'), 34050);
  assert.equal(I.fgtsDepositOfMonth(fgts, '2026-10'), 0);
  const modes = [
    { id: 'm2', mode: 'BIRTHDAY', birthdayMonth: 5, expectedAmount: null, startDate: '2026-05-01' },
    { id: 'm1', mode: 'TERMINATION', birthdayMonth: null, expectedAmount: null, startDate: '2025-01-01' },
  ];
  assert.equal(I.modeInForce(modes, '2026-04-30').id, 'm1');
  assert.equal(I.modeInForce(modes, '2026-05-01').id, 'm2');
  assert.equal(I.modeInForce(modes, '2024-01-01'), null);
  assert.deepEqual(I.modeHistory(modes).map((m: { id: string }) => m.id), ['m1', 'm2']);
});

check('I-o: the next birthday withdrawal is the first one from today; the basis says informed or since admission', () => {
  const list = [{ date: '2026-05-07', amount: 1 }, { date: '2027-05-07', amount: 2 }, { date: '2026-12-01', amount: 3 }];
  assert.equal(I.nextBirthdayWithdrawal(list, TODAY).amount, 3);
  assert.equal(I.nextBirthdayWithdrawal([], TODAY), null);
  assert.deepEqual(I.fgtsBasis({ basis: { asOfDate: '2026-01-01', amount: 5000.5 }, months: [] }), { informed: true, asOfDate: '2026-01-01', amountCents: 500050 });
  assert.deepEqual(I.fgtsBasis({ basis: null, months: [] }), { informed: false });
});

// ---- API errors and warnings ----------------------------------------------------------------------------------------

check('I-p: API errors map to text keys by status and by the backend message fragment', () => {
  assert.equal(I.incomeErrorKey({ status: 404, message: 'Employment not found' }), 'incomeErrNotFound');
  assert.equal(I.incomeErrorKey({ status: 409, message: 'That recurrence already feeds another employment' }), 'incomeErrRecurrenceUsed');
  assert.equal(I.incomeErrorKey({ status: 409, message: 'There is already a salary starting that day' }), 'incomeErrDateTaken');
  assert.equal(I.incomeErrorKey({ status: 409, message: 'There is already a balance informed for that date' }), 'incomeErrDateTaken');
  assert.equal(I.incomeErrorKey({ status: 409, message: 'Conflict' }), 'incomeErrConflict');
  assert.equal(I.incomeErrorKey({ status: 400, message: 'The account that receives the salary cannot be a credit card' }), 'incomeErrAccountCredit');
  assert.equal(I.incomeErrorKey({ status: 400, message: 'The linked recurrence must be an income recurrence' }), 'incomeErrRecurrenceIncome');
  assert.equal(I.incomeErrorKey({ status: 400, message: 'Inform the start date or only the month, not both' }), 'incomeErrVacationChoose');
  assert.equal(I.incomeErrorKey({ status: 400, message: 'days plus sold days cannot exceed 30' }), 'incomeErrVacationTotal');
  assert.equal(I.incomeErrorKey({ status: 400, message: 'The termination mode has no birthday month or expected amount' }), 'incomeErrTerminationExtras');
  assert.equal(I.incomeErrorKey({ status: 500, message: 'boom' }), 'incomeErrGeneric');
  assert.equal(I.incomeErrorKey(undefined), 'incomeErrGeneric');
});

// ---- Forms: employment ----------------------------------------------------------------------------------------------

const CTX = {
  peopleIds: new Set(['p-1', 'p-2']),
  moneyAccountIds: new Set(['acc-main']),
  freeIncomeRecurrenceIds: new Set(['rec-salary', 'rec-vale']),
  currentRecurrenceId: null,
};

function filledEmployment(over: Record<string, unknown> = {}) {
  return { ...F.emptyEmploymentForm('p-1'), employer: 'Empresa Exemplo', admissionDate: '2024-03-10', uf: 'sp', city: ' Cidade Exemplo ', ...over };
}

check('F-a: a valid employment passes; the owner, the admission and the employer are required', () => {
  assert.deepEqual(F.validateEmployment(filledEmployment(), CTX), {});
  assert.equal(F.validateEmployment(filledEmployment({ personId: '' }), CTX).personId, 'incomeErrPerson');
  assert.equal(F.validateEmployment(filledEmployment({ personId: 'p-foreign' }), CTX).personId, 'incomeErrPerson');
  assert.equal(F.validateEmployment(filledEmployment({ employer: '   ' }), CTX).employer, 'incomeErrEmployer');
  assert.equal(F.validateEmployment(filledEmployment({ admissionDate: '2024-02-30' }), CTX).admissionDate, 'incomeErrDate');
});

check('F-b: the end date cannot come before the admission; the city needs a UF; the UF is two letters', () => {
  assert.equal(F.validateEmployment(filledEmployment({ endDate: '2024-01-01' }), CTX).endDate, 'incomeErrDateOrder');
  assert.deepEqual(F.validateEmployment(filledEmployment({ endDate: '2026-06-30' }), CTX), {});
  assert.equal(F.validateEmployment(filledEmployment({ uf: '', city: 'Cidade Exemplo' }), CTX).city, 'incomeErrCityNeedsUf');
  assert.equal(F.validateEmployment(filledEmployment({ uf: 'SER' }), CTX).uf, 'incomeErrUf');
});

check('F-c: dependents 0 to 20, pay day 1 to 31, 13th months and days in range, first installment not after the second', () => {
  assert.equal(F.validateEmployment(filledEmployment({ dependents: '21' }), CTX).dependents, 'incomeErrDependents');
  assert.equal(F.validateEmployment(filledEmployment({ dependents: '-1' }), CTX).dependents, 'incomeErrDependents');
  assert.equal(F.validateEmployment(filledEmployment({ payDay: '0' }), CTX).payDay, 'incomeErrDay');
  assert.equal(F.validateEmployment(filledEmployment({ thirteenthSecondMonth: '13' }), CTX).thirteenthSecondMonth, 'incomeErrMonth');
  assert.equal(F.validateEmployment(filledEmployment({ thirteenthFirstMonth: '12', thirteenthFirstDay: '1', thirteenthSecondMonth: '6', thirteenthSecondDay: '30' }), CTX).thirteenthFirstMonth, 'incomeErrThirteenthOrder');
});

check('F-d: the account cannot be a card (not in the money accounts); the recurrence must be free (its own stays selectable)', () => {
  assert.equal(F.validateEmployment(filledEmployment({ accountId: 'acc-card' }), CTX).accountId, 'incomeErrAccountCredit');
  assert.equal(F.validateEmployment(filledEmployment({ recurringTransactionId: 'rec-used' }), CTX).recurringTransactionId, 'incomeErrRecurrenceUsed');
  assert.deepEqual(F.validateEmployment(filledEmployment({ recurringTransactionId: 'rec-used' }), { ...CTX, currentRecurrenceId: 'rec-used' }), {});
});

check('F-e: the employment body: numbers as numbers, empty calendar and links as null, create carries householdId and CLT', () => {
  const create = F.employmentBody(filledEmployment({ uf: '', city: 'Cidade Exemplo', dependents: '2', payDay: '5', thirteenthFirstMonth: '6', thirteenthFirstDay: '30' }), 'create', 'hh-1');
  assert.equal(create.householdId, 'hh-1');
  assert.equal(create.regime, 'CLT');
  assert.equal(create.uf, null);
  assert.equal(create.city, null);
  assert.equal(create.dependents, 2);
  assert.equal(create.accountId, null);
  assert.equal(create.endDate, null);
  const edit = F.employmentBody(filledEmployment({ uf: 'sp', city: 'Cidade Exemplo' }), 'edit');
  assert.equal(edit.uf, 'SP');
  assert.equal(edit.city, 'Cidade Exemplo');
  assert.equal('householdId' in edit, false);
  assert.equal('regime' in edit, false);
});

// ---- Forms: salary, items, values ------------------------------------------------------------------------------------

check('F-f: a salary needs a positive amount within the limit and a valid start date; its body is numeric', () => {
  assert.deepEqual(F.validateSalary({ amount: '3.000,00', startDate: '2026-03-01' }), {});
  assert.equal(F.validateSalary({ amount: '0', startDate: '2026-03-01' }).amount, 'incomeErrAmountPositive');
  assert.equal(F.validateSalary({ amount: '10,001', startDate: '2026-03-01' }).amount, 'incomeErrAmount');
  assert.equal(F.validateSalary({ amount: '100', startDate: '' }).startDate, 'incomeErrDate');
  assert.deepEqual(F.salaryBody({ amount: '3000,5', startDate: '2026-03-01' }), { amount: 3000.5, startDate: '2026-03-01' });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function itemForm(over: Record<string, any> = {}): any {
  return { ...F.emptyItemForm('PER_BUSINESS_DAY'), name: 'Vale', amount: '40', startDate: '2026-01-01', payDay: '25', ...over };
}
const ICTX = { moneyAccountIds: new Set(['acc-main']), freeRecurrenceIds: new Set(['rec-vale']), currentRecurrenceId: null, editing: false };

check('F-g: a per-day benefit is an earning outside the bases, with a pay day and a margin of 0 to 31', () => {
  assert.deepEqual(F.validateItem(itemForm(), ICTX), {});
  assert.equal(F.validateItem(itemForm({ kind: 'DEDUCTION' }), ICTX).kind, 'incomeErrPerDayKind');
  assert.equal(F.validateItem(itemForm({ inInssBase: true }), ICTX).inInssBase, 'incomeErrPerDayBases');
  assert.equal(F.validateItem(itemForm({ payDay: '' }), ICTX).payDay, 'incomeErrPayDayRequired');
  assert.equal(F.validateItem(itemForm({ marginDays: '32' }), ICTX).marginDays, 'incomeErrMargin');
  assert.equal(F.validateItem(itemForm({ amount: '0' }), ICTX).amount, 'incomeErrAmountPositive');
  assert.equal(F.validateItem(itemForm({ referenceMonthOffset: '2' }), ICTX).referenceMonthOffset, 'incomeErrCalcOnlyPerDay');
});

check('F-h: a benefit that is not money cannot feed a recurrence; a card cannot receive it; a recurrence used elsewhere is refused', () => {
  assert.equal(F.validateItem(itemForm({ isAvailableCash: false, recurringTransactionId: 'rec-vale' }), ICTX).recurringTransactionId, 'incomeErrNotCashRecurrence');
  assert.deepEqual(F.validateItem(itemForm({ isAvailableCash: false }), ICTX), {});
  assert.equal(F.validateItem(itemForm({ accountId: 'acc-card' }), ICTX).accountId, 'incomeErrAccountCredit');
  assert.equal(F.validateItem(itemForm({ recurringTransactionId: 'rec-salary' }), ICTX).recurringTransactionId, 'incomeErrRecurrenceUsed');
});

check('F-i: a fixed item needs no pay day; editing does not ask for the first value', () => {
  assert.deepEqual(F.validateItem(itemForm({ calcMode: 'FIXED_MONTHLY', amount: '130', payDay: '' }), ICTX), {});
  assert.equal(F.validateItem(itemForm({ calcMode: 'FIXED_MONTHLY', amount: '', startDate: '' }), ICTX).amount, 'incomeErrAmount');
  assert.deepEqual(F.validateItem(itemForm({ amount: '', startDate: '' }), { ...ICTX, editing: true }), {});
});

check('F-j: the item bodies: create sends the mode and the first value; per-day edit sends only the calc fields, no value', () => {
  const fixed = F.itemBody(itemForm({ calcMode: 'FIXED_MONTHLY', amount: '130', startDate: '2026-01-01', inInssBase: true, payDay: '' }), 'create');
  assert.equal(fixed.calcMode, 'FIXED_MONTHLY');
  assert.deepEqual(fixed.value, { amount: 130, startDate: '2026-01-01' });
  assert.equal('payDay' in fixed, false);
  const perDay = F.itemBody(itemForm({ inInssBase: true }), 'create');
  assert.equal(perDay.calcMode, 'PER_BUSINESS_DAY');
  assert.equal(perDay.inInssBase, false);
  assert.equal(perDay.payDay, 25);
  assert.equal(perDay.referenceMonthOffset, 1);
  assert.deepEqual(perDay.value, { amount: 40, startDate: '2026-01-01' });
  const edit = F.itemBody(itemForm({ marginDays: '2' }), 'edit');
  assert.equal('calcMode' in edit, false);
  assert.equal('value' in edit, false);
  assert.equal(edit.marginDays, 2);
});

check('F-k: a new value: per day must be positive, monthly may be zero; the body is numeric', () => {
  assert.deepEqual(F.validateItemValue({ amount: '0', startDate: '2026-11-01' }, false), {});
  assert.equal(F.validateItemValue({ amount: '0', startDate: '2026-11-01' }, true).amount, 'incomeErrAmountPositive');
  assert.deepEqual(F.itemValueBody({ amount: '45,50', startDate: '2026-11-01' }), { amount: 45.5, startDate: '2026-11-01' });
});

// ---- Forms: vacation, FGTS -----------------------------------------------------------------------------------------

check('F-l: vacation by dates or by the month only; days 1 to 30; sold days 0 to 10; days plus sold at most 30', () => {
  const base = F.emptyVacationForm();
  assert.equal(F.validateVacation({ ...base, startDate: '' }).startDate, 'incomeErrDate');
  assert.deepEqual(F.validateVacation({ ...base, startDate: '2027-07-05' }), {});
  assert.deepEqual(F.validateVacation({ ...base, mode: 'month', month: '2027-07' }), {});
  assert.equal(F.validateVacation({ ...base, mode: 'month', month: '2027-1' }).month, 'incomeErrMonthFormat');
  assert.equal(F.validateVacation({ ...base, startDate: '2027-07-05', days: '31' }).days, 'incomeErrVacationDays');
  assert.equal(F.validateVacation({ ...base, startDate: '2027-07-05', days: '20', sellDays: '11' }).sellDays, 'incomeErrSellDays');
  assert.equal(F.validateVacation({ ...base, startDate: '2027-07-05', days: '25', sellDays: '6' }).sellDays, 'incomeErrVacationTotal');
  assert.deepEqual(F.validateVacation({ ...base, startDate: '2027-07-05', days: '20', sellDays: '10' }), {});
});

check('F-m: the vacation body sends exactly one of the start date or the month', () => {
  const dates = F.vacationBody({ ...F.emptyVacationForm(), startDate: '2027-07-05', days: '30', sellDays: '0' });
  assert.equal(dates.startDate, '2027-07-05');
  assert.equal(dates.month, null);
  const month = F.vacationBody({ ...F.emptyVacationForm(), mode: 'month', month: '2027-07', days: '30', sellDays: '0' });
  assert.equal(month.startDate, null);
  assert.equal(month.month, '2027-07');
  assert.equal(month.days, 30);
});

check('F-n: FGTS balance and withdrawal rules: a date and an amount, a withdrawal above zero, notes up to 200', () => {
  assert.deepEqual(F.validateFgtsBalance({ amount: '5.000,50', asOfDate: '2026-01-01' }), {});
  assert.equal(F.validateFgtsBalance({ amount: 'x', asOfDate: '2026-01-01' }).amount, 'incomeErrAmount');
  assert.equal(F.validateFgtsWithdrawal({ amount: '0', date: '2026-06-04', kind: 'BIRTHDAY', note: '' }).amount, 'incomeErrAmountPositive');
  assert.equal(F.validateFgtsWithdrawal({ amount: '10', date: '2026-06-04', kind: 'BIRTHDAY', note: 'n'.repeat(201) }).note, 'incomeErrNoteLength');
  assert.deepEqual(F.fgtsWithdrawalBody({ amount: '123,45', date: '2026-06-04', kind: 'BIRTHDAY', note: '  ' }), { amount: 123.45, date: '2026-06-04', kind: 'BIRTHDAY', note: null });
});

check('F-o: the FGTS mode: birthday needs a month and takes an optional expected amount; termination takes neither', () => {
  const birthday = { mode: 'BIRTHDAY', birthdayMonth: '5', expectedAmount: '', startDate: '2026-05-01' };
  assert.deepEqual(F.validateFgtsMode(birthday), {});
  assert.equal(F.validateFgtsMode({ ...birthday, birthdayMonth: '' }).birthdayMonth, 'incomeErrBirthdayMonth');
  assert.equal(F.validateFgtsMode({ ...birthday, expectedAmount: '0' }).expectedAmount, 'incomeErrAmountPositive');
  assert.equal(F.validateFgtsMode({ mode: 'TERMINATION', birthdayMonth: '5', expectedAmount: '', startDate: '2026-05-01' }).mode, 'incomeErrTerminationExtras');
  assert.deepEqual(F.fgtsModeBody({ ...birthday, expectedAmount: '' }), { mode: 'BIRTHDAY', birthdayMonth: 5, expectedAmount: null, startDate: '2026-05-01' });
  assert.deepEqual(F.fgtsModeBody({ mode: 'TERMINATION', birthdayMonth: '', expectedAmount: '', startDate: '2026-05-01' }), { mode: 'TERMINATION', startDate: '2026-05-01' });
  assert.equal(F.validateExpectedAmount(''), null);
  assert.equal(F.validateExpectedAmount('1.500,00'), null);
  assert.equal(F.validateExpectedAmount('-3'), 'incomeErrAmount');
});

check('F-p: switching the FGTS mode from birthday to termination clears the hidden birthday fields, so the form passes', () => {
  const birthday = { mode: 'BIRTHDAY', birthdayMonth: '5', expectedAmount: '1.500,00', startDate: '2026-05-01' };
  const switched = F.fgtsModeAfterSwitch(birthday, 'TERMINATION');
  assert.equal(switched.mode, 'TERMINATION');
  assert.equal(switched.birthdayMonth, '');
  assert.equal(switched.expectedAmount, '');
  assert.equal(switched.startDate, '2026-05-01');
  assert.deepEqual(F.validateFgtsMode(switched), {});
  assert.deepEqual(F.fgtsModeBody(switched), { mode: 'TERMINATION', startDate: '2026-05-01' });
  assert.deepEqual(F.fgtsModeAfterSwitch(birthday, 'BIRTHDAY'), birthday, 'switching back to birthday keeps what was typed');
});

// ---- Texts ---------------------------------------------------------------------------------------------------------

check('T-a: the text helper fills placeholders and falls back to Portuguese; no key shows its name', () => {
  assert.equal(TX.incomeText({}, 'incomeEventBenefit', { name: 'Vale', days: 20 }), 'Vale, 20 dias');
  assert.equal(TX.incomeText({ incomeEventBenefit: '{name}: {days} days' }, 'incomeEventBenefit', { name: 'Meal', days: 20 }), 'Meal: 20 days');
  assert.equal(TX.incomeText(null, 'incomeTitle'), 'Renda');
  assert.equal(TX.incomeText({}, 'incomeOpenDetail', { other: 'x' }), 'Ver detalhes de {employer}');
});

check('T-b: every Portuguese key of the area (and the two new cash flow sources) exists in pt-BR.json and en-US.json', () => {
  const pt = JSON.parse(readFileSync(frontSrc('i18n/pt-BR.json'), 'utf8'));
  const en = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'));
  const keys = [...Object.keys(TX.INCOME_TEXTS_PT), 'cashFlowSourcePayroll', 'cashFlowSourceOther'];
  for (const key of keys) {
    assert.equal(typeof pt[key], 'string', `pt-BR.json lacks ${key}`);
    assert.equal(typeof en[key], 'string', `en-US.json lacks ${key}`);
  }
  assert.equal(pt.cashFlowSourcePayroll, CFT.CASH_FLOW_TEXTS_PT.cashFlowSourcePayroll);
});

// ---- Payroll in the cash flow and the bills checklist ------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function cfEvent(over: Record<string, any> = {}): any {
  return { date: TODAY, description: 'Item', amount: 100, source: 'payroll', certainty: 'estimated', overdue: false, originalDate: null, sourceId: 'emp-1', accountId: 'acc-main', invoiceMonth: null, ...over };
}

check('C-a: the payroll source is labelled "Renda"; a source this build does not know is "Outra origem", never "Pendente"', () => {
  assert.equal(C.sourceTextKey('payroll'), 'cashFlowSourcePayroll');
  assert.equal(C.sourceTextKey('pending'), 'cashFlowSourcePending');
  assert.equal(C.sourceTextKey('future_source'), 'cashFlowSourceOther');
});

check('C-b: the events of one day sort with payroll after recurrences and before invoices; an unknown source sorts last, no NaN', () => {
  const sorted = [
    cfEvent({ source: 'invoice', sourceId: 'c1', amount: -5, certainty: 'confirmed' }),
    cfEvent({ source: 'future_source', sourceId: 'f1', amount: -1 }),
    cfEvent({ source: 'payroll', sourceId: 'p1', amount: 10 }),
    cfEvent({ source: 'recurrence', sourceId: 'r1', amount: -2, certainty: 'confirmed' }),
  ].sort(C.compareEvents);
  assert.deepEqual(sorted.map((e: { sourceId: string }) => e.sourceId), ['r1', 'p1', 'c1', 'f1']);
  assert.ok(Number.isFinite(C.compareEvents(cfEvent(), cfEvent({ source: 'future_source' }))));
});

check('C-c: a payroll entry never becomes a bill, even with a negative amount; a real bill still does', () => {
  const bills = BILLS.buildBills([cfEvent({ amount: 100 }), cfEvent({ amount: -30, sourceId: 'p-neg' }), cfEvent({ source: 'pending', amount: -12, sourceId: 'bill' })], TODAY);
  assert.deepEqual(bills.map((b: { sourceId: string }) => b.sourceId), ['bill']);
});

// ---- Benefit shown in the detail, and month names (session 2) ----------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const MO: any = await load('INCOME_MONTH_MODULE', 'utils/incomeMonth.ts');

check('B-r1: the benefit shown is the one paid this month; with none this month, the next payment; past ones alone give null', () => {
  const events = [
    benefit({ itemId: 'i1', referenceMonth: '2026-11', paymentDate: '2026-10-25', amount: 800 }),
    benefit({ itemId: 'i1', referenceMonth: '2026-12', paymentDate: '2026-11-25', amount: 900 }),
    benefit({ itemId: 'i2', referenceMonth: '2026-12', paymentDate: '2026-11-25', amount: 5 }),
  ];
  assert.equal(I.benefitToShow(events, 'i1', TODAY).amount, 900);
  assert.equal(I.benefitToShow(events, 'i2', TODAY).amount, 5);
  const noneNow = [events[0], benefit({ itemId: 'i1', referenceMonth: '2027-01', paymentDate: '2026-12-25', amount: 700 })];
  assert.equal(I.benefitToShow(noneNow, 'i1', TODAY).paymentDate, '2026-12-25');
  assert.equal(I.benefitToShow([events[0]], 'i1', TODAY), null);
  assert.equal(I.benefitToShow([], 'i1', TODAY), null);
});

check('B-r2: the neighbour of a payment is the same item payment before or after it; none at the ends', () => {
  const events = [
    benefit({ itemId: 'i1', referenceMonth: '2026-11', paymentDate: '2026-10-25' }),
    benefit({ itemId: 'i1', referenceMonth: '2026-12', paymentDate: '2026-11-25' }),
    benefit({ itemId: 'i2', referenceMonth: '2026-12', paymentDate: '2026-11-26' }),
    benefit({ itemId: 'i1', referenceMonth: '2027-01', paymentDate: '2026-12-25' }),
  ];
  assert.equal(I.neighbourBenefit(events, 'i1', '2026-11-25', -1).paymentDate, '2026-10-25');
  assert.equal(I.neighbourBenefit(events, 'i1', '2026-11-25', 1).paymentDate, '2026-12-25');
  assert.equal(I.neighbourBenefit(events, 'i1', '2026-10-25', -1), null);
  assert.equal(I.neighbourBenefit(events, 'i1', '2026-12-25', 1), null);
  assert.equal(I.neighbourBenefit(events, 'i1', '2026-11-26', 1), null);
});

check('B-r3: month names in the project pattern: pt-BR "novembro de 2026", en-US "November 2026"; garbage gives empty', () => {
  assert.equal(MO.monthNameOf('2026-11', 'pt-BR'), 'novembro de 2026');
  assert.equal(MO.monthNameOf('2026-12', 'pt-BR'), 'dezembro de 2026');
  assert.equal(MO.monthNameOf('2027-01', 'pt-BR'), 'janeiro de 2027');
  assert.equal(MO.monthNameOf('2026-11', 'en-US'), 'November 2026');
  assert.equal(MO.monthNameOf('2026-11', 'xx-XX'), 'novembro de 2026', 'an unknown locale falls back to pt-BR');
  assert.equal(MO.monthNameOf('2026-13', 'pt-BR'), '');
  assert.equal(MO.monthNameOf('2026-1', 'pt-BR'), '');
});

check('B-r4: a birthday month number is the month name alone; out of range gives empty; the first letter can be capitalised', () => {
  assert.equal(MO.monthOnlyOf(5, 'pt-BR'), 'maio');
  assert.equal(MO.monthOnlyOf(5, 'en-US'), 'May');
  assert.equal(MO.monthOnlyOf(0, 'pt-BR'), '');
  assert.equal(MO.monthOnlyOf(13, 'pt-BR'), '');
  assert.equal(MO.monthOnlyOf(null, 'pt-BR'), '');
  assert.equal(MO.capitalize(MO.monthNameOf('2027-01', 'pt-BR')), 'Janeiro de 2027');
  assert.equal(MO.capitalize(''), '');
});

summary();
