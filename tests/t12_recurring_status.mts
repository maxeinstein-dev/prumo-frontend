import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CONFIRM_CTX, M, check, frontSrc, defaultSelection, mkPreview, mkRow } from './harness.mts';

// Phase 5, part 1: the `matches-recurring` row status in the monthly preview (selection, payload, counts, workbook totals,
// result lines) and, part 2, the "acompanhar o último valor" hint rule (utils/recurringFollow.ts).
// MAXFIN_WORKBOOK_MODULE / RECURRING_FOLLOW_MODULE point at mutated copies (bite-checks).
const wbPath = process.env.MAXFIN_WORKBOOK_MODULE || frontSrc('utils/maxfinWorkbook.ts');
const followPath = process.env.RECURRING_FOLLOW_MODULE || frontSrc('utils/recurringFollow.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const W: any = await import(pathToFileURL(wbPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = await import(pathToFileURL(followPath).href);
void fileURLToPath;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

console.log('\n[phase 5] matches-recurring in the monthly preview');

const bills = (o: Record<string, Any> = {}) => mkRow({ section: 'bills', accountId: 'acc-main', categoryKey: 'Moradia', ...o });
const k = (r: unknown): string => M.rowKey(r);

const energy = bills({ description: 'Conta de energia', amount: 187.43, status: 'matches-recurring', statusDetail: 'atualiza a transação gerada de 05/10', existingTransactionId: 'tx-gen-1' });
const internet = bills({ description: 'Internet fibra', amount: 99.9, status: 'matches-recurring', statusDetail: 'assume a recorrência e adianta a próxima execução' });
const fresh = bills({ description: 'Padaria', amount: 12, status: 'new' });
const changed = bills({ description: 'Aluguel', amount: 1500, status: 'changed' });
const future = mkRow({ description: 'Sofá 3/10', amount: 300, status: 'replaces-future', installment: { number: 3, total: 10, prepaid: 0, baseDescription: 'Sofá', installmentId: 'i1', futureCount: 7 } });
const dup = bills({ description: 'Seguro', amount: 50, status: 'duplicate' });
const unknown = bills({ description: 'Futuro', amount: 5, status: 'from-the-future' });
const ROWS = [energy, internet, fresh, changed, future, dup, unknown];

check('matches-recurring is sendable and ticked by default; the other statuses keep their behaviour', () => {
  assert.equal(M.isSendableStatus('matches-recurring'), true);
  assert.equal(M.defaultRowSelected('matches-recurring'), true);
  const table: Array<[string, boolean, boolean]> = [
    ['new', true, true], ['duplicate', false, false], ['changed', true, false], ['replaces-future', true, true], ['legacy-duplicate', true, false], ['from-the-future', false, false],
  ];
  for (const [status, sendable, ticked] of table) {
    assert.equal(M.isSendableStatus(status), sendable, status);
    assert.equal(M.defaultRowSelected(status), ticked, status);
  }
  const sel = defaultSelection(ROWS);
  assert.deepEqual(ROWS.filter((r) => sel[k(r)]).map((r) => r.description), ['Conta de energia', 'Internet fibra', 'Padaria', 'Sofá 3/10']);
});

check('reconcileSelection: a status that became matches-recurring gets the default (ticked); a kept status keeps the choice', () => {
  const before = { ...energy, status: 'duplicate' };
  const sel = M.reconcileSelection([before], { [k(before)]: false }, [energy]);
  assert.equal(sel[k(energy)], true);
  const kept = M.reconcileSelection([energy], { [k(energy)]: false }, [energy]);
  assert.equal(kept[k(energy)], false, 'the user unticked it and it is still the same status');
});

check('payload: matches-recurring rows go with replace:true; new rows without; the preview-only fields never travel', () => {
  const built = M.buildConfirmPayload(mkPreview(ROWS), defaultSelection(ROWS), {}, CONFIRM_CTX);
  const byDesc = Object.fromEntries(built.payload.rows.map((r: Any) => [r.description, r]));
  assert.equal(byDesc['Conta de energia'].replace, true);
  assert.equal(byDesc['Internet fibra'].replace, true);
  assert.equal('replace' in byDesc['Padaria'], false);
  assert.equal(byDesc['Sofá 3/10'].replace, true);
  for (const row of built.payload.rows) {
    for (const key of ['status', 'statusDetail', 'existingTransactionId']) assert.equal(key in row, false, key);
  }
});

check('replacements (the armed confirm count) include matches-recurring; `recurring` counts only those', () => {
  const built = M.buildConfirmPayload(mkPreview(ROWS), defaultSelection(ROWS), {}, CONFIRM_CTX);
  assert.equal(built.totals.count, 4);
  assert.equal(built.totals.replacements, 3, '2 matches-recurring + 1 replaces-future');
  assert.equal(built.totals.recurring, 2);
  const withChanged = { ...defaultSelection(ROWS), [k(changed)]: true };
  const b2 = M.buildConfirmPayload(mkPreview(ROWS), withChanged, {}, CONFIRM_CTX);
  assert.equal(b2.totals.replacements, 4);
  assert.equal(b2.totals.recurring, 2);
  const only = M.buildConfirmPayload(mkPreview([fresh]), defaultSelection([fresh]), {}, CONFIRM_CTX);
  assert.equal(only.totals.replacements, 0);
  assert.equal(only.totals.recurring, 0);
});

check('an unticked matches-recurring row is not sent and not counted', () => {
  const sel = { ...defaultSelection(ROWS), [k(energy)]: false };
  const built = M.buildConfirmPayload(mkPreview(ROWS), sel, {}, CONFIRM_CTX);
  assert.equal(built.payload.rows.some((r: Any) => r.description === 'Conta de energia'), false);
  assert.equal(built.totals.recurring, 1);
});

check('countByStatus: matches-recurring has its own bucket and is not "unknown"', () => {
  const counts = M.countByStatus(ROWS);
  assert.equal(counts.matchesRecurring, 2);
  assert.equal(counts.unknown, 1);
  assert.equal(counts.new, 1);
  assert.equal(counts.changed, 1);
  assert.equal(counts.replacesFuture, 1);
  assert.equal(counts.duplicate, 1);
});

check('result summary: "assumiu N recorrentes" from assumedRecurring; absent or zero says nothing', () => {
  const res = (o: object) => ({ imported: 3, skipped: 0, replaced: 2, consumedFutureInstallments: 0, futureInstallments: 0, createdCategories: [], invoicePayment: null, ids: [], warnings: [], ...o });
  const fmt = (v: number) => `R$ ${v}`;
  assert.equal(M.buildConfirmSummary(res({ assumedRecurring: 2 }), fmt), '3 transações importadas, 2 substituídas, assumiu 2 recorrentes.');
  assert.equal(M.buildConfirmSummary(res({ assumedRecurring: 1 }), fmt), '3 transações importadas, 2 substituídas, assumiu 1 recorrente.');
  assert.equal(M.buildConfirmSummary(res({ assumedRecurring: 0 }), fmt), '3 transações importadas, 2 substituídas.');
  assert.equal(M.buildConfirmSummary(res({}), fmt), '3 transações importadas, 2 substituídas.');
  assert.equal(M.confirmResultNeedsReview(res({ assumedRecurring: 5 })), false, 'assuming recurrences is not something to review');
});

check('workbook: totals add replacements and recurring across months; the run summary and toast carry assumedRecurring', () => {
  const m1 = mkPreview([energy, fresh], { month: { year: 2026, month: 8 }, monthKey: '2026-08', monthSource: 'sheet' });
  const m2 = mkPreview([internet], { month: { year: 2026, month: 9 }, monthKey: '2026-09', monthSource: 'sheet' });
  const months = [m1, m2];
  const sel = Object.fromEntries(months.map((m) => [m.monthKey, defaultSelection(m.rows)]));
  const plan = W.buildWorkbookPlan({ months }, sel, {}, CONFIRM_CTX);
  assert.equal(plan.totals.rows, 3);
  assert.equal(plan.totals.replacements, 2);
  assert.equal(plan.totals.recurring, 2);
  const res = (o: object) => ({ imported: 2, skipped: 0, replaced: 1, consumedFutureInstallments: 0, futureInstallments: 0, createdCategories: [], invoicePayment: null, ids: [], warnings: [], ...o });
  const summary = W.summarizeWorkbookRun(plan.steps, [res({ assumedRecurring: 1 }), res({ assumedRecurring: 1, imported: 1 })], null, (v: number) => `R$ ${v}`);
  assert.equal(summary.totals.assumedRecurring, 2);
  assert.match(W.workbookRunToast(summary), /assumiu 2 recorrentes/);
  assert.match(summary.months[0].line, /assumiu 1 recorrente/);
  const plain = W.summarizeWorkbookRun(plan.steps, [res({}), res({})], null, (v: number) => `R$ ${v}`);
  assert.doesNotMatch(W.workbookRunToast(plain), /assumiu/);
});

// ---------------------------------------------------------------------------------------------------------------------------
console.log('\n[phase 5] recurringFollow.ts: the hint "Este valor será usado nos próximos meses"');

const TODAY = new Date(2026, 9, 5); // 2026-10-05 (local)
const REC_FOLLOW = { id: 'rec-1', followLastAmount: true };
const REC_FIXED = { id: 'rec-2', followLastAmount: false };
const occ = (id: string, date: string | Date, recurringTransactionId: string | null = 'rec-1'): Any => ({ id, date, recurringTransactionId });
const OLD = occ('t-aug', '2026-08-10');
const MID = occ('t-sep', '2026-09-10');
const LATEST = occ('t-oct', '2026-10-10');
const KNOWN = [LATEST, MID, OLD, occ('t-other', '2026-10-20', 'rec-2'), occ('t-plain', '2026-10-25', null)];

check('hint: shown for the most recent occurrence of a recurrence that follows the last amount', () => {
  assert.equal(F.followLastHint(LATEST, [REC_FOLLOW], KNOWN, TODAY), 'Este valor será usado nos próximos meses');
});

check('hint: not for an older occurrence (editing it does not change the recurrence)', () => {
  assert.equal(F.followLastHint(MID, [REC_FOLLOW], KNOWN, TODAY), null);
  assert.equal(F.followLastHint(OLD, [REC_FOLLOW], KNOWN, TODAY), null);
});

check('hint: not when the recurrence does not follow the last amount, is unknown, or the transaction has none', () => {
  assert.equal(F.followLastHint(occ('t-oct', '2026-10-10', 'rec-2'), [REC_FIXED], KNOWN, TODAY), null);
  assert.equal(F.followLastHint(LATEST, [], KNOWN, TODAY), null);
  assert.equal(F.followLastHint(LATEST, [{ id: 'rec-1' }], KNOWN, TODAY), null, 'an older server without the field');
  assert.equal(F.followLastHint(occ('t-plain', '2026-10-25', null), [REC_FOLLOW], KNOWN, TODAY), null);
  assert.equal(F.followLastHint({ id: 't-n', date: '2026-10-10' }, [{ followLastAmount: true }], KNOWN, TODAY), null, 'no recurrence id never matches a recurrence without one');
  assert.equal(F.followLastHint(null, [REC_FOLLOW], KNOWN, TODAY), null);
});

check('hint: occurrences of OTHER recurrences do not count as later', () => {
  const known = [LATEST, occ('t-x', '2026-10-30', 'rec-2'), occ('t-y', '2026-10-31', null)];
  assert.equal(F.followLastHint(LATEST, [REC_FOLLOW], known, TODAY), 'Este valor será usado nos próximos meses');
});

check('hint: the window is today + 31 days (a later occurrence beyond it does not take the place; one beyond it is not "the" latest)', () => {
  const far = occ('t-far', '2026-12-15'); // beyond 2026-11-05
  assert.equal(F.followLastHint(LATEST, [REC_FOLLOW], [LATEST, far, MID], TODAY), 'Este valor será usado nos próximos meses');
  assert.equal(F.followLastHint(far, [REC_FOLLOW], [LATEST, far, MID], TODAY), null);
  const edge = occ('t-edge', '2026-11-05'); // exactly today + 31
  assert.equal(F.followLastHint(edge, [REC_FOLLOW], [edge, MID], TODAY), 'Este valor será usado nos próximos meses');
  const past = occ('t-past', '2026-11-06');
  assert.equal(F.followLastHint(past, [REC_FOLLOW], [past, MID], TODAY), null);
});

check('hint: same-day siblings do not hide it; a later sibling does', () => {
  const twin = occ('t-twin', '2026-10-10');
  assert.equal(F.followLastHint(LATEST, [REC_FOLLOW], [LATEST, twin], TODAY), 'Este valor será usado nos próximos meses');
  const later = occ('t-later', '2026-10-11');
  assert.equal(F.followLastHint(LATEST, [REC_FOLLOW], [LATEST, later], TODAY), null);
});

check('hint: a transaction older than everything the client knows cannot be judged (no hint); an empty list neither', () => {
  const ancient = occ('t-2024', '2024-01-10');
  assert.equal(F.followLastHint(ancient, [REC_FOLLOW], KNOWN, TODAY), null);
  const noSibling = [occ('t-x', '2026-09-10', 'rec-2')];
  assert.equal(F.followLastHint(ancient, [REC_FOLLOW], noSibling, TODAY), null, 'no later sibling is known, but the list does not reach back to it');
  assert.equal(F.followLastHint(occ('t-2026', '2026-09-10'), [REC_FOLLOW], noSibling, TODAY), 'Este valor será usado nos próximos meses');
  assert.equal(F.followLastHint(LATEST, [REC_FOLLOW], [], TODAY), null);
});

check('hint: dates as Date objects (local day) and as ISO timestamps compare by day', () => {
  const asDate = occ('t-oct', new Date(2026, 9, 10));
  const iso = occ('t-sep', '2026-09-10T00:00:00.000Z');
  assert.equal(F.followLastHint(asDate, [REC_FOLLOW], [asDate, iso], TODAY), 'Este valor será usado nos próximos meses');
  assert.equal(F.followLastHint(iso, [REC_FOLLOW], [asDate, iso], TODAY), null);
  assert.equal(F.dayKey(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(F.dayKey('2026-01-05T23:00:00Z'), '2026-01-05');
  assert.equal(F.dayKey('nope'), '');
  assert.equal(F.addDaysKey(new Date(2026, 11, 20), 31), '2027-01-20');
});

check('update notice: "Recorrência atualizada para R$ X" only when the response carries a valid recurringUpdated', () => {
  assert.equal(F.recurrenceUpdatedMessage({ id: 'rec-1', amount: 187.43 }), 'Recorrência atualizada para R$ 187,43');
  assert.equal(F.recurrenceUpdatedMessage({ id: 'rec-1', amount: 1234.5 }), 'Recorrência atualizada para R$ 1.234,50');
  assert.equal(F.recurrenceUpdatedMessage({ id: 'rec-1', amount: 10 }, (v: number) => `US$ ${v}`), 'Recorrência atualizada para US$ 10');
  assert.equal(F.recurrenceUpdatedMessage(undefined), null);
  assert.equal(F.recurrenceUpdatedMessage(null), null);
  assert.equal(F.recurrenceUpdatedMessage({ id: '', amount: 10 }), null);
  assert.equal(F.recurrenceUpdatedMessage({ id: 'rec-1', amount: 'x' }), null);
});

check('texts of the toggle are the ones the spec names', () => {
  assert.equal(F.FOLLOW_LAST_LABEL, 'Acompanhar o último valor');
  assert.equal(F.FOLLOW_LAST_HINT, 'Este valor será usado nos próximos meses');
  assert.equal(F.LATEST_WINDOW_DAYS, 31);
});

// ---------------------------------------------------------------------------------------------------------------------------
console.log('\n[phase 5, round 1] lastOccurrenceDate, existingAmount, amountChanged');

const HINT = 'Este valor será usado nos próximos meses';
const recWith = (last: string | null | undefined): Any => ({ id: 'rec-1', followLastAmount: true, ...(last === undefined ? {} : { lastOccurrenceDate: last }) });

check('hint with lastOccurrenceDate: the edited occurrence is the latest when own >= last and own <= today + 31', () => {
  assert.equal(F.followLastHint(LATEST, [recWith('2026-10-10')], [], TODAY), HINT, 'equal to the server date, even with nothing else known');
  assert.equal(F.followLastHint(LATEST, [recWith('2026-10-09')], [], TODAY), HINT);
  assert.equal(F.followLastHint(MID, [recWith('2026-10-10')], [MID], TODAY), null, 'older than the newest');
  assert.equal(F.followLastHint(LATEST, [recWith('2026-10-11')], [LATEST], TODAY), null, 'one day older than the newest');
});

check('hint with lastOccurrenceDate: the server date wins over what the client holds', () => {
  // the client knows a later sibling, the server says it is not within the window / not the newest: the server decides
  assert.equal(F.followLastHint(MID, [recWith('2026-09-10')], [MID, LATEST], TODAY), HINT);
  // the client knows nothing older, but the server has a newer one
  assert.equal(F.followLastHint(OLD, [recWith('2026-10-10')], [OLD], TODAY), null);
});

check('hint with lastOccurrenceDate: null (no occurrence in the window) and the +31 days limit give no hint', () => {
  assert.equal(F.followLastHint(LATEST, [recWith(null)], [LATEST], TODAY), null);
  const far = occ('t-far', '2026-12-15');
  assert.equal(F.followLastHint(far, [recWith('2026-10-10')], [far], TODAY), null, 'beyond today + 31');
  const edge = occ('t-edge', '2026-11-05');
  assert.equal(F.followLastHint(edge, [recWith('2026-11-05')], [edge], TODAY), HINT);
  const past = occ('t-past', '2026-11-06');
  assert.equal(F.followLastHint(past, [recWith('2026-11-06')], [past], TODAY), null);
});

check('hint with lastOccurrenceDate: the flag and the recurrence id still matter', () => {
  assert.equal(F.followLastHint(LATEST, [{ id: 'rec-1', followLastAmount: false, lastOccurrenceDate: '2026-10-10' }], [], TODAY), null);
  assert.equal(F.followLastHint(occ('t-x', '2026-10-10', null), [recWith('2026-10-10')], [], TODAY), null);
});

check('hint: an absent field falls back to the heuristic (unchanged behaviour)', () => {
  assert.equal(F.followLastHint(LATEST, [recWith(undefined)], KNOWN, TODAY), HINT);
  assert.equal(F.followLastHint(MID, [recWith(undefined)], KNOWN, TODAY), null);
});

check('rowDetailText: matches-recurring shows "old → new" after the server text; absent existingAmount keeps the server text', () => {
  const fmt = (v: number) => `R$ ${v.toFixed(2)}`;
  const row = (o: Record<string, Any>): Any => ({ status: 'matches-recurring', statusDetail: 'atualiza a transação gerada de 05/10', amount: 187.43, ...o });
  assert.equal(M.rowDetailText(row({ existingAmount: 180 }), fmt), 'atualiza a transação gerada de 05/10: R$ 180.00 → R$ 187.43');
  assert.equal(M.rowDetailText(row({ existingAmount: 187.43 }), fmt), 'atualiza a transação gerada de 05/10: R$ 187.43 → R$ 187.43', 'same amount is still shown');
  assert.equal(M.rowDetailText(row({ existingAmount: 0 }), fmt), 'atualiza a transação gerada de 05/10: R$ 0.00 → R$ 187.43');
  assert.equal(M.rowDetailText(row({}), fmt), 'atualiza a transação gerada de 05/10');
  assert.equal(M.rowDetailText(row({ existingAmount: null }), fmt), 'atualiza a transação gerada de 05/10');
  assert.equal(M.rowDetailText(row({ existingAmount: Number.NaN }), fmt), 'atualiza a transação gerada de 05/10');
  assert.equal(M.rowDetailText(row({ statusDetail: null, existingAmount: 10 }), fmt), 'R$ 10.00 → R$ 187.43');
  assert.equal(M.rowDetailText(row({ statusDetail: null }), fmt), null);
  assert.equal(M.rowDetailText({ status: 'changed', statusDetail: 'valor mudou', amount: 5, existingAmount: 4 }, fmt), 'valor mudou', 'only matches-recurring rows');
});

check('amountChanged: compares in integer cents; the edit that keeps the amount does not send it', () => {
  assert.equal(F.amountChanged(187.43, 187.43), false);
  assert.equal(F.amountChanged(0.1 + 0.2, 0.3), false, 'float noise is not a change');
  assert.equal(F.amountChanged(100, 100.01), true);
  assert.equal(F.amountChanged(100, 0), true);
  assert.equal(F.amountChanged(undefined, 50), true);
  assert.equal(F.amountChanged(50, undefined), true);
  assert.equal(F.amountChanged(undefined, undefined), false);
});
