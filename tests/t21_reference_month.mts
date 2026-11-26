import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Reference month (competencia) and "Confirmar recebimento": utils/referenceMonth.ts and utils/confirmReceipt.ts.
// REFERENCE_MONTH_MODULE / CONFIRM_RECEIPT_MODULE point at mutated copies (bite-checks). Invented data only.
const rmPath = process.env.REFERENCE_MONTH_MODULE || frontSrc('utils/referenceMonth.ts');
const crPath = process.env.CONFIRM_RECEIPT_MODULE || frontSrc('utils/confirmReceipt.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = await import(pathToFileURL(rmPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(crPath).href);

console.log('\n[reference month] utils/referenceMonth.ts');

check('effective month: the reference month when set, else the month of the date (local Date or string)', () => {
  assert.equal(R.effectiveMonthOf({ date: new Date(2026, 8, 25) }), '2026-09');
  assert.equal(R.effectiveMonthOf({ date: new Date(2026, 8, 25), competenceMonth: null }), '2026-09');
  assert.equal(R.effectiveMonthOf({ date: new Date(2026, 8, 25), competenceMonth: '2026-10' }), '2026-10');
  assert.equal(R.effectiveMonthOf({ date: '2026-12-31T00:00:00.000Z', competenceMonth: '2027-01' }), '2027-01');
  assert.equal(R.effectiveMonthOf({ date: '2026-12-31' }), '2026-12');
  assert.equal(R.effectiveMonthOf({ date: new Date(2026, 8, 25), competenceMonth: 'lixo' }), '2026-09', 'a malformed month is ignored');
});

check('chip "ref. MM/YYYY" only when the effective month differs from the date month; never for transfers', () => {
  assert.equal(R.referenceChip({ date: new Date(2026, 8, 25), competenceMonth: '2026-10', type: 'INCOME' }), 'ref. 10/2026');
  assert.equal(R.referenceChip({ date: new Date(2026, 8, 25), competenceMonth: '2026-09', type: 'INCOME' }), null);
  assert.equal(R.referenceChip({ date: new Date(2026, 8, 25), competenceMonth: null }), null);
  assert.equal(R.referenceChip({ date: new Date(2026, 8, 25) }), null);
  assert.equal(R.referenceChip({ date: new Date(2026, 8, 25), competenceMonth: '2026-10', type: 'TRANSFER' }), null);
  assert.equal(R.referenceChip({ date: new Date(2026, 11, 28), competenceMonth: '2027-01', type: 'EXPENSE' }), 'ref. 01/2027');
});

check('month arithmetic crosses the year; default reference month is the month after the date', () => {
  assert.equal(R.addMonthsKey('2026-12', 1), '2027-01');
  assert.equal(R.addMonthsKey('2026-01', -1), '2025-12');
  assert.equal(R.monthsBetween('2026-10', '2028-10'), 24);
  assert.equal(R.defaultReferenceMonth(new Date(2026, 8, 25)), '2026-10');
  assert.equal(R.defaultReferenceMonth('2026-12-25'), '2027-01');
});

check('validation: YYYY-MM within 24 months of the date; competenceToSend: off = null (clears), invalid = undefined', () => {
  const date = new Date(2026, 8, 25);
  assert.equal(R.referenceMonthError('2026-10', date), null);
  assert.equal(R.referenceMonthError('2028-09', date), null);
  assert.match(R.referenceMonthError('2028-10', date), /24 meses/);
  assert.match(R.referenceMonthError('2024-08', date), /24 meses/);
  assert.match(R.referenceMonthError('', date), /Informe/);
  assert.match(R.referenceMonthError('2026-13', date), /Informe/);
  assert.equal(R.competenceToSend(false, '2026-10', date), null);
  assert.equal(R.competenceToSend(true, '2026-10', date), '2026-10');
  assert.equal(R.competenceToSend(true, '2040-01', date), undefined);
});

check('recurrence offset: options, select round trip, "mesmo mês" is stored as null, chip, occurrence month', () => {
  assert.deepEqual(R.OFFSET_OPTIONS.map((o: { value: number }) => o.value), [0, 1, 2]);
  assert.equal(R.offsetLabel(1), 'Mês seguinte');
  assert.equal(R.offsetLabel(2), 'Em 2 meses');
  assert.equal(R.offsetLabel(null), 'Mesmo mês');
  assert.equal(R.offsetFromSelect(''), null);
  assert.equal(R.offsetFromSelect('1'), 1);
  assert.equal(R.offsetFromSelect('13'), null);
  assert.equal(R.offsetToSend(0), null);
  assert.equal(R.offsetToSend(null), null);
  assert.equal(R.offsetToSend(1), 1);
  assert.equal(R.offsetToSend(12), 12);
  assert.equal(R.offsetToSend(13), null);
  assert.equal(R.recurrenceChip(1), 'ref. mês seguinte');
  assert.equal(R.recurrenceChip(0), null);
  assert.equal(R.occurrenceCompetence('2026-12-25', 1), '2027-01');
  assert.equal(R.occurrenceCompetence('2026-12-25', null), null);
});

console.log('\n[confirm receipt] utils/confirmReceipt.ts');

const TODAY = new Date(2026, 9, 6);
const voucher = (o: Record<string, unknown> = {}) => ({ id: 'tx-1', type: 'INCOME', amount: 600, date: new Date(2026, 8, 25), paid: false, notes: null, ...o });

check('only pending income/expense can be confirmed; due = expected day today or earlier; the list is oldest first', () => {
  assert.equal(C.isConfirmable(voucher()), true);
  assert.equal(C.isConfirmable(voucher({ paid: true })), false);
  assert.equal(C.isConfirmable(voucher({ paid: undefined })), false);
  assert.equal(C.isConfirmable(voucher({ type: 'TRANSFER' })), false);
  assert.equal(C.isConfirmable(voucher({ id: undefined })), false);
  assert.equal(C.isDueToConfirm(voucher({ date: new Date(2026, 9, 6) }), TODAY), true, 'today counts');
  assert.equal(C.isDueToConfirm(voucher({ date: new Date(2026, 9, 7) }), TODAY), false, 'tomorrow does not');
  const list = C.dueToConfirm([voucher({ id: 'b', date: '2026-10-02' }), voucher({ id: 'a', date: '2026-09-25' }), voucher({ id: 'c', date: '2026-10-09' }), voucher({ id: 'd', paid: true, date: '2026-09-01' })], TODAY);
  assert.deepEqual(list.map((r: { id: string }) => r.id), ['a', 'b']);
});

check('wording: income is "recebimento", expense is "pagamento"', () => {
  assert.equal(C.confirmCopy('INCOME').title, 'Confirmar recebimento');
  assert.equal(C.confirmCopy('EXPENSE').title, 'Confirmar pagamento');
  assert.match(C.confirmCopy('INCOME').success('R$ 640,00', '27/09/2026'), /Recebimento confirmado: R\$ 640,00 em 27\/09\/2026/);
});

check('prefill: the expected amount, and today when the expected day is past (the expected day when it is still ahead)', () => {
  const past = C.initialDraft(voucher(), TODAY);
  assert.equal(past.amountText, 'R$ 600,00');
  assert.equal(past.dateKey, '2026-10-06');
  const ahead = C.initialDraft(voucher({ date: new Date(2026, 9, 25) }), TODAY);
  assert.equal(ahead.dateKey, '2026-10-25');
  assert.equal(C.initialDraft(voucher({ amount: -42.5, type: 'EXPENSE' }), TODAY).amountText, 'R$ 42,50');
});

check('amount mask: digits are cents ("64000" is 640,00); letters ignored; too many digits is refused', () => {
  assert.equal(C.maskCents('64000').cents, 64000);
  assert.equal(C.maskCents('R$ 6.400,00').cents, 640000);
  assert.equal(C.maskCents('abc').cents, null);
  assert.equal(C.maskCents('').display, '');
  assert.equal(C.maskCents('0005').cents, 5);
  assert.equal(C.maskCents('1234567890123').cents, null);
});

check('validation: amount > 0 and a real day', () => {
  assert.equal(C.validateConfirm({ amountText: 'R$ 0,00', dateKey: '2026-10-06', note: '' }).errors.amount !== undefined, true);
  assert.equal(C.validateConfirm({ amountText: '', dateKey: '2026-10-06', note: '' }).ok, false);
  assert.equal(C.validateConfirm({ amountText: 'R$ 1,00', dateKey: '2026-02-30', note: '' }).errors.date !== undefined, true);
  assert.equal(C.validateConfirm({ amountText: 'R$ 1,00', dateKey: '', note: '' }).ok, false);
  assert.equal(C.validateConfirm({ amountText: 'R$ 1,00', dateKey: '2026-10-06', note: '' }).ok, true);
});

check('patch: always paid + date; the amount ONLY when it differs from the expected one; the note only when edited', () => {
  const tx = voucher();
  const same = C.buildPatch(tx, { amountText: 'R$ 600,00', dateKey: '2026-09-27', note: '' });
  assert.equal(same.paid, true);
  assert.equal('amount' in same, false, 'unchanged amount is not sent (a recurrence that follows the last amount would adopt it)');
  assert.equal('notes' in same, false);
  assert.deepEqual([same.date.getFullYear(), same.date.getMonth(), same.date.getDate()], [2026, 8, 27]);
  const diff = C.buildPatch(tx, { amountText: 'R$ 640,00', dateKey: '2026-09-27', note: ' caiu no app ' });
  assert.equal(diff.amount, 640);
  assert.equal(diff.notes, 'caiu no app');
  const cleared = C.buildPatch(voucher({ notes: 'antiga' }), { amountText: 'R$ 600,00', dateKey: '2026-09-27', note: '' });
  assert.equal(cleared.notes, '');
  assert.equal(C.buildPatch(tx, { amountText: 'R$ 0,00', dateKey: '2026-09-27', note: '' }), null);
  assert.equal(C.buildPatch(tx, { amountText: 'R$ 640,00', dateKey: '', note: '' }), null);
});

check('amount in integer cents: 0.1 + 0.2 style values do not drift', () => {
  const patch = C.buildPatch(voucher({ amount: 0.3 }), { amountText: 'R$ 0,30', dateKey: '2026-10-06', note: '' });
  assert.equal('amount' in patch, false);
  assert.equal(C.buildPatch(voucher({ amount: 600.1 }), { amountText: 'R$ 600,11', dateKey: '2026-10-06', note: '' }).amount, 600.11);
});

check('difference hint: nothing when equal; "esperado X, recebido Y" and, following the last amount, the next occurrences', () => {
  assert.equal(C.differenceHint(60000, 60000, 'INCOME', true), null);
  assert.equal(C.differenceHint(60000, null, 'INCOME', true), null);
  assert.equal(C.differenceHint(60000, 64000, 'INCOME', false), 'Esperado R$ 600,00, recebido R$ 640,00.');
  assert.equal(C.differenceHint(60000, 64000, 'INCOME', true), 'Esperado R$ 600,00, recebido R$ 640,00; as próximas ocorrências passam a usar R$ 640,00.');
  assert.match(C.differenceHint(60000, 55000, 'EXPENSE', false), /pago R\$ 550,00/);
});

check('conflict (409) is shown as the pt-BR message; other errors keep their own text', () => {
  assert.match(C.confirmErrorMessage(Object.assign(new Error('x'), { status: 409 })), /acabou de ser alterada/);
  assert.equal(C.confirmErrorMessage(new Error('Conta não encontrada')), 'Conta não encontrada');
  assert.equal(C.confirmErrorMessage(null), 'Não foi possível confirmar.');
});

check('expectedAmountFor is the single extension point: today the recurrence amount, whatever the history', () => {
  assert.equal(C.expectedAmountFor({ amount: 640 }, [{ amount: 600, date: '2026-09-25' }], '2026-11'), 640);
  assert.equal(C.expectedAmountFor({ amount: 640 }), 640);
});

check('confirming in another month than expected pins the expected month when the row has no reference month', () => {
  const oct1 = voucher({ amount: 500, date: new Date(2026, 9, 1) });
  const early = C.buildPatch(oct1, { amountText: 'R$ 500,00', dateKey: '2026-09-30', note: '' });
  assert.equal(early.competenceMonth, '2026-10', 'received on 30/09 still counts in October');
  assert.equal('competenceMonth' in C.buildPatch(oct1, { amountText: 'R$ 500,00', dateKey: '2026-10-20', note: '' }), false, 'same month: nothing to pin');
  const late = C.buildPatch(voucher({ date: new Date(2026, 8, 25) }), { amountText: 'R$ 600,00', dateKey: '2026-10-02', note: '' });
  assert.equal(late.competenceMonth, '2026-09', 'received later than the month it was expected in');
  const already = C.buildPatch(voucher({ date: new Date(2026, 8, 25), competenceMonth: '2026-10' }), { amountText: 'R$ 600,00', dateKey: '2026-10-02', note: '' });
  assert.equal('competenceMonth' in already, false, 'a reference month the row already has is left alone');
  assert.equal(C.keptReferenceMonth({ date: '2026-10-01', competenceMonth: null }, '2026-09-30'), '2026-10');
  assert.equal(C.keptReferenceMonth({ date: '2026-10-01', competenceMonth: null }, '2026-10-31'), null);
});

