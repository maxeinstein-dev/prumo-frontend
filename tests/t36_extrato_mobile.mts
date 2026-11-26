import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Extrato mobile (lote R1): pure logic of the Extrato below 768 px. Invented data only.
// EXTRATO_MOBILE_MODULE points the suite at a mutated copy of utils/extratoMobile.ts.
const exPath = process.env.EXTRATO_MOBILE_MODULE || frontSrc('utils/extratoMobile.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const X: any = await import(pathToFileURL(exPath).href);

console.log('\n[extrato mobile] utils/extratoMobile.ts');

check('monthBounds: the selected month goes from its first day 00:00 to its last day 23:59:59.999 (local time)', () => {
  const { startDate, endDate } = X.monthBounds('2026-02');
  assert.equal(startDate.getFullYear(), 2026);
  assert.equal(startDate.getMonth(), 1);
  assert.equal(startDate.getDate(), 1);
  assert.equal(startDate.getHours(), 0);
  assert.equal(endDate.getMonth(), 1);
  assert.equal(endDate.getDate(), 28); // 2026 is not a leap year
  assert.equal(endDate.getHours(), 23);
  assert.equal(endDate.getMinutes(), 59);
});

check('monthBounds: a December month ends on the 31st, not in the next year', () => {
  const { endDate } = X.monthBounds('2026-12');
  assert.equal(endDate.getFullYear(), 2026);
  assert.equal(endDate.getMonth(), 11);
  assert.equal(endDate.getDate(), 31);
});

check('dayKeyOf: YYYY-MM-DD in local time, zero-padded', () => {
  assert.equal(X.dayKeyOf(new Date(2026, 10, 5, 22, 30)), '2026-11-05');
});

check('dayLabel: "Hoje" and "Ontem" for today and yesterday, otherwise weekday and day with month', () => {
  assert.equal(X.dayLabel('2026-11-12', '2026-11-12'), 'Hoje');
  assert.equal(X.dayLabel('2026-11-11', '2026-11-12'), 'Ontem');
  // 2026-11-10 is a Tuesday
  // Only the first letter is capital: the case is decided here, not by CSS
  assert.equal(X.dayLabel('2026-11-10', '2026-11-12'), 'Terça, 10 nov');
  assert.equal(X.dayLabel('2026-10-03', '2026-11-12'), 'Sábado, 3 out');
  assert.equal(X.dayLabel('2026-11-09', '2026-11-12'), 'Segunda, 9 nov');
});

check('signedAmount: income is positive, expense negative, transfers and allocations count as zero', () => {
  assert.equal(X.signedAmount('INCOME', 150), 150);
  assert.equal(X.signedAmount('EXPENSE', 42.5), -42.5);
  assert.equal(X.signedAmount('EXPENSE', -10), -10);
  assert.equal(X.signedAmount('TRANSFER', 300), 0);
  assert.equal(X.signedAmount('ALLOCATION', 300), 0);
});

check('groupByDay: newest day first, rows keep their order, each day has its signed total', () => {
  const rows = [
    { id: 'a', dayKey: '2026-11-10', amount: -20 },
    { id: 'b', dayKey: '2026-11-12', amount: -5 },
    { id: 'c', dayKey: '2026-11-12', amount: 100 },
    { id: 'd', dayKey: '2026-11-10', amount: -30 },
  ];
  const groups = X.groupByDay(rows);
  assert.deepEqual(groups.map((g: { dayKey: string }) => g.dayKey), ['2026-11-12', '2026-11-10']);
  assert.deepEqual(groups[0].items.map((r: { id: string }) => r.id), ['b', 'c']);
  assert.equal(groups[0].total, 95);
  assert.equal(groups[1].total, -50);
});

check('groupByDay: no rows, no groups', () => {
  assert.deepEqual(X.groupByDay([]), []);
});

check('matchesShortFilter: Todos keeps all; Despesas and Receitas by sign of the type; No cartão by the account', () => {
  const expense = { type: 'EXPENSE', onCard: false };
  const income = { type: 'INCOME', onCard: false };
  const card = { type: 'EXPENSE', onCard: true };
  assert.equal(X.matchesShortFilter(expense, 'todos'), true);
  assert.equal(X.matchesShortFilter(income, 'todos'), true);
  assert.equal(X.matchesShortFilter(expense, 'despesas'), true);
  assert.equal(X.matchesShortFilter(income, 'despesas'), false);
  assert.equal(X.matchesShortFilter(income, 'receitas'), true);
  assert.equal(X.matchesShortFilter(expense, 'receitas'), false);
  assert.equal(X.matchesShortFilter(card, 'cartao'), true);
  assert.equal(X.matchesShortFilter(expense, 'cartao'), false);
});

check('captureVisibleCount: collapsed shows the first capture; open shows all; the rest is counted', () => {
  assert.deepEqual(X.captureVisibleCount(0, false), { visible: 0, rest: 0 });
  assert.deepEqual(X.captureVisibleCount(1, false), { visible: 1, rest: 0 });
  assert.deepEqual(X.captureVisibleCount(4, false), { visible: 1, rest: 3 });
  assert.deepEqual(X.captureVisibleCount(4, true), { visible: 4, rest: 0 });
});

check('rowActions: a read-only row offers only "Ver detalhes"', () => {
  assert.deepEqual(X.rowActions({ paid: false, readOnly: true, canConfirm: true, canSplit: true }), ['view']);
});

check('rowActions: a pending row that can be confirmed offers Confirmar in place of Marcar como pago', () => {
  assert.deepEqual(X.rowActions({ paid: false, readOnly: false, canConfirm: true, canSplit: false }), ['view', 'confirm', 'edit', 'delete']);
});

check('rowActions: a pending row that cannot be confirmed (transfer) offers Marcar como pago', () => {
  assert.deepEqual(X.rowActions({ paid: false, readOnly: false, canConfirm: false, canSplit: false }), ['view', 'markAsPaid', 'edit', 'delete']);
});

check('rowActions: a paid row offers Marcar como pendente; Dividir comes before Excluir when allowed', () => {
  assert.deepEqual(X.rowActions({ paid: true, readOnly: false, canConfirm: false, canSplit: false }), ['view', 'markAsPending', 'edit', 'delete']);
  assert.deepEqual(X.rowActions({ paid: true, readOnly: false, canConfirm: false, canSplit: true }), ['view', 'markAsPending', 'edit', 'split', 'delete']);
  assert.deepEqual(X.rowActions({ paid: false, readOnly: false, canConfirm: true, canSplit: true }), ['view', 'confirm', 'edit', 'split', 'delete']);
});

check('captureLineMeta: type, account and time joined with a dot; an empty part is left out', () => {
  assert.equal(X.captureLineMeta('Despesa', 'Conta teste A', '12/11/2026 12:00'), 'Despesa · Conta teste A · 12/11/2026 12:00');
  assert.equal(X.captureLineMeta('Receita', null, '11/11/2026 09:30'), 'Receita · 11/11/2026 09:30');
  assert.equal(X.captureLineMeta('Despesa', '', ''), 'Despesa');
});

// Caixa de capturas: sinal do valor. Uma captura sem tipo (transferência entre contas) não é despesa.
check('captureAmountSign: income is "+", expense is "−", an unknown type has no sign', () => {
  assert.equal(X.captureAmountSign('INCOME'), '+');
  assert.equal(X.captureAmountSign('EXPENSE'), '−');
  assert.equal(X.captureAmountSign(null), '');
  assert.equal(X.captureAmountSign(undefined), '');
});
