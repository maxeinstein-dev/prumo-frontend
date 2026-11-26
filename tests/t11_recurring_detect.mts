import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check } from './harness.mts';

// RECURRING_DETECT_MODULE points at a mutated copy of utils/recurringDetect.ts (bite-checks), next to a copy of people.ts.
const modPath = process.env.RECURRING_DETECT_MODULE
  || (process.env.FRONTEND_DIR ? fileURLToPath(pathToFileURL(process.env.FRONTEND_DIR + '/src/utils/recurringDetect.ts')) : fileURLToPath(new URL('../src/utils/recurringDetect.ts', import.meta.url)));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const D: any = await import(pathToFileURL(modPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

console.log('\n[phase 5] recurringDetect.ts');

// ---- fixtures (invented names and amounts) ---------------------------------------------------------------------------

const cand = (id: string, description: string, o: Record<string, unknown> = {}): Any => ({
  id, accountId: 'acc-main', accountName: 'Conta Principal', description, categoryName: 'UTILITIES', amount: 100, medianAmount: 100, minAmount: 100, maxAmount: 100,
  dayOfMonth: 10, monthsSeen: 6, windowMonths: 12, lastMonth: '2026-09', kind: 'stable', confidence: 0.9, defaultSelected: true, followLastAmount: true,
  examples: [{ transactionId: 't1', date: '2026-09-10', amount: 100, description }], ...o,
});

const STREAM = cand('c-stream', 'Streaming Alfa', { amount: 39.9, minAmount: 39.9, maxAmount: 39.9, dayOfMonth: 5 });
const GYM = cand('c-gym', 'Academia Beta', { amount: 120, dayOfMonth: 12, defaultSelected: false });
const POWER = cand('c-power', 'Conta de energia', { kind: 'bill', amount: 187.43, minAmount: 150.1, maxAmount: 210, medianAmount: 180, dayOfMonth: 20, confidence: 0.7 });
const WATER = cand('c-water', 'Conta de agua', { kind: 'bill', amount: 64.5, dayOfMonth: 15, defaultSelected: false });
const ALL = [STREAM, GYM, POWER, WATER];

// ---- default selection, groups, bulk toggles -----------------------------------------------------------------------------

check('defaultDraft: the server marks are the selection, no edits', () => {
  const d = D.defaultDraft(ALL);
  assert.deepEqual(d.selected, { 'c-stream': true, 'c-gym': false, 'c-power': true, 'c-water': false });
  assert.deepEqual(d.edits, {});
});

check('groupCandidates: stable first, then bills, server order kept, empty groups dropped', () => {
  const groups = D.groupCandidates([POWER, STREAM, WATER, GYM]);
  assert.deepEqual(groups.map((g: Any) => [g.kind, g.candidates.map((c: Any) => c.id)]), [['stable', ['c-stream', 'c-gym']], ['bill', ['c-power', 'c-water']]]);
  assert.deepEqual(D.groupCandidates([POWER]).map((g: Any) => g.kind), ['bill']);
  assert.deepEqual(D.groupCandidates([]), []);
  assert.equal(D.groupCandidates([cand('x', 'Novo tipo', { kind: 'weird' })])[0].kind, 'stable', 'an unknown kind goes with the stable ones');
});

check('setKindSelected: "as estáveis" only touches stable, "as contas" only bills', () => {
  const d0 = D.defaultDraft(ALL);
  const stable = D.setKindSelected(d0, ALL, 'stable', true);
  assert.deepEqual(stable.selected, { 'c-stream': true, 'c-gym': true, 'c-power': true, 'c-water': false });
  const bills = D.setKindSelected(d0, ALL, 'bill', true);
  assert.deepEqual(bills.selected, { 'c-stream': true, 'c-gym': false, 'c-power': true, 'c-water': true });
  const off = D.setKindSelected(bills, ALL, 'bill', false);
  assert.deepEqual(off.selected, { 'c-stream': true, 'c-gym': false, 'c-power': false, 'c-water': false });
  assert.equal(D.kindFullySelected(stable, ALL, 'stable'), true);
  assert.equal(D.kindFullySelected(stable, ALL, 'bill'), false);
  assert.equal(D.kindFullySelected(d0, [], 'bill'), false, 'no candidates of the kind: nothing is fully selected');
});

check('setAllSelected and setSelected', () => {
  const d = D.setAllSelected(D.defaultDraft(ALL), ALL, false);
  assert.ok(Object.values(d.selected).every((v) => v === false));
  assert.equal(D.setSelected(d, 'c-gym', true).selected['c-gym'], true);
});

check('reconcileDraft: keeps what the user did for known candidates, defaults for new ones, drops the gone ones', () => {
  let d = D.defaultDraft(ALL);
  d = D.setSelected(d, 'c-gym', true);
  d = D.setAmountText(d, 'c-stream', '45,00');
  d = D.setSelected(d, 'c-power', false);
  const gym2 = cand('c-gym', 'Academia Beta', { defaultSelected: false });
  const next = [STREAM, gym2, cand('c-new', 'Seguro Gama', { defaultSelected: true })];
  const r = D.reconcileDraft(d, ALL, next);
  assert.deepEqual(r.selected, { 'c-stream': true, 'c-gym': true, 'c-new': true });
  assert.deepEqual(r.edits, { 'c-stream': { amountText: '45,00' } });
});

// ---- adjustments ------------------------------------------------------------------------------------------------------------

check('resolveCandidate: shows the suggestion; nothing is "adjusted" until the user changes it', () => {
  const r = D.resolveCandidate(POWER, D.defaultDraft(ALL));
  assert.equal(r.amountText, '187,43');
  assert.equal(r.amountCents, 18743);
  assert.equal(r.dayText, '20');
  assert.equal(r.day, 20);
  assert.equal(r.description, 'Conta de energia');
  assert.equal(r.followLast, true);
  assert.deepEqual(r.adjusted, { amount: false, day: false, description: false, followLast: false });
  assert.deepEqual(r.errors, {});
});

check('amount: integer cents, accepts the usual notations, retyping the suggestion is not an adjustment', () => {
  const t = (text: string) => D.resolveCandidate(STREAM, D.setAmountText(D.defaultDraft(ALL), 'c-stream', text));
  assert.equal(t('1.234,56').amountCents, 123456);
  assert.equal(t('R$ 12,5').amountCents, 1250);
  assert.equal(t('39,90').adjusted.amount, false);
  assert.equal(t('39.9').adjusted.amount, false, '39.9 is the suggestion in another notation');
  assert.equal(t('40').adjusted.amount, true);
  assert.equal(t('').errors.amount, 'Informe o valor.');
  assert.equal(t('abc').errors.amount, 'Valor inválido.');
  assert.equal(t('-5').errors.amount, 'Valor inválido.');
  assert.equal(t('12,345').errors.amount, 'Valor inválido.');
  assert.equal(t('0').errors.amount, 'O valor precisa ser maior que zero.');
  assert.equal(t('0,00').amountCents, null);
});

check('day of the month: whole number 1..31', () => {
  const t = (text: string) => D.resolveCandidate(STREAM, D.setDayText(D.defaultDraft(ALL), 'c-stream', text));
  for (const ok of ['1', '15', '31', ' 7 ']) assert.equal(t(ok).errors.day, undefined, ok);
  for (const bad of ['0', '32', '', '-1', '1.5', 'dia', '100']) assert.equal(t(bad).errors.day, 'Informe um dia de 1 a 31.', bad);
  assert.equal(t('5').adjusted.day, false, 'the suggestion again');
  assert.equal(t('6').adjusted.day, true);
  assert.equal(t('6').day, 6);
});

check('description: trimmed, not empty, at most 500; unchanged text is not an adjustment', () => {
  const t = (text: string) => D.resolveCandidate(STREAM, D.setDescriptionText(D.defaultDraft(ALL), 'c-stream', text));
  assert.equal(t('   ').errors.description, 'Informe a descrição.');
  assert.equal(t('x'.repeat(501)).errors.description, 'A descrição pode ter no máximo 500 caracteres.');
  assert.equal(t('x'.repeat(500)).errors.description, undefined);
  assert.equal(t('  Streaming Alfa  ').adjusted.description, false);
  assert.equal(t('Streaming Alfa Plus').adjusted.description, true);
});

check('followLast: default on (absent counts as on); an adjustment only when it differs from the candidate', () => {
  const noField = cand('c-nofield', 'Sem campo');
  delete noField.followLastAmount;
  assert.equal(D.candidateFollowsLast(noField), true);
  assert.equal(D.candidateFollowsLast(cand('c-off', 'Desligada', { followLastAmount: false })), false);
  const off = D.setFollowLast(D.defaultDraft([STREAM]), 'c-stream', false);
  const r = D.resolveCandidate(STREAM, off);
  assert.equal(r.followLast, false);
  assert.equal(r.adjusted.followLast, true);
  const same = D.resolveCandidate(STREAM, D.setFollowLast(D.defaultDraft([STREAM]), 'c-stream', true));
  assert.equal(same.adjusted.followLast, false);
  const serverOff = cand('c-off', 'Desligada', { followLastAmount: false });
  assert.equal(D.resolveCandidate(serverOff, D.setFollowLast(D.defaultDraft([serverOff]), 'c-off', true)).adjusted.followLast, true);
});

check('bulk "acompanhar o último valor": setAllFollowLast / allFollowLast', () => {
  const d0 = D.defaultDraft(ALL);
  assert.equal(D.allFollowLast(d0, ALL), true);
  const off = D.setAllFollowLast(d0, ALL, false);
  assert.equal(D.allFollowLast(off, ALL), false);
  assert.ok(ALL.every((c) => D.resolveCandidate(c, off).followLast === false));
  assert.equal(D.allFollowLast(D.setFollowLast(d0, 'c-gym', false), ALL), false, 'one off is not "all"');
  assert.equal(D.allFollowLast(d0, []), false);
});

// ---- apply payload and totals ---------------------------------------------------------------------------------------------

check('payload: only the ticked candidates, items carry only the adjusted fields, reais on the wire', () => {
  let d = D.defaultDraft(ALL);
  d = D.setAmountText(d, 'c-power', '195,50');
  d = D.setDayText(d, 'c-power', '25');
  d = D.setDescriptionText(d, 'c-power', ' Energia da casa ');
  d = D.setFollowLast(d, 'c-power', false);
  const built = D.buildDetectApply('h1', ALL, d);
  assert.deepEqual(built.payload, {
    householdId: 'h1',
    items: [{ id: 'c-stream' }, { id: 'c-power', amount: 195.5, dayOfMonth: 25, description: 'Energia da casa', followLastAmount: false }],
  });
  assert.deepEqual(built.items.map((i: Any) => i.candidate.id), ['c-stream', 'c-power']);
});

check('payload: the detection parameters are echoed only when given; item keys are exactly the contract', () => {
  const built = D.buildDetectApply('h1', ALL, D.defaultDraft(ALL), { minMonths: 4, months: 6 });
  assert.deepEqual(Object.keys(built.payload).sort(), ['householdId', 'items', 'minMonths', 'months']);
  assert.deepEqual(Object.keys(D.buildDetectApply('h1', ALL, D.defaultDraft(ALL)).payload).sort(), ['householdId', 'items']);
  let d = D.defaultDraft([STREAM]);
  d = D.setAmountText(d, 'c-stream', '10');
  d = D.setDayText(d, 'c-stream', '2');
  d = D.setDescriptionText(d, 'c-stream', 'Outro');
  d = D.setFollowLast(d, 'c-stream', false);
  assert.deepEqual(Object.keys(D.buildDetectApply('h1', [STREAM], d).payload.items[0]).sort(), ['amount', 'dayOfMonth', 'description', 'followLastAmount', 'id']);
});

check('payload: an invalid adjustment never reaches the payload', () => {
  let d = D.defaultDraft([STREAM]);
  d = D.setAmountText(d, 'c-stream', 'abc');
  d = D.setDayText(d, 'c-stream', '40');
  d = D.setDescriptionText(d, 'c-stream', '');
  assert.deepEqual(D.buildDetectApply('h1', [STREAM], d).payload.items, [{ id: 'c-stream' }]);
});

check('totals: count by kind, followers, monthly sum in integer cents', () => {
  let d = D.setAllSelected(D.defaultDraft(ALL), ALL, true);
  d = D.setFollowLast(d, 'c-gym', false);
  const { totals } = D.buildDetectApply('h1', ALL, d);
  assert.deepEqual(totals, { count: 4, stableCount: 2, billCount: 2, followCount: 3, monthlyCents: 3990 + 12000 + 18743 + 6450, invalidCount: 0 });
  assert.equal(Number.isInteger(totals.monthlyCents), true);
  const typed = D.setAmountText(D.defaultDraft(ALL), 'c-stream', '50,00');
  assert.equal(D.buildDetectApply('h1', ALL, typed).totals.monthlyCents, 5000 + 18743, 'the typed amount is what is summed');
});

check('the 0.1 + 0.2 trap: sums stay exact in cents', () => {
  const a = cand('a', 'A', { amount: 0.1, minAmount: 0.1, maxAmount: 0.1 });
  const b = cand('b', 'B', { amount: 0.2, minAmount: 0.2, maxAmount: 0.2 });
  assert.equal(D.buildDetectApply('h1', [a, b], D.defaultDraft([a, b])).totals.monthlyCents, 30);
});

// ---- blocker ----------------------------------------------------------------------------------------------------------------------

check('detectBlocker: applying > needs-refresh > nothing selected > invalid > null', () => {
  const ok = D.buildDetectApply('h1', ALL, D.defaultDraft(ALL));
  const none = D.buildDetectApply('h1', ALL, D.setAllSelected(D.defaultDraft(ALL), ALL, false));
  const bad = D.buildDetectApply('h1', ALL, D.setDayText(D.defaultDraft(ALL), 'c-stream', '99'));
  const idle = { needsRefresh: false, applying: false };
  assert.equal(D.detectBlocker(ok, idle), null);
  assert.equal(D.detectBlocker(ok, { needsRefresh: false, applying: true }).code, 'applying');
  assert.equal(D.detectBlocker(ok, { needsRefresh: true, applying: false }).code, 'needs-refresh');
  assert.equal(D.detectBlocker(none, idle).code, 'none-selected');
  assert.equal(D.detectBlocker(null, idle).code, 'none-selected');
  assert.equal(D.detectBlocker(bad, idle).code, 'invalid');
  assert.equal(D.detectBlocker(bad, idle).message, 'Corrija o ajuste inválido antes de criar.');
  assert.equal(D.detectBlocker(none, { needsRefresh: true, applying: false }).code, 'needs-refresh', 'a stale list is blocked even when nothing is ticked');
});

check('an invalid adjustment on an UNTICKED candidate does not block', () => {
  let d = D.defaultDraft(ALL);
  d = D.setDayText(d, 'c-gym', '99');
  assert.equal(D.detectBlocker(D.buildDetectApply('h1', ALL, d), { needsRefresh: false, applying: false }), null);
});

// ---- texts --------------------------------------------------------------------------------------------------------------------------

check('display texts: range only when the amounts varied, months seen, confidence', () => {
  assert.equal(D.amountRangeText(STREAM), null);
  assert.equal(D.amountRangeText(POWER), 'R$ 150,10 a R$ 210,00');
  assert.equal(D.monthsSeenText(STREAM), '6 de 12');
  assert.equal(D.confidenceText(0.856), '86%');
  assert.equal(D.confidenceText(2), '100%');
  assert.equal(D.confidenceText(Number.NaN), '0%');
});

check('empty state: the reasons come from the skipped counts, zero counts are left out', () => {
  assert.deepEqual(D.skippedLines({ alreadyRecurring: 2, installments: 1, sparse: 0, consumption: 7 }), ['2 já são recorrências', '1 é parcela', '7 são consumo variável']);
  assert.deepEqual(D.skippedLines({ alreadyRecurring: 1, installments: 0, sparse: 3, consumption: 0 }), ['1 já é uma recorrência', '3 aparecem com lacunas demais']);
  assert.deepEqual(D.skippedLines({ alreadyRecurring: 0, installments: 0, sparse: 0, consumption: 0 }), []);
  assert.deepEqual(D.skippedLines(null), []);
});

check('result texts: created / linked / skipped, plurals, warnings are shown by the dialog', () => {
  assert.deepEqual(D.applyResultLines({ created: 2, skipped: 1, linkedTransactions: 14, warnings: [] }), [
    '2 recorrências criadas.', '14 transações do histórico vinculadas.', '1 item ignorado (já eram recorrentes ou não aparecem mais).',
  ]);
  assert.deepEqual(D.applyResultLines({ created: 1, skipped: 0, linkedTransactions: 1, warnings: [] }), ['1 recorrência criada.', '1 transação do histórico vinculada.']);
  assert.equal(D.applySummary({ created: 3, skipped: 0, linkedTransactions: 0, warnings: [] }), '3 recorrências criadas.');
  assert.equal(D.applySummary({ created: 0, skipped: 0, linkedTransactions: 0, warnings: [] }), 'Nada foi criado.');
});

check('failure text: a 4xx says nothing was created, other failures may be partial', () => {
  assert.equal(D.applyFailureMessage('Sem permissão', 403), 'Sem permissão. Nada foi criado: detecte de novo.');
  assert.match(D.applyFailureMessage('Falha de rede.'), /parcial/);
  assert.match(D.applyFailureMessage('Erro', 500), /parcial/);
  assert.match(D.applyFailureMessage('', undefined), /Não foi possível criar as recorrências\./);
});
