import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CONFIRM_CTX, M, check, frontSrc, mkPreview, mkRow } from './harness.mts';

// Shifted rows and realignment proposals of the MaxFin importer (backend contract: maxfin-realign.ts / maxfin-realign.service.ts).
// Covers src/utils/maxfinRealign.ts (proposals, defaults, `requires`, decisions, rows held back, card texts, result),
// its wiring in maxfinPayload.ts (payload, blocker, summary, review) and maxfinWorkbook.ts (plan, run summary), and the
// i18n texts. MAXFIN_REALIGN_MODULE / MAXFIN_WORKBOOK_MODULE (and MAXFIN_MODULE) point at a mutated copy for bite-checks
// (bite-realign.mjs). Invented data only.
const realignPath = process.env.MAXFIN_REALIGN_MODULE || frontSrc('utils/maxfinRealign.ts');
const workbookPath = process.env.MAXFIN_WORKBOOK_MODULE || frontSrc('utils/maxfinWorkbook.ts');
const textsPath = process.env.MAXFIN_REALIGN_TEXTS_MODULE || frontSrc('utils/maxfinRealignTexts.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const R: Any = await import(pathToFileURL(realignPath).href);
const W: Any = await import(pathToFileURL(workbookPath).href);
const T: Any = await import(pathToFileURL(textsPath).href);
console.log(`\n(realign module: ${realignPath})`);

const ref = (section: string, line: number, month = '2026-09'): string => `maxfin:${month}:${section}:${line}`;

/** A move of a stored purchase from line `from` to line `to` (sheet line = `to`). */
function mv(n: number, from: number, to: number, o: Record<string, Any> = {}, section = 'credit'): Any {
  return {
    transactionId: `tx-${section}-${n}`, from: ref(section, from), to: ref(section, to), sheetLine: to, verified: true,
    sheet: { description: `Compra ${n}`, type: 'EXPENSE', amount: n * 10, installment: null },
    storedDescription: `Compra ${n}`, storedAmount: n * 10, ...o,
  };
}

/** A proposal: lines 5..7 moved 2 lines down (two lines inserted at 3 and 4), unless told otherwise. */
function prop(o: Record<string, Any> = {}): Any {
  return {
    id: 'credit:5:2', section: 'credit', kind: 'insertion', shift: 2, firstLine: 5, lastLine: 7,
    moves: [mv(1, 3, 5), mv(2, 4, 6), mv(3, 5, 7)], removed: [], insertedRefs: [ref('credit', 3), ref('credit', 4)],
    requires: [], defaultSelected: true, ambiguous: false, reason: null, detail: 'Cartão: 3 lançamentos estão 2 linhas abaixo ...', ...o,
  };
}

/** Lower block (lines 12..14 moved 3 down) and the upper one (lines 5..7 moved 2 down) that lands on lines the lower vacates. */
const lower = prop({ id: 'credit:12:3', firstLine: 12, lastLine: 14, shift: 3, moves: [mv(11, 9, 12), mv(12, 10, 13), mv(13, 11, 14)], insertedRefs: [] });
const upper = prop({ requires: ['credit:12:3'] });
const ambiguousProp = prop({ id: 'debit:8:1', section: 'debit', shift: 1, firstLine: 8, lastLine: 9, moves: [mv(21, 7, 8, {}, 'debit'), mv(22, 8, 9, {}, 'debit')], insertedRefs: [], defaultSelected: false, ambiguous: true, reason: 'há linhas iguais lado a lado (mesma descrição e valor)' });

const newRow = (line: number, o: Record<string, Any> = {}): Any =>
  mkRow({ sourceRef: ref('credit', line), sourceLine: line, description: `Nova ${line}`, ...o });
const shiftedRow = (line: number): Any =>
  mkRow({ sourceRef: ref('credit', line), sourceLine: line, description: `Compra ${line}`, status: 'shifted', statusDetail: 'só mudou de linha', existingTransactionId: `tx-${line}` });

const built = (proposals: Any[], rows: Any[], sel?: Record<string, boolean>, rowSel?: Record<string, boolean>): Any => {
  const preview = mkPreview(rows, { realignments: proposals });
  const selected = rowSel ?? Object.fromEntries(rows.map((r) => [M.rowKey(r), true]));
  return M.buildConfirmPayload(preview, selected, {}, CONFIRM_CTX, sel);
};

console.log('\n[RA] proposals of a preview');

check('RA-a: an older server (no realignments) or garbage gives no proposals', () => {
  assert.deepEqual(R.realignProposals(mkPreview([])), []);
  assert.deepEqual(R.realignProposals({ realignments: 'x' }), []);
  assert.deepEqual(R.realignProposals({ realignments: null }), []);
  assert.deepEqual(R.realignProposals(null), []);
});

check('RA-b: an entry without id or without moves, and a repeated id, are dropped; missing arrays become empty', () => {
  const bare = { ...prop({ id: 'bare' }), removed: undefined, insertedRefs: undefined, requires: undefined };
  const out = R.realignProposals({ realignments: [prop(), { ...prop({ id: 'nomoves' }), moves: [] }, { ...prop({ id: '' }) }, prop(), null, 7, bare] });
  assert.deepEqual(out.map((p: Any) => p.id), ['credit:5:2', 'bare']);
  assert.deepEqual([out[1].removed, out[1].insertedRefs, out[1].requires], [[], [], []]);
});

console.log('\n[RB] default selection and `requires`');

check('RB-a: defaultSelected ticks, an ambiguous one never does (even when the server says defaultSelected)', () => {
  const sel = R.defaultRealignSelection([lower, ambiguousProp]);
  assert.deepEqual(sel, { 'credit:12:3': true, 'debit:8:1': false });
  assert.equal(R.defaultRealignSelection([{ ...ambiguousProp, defaultSelected: true }])['debit:8:1'], false);
});

check('RB-b: a proposal whose requirement is unticked by default is unticked too (the server would skip it)', () => {
  const ambLower = { ...lower, defaultSelected: false, ambiguous: true, reason: 'x' };
  assert.deepEqual(R.defaultRealignSelection([upper, ambLower]), { 'credit:5:2': false, 'credit:12:3': false });
  assert.deepEqual(R.defaultRealignSelection([upper, lower]), { 'credit:5:2': true, 'credit:12:3': true });
});

check('RB-c: a requirement that is not among the proposals can never be applied', () => {
  const proposals = [upper];
  assert.deepEqual(R.defaultRealignSelection(proposals), { 'credit:5:2': false });
  assert.equal(R.canTickRealign(proposals, {}, 'credit:5:2'), false);
  assert.deepEqual(R.toggleRealign(proposals, {}, 'credit:5:2', true), { 'credit:5:2': false });
  assert.deepEqual(R.missingRequirements(proposals, 'credit:5:2'), ['credit:12:3']);
});

check('RB-d: ticking is refused while a requirement is unticked, allowed once it is ticked', () => {
  const proposals = [upper, lower];
  const off = { 'credit:5:2': false, 'credit:12:3': false };
  assert.equal(R.canTickRealign(proposals, off, 'credit:5:2'), false);
  assert.deepEqual(R.toggleRealign(proposals, off, 'credit:5:2', true), off, 'refused: unchanged');
  const lowerOn = R.toggleRealign(proposals, off, 'credit:12:3', true);
  assert.deepEqual(lowerOn, { 'credit:5:2': false, 'credit:12:3': true });
  assert.equal(R.canTickRealign(proposals, lowerOn, 'credit:5:2'), true);
  assert.deepEqual(R.toggleRealign(proposals, lowerOn, 'credit:5:2', true), { 'credit:5:2': true, 'credit:12:3': true });
});

check('RB-e: unticking a requirement unticks, transitively, whoever needs it; the requirement itself is not dragged along', () => {
  const a = prop({ id: 'A', requires: ['B'] });
  const b = prop({ id: 'B', requires: ['C'] });
  const c = prop({ id: 'C', requires: [] });
  const all = { A: true, B: true, C: true };
  assert.deepEqual(R.toggleRealign([a, b, c], all, 'C', false), { A: false, B: false, C: false });
  assert.deepEqual(R.toggleRealign([a, b, c], all, 'B', false), { A: false, B: false, C: true });
  assert.deepEqual(R.toggleRealign([a, b, c], all, 'A', false), { A: false, B: true, C: true });
});

check('RB-f: a stale selection is made coherent (an entry for a gone proposal is ignored, a ticked one without its requirement is unticked)', () => {
  assert.deepEqual(R.normalizeRealignSelection([upper, lower], { 'credit:5:2': true, 'credit:12:3': false, ghost: true }), { 'credit:5:2': false, 'credit:12:3': false });
  assert.deepEqual(R.unmetRequirements([upper, lower], { 'credit:12:3': false }, 'credit:5:2'), ['credit:12:3']);
});

check('RB-g: a proposal over the limits of a request is never ticked, and stays out of the decisions', () => {
  const many = prop({ id: 'big', moves: Array.from({ length: 501 }, (_, i) => mv(i + 1, i + 3, i + 5)) });
  assert.equal(R.realignLimitProblem(many), 'limits');
  assert.equal(R.realignLimitProblem(prop({ shift: 61 })), 'limits');
  assert.equal(R.realignLimitProblem(prop({ shift: 0 })), 'limits');
  assert.equal(R.realignLimitProblem(prop({ removed: Array.from({ length: 61 }, (_, i) => ({ transactionId: `r${i}`, from: ref('credit', i + 1), to: ref('credit', i + 2), description: null, amount: 1 })) })), 'limits');
  assert.equal(R.realignLimitProblem(prop({ moves: [mv(1, 3, 5, { sheet: { description: 'x', type: 'EXPENSE', amount: 0, installment: null } })] })), 'limits');
  assert.equal(R.realignLimitProblem(prop({ moves: [mv(1, 3, 5, { sheet: null })] })), 'limits', 'verified without sheet data');
  assert.equal(R.realignLimitProblem(prop()), null);
  assert.deepEqual(R.defaultRealignSelection([many]), { big: false });
  assert.deepEqual(R.buildRealignDecisions([many, prop()], undefined).map((d: Any) => d.id), ['credit:5:2']);
});

check('RB-h: a re-run keeps the choice of a proposal that is the same, and resets one that changed or is new', () => {
  const prev = [prop(), ambiguousProp];
  const choice = { 'credit:5:2': false, 'debit:8:1': true };
  const changed = prop({ moves: [mv(1, 3, 5), mv(2, 4, 6), mv(9, 5, 7)] });
  const out = R.reconcileRealignSelection(prev, choice, [changed, ambiguousProp, lower]);
  assert.deepEqual(out, { 'credit:5:2': true, 'debit:8:1': true, 'credit:12:3': true });
  const same = R.reconcileRealignSelection(prev, choice, [prop(), ambiguousProp]);
  assert.deepEqual(same, { 'credit:5:2': false, 'debit:8:1': true });
  assert.deepEqual(R.reconcileRealignSelection(prev, choice, []), {});
});

console.log('\n[RC] decisions and payload');

check('RC-a: one decision per proposal, ticked or not, echoing exactly what the server checks again', () => {
  const removal = prop({
    id: 'bills:6:-1', section: 'bills', kind: 'removal', shift: -1, firstLine: 6, lastLine: 7,
    moves: [mv(31, 7, 6, {}, 'bills'), mv(32, 8, 7, { verified: false, sheet: null }, 'bills')],
    removed: [{ transactionId: 'tx-gone', from: ref('bills', 6), to: ref('bills', 8), description: 'Removida', amount: 5 }], insertedRefs: [],
  });
  const decisions = R.buildRealignDecisions([upper, lower, removal], { 'credit:5:2': false, 'credit:12:3': true, 'bills:6:-1': true });
  assert.deepEqual(decisions.map((d: Any) => [d.id, d.apply]), [['credit:5:2', false], ['credit:12:3', true], ['bills:6:-1', true]]);
  assert.deepEqual(decisions[2], {
    id: 'bills:6:-1', apply: true, section: 'bills', shift: -1,
    moves: [
      { transactionId: 'tx-bills-31', from: ref('bills', 7), to: ref('bills', 6), sheetLine: 6, verified: true, sheet: { description: 'Compra 31', type: 'EXPENSE', amount: 310, installment: null } },
      { transactionId: 'tx-bills-32', from: ref('bills', 8), to: ref('bills', 7), sheetLine: 7, verified: false, sheet: null },
    ],
    requires: [], removed: [{ transactionId: 'tx-gone', from: ref('bills', 6), to: ref('bills', 8) }],
  });
  assert.deepEqual(decisions[0].requires, ['credit:12:3']);
  assert.ok(!('removed' in decisions[1]), 'removed is sent only when there is something');
  assert.ok(!('storedDescription' in decisions[1].moves[0]) && !('storedAmount' in decisions[1].moves[0]), 'display fields are not sent');
});

check('RC-b: an installment of the sheet row is echoed as it came', () => {
  const p = prop({ moves: [mv(1, 3, 5, { sheet: { description: 'Curso', type: 'EXPENSE', amount: 99.9, installment: { number: 2, total: 6 } } }), mv(2, 4, 6), mv(3, 5, 7)] });
  assert.deepEqual(R.buildRealignDecisions([p], {})[0].moves[0].sheet, { description: 'Curso', type: 'EXPENSE', amount: 99.9, installment: { number: 2, total: 6 } });
});

check('RC-c: the payload carries the decisions; with no proposal (older server) it has no realignments key and is unchanged', () => {
  const rows = [newRow(20), shiftedRow(5)];
  const withProp = built([prop()], rows);
  assert.deepEqual(withProp.payload.realignments.map((d: Any) => [d.id, d.apply]), [['credit:5:2', true]]);
  const old = built([], rows);
  assert.ok(!('realignments' in old.payload), 'key absent');
  assert.deepEqual(Object.keys(old.payload).sort(), ['accounts', 'categoryMap', 'month', 'options', 'rows']);
  const oldNoField = M.buildConfirmPayload(mkPreview(rows), Object.fromEntries(rows.map((r) => [M.rowKey(r), true])), {}, CONFIRM_CTX);
  assert.deepEqual(oldNoField.payload, old.payload);
  assert.equal(oldNoField.totals.realign.total, 0);
});

check('RC-d: without an explicit selection the defaults are sent; an explicit one wins', () => {
  const rows = [newRow(20)];
  assert.deepEqual(built([prop(), ambiguousProp], rows).payload.realignments.map((d: Any) => d.apply), [true, false]);
  assert.deepEqual(built([prop(), ambiguousProp], rows, { 'credit:5:2': false, 'debit:8:1': true }).payload.realignments.map((d: Any) => d.apply), [false, true]);
});

check('RC-e: a ticked requirement chain is sent coherent: unticking the lower block sends both as apply false', () => {
  const rows = [newRow(20)];
  const sent = built([upper, lower], rows, { 'credit:5:2': true, 'credit:12:3': false });
  assert.deepEqual(sent.payload.realignments.map((d: Any) => [d.id, d.apply]), [['credit:5:2', false], ['credit:12:3', false]]);
  assert.deepEqual(sent.totals.realign, { total: 2, applied: 0, declined: 2, moves: 0 });
});

check('RC-f: shifted rows never go, ticked or not; they are not selectable by default', () => {
  const rows = [shiftedRow(5), shiftedRow(6), newRow(20)];
  const b = built([prop()], rows);
  assert.deepEqual(b.rowsSent.map((r: Any) => r.status), ['new']);
  assert.equal(M.isSendableStatus('shifted'), false);
  assert.equal(M.defaultRowSelected('shifted'), false);
  assert.deepEqual(M.reconcileSelection([], {}, rows), { [M.rowKey(rows[0])]: false, [M.rowKey(rows[1])]: false, [M.rowKey(rows[2])]: true });
  assert.equal(M.toConfirmRow(newRow(20)).replace, undefined);
});

check('RC-g: a new row on a line of a pending block is held back; ticking the block releases it', () => {
  const inserted = newRow(3);
  const other = newRow(20);
  const rows = [inserted, other, shiftedRow(5)];
  const off = built([prop()], rows, { 'credit:5:2': false });
  assert.deepEqual(off.rowsSent.map((r: Any) => r.sourceRef), [ref('credit', 20)]);
  const on = built([prop()], rows, { 'credit:5:2': true });
  assert.deepEqual(on.rowsSent.map((r: Any) => r.sourceRef), [ref('credit', 3), ref('credit', 20)]);
  assert.equal(on.totals.count, 2);
  // Held by a requirement: the lower block is the one unticked, the upper one drops with it.
  const heldByUpper = built([upper, lower], rows, { 'credit:5:2': true, 'credit:12:3': false });
  assert.deepEqual(heldByUpper.rowsSent.map((r: Any) => r.sourceRef), [ref('credit', 20)]);
  // The footer sum follows what is sent.
  assert.equal(off.totals.expenseTotal, 10);
  assert.equal(on.totals.expenseTotal, 20);
});

check('RC-h: only rows that could be sent are held (a changed row on a pending ref is not held by this rule), and the other sections are unaffected', () => {
  const changed = mkRow({ sourceRef: ref('credit', 3), status: 'changed', description: 'x' });
  const debitRow = mkRow({ sourceRef: ref('debit', 3), section: 'debit', description: 'y' });
  const b = built([prop()], [changed, debitRow], { 'credit:5:2': false });
  assert.deepEqual(b.rowsSent.map((r: Any) => r.description), ['x', 'y']);
  assert.equal(R.proposalHoldingRow(newRow(3), [prop()], { 'credit:5:2': false })?.id, 'credit:5:2');
  assert.equal(R.proposalHoldingRow(newRow(3), [prop()], { 'credit:5:2': true }), null);
  assert.equal(R.proposalHoldingRow(changed, [prop()], { 'credit:5:2': false }), null);
  assert.equal(R.proposalHoldingRow(newRow(30), [prop()], { 'credit:5:2': false }), null);
});

check('RC-i: pending refs cover every from, to, removed and inserted ref of the proposals not ticked', () => {
  const removal = prop({ id: 'bills:6:-1', section: 'bills', kind: 'removal', shift: -1, moves: [mv(31, 7, 6, {}, 'bills'), mv(32, 8, 7, {}, 'bills')], removed: [{ transactionId: 'g', from: ref('bills', 6), to: ref('bills', 8), description: null, amount: 1 }], insertedRefs: [] });
  const refs = R.pendingRealignRefs([prop(), removal], { 'credit:5:2': false, 'bills:6:-1': false });
  for (const r of [ref('credit', 3), ref('credit', 4), ref('credit', 5), ref('credit', 6), ref('credit', 7), ref('bills', 6), ref('bills', 7), ref('bills', 8)]) assert.ok(refs.has(r), r);
  assert.equal(R.pendingRealignRefs([prop()], { 'credit:5:2': true }).size, 0);
  assert.equal(R.pendingRealignRefs([], {}).size, 0);
});

check('RC-i2: an inserted ref is held back even when no move starts from it (defensive: the server lists it as a ref of the block)', () => {
  const p = prop({ insertedRefs: [ref('credit', 3), ref('credit', 4), ref('credit', 2)] });
  assert.ok(R.pendingRealignRefs([p], { 'credit:5:2': false }).has(ref('credit', 2)));
  const b = built([p], [newRow(2), newRow(20)], { 'credit:5:2': false });
  assert.deepEqual(b.rowsSent.map((r: Any) => r.sourceRef), [ref('credit', 20)]);
  assert.equal(R.proposalHoldingRow(newRow(2), [p], { 'credit:5:2': false })?.id, 'credit:5:2');
});

check('RC-j: totals count ticked blocks and the transactions they move (moves and removed rows)', () => {
  const removal = prop({ id: 'bills:6:-1', section: 'bills', kind: 'removal', shift: -1, moves: [mv(31, 7, 6, {}, 'bills'), mv(32, 8, 7, {}, 'bills')], removed: [{ transactionId: 'g', from: ref('bills', 6), to: ref('bills', 8), description: null, amount: 1 }], insertedRefs: [] });
  assert.deepEqual(R.realignTotals([prop(), removal, ambiguousProp], undefined), { total: 3, applied: 2, declined: 1, moves: 3 + 3 });
  assert.deepEqual(R.realignTotals([], undefined), { total: 0, applied: 0, declined: 0, moves: 0 });
});

console.log('\n[RD] confirm blocker');

check('RD-a: a confirm that only realigns is allowed; with every block unticked and no rows it is not', () => {
  const only = built([prop()], [shiftedRow(5)], undefined, {});
  assert.equal(only.payload.rows.length, 0);
  assert.equal(only.payload.realignments.length, 1);
  assert.equal(M.confirmBlocker(only, false), null);
  const none = built([prop()], [shiftedRow(5)], { 'credit:5:2': false }, {});
  const blocker = M.confirmBlocker(none, false);
  assert.equal(blocker.code, 'none-selected');
  assert.equal(blocker.message, 'Selecione ao menos uma transação ou um realinhamento.');
});

check('RD-b: without proposals the old message and rule stay', () => {
  const none = built([], [newRow(20)], undefined, {});
  assert.deepEqual(M.confirmBlocker(none, false), { code: 'none-selected', message: 'Selecione ao menos uma transação.' });
  assert.equal(M.confirmBlocker(built([], [newRow(20)]), false), null);
});

check('RD-c: more proposals than the server takes at once block the confirm', () => {
  const many = Array.from({ length: 51 }, (_, i) => prop({ id: `credit:${100 + i}:2`, requires: [] }));
  const b = built(many, [newRow(20)]);
  assert.equal(M.confirmBlocker(b, false).code, 'too-many-realign');
  assert.equal(M.confirmBlocker(built(many.slice(0, 50), [newRow(20)]), false), null);
});

check('RD-d: needs-refresh still comes first', () => {
  assert.equal(M.confirmBlocker(built([prop()], [newRow(20)]), true).code, 'needs-refresh');
});

console.log('\n[RE] counts, cards and texts');

check('RE-a: shifted rows are counted apart, not as unknown; a really unknown status still is', () => {
  const rows = [shiftedRow(5), shiftedRow(6), mkRow({ status: 'brand-new' }), newRow(20)];
  assert.equal(R.countShiftedRows(rows), 2);
  assert.deepEqual(M.countByStatus(rows), { new: 1, duplicate: 0, changed: 0, replacesFuture: 0, legacyDuplicate: 0, matchesRecurring: 0, unknown: 1 });
  assert.equal(R.isShiftedRow(rows[0]), true);
  assert.equal(R.isShiftedRow(rows[3]), false);
});

check('RE-b: the card of an insertion says how many move, by how much, and what enters only afterwards', () => {
  const v = R.realignCardView([prop()], {}, 'credit:5:2');
  assert.equal(v.sectionLabel, 'Cartão');
  assert.equal(v.range, 'linhas 5 a 7 da planilha');
  assert.equal(v.movesText, '3 lançamentos descem 2 linhas (linhas inseridas acima)');
  assert.equal(v.insertedText, '2 linhas novas só entram depois deste realinhamento');
  assert.equal(v.removedText, null);
  assert.equal(v.checked, true);
  assert.equal(v.tickDisabled, false);
  assert.equal(v.ambiguous, false);
  assert.equal(v.ambiguousText, null);
});

check('RE-c: singular forms and a removal card (what leaves the sheet stays in the ledger)', () => {
  const one = R.realignCardView([prop({ shift: 1, moves: [mv(1, 4, 5)], insertedRefs: [ref('credit', 4)] })], {}, 'credit:5:2');
  assert.equal(one.movesText, '1 lançamento desce 1 linha (linhas inseridas acima)');
  assert.equal(one.insertedText, '1 linha nova só entra depois deste realinhamento');
  const removal = prop({ id: 'bills:6:-2', section: 'bills', kind: 'removal', shift: -2, moves: [mv(31, 8, 6, {}, 'bills'), mv(32, 9, 7, {}, 'bills')], removed: [{ transactionId: 'g', from: ref('bills', 6), to: ref('bills', 9), description: 'Velha', amount: 5 }], insertedRefs: [] });
  const v = R.realignCardView([removal], {}, 'bills:6:-2');
  assert.equal(v.movesText, '2 lançamentos sobem 2 linhas (linhas removidas acima)');
  assert.equal(v.removedText, '1 lançamento removido da planilha continua no Prumo e assume a linha que o bloco desocupa');
  assert.equal(v.insertedText, null);
  assert.equal(R.realignCardView([removal], {}, 'bills:6:-2').sectionLabel, 'Contas fixas');
});

check('RE-d: an ambiguous card comes unticked with the reason of the server', () => {
  const v = R.realignCardView([ambiguousProp], {}, 'debit:8:1');
  assert.equal(v.checked, false);
  assert.equal(v.ambiguous, true);
  assert.equal(v.ambiguousText, 'Vem desmarcada: há linhas iguais lado a lado (mesma descrição e valor)');
  assert.equal(v.tickDisabled, false, 'the user may still tick it');
  assert.equal(R.realignCardView([ambiguousProp], { 'debit:8:1': true }, 'debit:8:1').checked, true);
});

check('RE-e: a card that requires another says so, and cannot be ticked until the requirement is', () => {
  const off = { 'credit:5:2': false, 'credit:12:3': false };
  const v = R.realignCardView([upper, lower], off, 'credit:5:2');
  assert.equal(v.requiresText, 'Precisa ser aplicado junto com: Cartão, linhas 12 a 14');
  assert.equal(v.tickFirstText, 'Marque antes: Cartão, linhas 12 a 14');
  assert.equal(v.tickDisabled, true);
  assert.equal(v.unavailableText, null);
  const on = R.realignCardView([upper, lower], { 'credit:5:2': false, 'credit:12:3': true }, 'credit:5:2');
  assert.equal(on.tickDisabled, false);
  assert.equal(on.tickFirstText, null);
  assert.equal(R.realignCardView([upper, lower], off, 'credit:12:3').requiresText, null);
  const missing = R.realignCardView([upper], {}, 'credit:5:2');
  assert.equal(missing.unavailableText, 'Depende de um bloco que não veio na prévia: não dá para aplicar.');
  assert.equal(missing.tickDisabled, true);
  assert.equal(missing.tickFirstText, null);
  assert.equal(R.realignCardView([prop()], {}, 'nope'), null);
});

check('RE-f: the footer says what is realigned and what stays pending', () => {
  assert.deepEqual(R.realignFooterLines({ total: 0, applied: 0, declined: 0, moves: 0 }), []);
  assert.deepEqual(R.realignFooterLines({ total: 3, applied: 2, declined: 1, moves: 7 }), [
    '2 blocos serão realinhados (7 lançamentos mudam de linha)',
    '1 bloco deslocado ficará pendente: nada nele será importado nem substituído',
  ]);
  assert.deepEqual(R.realignFooterLines({ total: 1, applied: 1, declined: 0, moves: 1 }), ['1 bloco será realinhado (1 lançamento muda de linha)']);
  assert.deepEqual(R.realignFooterLines({ total: 2, applied: 0, declined: 2, moves: 0 }), ['2 blocos deslocados ficarão pendentes: nada neles será importado nem substituído']);
});

check('RE-g: the cards are written in English with the en-US texts and fall back to Portuguese for a missing key', () => {
  const en = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'));
  const tx = T.realignTextFor(en);
  const v = R.realignCardView([prop()], {}, 'credit:5:2', tx);
  assert.equal(v.movesText, '3 transactions move down 2 lines (lines inserted above)');
  assert.equal(v.range, 'lines 5 to 7 of the sheet');
  assert.equal(R.realignFooterLines({ total: 1, applied: 1, declined: 0, moves: 1 }, tx)[0], '1 block will be realigned (1 transaction changes line)');
  const partial = T.realignTextFor({ maxfinRealignApply: 'Realign' });
  assert.equal(partial('maxfinRealignApply'), 'Realign');
  assert.equal(partial('maxfinRealignNote'), T.MAXFIN_REALIGN_TEXTS_PT.maxfinRealignNote, 'falls back');
  assert.equal(T.maxfinRealignText(null, 'maxfinRealignTooMany', { max: 50 }), 'Há mais blocos deslocados do que o servidor aceita por vez (50): atualize a pré-visualização.');
});

check('RE-h: the explanation says values, dates and descriptions do not change, only the position', () => {
  const pt = T.MAXFIN_REALIGN_TEXTS_PT.maxfinRealignNote;
  for (const word of ['posição', 'valores', 'datas', 'descrições']) assert.ok(pt.includes(word), word);
  const en = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8')).maxfinRealignNote;
  for (const word of ['position', 'values', 'dates', 'descriptions']) assert.ok(en.includes(word), word);
});

console.log('\n[RF] result');

const result = (o: Record<string, Any> = {}): Any => ({
  imported: 2, skipped: 0, replaced: 0, consumedFutureInstallments: 0, futureInstallments: 0, createdCategories: [], invoicePayment: null, ids: [], warnings: [], ...o,
});

check('RF-a: the summary counts the realigned transactions; an older response and zero add nothing', () => {
  const fmt = (v: number) => `R$ ${v}`;
  assert.equal(M.buildConfirmSummary(result(), fmt), '2 transações importadas.');
  assert.equal(M.buildConfirmSummary(result({ realigned: 0, realignments: [] }), fmt), '2 transações importadas.');
  assert.equal(M.buildConfirmSummary(result({ realigned: 7 }), fmt), '2 transações importadas, 7 lançamentos realinhados.');
  assert.equal(M.buildConfirmSummary(result({ realigned: 1, skipped: 1 }), fmt), '2 transações importadas, 1 lançamento realinhado, 1 linha ignorada.');
  const en = T.realignTextFor(JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8')));
  assert.ok(M.buildConfirmSummary(result({ realigned: 7 }), fmt, en).includes('7 transactions realigned'));
});

check('RF-b: one line per decision, with its block, status and (for a block not applied) the reason of the server', () => {
  const decisions = R.buildRealignDecisions([upper, lower, ambiguousProp], { 'credit:5:2': false, 'credit:12:3': true, 'debit:8:1': false });
  const lines = R.realignOutcomeLines([
    { id: 'credit:12:3', status: 'applied', moved: 6, reason: null },
    { id: 'credit:5:2', status: 'skipped', moved: 0, reason: 'depende do bloco credit:12:3, que não foi aplicado' },
    { id: 'debit:8:1', status: 'declined', moved: 0, reason: 'bloco deixado pendente por escolha: nada nele foi alterado' },
    { id: 'credit:99:1', status: 'already-applied', moved: 0, reason: null },
    { id: 'x', status: 'something-new', moved: 0, reason: null },
  ], decisions);
  assert.deepEqual(lines, [
    'Cartão, linhas 12 a 14: Realinhado (6)',
    'Cartão, linhas 5 a 7: Não aplicado. depende do bloco credit:12:3, que não foi aplicado',
    'Débito/pix, linhas 8 a 9: Deixado pendente. bloco deixado pendente por escolha: nada nele foi alterado',
    'Bloco credit:99:1: Já estava realinhado',
    'Bloco x: Resultado desconhecido',
  ]);
  assert.deepEqual(R.realignOutcomeLines(undefined, decisions), []);
  assert.deepEqual(R.realignOutcomeLines([], decisions), []);
});

check('RF-c: the result stays open for every decision the server answered (to show each block), and for nothing on an older server', () => {
  const ok = [{ id: 'a', status: 'applied', moved: 3, reason: null }, { id: 'b', status: 'already-applied', moved: 0, reason: null }];
  assert.equal(M.confirmResultNeedsReview(result({ realignments: ok })), true);
  assert.equal(M.confirmResultNeedsReview(result({ realignments: [] })), false);
  assert.equal(M.confirmResultNeedsReview(result()), false, 'older server');
  assert.equal(M.confirmResultNeedsReview(result({ realignments: [...ok, { id: 'c', status: 'skipped', moved: 0, reason: 'x' }] })), true);
  assert.equal(M.confirmResultNeedsReview(result({ realignments: [{ id: 'c', status: 'declined', moved: 0, reason: 'x' }] })), true);
  assert.equal(M.confirmResultNeedsReview(result({ realignments: [{ id: 'c', status: 'weird', moved: 0, reason: null }] })), true);
  assert.equal(M.confirmResultNeedsReview(result({ warnings: ['w'] })), true, 'warnings still count');
  assert.equal(R.realignResultNeedsReview(undefined), false);
});

check('RF-d: the transactions a block moves are listed with their lines, description and amount', () => {
  const removal = prop({ id: 'bills:6:-1', section: 'bills', kind: 'removal', shift: -1, moves: [mv(31, 7, 6, {}, 'bills')], removed: [{ transactionId: 'g', from: ref('bills', 6), to: ref('bills', 8), description: null, amount: 5 }], insertedRefs: [] });
  const lines = R.realignMoveLines(removal, (v: number) => `R$ ${v.toFixed(2)}`);
  assert.deepEqual(lines.map((l: Any) => l.text), ['Linha 7 → 6: Compra 31 · R$ 310.00', 'Linha 6 → 8: — · R$ 5.00']);
  assert.equal(new Set(lines.map((l: Any) => l.key)).size, 2);
  assert.equal(R.realignMoveLines(prop(), (v: number) => String(v), T.realignTextFor(JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'))))[0].text, 'Line 3 → 5: Compra 1 · 10');
});

check('RF-e: a shifted row says where it is and where it goes; without a proposal that moves it, nothing (the server text is used)', () => {
  assert.equal(R.shiftedRowDetail(shiftedRow(5), [prop()]), 'Mesmo lançamento que está hoje na linha 3; vai para a linha 5 ao realinhar');
  assert.equal(R.shiftedRowDetail(shiftedRow(30), [prop()]), null);
  assert.equal(R.shiftedRowDetail(newRow(5), [prop()]), null, 'only shifted rows');
});

console.log('\n[RG] workbook');

const month = (key: string, rows: Any[], proposals: Any[] | undefined, o: Record<string, Any> = {}): Any => {
  const [year, m] = key.split('-').map(Number);
  return mkPreview(rows, { month: { year, month: m }, monthKey: key, monthSource: 'sheet', ...(proposals ? { realignments: proposals } : {}), ...o });
};
const tick = (rows: Any[]): Record<string, boolean> => Object.fromEntries(rows.map((r) => [M.rowKey(r), true]));

check('RG-a: a month with only a ticked realignment is a step (no rows); one with every block unticked and no rows is empty', () => {
  const rowsA = [shiftedRow(5)];
  const rowsB = [shiftedRow(5)];
  const wb = { months: [month('2026-08', rowsA, [prop()]), month('2026-09', rowsB, [prop()])] };
  const plan = W.buildWorkbookPlan(wb, { '2026-08': tick(rowsA), '2026-09': tick(rowsB) }, {}, CONFIRM_CTX, { '2026-09': { 'credit:5:2': false } });
  assert.deepEqual(plan.steps.map((s: Any) => s.monthKey), ['2026-08']);
  assert.equal(plan.steps[0].payload.rows.length, 0);
  assert.deepEqual(plan.steps[0].payload.realignments.map((d: Any) => [d.id, d.apply]), [['credit:5:2', true]]);
  assert.deepEqual(plan.totals.emptyMonths, ['setembro/2026']);
  assert.equal(plan.totals.realignBlocks, 1);
  assert.equal(plan.totals.realignMoves, 3);
  assert.equal(plan.totals.realignPending, 1, 'the unticked block of the other month stays pending');
  assert.equal(W.workbookConfirmBlocker(plan, false), null);
});

check('RG-b: each month is sent with its own decisions and its own held rows; months without proposals are unchanged', () => {
  const rowsA = [newRow(3), newRow(20)];
  const rowsB = [newRow(30)];
  const wb = { months: [month('2026-08', rowsA, [prop()]), month('2026-09', rowsB, undefined)] };
  const plan = W.buildWorkbookPlan(wb, { '2026-08': tick(rowsA), '2026-09': tick(rowsB) }, {}, CONFIRM_CTX, { '2026-08': { 'credit:5:2': false } });
  assert.deepEqual(plan.steps[0].payload.rows.map((r: Any) => r.sourceRef), [ref('credit', 20)]);
  assert.equal(plan.steps[0].payload.realignments[0].apply, false);
  assert.ok(!('realignments' in plan.steps[1].payload));
  const defaults = W.buildWorkbookPlan(wb, { '2026-08': tick(rowsA), '2026-09': tick(rowsB) }, {}, CONFIRM_CTX);
  assert.deepEqual(defaults.steps[0].payload.rows.map((r: Any) => r.sourceRef), [ref('credit', 3), ref('credit', 20)]);
});

check('RG-c: the blocker for too many blocks applies to the workbook too', () => {
  const many = Array.from({ length: 51 }, (_, i) => prop({ id: `credit:${100 + i}:2` }));
  const rows = [newRow(20)];
  const plan = W.buildWorkbookPlan({ months: [month('2026-09', rows, many)] }, { '2026-09': tick(rows) }, {}, CONFIRM_CTX);
  assert.equal(W.workbookConfirmBlocker(plan, false).code, 'too-many-realign');
});

check('RG-d: the run summary counts the realigned transactions and lists each block, prefixed with its month', () => {
  const rows = [newRow(20)];
  const wb = { months: [month('2026-08', rows, [upper, lower]), month('2026-09', rows, undefined)] };
  const plan = W.buildWorkbookPlan(wb, { '2026-08': tick(rows), '2026-09': tick(rows) }, {}, CONFIRM_CTX);
  const fmt = (v: number) => `R$ ${v}`;
  const results = [
    result({ realigned: 9, realignments: [{ id: 'credit:5:2', status: 'applied', moved: 3, reason: null }, { id: 'credit:12:3', status: 'skipped', moved: 0, reason: 'a referência já está em uso' }] }),
    result({ imported: 1 }),
  ];
  const s = W.summarizeWorkbookRun(plan.steps, results, null, fmt);
  assert.equal(s.realigned, 9);
  assert.deepEqual(s.months[0].realignLines, [
    'agosto/2026: Cartão, linhas 5 a 7: Realinhado (3)',
    'agosto/2026: Cartão, linhas 12 a 14: Não aplicado. a referência já está em uso',
  ]);
  assert.deepEqual(s.months[1].realignLines, []);
  assert.equal(s.needsReview, true);
  assert.ok(s.months[0].line.includes('9 lançamentos realinhados'));
  assert.ok(W.workbookRunToast(s).includes('9 lançamentos realinhados'));
  assert.deepEqual(s.totals, { imported: 3, replaced: 0, assumedRecurring: 0, skipped: 0, invoices: 0, invoiceCents: 0 });
  const plain = W.summarizeWorkbookRun(plan.steps, [result(), result()], null, fmt);
  assert.equal(plain.realigned, 0);
  assert.equal(plain.needsReview, false);
  assert.ok(!W.workbookRunToast(plain).includes('realinhado'));
  const failed = W.summarizeWorkbookRun(plan.steps, [], { reason: 'x' }, fmt);
  assert.deepEqual(failed.months.map((m: Any) => m.realignLines), [[], []]);
});

check('RG-e: proposals and ticks are kept per month across a re-run', () => {
  const m1 = month('2026-08', [], [prop(), ambiguousProp]);
  const m2 = month('2026-09', [], undefined);
  const prevProposals = W.proposalsByMonth({}, [m1, m2]);
  assert.deepEqual(prevProposals['2026-08'].map((p: Any) => p.id), ['credit:5:2', 'debit:8:1']);
  assert.deepEqual(prevProposals['2026-09'], []);
  const prevSel = { '2026-08': { 'credit:5:2': false, 'debit:8:1': true } };
  const next = W.reconcileWorkbookRealign(prevProposals, prevSel, [m1, m2]);
  assert.deepEqual(next['2026-08'], { 'credit:5:2': false, 'debit:8:1': true });
  assert.deepEqual(next['2026-09'], {});
  const gone = W.reconcileWorkbookRealign(prevProposals, prevSel, [m2]);
  assert.deepEqual(gone['2026-08'], prevSel['2026-08'], 'a month that left keeps its choices');
});

console.log('\n[RH] i18n');

const ptJson = JSON.parse(readFileSync(frontSrc('i18n/pt-BR.json'), 'utf8'));
const enJson = JSON.parse(readFileSync(frontSrc('i18n/en-US.json'), 'utf8'));
const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

check('RH-a: every key is in pt-BR.json (same text as the default) and in en-US.json (different text, same placeholders)', () => {
  for (const [key, text] of Object.entries(T.MAXFIN_REALIGN_TEXTS_PT) as Array<[string, string]>) {
    assert.equal(ptJson[key], text, `pt-BR.json ${key}`);
    assert.equal(typeof enJson[key], 'string', `en-US.json lacks ${key}`);
    // A text that is only placeholders and punctuation is the same in both languages.
    if (/\p{L}/u.test(text.replace(/\{\w+\}/g, ''))) assert.notEqual(enJson[key], text, `en-US.json ${key} is still Portuguese`);
    assert.deepEqual(placeholders(enJson[key]), placeholders(text), `${key} placeholders`);
  }
});

check('RH-b: every key is declared in the Translations type (I18nContext.tsx)', () => {
  const source = readFileSync(frontSrc('context/I18nContext.tsx'), 'utf8');
  for (const key of Object.keys(T.MAXFIN_REALIGN_TEXTS_PT)) assert.match(source, new RegExp(`^\\s+${key}\\??: string;`, 'm'), `Translations lacks ${key}`);
});

check('RH-c: the Portuguese texts are accented', () => {
  const all = Object.values(T.MAXFIN_REALIGN_TEXTS_PT).join(' | ') as string;
  for (const word of ['lançamento', 'descem', 'não', 'posição', 'ambígua'.replace('ambígua', 'Ambígua'), 'pré-visualização', 'descrições', 'Já estava']) assert.ok(all.includes(word), word);
  for (const bad of ['lancamento', 'nao ', 'posicao', 'descricoes', 'pre-visualizacao', 'Ja estava', 'Ambigua']) assert.ok(!all.includes(bad), bad);
});

check('RH-d: the dialog wires the new parts (status chip, cards, no checkbox for shifted rows, decisions in the request)', () => {
  const dialog = readFileSync(frontSrc('components/ImportMaxFinDialog.tsx'), 'utf8');
  for (const needle of ['shifted:', 'RealignPanel', 'realignCardView', 'toggleRealign', 'realignSelection', 'realignOutcomeLines']) assert.ok(dialog.includes(needle), needle);
});
