import assert from 'node:assert/strict';
import { CLOSED, M, OPEN, check, show } from './harness.mts';

console.log('\n[N2] option toggles, storage self-healing');

check('closed month ON -> payInvoice true, future installments off', () => {
  const next = M.applyOptionPatch(OPEN, { closedMonth: true });
  show('ON', next);
  assert.deepEqual(next, { closedMonth: true, payInvoice: true, generateFutureInstallments: false });
});

check('closed month OFF -> payInvoice false, future installments on', () => {
  const next = M.applyOptionPatch(CLOSED, { closedMonth: false });
  show('OFF', next);
  assert.deepEqual(next, { closedMonth: false, payInvoice: false, generateFutureInstallments: true });
});

check('after switching, the user may still change the dependent options', () => {
  const off = M.applyOptionPatch(CLOSED, { payInvoice: false });
  assert.deepEqual(off, { closedMonth: true, payInvoice: false, generateFutureInstallments: false });
  const noFuture = M.applyOptionPatch(OPEN, { generateFutureInstallments: false });
  assert.deepEqual(noFuture, { closedMonth: false, payInvoice: false, generateFutureInstallments: false });
});

check('gating stays: closed month excludes future installments, open month cannot pay the invoice', () => {
  assert.deepEqual(M.normalizeOptions({ closedMonth: true, payInvoice: true, generateFutureInstallments: true }), CLOSED);
  assert.deepEqual(M.normalizeOptions({ closedMonth: false, payInvoice: true, generateFutureInstallments: true }), OPEN);
  assert.deepEqual(M.applyOptionPatch(OPEN, { payInvoice: true }), { ...OPEN, payInvoice: false });
  // patching closedMonth to the value it already has is not a mode switch
  assert.deepEqual(M.applyOptionPatch({ ...CLOSED, payInvoice: false }, { closedMonth: true }), { ...CLOSED, payInvoice: false });
});

const IDS = { income: 'a', bills: 'b', credit: 'c', debit: 'd' };

check('saveAccountIds self-heals: corrupt / non-object stored JSON starts over from {}', () => {
  for (const raw of ['{not json', '[1,2,3]', '"text"', '42', 'null', '', null, undefined]) {
    const out = JSON.parse(M.mergeSavedAccountIds(raw, 'h1', IDS));
    assert.deepEqual(out, { h1: IDS }, `raw=${String(raw)}`);
  }
  show('corrupt -> ', JSON.parse(M.mergeSavedAccountIds('{not json', 'h1', IDS)));
});

check('saveAccountIds keeps other households and overwrites its own', () => {
  const raw = JSON.stringify({ h2: { income: 'x', bills: 'x', credit: 'y', debit: 'x' }, h1: { income: 'old' } });
  const out = JSON.parse(M.mergeSavedAccountIds(raw, 'h1', IDS));
  assert.deepEqual(out, { h2: { income: 'x', bills: 'x', credit: 'y', debit: 'x' }, h1: IDS });
});

check('loadSavedAccountIds parsing ignores junk and non-string values', () => {
  const raw = JSON.stringify({ h1: { income: 'a', bills: 5, credit: '', debit: 'd', extra: 'z' } });
  assert.deepEqual(M.parseSavedAccountIds(raw, 'h1'), { income: 'a', debit: 'd' });
  assert.deepEqual(M.parseSavedAccountIds('{broken', 'h1'), {});
  assert.deepEqual(M.parseSavedAccountIds(raw, 'other'), {});
  assert.deepEqual(M.parseSavedAccountIds(JSON.stringify({ h1: [1] }), 'h1'), {});
});

check('saved category choices: malformed entries dropped, corrupt storage replaced on merge', () => {
  const raw = JSON.stringify({ h1: {
    'EXPENSE|saude': { kind: 'system', categoryName: 'HEALTHCARE' }, bad1: { kind: 'system' }, bad2: 'x', bad3: { kind: 'zzz' },
    ok2: { kind: 'default' }, ok3: { kind: 'create', name: 'N' },
  } });
  const parsed = M.parseSavedCategoryChoices(raw, 'h1');
  show('kept keys', Object.keys(parsed));
  assert.deepEqual(Object.keys(parsed).sort(), ['EXPENSE|saude', 'ok2', 'ok3']);
  const merged = JSON.parse(M.mergeSavedCategoryChoices('{corrupt', 'h1', { k: { kind: 'default' } }));
  assert.deepEqual(merged, { h1: { k: { kind: 'default' } } });
});

console.log('\n[F3/F8] confirm result and failure message; normalizeLabel parity');

const res = (o: object) => ({ imported: 3, skipped: 0, replaced: 0, consumedFutureInstallments: 0, futureInstallments: 0, createdCategories: [], invoicePayment: null, ids: [], warnings: [], ...o });

check('confirmResultNeedsReview: warnings, skipped or consumed installments keep the dialog open', () => {
  assert.equal(M.confirmResultNeedsReview(res({})), false);
  assert.equal(M.confirmResultNeedsReview(res({ warnings: ['w'] })), true);
  assert.equal(M.confirmResultNeedsReview(res({ skipped: 2 })), true);
  assert.equal(M.confirmResultNeedsReview(res({ consumedFutureInstallments: 4 })), true);
  const old = res({}) as Record<string, unknown>;
  delete old.consumedFutureInstallments; // older server
  assert.equal(M.confirmResultNeedsReview(old), false);
});

check('buildConfirmSummary lists the counts, including consumed future installments', () => {
  const text = M.buildConfirmSummary(res({ imported: 1, replaced: 1, consumedFutureInstallments: 2, skipped: 1, warnings: ['a', 'b'],
    createdCategories: [{ id: 'x', name: 'n', type: 'EXPENSE' }], invoicePayment: { transactionId: 't', amount: 500, date: 'd' } }), (v: number) => `R$ ${v}`);
  show('summary', text);
  assert.ok(text.includes('1 transação importada') && text.includes('1 substituída') && text.includes('2 parcelas futuras substituídas'));
  assert.ok(text.includes('1 categoria criada') && text.includes('fatura de R$ 500 registrada') && text.includes('1 linha ignorada') && text.includes('2 avisos'));
});

check('confirmFailureMessage adds the partial-import notice', () => {
  const a = M.confirmFailureMessage('Falha de rede');
  const b = M.confirmFailureMessage('Erro do servidor.');
  show('message', a);
  assert.ok(a.startsWith('Falha de rede. A importação pode ter sido parcial'));
  assert.ok(a.includes('atualize a pré-visualização') && a.includes('duplicadas') && a.includes('confira a fatura do mês'));
  assert.ok(b.startsWith('Erro do servidor. A importação'));
});

check('normalizeLabel: NFD, strip combining marks, lowercase, collapse whitespace, trim', () => {
  const out = ['Saúde', 'saude', 'SAÚDE  ', '  Saúde\t Mental ', 'Ação', 'Cartão  de   Crédito'].map((v) => M.normalizeLabel(v));
  show('normalized', out);
  assert.deepEqual(out, ['saude', 'saude', 'saude', 'saude mental', 'acao', 'cartao de credito']);
});
