import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIRM_CTX, M, check, frontSrc, defaultSelection, mkEntry, mkPreview, mkRow, show } from './harness.mts';

// Set MAXFIN_WORKBOOK_MODULE to a mutated copy (next to a copy of maxfinPayload.ts and ../lib/enums.ts) for bite-checks.
export const wbPath =
  process.env.MAXFIN_WORKBOOK_MODULE || frontSrc('utils/maxfinWorkbook.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W: any = await import(pathToFileURL(wbPath).href);
console.log(`\n(workbook module: ${wbPath})`);

const MB = 1024 * 1024;
const CLOSED = { closedMonth: true, payInvoice: true, generateFutureInstallments: false };
const OPEN_FUT = { closedMonth: false, payInvoice: false, generateFutureInstallments: true };
const OPEN_NO_FUT = { closedMonth: false, payInvoice: false, generateFutureInstallments: false };
const k = (r: unknown): string => M.rowKey(r);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** A month preview of the workbook response (same shape as the .csv preview). */
function mkMonth(key: string, rows: Any[], o: Record<string, Any> = {}): Any {
  const [year, month] = key.split('-').map(Number);
  return mkPreview(rows, { month: { year, month }, monthKey: key, monthSource: 'sheet', ...o });
}
const credit = (o: Record<string, Any> = {}) => mkRow({ section: 'credit', accountId: 'acc-card', categoryKey: 'Lazer', ...o });
const bills = (o: Record<string, Any> = {}) => mkRow({ section: 'bills', accountId: 'acc-main', categoryKey: 'Moradia', ...o });
const income = (o: Record<string, Any> = {}) =>
  mkRow({ section: 'income', accountId: 'acc-main', type: 'INCOME', categoryKey: 'Salário', ...o });

console.log('\n[W1] file kind and upload validation');

check('maxfinFileKind: .csv and .xlsx by extension, case-insensitive; anything else is null', () => {
  const cases: Array<[string, string | null]> = [
    ['out.csv', 'csv'], ['OUT.CSV', 'csv'], ['FINANCAS_2026.xlsx - OUT.csv', 'csv'], ['pasta.xlsx', 'xlsx'], ['PASTA.XLSX', 'xlsx'],
    ['pasta.xls', null], ['pasta.ods', null], ['pasta.xlsx.txt', null], ['csv', null], ['xlsx', null], ['', null],
  ];
  show('kinds', cases.map(([name]) => [name, M.maxfinFileKind(name)]));
  for (const [name, kind] of cases) assert.equal(M.maxfinFileKind(name), kind, name);
});

check('validateMaxFinFile: .xlsx accepted up to 5 MB; over it the message has the size, the limit and a workbook hint', () => {
  assert.equal(M.validateMaxFinFile({ name: 'pasta.xlsx', size: 5 * MB }), null);
  assert.equal(M.validateMaxFinFile({ name: 'PASTA.XLSX', size: 10 }), null);
  const over = M.validateMaxFinFile({ name: 'pasta.xlsx', size: 5 * MB + 1 });
  const csvOver = M.validateMaxFinFile({ name: 'out.csv', size: 5 * MB + 1 });
  show('messages', [over, csvOver]);
  assert.ok(over.includes('5,1 MB') && over.includes('O limite é 5 MB'), over);
  assert.ok(over.includes('remova as abas que não são meses'), over);
  assert.ok(csvOver.includes('exporte só a aba do mês'), csvOver);
});

check('validateMaxFinFile: other formats are refused naming both accepted ones', () => {
  for (const name of ['pasta.xls', 'pasta.ods', 'notas.txt', 'sem-extensao']) {
    const msg = M.validateMaxFinFile({ name, size: 10 });
    assert.ok(msg && msg.includes('.csv') && msg.includes('.xlsx'), `${name}: ${msg}`);
  }
});

console.log('\n[W2] month keys and labels');

check('monthKeyLabel: lowercase pt-BR month and year ("março/2026"); anything else comes back as is', () => {
  const labels = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12']
    .map((key) => W.monthKeyLabel(key));
  show('labels', labels);
  assert.deepEqual(labels, [
    'janeiro/2026', 'fevereiro/2026', 'março/2026', 'abril/2026', 'maio/2026', 'junho/2026', 'julho/2026', 'agosto/2026', 'setembro/2026',
    'outubro/2026', 'novembro/2026', 'dezembro/2026',
  ]);
  for (const bad of ['2026-13', '2026-00', '2026-3', 'abc', '', '1999-12']) assert.equal(W.monthKeyLabel(bad), bad);
});

check('isMonthKey / previewMonthKey / workbookMonthId', () => {
  assert.equal(W.isMonthKey('2026-10'), true);
  for (const bad of ['2026-1', '2026-13', null, undefined, 202610, '']) assert.equal(W.isMonthKey(bad), false, String(bad));
  assert.equal(W.previewMonthKey({ month: { year: 2026, month: 3 }, monthKey: '2026-03' }), '2026-03');
  // `month` is what confirm sends: it wins over a disagreeing monthKey
  assert.equal(W.previewMonthKey({ month: { year: 2026, month: 4 }, monthKey: '2026-03' }), '2026-04');
  assert.equal(W.previewMonthKey({ month: null, monthKey: '2026-05' }), '2026-05');
  assert.equal(W.previewMonthKey({ month: null, monthKey: null }), null);
  assert.equal(W.workbookMonthId({ month: null, monthKey: null }, 1), '#2');
  assert.equal(W.workbookMonthId({ month: { year: 2026, month: 1 }, monthKey: null }, 0), '2026-01');
});

console.log('\n[W3] options sent to the workbook preview');

const OPTS = { months: ['2026-09', '2026-08'], closedThrough: '2026-09', payInvoice: true, generateFutureInstallments: true };

check('nextWorkbookOptions: every contract field explicit, months sorted without repeats, extra fields dropped', () => {
  const echo = { ...OPTS, months: ['2026-10', '2026-08', '2026-10'], extra: 'x' };
  const next = W.nextWorkbookOptions(echo);
  show('next', next);
  assert.deepEqual(next, { months: ['2026-08', '2026-10'], closedThrough: '2026-09', payInvoice: true, generateFutureInstallments: true });
  assert.deepEqual(Object.keys(next).sort(), ['closedThrough', 'generateFutureInstallments', 'months', 'payInvoice']);
});

check('nextWorkbookOptions: a patch changes only its field; closedThrough null ("nenhum") is kept as null', () => {
  assert.deepEqual(W.nextWorkbookOptions(OPTS, { closedThrough: null }), { ...OPTS, months: ['2026-08', '2026-09'], closedThrough: null });
  assert.deepEqual(W.nextWorkbookOptions(OPTS, { payInvoice: false }).payInvoice, false);
  assert.deepEqual(W.nextWorkbookOptions(OPTS, { generateFutureInstallments: false }).generateFutureInstallments, false);
  assert.deepEqual(W.nextWorkbookOptions(OPTS, { months: ['2026-11'] }).months, ['2026-11']);
  assert.equal(W.nextWorkbookOptions({ ...OPTS, closedThrough: undefined }).closedThrough, null);
});

check('toggleWorkbookMonth: adds in order, removes, and refuses to leave no month', () => {
  assert.deepEqual(W.toggleWorkbookMonth(['2026-08', '2026-10'], '2026-09', true), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(W.toggleWorkbookMonth(['2026-08', '2026-10'], '2026-08', true), ['2026-08', '2026-10']);
  assert.deepEqual(W.toggleWorkbookMonth(['2026-08', '2026-10'], '2026-08', false), ['2026-10']);
  assert.equal(W.toggleWorkbookMonth(['2026-10'], '2026-10', false), null);
  assert.deepEqual(W.toggleWorkbookMonth([], '2026-01', true), ['2026-01']);
});

const SHEETS = [
  { name: 'JAN', monthKey: '2026-01', status: 'selected', reason: null, rowCount: 60, hidden: true },
  { name: 'Resumo', monthKey: null, status: 'skipped', reason: 'sem cabeçalho "Descrição"', rowCount: 0, hidden: false },
  { name: 'NOV', monthKey: '2026-11', status: 'available', reason: null, rowCount: 40, hidden: false },
  { name: 'JAN (2)', monthKey: '2026-01', status: 'skipped', reason: 'mês repetido', rowCount: 0, hidden: false },
  { name: 'FEV', monthKey: '2026-02', status: 'brand-new', reason: null, rowCount: 5, hidden: false },
  { name: 'MAR', monthKey: '2026-3', status: 'available', reason: null, rowCount: 5, hidden: false },
  { name: 'OUT', monthKey: '2026-10', status: 'selected', reason: null, rowCount: 97, hidden: false },
];

check('isSelectableSheet: selected/available with a valid key only (skipped, unknown status, bad key are not)', () => {
  const flags = SHEETS.map((s) => [s.name, W.isSelectableSheet(s)]);
  show('selectable', flags);
  assert.deepEqual(flags.filter(([, ok]) => ok).map(([name]) => name), ['JAN', 'NOV', 'OUT']);
});

check('closedThroughChoices: workbook months sorted, plus the applied value even when no sheet has it', () => {
  assert.deepEqual(W.closedThroughChoices(SHEETS, '2026-09'), ['2026-01', '2026-09', '2026-10', '2026-11']);
  assert.deepEqual(W.closedThroughChoices(SHEETS, '2026-10'), ['2026-01', '2026-10', '2026-11']);
  assert.deepEqual(W.closedThroughChoices(SHEETS, null), ['2026-01', '2026-10', '2026-11']);
});

console.log('\n[W4] row selection per month');

const a1 = credit({ description: 'A1' });
const a2 = credit({ description: 'A2', status: 'changed' });
const b1 = credit({ description: 'B1' });
const c1 = credit({ description: 'C1' });
const ago = mkMonth('2026-08', [a1, a2]);
const set = mkMonth('2026-09', [b1]);
const out = mkMonth('2026-10', [c1]);

check('a fresh workbook gets the default selection of every month (new ticked, changed not)', () => {
  const sel = W.reconcileWorkbookSelection({}, {}, [ago, set]);
  show('selection', sel);
  assert.deepEqual(sel, { '2026-08': { [k(a1)]: true, [k(a2)]: false }, '2026-09': { [k(b1)]: true } });
});

check('a re-preview keeps the choices of the months that remain and resets a row whose status changed', () => {
  const rows0 = W.rowsByMonth({}, [ago, set]);
  const userSel = { '2026-08': { [k(a1)]: false, [k(a2)]: true }, '2026-09': { [k(b1)]: false } };
  // SET's row is now a duplicate (stored meanwhile); AGO unchanged; OUT joins.
  const set2 = mkMonth('2026-09', [{ ...b1, status: 'duplicate' }]);
  const sel = W.reconcileWorkbookSelection(rows0, userSel, [ago, set2, out]);
  show('selection', sel);
  assert.deepEqual(sel['2026-08'], { [k(a1)]: false, [k(a2)]: true });
  assert.deepEqual(sel['2026-09'], { [k(b1)]: false });
  assert.deepEqual(sel['2026-10'], { [k(c1)]: true });
});

check('a month unticked and ticked again gets its choices back (rows remembered by rowsByMonth)', () => {
  let rows = W.rowsByMonth({}, [ago, set]);
  let sel = { '2026-08': { [k(a1)]: false, [k(a2)]: false }, '2026-09': { [k(b1)]: true } };
  sel = W.reconcileWorkbookSelection(rows, sel, [set]); // AGO unticked
  rows = W.rowsByMonth(rows, [set]);
  assert.deepEqual(sel['2026-08'], { [k(a1)]: false, [k(a2)]: false }, 'kept while out of the response');
  sel = W.reconcileWorkbookSelection(rows, sel, [ago, set]); // AGO ticked again
  assert.deepEqual(sel['2026-08'], { [k(a1)]: false, [k(a2)]: false });
  assert.deepEqual(Object.keys(rows).sort(), ['2026-08', '2026-09']);
});

check('pickDetailMonth: keeps the month on screen while it exists, else the first one, else null', () => {
  assert.equal(W.pickDetailMonth('2026-09', ['2026-08', '2026-09']), '2026-09');
  assert.equal(W.pickDetailMonth('2026-07', ['2026-08', '2026-09']), '2026-08');
  assert.equal(W.pickDetailMonth(null, ['2026-08']), '2026-08');
  assert.equal(W.pickDetailMonth('2026-08', []), null);
});

console.log('\n[W5] confirm plan: one monthly confirm per month, oldest first');

// JUL: all duplicates (nothing to send). AGO, SET closed (invoice), OUT open (future installments).
const jul = mkMonth('2026-07', [credit({ description: 'J dup', status: 'duplicate' })], { options: CLOSED });
const agoRows = [
  credit({ description: 'Cinema', amount: 100.1 }), credit({ description: 'Bala', amount: 0.1, categoryKey: 'lazer' }),
  bills({ description: 'Aluguel', amount: 1200 }), income({ description: 'Salario', amount: 5000.2 }),
  credit({ description: 'Netflix', amount: 55, status: 'duplicate' }),
];
const setRows = [
  credit({ description: 'Chiclete', amount: 0.2 }), credit({ description: 'TV 4/10', amount: 300, status: 'replaces-future' }),
  bills({ description: 'Luz', amount: 80, status: 'changed' }),
];
const outRows = [credit({ description: 'Livro', amount: 49.9 }), income({ description: 'Freela', amount: 10 })];
const lazerMap = [mkEntry('Lazer'), mkEntry('Moradia', { sections: ['bills'] }), mkEntry('Salário', { type: 'INCOME', sections: ['income'] })];
const wJul = jul;
const wAgo = mkMonth('2026-08', agoRows, { options: CLOSED, categoryMap: lazerMap });
const wSet = mkMonth('2026-09', setRows, { options: CLOSED, categoryMap: [mkEntry('lazer'), mkEntry('Moradia', { sections: ['bills'] })] });
const wOut = mkMonth('2026-10', outRows, { options: OPEN_FUT, categoryMap: lazerMap });
// The response is deliberately out of order: the plan must still go oldest first.
const workbook = { months: [wOut, wAgo, wJul, wSet] };
const selectionOf = (months: Any[]) => W.reconcileWorkbookSelection({}, {}, months);
const SEL = selectionOf(workbook.months);
const LAZER = M.categoryChoiceKey('EXPENSE', 'Lazer');
const CHOICES = { [LAZER]: { kind: 'system', categoryName: 'ENTERTAINMENT' } };
const plan = W.buildWorkbookPlan(workbook, SEL, CHOICES, CONFIRM_CTX);

check('steps go oldest first and skip the month with nothing to send', () => {
  show('months', plan.months.map((m: Any) => m.label));
  show('steps', plan.steps.map((s: Any) => s.label));
  assert.deepEqual(plan.months.map((m: Any) => m.monthKey), ['2026-07', '2026-08', '2026-09', '2026-10']);
  assert.deepEqual(plan.steps.map((s: Any) => s.monthKey), ['2026-08', '2026-09', '2026-10']);
  assert.deepEqual(plan.steps.map((s: Any) => s.label), ['agosto/2026', 'setembro/2026', 'outubro/2026']);
  assert.deepEqual(plan.totals.emptyMonths, ['julho/2026']);
  assert.deepEqual(plan.unsendable, []);
});

check('each request is exactly what the .csv flow would send for that month (buildConfirmPayload)', () => {
  for (const [step, month] of [[plan.steps[0], wAgo], [plan.steps[1], wSet], [plan.steps[2], wOut]]) {
    const single = M.buildConfirmPayload(month, defaultSelection(month.rows), CHOICES, CONFIRM_CTX);
    assert.deepEqual(step.payload, single.payload, step.label);
    assert.deepEqual(step.totals, single.totals, step.label);
  }
});

check('each month keeps its own options (closed months pay the invoice, only the open last month generates futures)', () => {
  const opts = plan.steps.map((s: Any) => [s.label, s.payload.options]);
  show('options', opts);
  assert.deepEqual(plan.steps.map((s: Any) => s.payload.options), [CLOSED, CLOSED, OPEN_FUT]);
  assert.deepEqual(plan.steps.map((s: Any) => s.payload.month), [{ year: 2026, month: 8 }, { year: 2026, month: 9 }, { year: 2026, month: 10 }]);
});

check('the shared category choice reaches every month, whatever the spelling of the key in that month', () => {
  const targets = plan.steps.map((s: Any) => s.payload.categoryMap.find((e: Any) => M.normalizeLabel(e.key) === 'lazer')?.target);
  show('Lazer target per month', targets);
  for (const target of targets) assert.deepEqual(target, { kind: 'system', categoryName: 'ENTERTAINMENT' });
  // without a choice every month falls back to its own suggestion (default here)
  const plain = W.buildWorkbookPlan(workbook, SEL, {}, CONFIRM_CTX);
  assert.deepEqual(plain.steps[1].payload.categoryMap.find((e: Any) => e.key === 'lazer').target, { kind: 'default' });
});

check('the row selection of each month is its own: unticking a row of SET changes only the SET request', () => {
  const tv = setRows[1];
  const sel = { ...SEL, '2026-09': { ...SEL['2026-09'], [k(tv)]: false } };
  const p = W.buildWorkbookPlan(workbook, sel, CHOICES, CONFIRM_CTX);
  assert.deepEqual(p.steps[0].payload, plan.steps[0].payload);
  assert.deepEqual(p.steps[2].payload, plan.steps[2].payload);
  assert.deepEqual(p.steps[1].payload.rows.map((r: Any) => r.description), ['Chiclete']);
  assert.equal(p.totals.replacements, 0);
});

check('totals: rows, receitas and despesas from integer cents across months (0.1 + 0.2 stays exact)', () => {
  const t = plan.totals;
  show('totals', t);
  assert.equal(t.months, 3);
  assert.equal(t.rows, 8);
  assert.equal(t.incomeCount, 2);
  assert.equal(t.incomeCents, 501020);
  assert.equal(t.incomeTotal, 5010.2);
  assert.equal(t.expenseCount, 6);
  assert.equal(t.expenseCents, 165030);
  assert.equal(t.expenseTotal, 1650.3);
  assert.notEqual(100.1 + 0.1 + 1200 + 0.2 + 300 + 49.9, 1650.3, 'the float sum would drift');
  assert.equal(t.replacements, 1); // TV 4/10 (replaces-future); Luz (changed) is not ticked by default
});

check('totals: every row is added in integer cents (small amounts summed as floats would drift)', () => {
  const months = [
    mkMonth('2026-08', [income({ amount: 0.29 }), bills({ amount: 0.57 })]),
    mkMonth('2026-09', [income({ amount: 0.57 }), bills({ amount: 8.28 })]),
  ];
  assert.notEqual(0.29 * 100 + 0.57 * 100, 86, 'the float sum would drift');
  const t = W.buildWorkbookPlan({ months }, selectionOf(months), {}, CONFIRM_CTX).totals;
  show('small totals', { incomeCents: t.incomeCents, expenseCents: t.expenseCents, incomeTotal: t.incomeTotal, expenseTotal: t.expenseTotal });
  assert.equal(t.incomeCents, 86);
  assert.equal(t.expenseCents, 885);
  assert.equal(t.incomeTotal, 0.86);
  assert.equal(t.expenseTotal, 8.85);
});

check('totals: invoices recorded = closed months with credit rows, summed in cents (open month never)', () => {
  const t = plan.totals;
  show('invoices', { count: t.invoiceCount, cents: t.invoiceCents, total: t.invoiceTotal });
  assert.equal(t.invoiceCount, 2);
  assert.equal(t.invoiceCents, 10020 + 30020);
  assert.equal(t.invoiceTotal, 400.4);
  assert.deepEqual(plan.steps.map((s: Any) => s.totals.invoice.willPay), [true, true, false]);
  const noInvoice = { months: [mkMonth('2026-08', agoRows, { options: { ...CLOSED, payInvoice: false } })] };
  assert.equal(W.buildWorkbookPlan(noInvoice, selectionOf(noInvoice.months), {}, CONFIRM_CTX).totals.invoiceCount, 0);
  const paid = { months: [mkMonth('2026-08', agoRows, { invoice: { ...mkPreview([]).invoice, alreadyPaid: true } })] };
  assert.equal(W.buildWorkbookPlan(paid, selectionOf(paid.months), {}, CONFIRM_CTX).totals.invoiceCount, 0);
});

check('a month the server could not date, or a repeated month, cannot be sent', () => {
  const undated = mkMonth('2026-08', [credit()], { month: null, monthKey: null });
  const p1 = W.buildWorkbookPlan({ months: [wAgo, undated] }, selectionOf([wAgo, undated]), {}, CONFIRM_CTX);
  show('unsendable', p1.unsendable);
  assert.equal(p1.unsendable.length, 1);
  assert.deepEqual(p1.steps.map((s: Any) => s.monthKey), ['2026-08']);
  const again = mkMonth('2026-08', [credit({ description: 'outra' })]);
  const p2 = W.buildWorkbookPlan({ months: [wAgo, again] }, selectionOf([wAgo, again]), {}, CONFIRM_CTX);
  assert.deepEqual(p2.unsendable, ['agosto/2026']);
  assert.equal(W.workbookConfirmBlocker(p2, false).code, 'no-month');
});

console.log('\n[W6] blocker of the workbook confirm');

check('needs-refresh comes first, even for an empty or missing plan', () => {
  assert.equal(W.workbookConfirmBlocker(plan, true).code, 'needs-refresh');
  assert.ok(W.workbookConfirmBlocker(plan, true).message.includes('Atualize a pré-visualização'));
  assert.equal(W.workbookConfirmBlocker(null, true).code, 'needs-refresh');
  assert.equal(W.workbookConfirmBlocker(W.buildWorkbookPlan({ months: [] }, {}, {}, CONFIRM_CTX), true).code, 'needs-refresh');
  assert.equal(W.workbookConfirmBlocker(plan, false), null);
});

check('no month, nothing selected, unsendable month: each blocks with its own reason', () => {
  const empty = W.workbookConfirmBlocker(W.buildWorkbookPlan({ months: [] }, {}, {}, CONFIRM_CTX), false);
  assert.deepEqual(empty, { code: 'none-selected', message: 'Marque ao menos um mês.' });
  assert.equal(W.workbookConfirmBlocker(null, false).code, 'none-selected');
  const nothing = W.workbookConfirmBlocker(W.buildWorkbookPlan(workbook, {}, {}, CONFIRM_CTX), false);
  assert.deepEqual(nothing, { code: 'none-selected', message: 'Selecione ao menos uma transação.' });
  const undated = mkMonth('2026-08', [credit()], { month: null, monthKey: null });
  const bad = W.workbookConfirmBlocker(W.buildWorkbookPlan({ months: [undated] }, selectionOf([undated]), {}, CONFIRM_CTX), false);
  show('unsendable blocker', bad);
  assert.equal(bad.code, 'no-month');
});

check('the 500-row limit is per month: 500 + 300 go, 501 in one month blocks naming the month', () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => bills({ description: `Linha ${i}`, amount: 1 }));
  const ok = { months: [mkMonth('2026-08', many(500)), mkMonth('2026-09', many(300))] };
  assert.equal(W.workbookConfirmBlocker(W.buildWorkbookPlan(ok, selectionOf(ok.months), {}, CONFIRM_CTX), false), null);
  const over = { months: [mkMonth('2026-08', many(10)), mkMonth('2026-09', many(501))] };
  const blocker = W.workbookConfirmBlocker(W.buildWorkbookPlan(over, selectionOf(over.months), {}, CONFIRM_CTX), false);
  show('501 rows', blocker);
  assert.equal(blocker.code, 'too-many');
  assert.ok(blocker.message.includes('no máximo 500 linhas por mês') && blocker.message.includes('setembro/2026 tem 501 selecionadas'));
});

console.log('\n[W7] summary of a run');

const res = (o: Record<string, Any> = {}) => ({
  imported: 2, skipped: 0, replaced: 0, consumedFutureInstallments: 0, futureInstallments: 0, createdCategories: [], invoicePayment: null,
  ids: [], warnings: [], ...o,
});
const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
const steps = plan.steps;

check('workbookProgressLabel: "Importando março/2026 (3 de 10)…"', () => {
  assert.equal(W.workbookProgressLabel('março/2026', 2, 10), 'Importando março/2026 (3 de 10)…');
  assert.equal(W.workbookProgressLabel('agosto/2026', 0, 1), 'Importando agosto/2026 (1 de 1)…');
});

check('every month went through: one line per month, warnings prefixed with the month, totals in cents', () => {
  const results = [
    res({ imported: 4, invoicePayment: { transactionId: 't1', amount: 100.2, date: '2026-08-10' }, warnings: ['Soma do cartão difere do total'] }),
    res({ imported: 2, replaced: 1, invoicePayment: { transactionId: 't2', amount: 300.2, date: '2026-09-10' } }),
    res({ imported: 2, futureInstallments: 6 }),
  ];
  const s = W.summarizeWorkbookRun(steps, results, null, fmt);
  show('lines', s.months.map((m: Any) => m.line));
  show('warnings', s.warnings);
  assert.deepEqual(s.imported, ['agosto/2026', 'setembro/2026', 'outubro/2026']);
  assert.equal(s.failed, null);
  assert.deepEqual(s.notSent, []);
  assert.deepEqual(s.months.map((m: Any) => m.status), ['imported', 'imported', 'imported']);
  assert.ok(s.months[0].line.startsWith('agosto/2026: 4 transações importadas'));
  assert.ok(s.months[0].line.includes('fatura de R$ 100.20 registrada'));
  assert.ok(s.months[1].line.includes('1 substituída'));
  assert.ok(s.months[2].line.includes('6 parcelas futuras'));
  assert.deepEqual(s.warnings, ['agosto/2026: Soma do cartão difere do total']);
  assert.deepEqual(s.totals, { imported: 8, replaced: 1, assumedRecurring: 0, skipped: 0, invoices: 2, invoiceCents: 40040 });
  assert.equal(s.needsReview, true); // the AGO warning
  assert.equal(W.workbookRunToast(s), '3 meses importados: 8 transações importadas, 1 substituída, 2 faturas registradas. 1 aviso.');
});

check('nothing to read (no warnings, skipped or consumed installments) -> no review step', () => {
  const s = W.summarizeWorkbookRun(steps, [res(), res(), res()], null, fmt);
  assert.equal(s.needsReview, false);
  assert.equal(W.summarizeWorkbookRun(steps, [res(), res({ skipped: 1 }), res()], null, fmt).needsReview, true);
  assert.equal(W.summarizeWorkbookRun(steps, [res(), res(), res({ consumedFutureInstallments: 2 })], null, fmt).needsReview, true);
  assert.equal(W.workbookRunToast(W.summarizeWorkbookRun(steps.slice(0, 1), [res({ imported: 1 })], null, fmt)),
    '1 mês importado: 1 transação importada.');
});

check('failure on the second month: first imported, second failed (maybe partial), third not sent', () => {
  const s = W.summarizeWorkbookRun(steps, [res({ warnings: ['w'] })], { reason: 'Falha de rede' }, fmt);
  show('summary', { imported: s.imported, failed: s.failed, notSent: s.notSent });
  assert.deepEqual(s.imported, ['agosto/2026']);
  assert.deepEqual(s.failed, { label: 'setembro/2026', reason: 'Falha de rede', invoicePromised: true });
  assert.deepEqual(s.notSent, ['outubro/2026']);
  assert.deepEqual(s.months.map((m: Any) => m.status), ['imported', 'failed', 'not-sent']);
  assert.deepEqual(s.warnings, ['agosto/2026: w']);
  const msg = W.workbookStopMessage(s);
  show('message', msg);
  assert.ok(msg.startsWith('Falha ao importar setembro/2026: Falha de rede. Meses importados: agosto/2026.'), msg);
  assert.ok(msg.includes('A importação de setembro/2026 pode ter sido parcial.'), msg);
  assert.ok(msg.includes('Não enviados: outubro/2026.'), msg);
  assert.ok(msg.includes('Atualize a pré-visualização: as linhas já importadas aparecem como duplicadas.'), msg);
  assert.ok(msg.includes('confira a fatura de setembro/2026'), 'SET was going to record its invoice');
});

check('failure on the first month / on the open last month: wording without imports, no invoice sentence', () => {
  const first = W.workbookStopMessage(W.summarizeWorkbookRun(steps, [], { reason: 'Erro do servidor.' }, fmt));
  assert.ok(first.startsWith('Falha ao importar agosto/2026: Erro do servidor. Nenhum mês foi importado.'), first);
  assert.ok(first.includes('Não enviados: setembro/2026, outubro/2026.'), first);
  const last = W.workbookStopMessage(W.summarizeWorkbookRun(steps, [res(), res()], { reason: '' }, fmt));
  show('last', last);
  assert.ok(last.startsWith('Falha ao importar outubro/2026: Não foi possível confirmar a importação.'), last);
  assert.ok(last.includes('Meses importados: agosto/2026, setembro/2026.'), last);
  assert.ok(!last.includes('Não enviados'), last);
  assert.ok(!last.includes('confira a fatura'), 'the open month records no invoice');
});

check('interrupted (the dialog went away): imported months and the ones never sent, no failed month', () => {
  const s = W.summarizeWorkbookRun(steps, [res()], null, fmt);
  assert.equal(s.failed, null);
  assert.deepEqual(s.notSent, ['setembro/2026', 'outubro/2026']);
  const msg = W.workbookStopMessage(s);
  show('message', msg);
  assert.equal(msg, 'Importação interrompida. Meses importados: agosto/2026. Não enviados: setembro/2026, outubro/2026.');
});

check('open months without future installments keep their options (sanity of the fixture helpers)', () => {
  const p = W.buildWorkbookPlan({ months: [mkMonth('2026-10', outRows, { options: OPEN_NO_FUT })] }, selectionOf([mkMonth('2026-10', outRows)]), {}, CONFIRM_CTX);
  assert.deepEqual(p.steps[0].payload.options, OPEN_NO_FUT);
});

check('totals are exactly the sums over the steps (months, rows, replacements, invoices)', () => {
  for (const p of [plan, W.buildWorkbookPlan(workbook, SEL, {}, CONFIRM_CTX)]) {
    const steps = p.steps;
    assert.equal(p.totals.months, steps.length);
    assert.equal(p.totals.rows, steps.reduce((sum: number, s: { payload: { rows: unknown[] } }) => sum + s.payload.rows.length, 0));
    assert.equal(p.totals.replacements, steps.reduce((sum: number, s: { totals: { replacements: number } }) => sum + s.totals.replacements, 0));
    const paying = steps.filter((s: { totals: { invoice: { willPay: boolean } } }) => s.totals.invoice.willPay);
    assert.equal(p.totals.invoiceCount, paying.length);
    assert.equal(p.totals.invoiceCents, paying.reduce((sum: number, s: { totals: { invoice: { cents: number } } }) => sum + s.totals.invoice.cents, 0));
  }
});
