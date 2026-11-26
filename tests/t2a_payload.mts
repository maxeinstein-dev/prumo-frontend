import assert from 'node:assert/strict';
import { CONFIRM_CTX, M, OPEN, check, mkPreview, show } from './harness.mts';
import { all, built, categoryMap, curso, internet, k, mystery, netflix, preview, selected, sentNames } from './fx2.mts';

console.log('\n[N1/F7] buildConfirmPayload: rows, replace flags, totals');

check('payload.rows.length === rowsSent.length and the rows are the expected ones', () => {
  show('rowsSent', sentNames);
  assert.equal(built.payload.rows.length, built.rowsSent.length);
  assert.deepEqual(sentNames, ['Salario', 'Freela', 'Farmacia', 'Internet', 'Curso 2/12', 'Posto']);
});

check('duplicates and unknown statuses are excluded even when ticked', () => {
  assert.ok(!sentNames.includes('Netflix'));
  assert.ok(!sentNames.includes('Mystery'));
  const refs = built.payload.rows.map((r: { sourceRef: string }) => r.sourceRef);
  assert.ok(!refs.includes(netflix.sourceRef) && !refs.includes(mystery.sourceRef));
});

check('replace is set only for changed / replaces-future rows', () => {
  const byRef = new Map(all.map((r) => [r.sourceRef, r.status]));
  const view = built.payload.rows.map((r: { sourceRef: string; description: string; replace?: boolean }) => [r.description, byRef.get(r.sourceRef), r.replace]);
  show('[description, status, replace]', view);
  for (const r of built.payload.rows) {
    const status = byRef.get(r.sourceRef);
    const expects = status === 'changed' || status === 'replaces-future';
    assert.equal('replace' in r, expects, `${r.description} (${status})`);
    if (expects) assert.equal(r.replace, true);
  }
});

check('receitas and despesas totals are separate (no mixed sum)', () => {
  const t = built.totals;
  show('totals', { ...t, invoice: undefined });
  assert.equal(t.incomeCount, 2);
  assert.equal(t.incomeTotal, 6200.3);
  assert.equal(t.expenseCount, 4);
  assert.equal(t.expenseTotal, 89.9 + 120 + 200 + 80);
  assert.equal(t.count, 6);
  assert.ok(!('total' in t) && !('sum' in t), 'no single mixed total is exposed');
});

check('replacements = ticked changed + ticked replaces-future (legacy-duplicate does not count)', () => {
  assert.equal(built.totals.replacements, 2); // Internet (changed) + Curso (replaces-future)
  const noInternet = M.buildConfirmPayload(preview, { ...selected, [k(internet)]: false }, {}, CONFIRM_CTX);
  assert.equal(noInternet.totals.replacements, 1);
  const none = M.buildConfirmPayload(preview, { ...selected, [k(internet)]: false, [k(curso)]: false }, {}, CONFIRM_CTX);
  assert.equal(none.totals.replacements, 0);
});

check('options come from preview.options (open month -> no invoice; closed month -> 280.00)', () => {
  const open = mkPreview(all, { categoryMap, options: OPEN });
  const b = M.buildConfirmPayload(open, selected, {}, CONFIRM_CTX);
  assert.deepEqual(b.payload.options, OPEN);
  assert.equal(b.totals.invoice.willPay, false);
  assert.equal(b.totals.invoice.reason, 'mês aberto');
  assert.deepEqual(built.payload.options, preview.options);
  show('invoice (closed month)', { cents: built.totals.invoice.cents, willPay: built.totals.invoice.willPay });
  assert.equal(built.totals.invoice.cents, 28000); // Curso 200 + Posto 80 (credit rows sent)
  assert.equal(built.totals.invoice.willPay, true);
});

check('payload is null while the month is unknown, but rows and totals are still computed', () => {
  const noMonth = M.buildConfirmPayload(mkPreview(all, { categoryMap, month: null }), selected, {}, CONFIRM_CTX);
  assert.equal(noMonth.payload, null);
  assert.equal(noMonth.rowsSent.length, 6);
  assert.equal(M.confirmBlocker(noMonth, false).code, 'no-month');
});
