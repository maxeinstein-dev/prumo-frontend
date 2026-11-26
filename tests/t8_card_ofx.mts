import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, frontSrc, show } from './harness.mts';

// Phase 3: the card invoice (.ofx) import. CARD_OFX_MODULE points at a mutated copy for bite-checks.
const cardPath =
  process.env.CARD_OFX_MODULE || frontSrc('utils/cardOfx.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(cardPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

// ---- Fixtures (invented merchants and amounts) ------------------------------------------------------------

let n = 0;
const line = (memo: string, amount: number, o: Record<string, Any> = {}): Any => {
  n += 1;
  return {
    ref: `ofx:F${n}:0000000${n % 10}`, fitid: `F${n}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo,
    merchant: memo.replace(/ - Parcela \d+\/\d+$/, ''), installment: null, status: 'proposed', group: null, ...o,
  };
};
const target = (id: string, description: string, amount: number, o: Record<string, Any> = {}) => ({
  transactionId: id, description, amount, type: 'EXPENSE', date: '2026-09-08', sourceRef: `maxfin:2026-10:credit:${id}`, ...o,
});
const proposal = (group: string, kind: string, lines: Any[], o: Record<string, Any> = {}): Any => {
  for (const l of lines) l.group = group;
  return { group, kind, refs: lines.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, result: null, futureInstallments: 0, ...o };
};

const padaria = line('Padaria Sol Nascente', 25.9);
const cursoA = line('Curso Alfa - Parcela 4/10', 100, { installment: { number: 4, total: 10 } });
const cursoB = line('Curso Alfa - Parcela 5/10', 100, { installment: { number: 5, total: 10 } });
const cursoDesc = line('Desconto Antecipação Curso Alfa', 12.34, { type: 'INCOME', kind: 'discount' });
const posto1 = line('Posto Via Norte', 120);
const posto2 = line('Posto Via Norte', 80);
const lojaBeta = line('Loja Beta - Parcela 3/6', 50, { installment: { number: 3, total: 6 } });
const livraria = line('Livraria Gama', 45.5);
const eletro = line('Eletro Delta - Parcela 1/3', 300, { installment: { number: 1, total: 3 } });
const siteBuy = line('Site Omega', 199.99);
const siteRefund = line('Site Omega', 199.99, { type: 'INCOME', kind: 'refund' });
const mercado = line('Mercado Zeta', 60, { status: 'reconciled' });
const pagamento = line('Pagamento recebido', 900, { type: 'INCOME', kind: 'payment', status: 'payment' });
const antecipado = line('Pagamento recebido', 150, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-20' });
const antecipadoPar = line('Pagamento recebido', 70, { type: 'INCOME', kind: 'payment', date: '2026-09-25' });
const farm1 = line('Farmacia Kappa', 30);
const farm2 = line('Farmacia Kappa', 20);

const pExact = proposal('g-exact', 'enrich-exact', [padaria], {
  target: target('t-padaria', 'Padaria', 25.9), result: { date: '2026-09-10', description: 'Padaria Sol Nascente', notesAppend: 'Planilha: Padaria' },
});
const pPlan = proposal('g-plan', 'enrich-plan', [cursoA, cursoB, cursoDesc], {
  target: target('t-curso', 'Curso Alfa 4/10 +1', 187.66), result: { date: '2026-09-10', description: 'Curso Alfa 4/10 +1', notesAppend: 'OFX: 3 linhas' },
});
const pSum = proposal('g-sum', 'enrich-sum', [posto1, posto2], { target: target('t-gasolina', 'Gasolina 200', 200) });
const pPaid = proposal('g-paid', 'enrich-exact', [antecipadoPar], {
  target: target('t-antecipado', 'Pagamento antecipado', 70, { type: 'INCOME' }),
});
const pAmbiguous = proposal('g-amb', 'enrich-sum', [farm1, farm2], {
  defaultSelected: false, ambiguous: true, target: target('t-farmacia', 'Farmácia 50', 50),
});
const pFuture = proposal('g-future', 'consume-future', [lojaBeta], { target: target('t-beta3', 'Loja Beta 3/6', 50) });
const pLivraria = proposal('g-livraria', 'create', [livraria]);
const pEletro = proposal('g-eletro', 'create', [eletro], { futureInstallments: 2 });
const pReversal = proposal('g-rev', 'reversal', [siteBuy, siteRefund], { defaultSelected: false });

const lines = [padaria, cursoA, cursoB, cursoDesc, posto1, posto2, lojaBeta, livraria, eletro, siteBuy, siteRefund, mercado, pagamento,
  antecipado, antecipadoPar, farm1, farm2];
const proposals = [pExact, pPlan, pSum, pPaid, pAmbiguous, pFuture, pLivraria, pEletro, pReversal];
const entry = (key: string, o: Record<string, Any> = {}) => ({ key, type: 'EXPENSE', count: 1, sections: ['credit'], suggestion: { kind: 'default', label: 'Padrão' }, ...o });

const mkPreview = (o: Record<string, Any> = {}): Any => ({
  accountId: 'acc-card', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement',
  period: { start: '2026-09-02', end: '2026-10-02' }, ofxTotal: 919.06, lines, proposals,
  sheetOnly: [{ transactionId: 't-stream', description: 'Assinatura Streaming', amount: 39.9, type: 'EXPENSE', date: '2026-09-15', sourceRef: null }],
  payment: { ref: pagamento.ref, amount: 900, date: '2026-09-09', invoiceMonthKey: '2026-09', proposal: 'adjust',
    recorded: { transactionId: 't-pay-09', amount: 905, date: '2026-09-10', sourceAccountId: 'acc-main' } },
  categoryMap: [
    entry('LIVRARIA GAMA', { suggestion: { kind: 'system', categoryName: 'EDUCATION', label: 'Educação' } }),
    entry('Eletro Delta'),
    entry('Outro Comerciante', { suggestion: { kind: 'system', categoryName: 'FOOD', label: 'Alimentação' } }),
  ],
  totals: { lines: lines.length, reconciled: 1, proposals: proposals.length, create: 2, sheetOnly: 1 },
  warnings: [],
  ...o,
});

const ACCOUNTS = [{ id: 'acc-main', type: 'CHECKING' }, { id: 'acc-card', type: 'CREDIT' }, { id: 'acc-card2', type: 'CREDIT' }];
const CTX = { accounts: ACCOUNTS, customIdsByType: { INCOME: new Set<string>(), EXPENSE: new Set<string>() } };
const preview = mkPreview();
const sections = C.buildCardOfxSections(preview);
const defaults = C.reconcileGroupSelection([], {}, sections.groups);
const payAdjust = C.defaultPaymentChoice(preview.payment);
const build = (sel: Any = defaults, choice: Any = payAdjust, p: Any = preview, choices: Any = {}) => C.buildCardOfxConfirm(p, sel, choices, choice, CTX);
const built = build();
const ids = (groups: Any[]) => groups.map((g) => g.proposal.group);

console.log('\n[K1] card .ofx file checks and the hand-off from the generic import');

check('validateCardOfxFile: .ofx in any case passes; other formats and files over 5 MB are refused', () => {
  assert.equal(C.validateCardOfxFile({ name: 'fatura.ofx', size: 1000 }), null);
  assert.equal(C.validateCardOfxFile({ name: 'FATURA.OFX', size: 5 * 1024 * 1024 }), null, 'exactly 5 MB is accepted');
  assert.equal(C.validateCardOfxFile({ name: 'fatura.csv', size: 10 }), 'Formato inválido. Envie a fatura do cartão exportada como .ofx.');
  assert.match(C.validateCardOfxFile({ name: 'fatura.qfx', size: 10 }), /Formato inválido/);
  assert.equal(C.validateCardOfxFile({ name: 'fatura.ofx', size: 5 * 1024 * 1024 + 1 }), 'Arquivo muito grande (5,1 MB). O limite é 5 MB.');
});

check('isCardOfxHandoff: only a CREDIT account with a .ofx file goes to the card flow', () => {
  assert.equal(C.isCardOfxHandoff('CREDIT', 'nubank.ofx'), true);
  assert.equal(C.isCardOfxHandoff('CREDIT', 'NUBANK.OFX'), true);
  assert.equal(C.isCardOfxHandoff('CHECKING', 'extrato.ofx'), false);
  assert.equal(C.isCardOfxHandoff('CREDIT', 'fatura.csv'), false);
  assert.equal(C.isCardOfxHandoff(undefined, 'fatura.ofx'), false);
});

console.log('\n[K2] sections of the preview');

check('groups go to their sections; lines follow the statement order; nets are integer cents', () => {
  assert.deepEqual(ids(sections.matched), ['g-exact', 'g-plan', 'g-sum', 'g-paid', 'g-amb']);
  assert.deepEqual(ids(sections.futures), ['g-future']);
  assert.deepEqual(ids(sections.created), ['g-livraria', 'g-eletro']);
  assert.deepEqual(ids(sections.reversal), ['g-rev']);
  assert.deepEqual(sections.other, []);
  const plan = sections.groups.find((g: Any) => g.proposal.group === 'g-plan');
  assert.deepEqual(plan.lines.map((l: Any) => l.ref), [cursoA.ref, cursoB.ref, cursoDesc.ref]);
  assert.equal(plan.netCents, 18766, 'two installments minus the discount');
  assert.equal(sections.groups.find((g: Any) => g.proposal.group === 'g-rev').netCents, 0);
  assert.ok(sections.groups.every((g: Any) => g.sendable), 'every known proposal with its lines can be sent');
});

check('payments: the previous invoice line, the advance payment paired with a sheet credit, the one that is only information', () => {
  assert.equal(sections.paymentLine.ref, pagamento.ref);
  assert.deepEqual(sections.advancePayments.map((l: Any) => l.ref), [antecipado.ref]);
  assert.deepEqual(sections.pairedAdvancePayments.map((l: Any) => l.ref), [antecipadoPar.ref]);
  assert.equal(sections.groups.find((g: Any) => g.proposal.group === 'g-paid').hasPayment, true);
  assert.deepEqual(sections.reconciled.map((l: Any) => l.ref), [mercado.ref]);
  assert.deepEqual(sections.orphans, []);
});

check('an unknown kind, a missing ref and a repeated group id are shown but never sendable', () => {
  const extra = line('Coisa Nova', 10);
  const odd = mkPreview({
    lines: [...lines, extra],
    proposals: [...proposals, proposal('g-x', 'teleport', [extra]), { ...pLivraria, group: 'g-broken', refs: [...pLivraria.refs, 'ofx:NOPE:00000000'] },
      { ...pExact }],
  });
  const s = C.buildCardOfxSections(odd);
  assert.deepEqual(ids(s.other), ['g-x']);
  assert.equal(s.other[0].sendable, false);
  const broken = s.created.find((g: Any) => g.proposal.group === 'g-broken');
  assert.equal(broken.sendable, false, 'a ref missing from the lines: confirm would refuse the group');
  assert.deepEqual(broken.missingRefs, ['ofx:NOPE:00000000']);
  assert.deepEqual(broken.lines.map((l: Any) => l.ref), [livraria.ref], 'the lines that are there are still shown');
  const repeated = s.matched.filter((g: Any) => g.proposal.group === 'g-exact');
  assert.deepEqual(repeated.map((g: Any) => g.sendable), [true, false], 'the first proposal with an id wins');
  const sel = C.reconcileGroupSelection([], {}, s.groups);
  assert.equal(sel['g-x'], false);
  assert.equal(sel['g-exact'], true, 'a repeated id does not untick the first one');
  assert.equal(sel['g-broken'], false);
  const b = C.buildCardOfxConfirm(odd, { ...sel, 'g-x': true, 'g-broken': true }, {}, payAdjust, CTX);
  assert.ok(!b.payload.selectedGroups.includes('g-x'), 'an unknown kind is never sent, ticked or not');
  assert.ok(!b.payload.selectedGroups.includes('g-broken'), 'a group with a missing line is never sent, ticked or not');
  assert.equal(b.payload.selectedGroups.filter((g: string) => g === 'g-exact').length, 1, 'a group id is sent once');
});

console.log('\n[K3] selection by group');

check('defaults: what the server marks, never an ambiguous sum, never a purchase + refund pair', () => {
  show('defaults', defaults);
  assert.deepEqual(defaults, {
    'g-exact': true, 'g-plan': true, 'g-sum': true, 'g-paid': true, 'g-amb': false, 'g-future': true, 'g-livraria': true, 'g-eletro': true,
    'g-rev': false,
  });
  const lying = C.buildCardOfxSections(mkPreview({ proposals: [{ ...pAmbiguous, defaultSelected: true }] }));
  assert.equal(C.reconcileGroupSelection([], {}, lying.groups)['g-amb'], false, 'ambiguous stays unticked even if marked by default');
});

check('a re-run keeps the choice of a group that did not change and defaults the rest', () => {
  const mine = { ...defaults, 'g-exact': false, 'g-rev': true };
  const again = C.reconcileGroupSelection(proposals, mine, sections.groups);
  assert.equal(again['g-exact'], false);
  assert.equal(again['g-rev'], true);
  const flipped = C.buildCardOfxSections(mkPreview({ proposals: proposals.map((p: Any) => (p.group === 'g-exact' ? { ...p, ambiguous: true, defaultSelected: false } : p)) }));
  assert.equal(C.reconcileGroupSelection(proposals, mine, flipped.groups)['g-exact'], false, 'changed defaults: the new default');
  const turned = C.buildCardOfxSections(mkPreview({ proposals: proposals.map((p: Any) => (p.group === 'g-rev' ? { ...p, defaultSelected: true } : p)) }));
  assert.equal(C.reconcileGroupSelection(proposals, { ...defaults, 'g-rev': false }, turned.groups)['g-rev'], true, 'a group whose default changed gets it');
  const fresh = C.reconcileGroupSelection([], mine, sections.groups);
  assert.equal(fresh['g-exact'], true, 'a group that is new to the dialog gets its default');
});

check('bulk ticks skip ambiguous groups; bulk unticks clear every group; a single toggle follows the box', () => {
  const none = C.clearGroups(defaults, sections.matched);
  assert.deepEqual(ids(sections.matched).map((g) => none[g]), [false, false, false, false, false]);
  const all = C.selectAllGroups(none, sections.matched);
  assert.deepEqual(ids(sections.matched).map((g) => all[g]), [true, true, true, true, false], 'the ambiguous sum is ticked one by one');
  const amb = sections.matched.find((g: Any) => g.proposal.group === 'g-amb');
  assert.equal(C.setGroupSelected(all, amb, true)['g-amb'], true);
  const news = C.selectAllGroups(C.clearGroups(defaults, sections.created), sections.created);
  assert.deepEqual([news['g-livraria'], news['g-eletro']], [true, true]);
});

console.log('\n[K4] confirm payload');

check('every line is echoed with the contract fields only (status and group stay out)', () => {
  const keys = ['ref', 'fitid', 'date', 'amount', 'type', 'kind', 'memo', 'merchant', 'installment'].sort();
  assert.equal(built.payload.lines.length, lines.length, 'reconciled, payment and unticked lines included');
  for (const l of built.payload.lines) assert.deepEqual(Object.keys(l).sort(), keys);
  const curso = built.payload.lines.find((l: Any) => l.ref === cursoA.ref);
  assert.deepEqual(curso.installment, { number: 4, total: 10 });
  assert.equal(built.payload.accountId, 'acc-card');
  assert.equal(built.payload.monthKey, '2026-10');
  assert.deepEqual(Object.keys(built.payload).sort(), ['accountId', 'categoryMap', 'lines', 'monthKey', 'payment', 'paymentLineRef', 'selectedGroups']);
});

check('selectedGroups: the ticked groups that can be sent, in the order of the proposals', () => {
  assert.deepEqual(built.payload.selectedGroups, ['g-exact', 'g-plan', 'g-sum', 'g-paid', 'g-future', 'g-livraria', 'g-eletro']);
  const b = build({ ...defaults, 'g-plan': false, 'g-rev': true });
  assert.deepEqual(b.payload.selectedGroups, ['g-exact', 'g-sum', 'g-paid', 'g-future', 'g-livraria', 'g-eletro', 'g-rev']);
});

check('categoryMap: only the merchants of the ticked creates (normalized match), with the shared choices', () => {
  show('categoryMap', built.payload.categoryMap);
  assert.deepEqual(built.payload.categoryMap, [
    { key: 'LIVRARIA GAMA', type: 'EXPENSE', target: { kind: 'system', categoryName: 'EDUCATION' } },
    { key: 'Eletro Delta', type: 'EXPENSE', target: { kind: 'default' } },
  ]);
  const chosen = build(defaults, payAdjust, preview, { 'EXPENSE|eletro delta': { kind: 'system', categoryName: 'UTILITIES' } });
  assert.deepEqual(chosen.payload.categoryMap[1].target, { kind: 'system', categoryName: 'UTILITIES' });
  const noLivraria = build({ ...defaults, 'g-livraria': false });
  assert.deepEqual(noLivraria.payload.categoryMap.map((e: Any) => e.key), ['Eletro Delta']);
  const noCreates = build({ ...defaults, 'g-livraria': false, 'g-eletro': false, 'g-rev': true });
  assert.deepEqual(noCreates.payload.categoryMap, [], 'no create ticked: no category is sent (a reversal pair needs none)');
});

check('payment decision: adjust sends only apply; create sends the source account when applied; ok and none send null', () => {
  assert.deepEqual(built.payload.payment, { apply: true });
  assert.deepEqual(build(defaults, { apply: false, sourceAccountId: 'acc-main' }).payload.payment, { apply: false });
  const createPreview = mkPreview({ payment: { ...preview.payment, proposal: 'create', recorded: null } });
  assert.deepEqual(C.defaultPaymentChoice(createPreview.payment), { apply: true, sourceAccountId: '' });
  assert.deepEqual(build(defaults, { apply: true, sourceAccountId: 'acc-main' }, createPreview).payload.payment, { apply: true, sourceAccountId: 'acc-main' });
  assert.deepEqual(build(defaults, { apply: false, sourceAccountId: 'acc-main' }, createPreview).payload.payment, { apply: false });
  const okPreview = mkPreview({ payment: { ...preview.payment, proposal: 'ok' } });
  assert.deepEqual(C.defaultPaymentChoice(okPreview.payment), { apply: false, sourceAccountId: '' });
  assert.equal(build(defaults, { apply: true, sourceAccountId: 'acc-main' }, okPreview).payload.payment, null);
  assert.equal(build(defaults, payAdjust, mkPreview({ payment: null })).payload.payment, null);
  assert.equal(build(defaults, payAdjust, mkPreview({ payment: { ...preview.payment, proposal: 'refund-it' } })).payload.payment, null);
});

check('payment choice across re-runs: the tick stays for the same line and proposal; the source account is kept', () => {
  const prev = preview.payment;
  const mine = { apply: false, sourceAccountId: 'acc-main' };
  assert.deepEqual(C.reconcilePaymentChoice(prev, mine, prev), mine);
  assert.deepEqual(C.reconcilePaymentChoice(prev, mine, { ...prev, proposal: 'create' }), { apply: true, sourceAccountId: 'acc-main' });
  assert.deepEqual(C.reconcilePaymentChoice(prev, mine, { ...prev, proposal: 'ok' }), { apply: false, sourceAccountId: 'acc-main' });
  assert.deepEqual(C.reconcilePaymentChoice(null, C.defaultPaymentChoice(null), prev), { apply: true, sourceAccountId: '' });
  assert.deepEqual(C.paymentSourceAccounts(ACCOUNTS).map((a: Any) => a.id), ['acc-main'], 'credit cards (the card included) cannot pay');
});

console.log('\n[K5] totals in integer cents');

check('kind totals of the ticked groups; created carries its future installments', () => {
  const t = built.totals;
  show('totals', { ...t, payment: undefined });
  assert.deepEqual(t.enriched, { groups: 4, lines: 7, cents: 2590 + 18766 + 20000 - 7000 });
  assert.deepEqual(t.consumed, { groups: 1, lines: 1, cents: 5000 });
  assert.deepEqual(t.created, { groups: 2, lines: 2, cents: 34550, futureInstallments: 2 });
  assert.deepEqual(t.reversal, { groups: 0, lines: 0, cents: 0 });
  assert.equal(t.groups, 7);
  assert.deepEqual(build({ ...defaults, 'g-rev': true }).totals.reversal, { groups: 1, lines: 2, cents: 0 });
  assert.deepEqual(t.reconciled, { lines: 1, cents: 6000 });
  assert.deepEqual(t.sheetOnly, { count: 1, cents: 3990 });
  assert.deepEqual(t.payment, { action: 'adjust', cents: 90000 });
});

check('OFX total vs Recta after the confirm: targets ticked or not, ticked creates, the sheet-only rows; payments out', () => {
  const t = built.totals;
  assert.equal(t.ofxCents, 91906);
  // 60.00 reconciled + targets 25.90 + 187.66 + 200.00 + 50.00 (ambiguous) + 50.00 (future) + creates 345.50 + sheet-only 39.90
  assert.equal(t.rectaCents, 6000 + 2590 + 18766 + 20000 + 5000 + 5000 + 34550 + 3990);
  assert.equal(t.differenceCents, -3990, 'the sheet row that is not on the invoice');
  assert.equal(build({ ...defaults, 'g-exact': false, 'g-plan': false }).totals.rectaCents, t.rectaCents, 'unticking an enrich keeps the sheet row');
  assert.equal(build({ ...defaults, 'g-eletro': false }).totals.rectaCents, t.rectaCents - 30000, 'an unticked create is not recorded');
  assert.equal(build({ ...defaults, 'g-rev': true }).totals.rectaCents, t.rectaCents, 'a purchase + refund pair nets zero');
  const doubled = mkPreview({ sheetOnly: [...preview.sheetOnly, { ...target('t-padaria', 'Padaria', 25.9), sourceRef: null }] });
  assert.equal(build(defaults, payAdjust, doubled).totals.rectaCents, t.rectaCents, 'a target listed as sheet-only is counted once');
});

check('integer cents: 1.15 + 3.20 of credits against 4.35 of purchase nets exactly zero', () => {
  const a = line('Loja Cent', 4.35);
  const r1 = line('Loja Cent', 1.15, { type: 'INCOME', kind: 'refund' });
  const r2 = line('Loja Cent', 3.2, { type: 'INCOME', kind: 'refund' });
  const p = mkPreview({ lines: [a, r1, r2], proposals: [proposal('g-cent', 'reversal', [a, r1, r2])], ofxTotal: 0, sheetOnly: [], payment: null });
  const b = C.buildCardOfxConfirm(p, { 'g-cent': true }, {}, C.defaultPaymentChoice(null), CTX);
  assert.notEqual(4.35 * 100 - 1.15 * 100 - 3.2 * 100, 0, 'the float difference would not be zero');
  assert.equal(b.totals.reversal.cents, 0);
  assert.equal(b.totals.rectaCents, 0);
  assert.equal(b.totals.differenceCents, 0);
});

console.log('\n[K6] blocker');

check('needs-refresh comes first, even with nothing to send', () => {
  assert.equal(C.cardOfxConfirmBlocker(built, true).code, 'needs-refresh');
  assert.equal(C.cardOfxConfirmBlocker(built, true).message, 'Atualize a pré-visualização antes de confirmar de novo.');
  const none = build(C.clearGroups(defaults, sections.groups), { apply: false, sourceAccountId: '' });
  assert.equal(C.cardOfxConfirmBlocker(none, true).code, 'needs-refresh');
  assert.equal(C.cardOfxConfirmBlocker(built, false), null);
});

check('nothing selected: none-selected; nothing selectable at all: nothing-to-do; the payment alone is enough', () => {
  const cleared = C.clearGroups(defaults, sections.groups);
  assert.equal(C.cardOfxConfirmBlocker(build(cleared, { apply: false, sourceAccountId: '' }), false).code, 'none-selected');
  assert.equal(C.cardOfxConfirmBlocker(build(cleared, payAdjust), false), null, 'adjusting the payment is something to send');
  const done = mkPreview({ lines: [{ ...mercado }, { ...pagamento }], proposals: [], sheetOnly: [], payment: { ...preview.payment, proposal: 'ok' } });
  const b = C.buildCardOfxConfirm(done, {}, {}, C.defaultPaymentChoice(done.payment), CTX);
  assert.equal(b.hasSelectable, false);
  assert.equal(C.cardOfxConfirmBlocker(b, false).code, 'nothing-to-do');
});

check('payment create: the source account is required, must exist and cannot be a card', () => {
  const p = mkPreview({ payment: { ...preview.payment, proposal: 'create', recorded: null } });
  const blockerFor = (sourceAccountId: string) => C.cardOfxConfirmBlocker(build(defaults, { apply: true, sourceAccountId }, p), false);
  assert.deepEqual(blockerFor(''), { code: 'payment-source', message: C.PAYMENT_SOURCE_PROBLEM.missing });
  assert.equal(blockerFor('acc-gone').message, C.PAYMENT_SOURCE_PROBLEM.notFound);
  assert.equal(blockerFor('acc-card').message, C.PAYMENT_SOURCE_PROBLEM.isCard, 'the card itself cannot pay its invoice');
  assert.equal(blockerFor('acc-card2').message, C.PAYMENT_SOURCE_PROBLEM.isCard);
  assert.equal(blockerFor('acc-main'), null);
  assert.equal(C.cardOfxConfirmBlocker(build(defaults, { apply: false, sourceAccountId: '' }, p), false), null, 'unticked: no account needed');
  assert.equal(build(defaults, { apply: true, sourceAccountId: '' }, preview).paymentProblem, null, 'adjust never asks for an account');
});

check('two ticked groups on the same transaction or the same line: conflict', () => {
  const farmAll = line('Farmacia Kappa', 50);
  const twin = proposal('g-amb2', 'enrich-sum', [farmAll], { defaultSelected: false, ambiguous: true, target: target('t-farmacia', 'Farmácia 50', 50) });
  const p = mkPreview({ lines: [...lines, farmAll], proposals: [...proposals, twin] });
  const s = C.buildCardOfxSections(p);
  const sel = { ...C.reconcileGroupSelection([], {}, s.groups), 'g-amb': true, 'g-amb2': true };
  const b = C.buildCardOfxConfirm(p, sel, {}, payAdjust, CTX);
  assert.deepEqual([...b.conflicts].sort(), ['g-amb', 'g-amb2'], 'same sheet row');
  assert.equal(C.cardOfxConfirmBlocker(b, false).code, 'conflict');
  const one = C.buildCardOfxConfirm(p, { ...sel, 'g-amb2': false }, {}, payAdjust, CTX);
  assert.equal(C.cardOfxConfirmBlocker(one, false), null);
  // A create that claims a line an enrich group also covers (built by hand: the fixture lines keep their group).
  const sameLine = { group: 'g-dup', kind: 'create', refs: [padaria.ref], defaultSelected: true, ambiguous: false, target: null, result: null, futureInstallments: 0 };
  const q = mkPreview({ proposals: [...proposals, sameLine] });
  const qs = C.buildCardOfxSections(q);
  const qb = C.buildCardOfxConfirm(q, C.reconcileGroupSelection([], {}, qs.groups), {}, payAdjust, CTX);
  assert.deepEqual([...qb.conflicts].sort(), ['g-dup', 'g-exact'], 'same OFX line');
  assert.equal(C.cardOfxConfirmBlocker(qb, false).code, 'conflict');
});

check('more than 1000 lines: too-many', () => {
  const many = Array.from({ length: 1001 }, (_, i) => line(`Loja ${i}`, 1, { status: 'reconciled' }));
  const p = mkPreview({ lines: [...many, livraria], proposals: [pLivraria], payment: null, sheetOnly: [] });
  const b = C.buildCardOfxConfirm(p, { 'g-livraria': true }, {}, C.defaultPaymentChoice(null), CTX);
  assert.equal(C.cardOfxConfirmBlocker(b, false).code, 'too-many');
  assert.match(C.cardOfxConfirmBlocker(b, false).message, /1002 lançamentos: o limite por importação é 1000/);
});

console.log('\n[K7] the new lines of a month that already has sheet rows');

check('newLinesNotice: null while the creates come ticked; else what is left on each side', () => {
  assert.equal(C.newLinesNotice(sections), null);
  const unticked = C.buildCardOfxSections(mkPreview({ proposals: proposals.map((p: Any) => (p.kind === 'create' ? { ...p, defaultSelected: false } : p)) }));
  assert.deepEqual(C.newLinesNotice(unticked), { ofxLines: 2, ofxCents: 34550, sheetRows: 1, sheetCents: 3990 });
  assert.deepEqual([C.reconcileGroupSelection([], {}, unticked.groups)['g-livraria'], C.reconcileGroupSelection([], {}, unticked.groups)['g-eletro']],
    [false, false]);
});

console.log('\n[K8] result texts');

const FMT = (v: number) => `R$ ${v.toFixed(2)}`;
const DATE = (iso: string) => iso.split('-').reverse().join('/');
const RESULT = {
  enriched: 4, consumedFutures: 1, created: 2, futureInstallments: 2, reversalsImported: 0,
  payment: { action: 'adjusted', transactionId: 't-pay-09', amount: 900, date: '2026-09-09' }, skipped: 1,
  createdCategories: [{ id: 'c1', name: 'Livros', type: 'EXPENSE' }], warnings: ['Linha X mudou'],
};

check('result lines name what changed; the toast summary omits zeros and counts the warnings', () => {
  const items = C.cardOfxResultLines(RESULT, FMT, DATE);
  show('items', items);
  assert.deepEqual(items, [
    '4 lançamentos da planilha enriquecidos com os dados do banco',
    '1 parcela futura substituída pela compra real',
    '2 transações criadas, mais 2 parcelas futuras',
    'Pagamento da fatura anterior ajustado: R$ 900.00 em 09/09/2026',
    '1 categoria criada: Livros',
    '1 proposta ignorada (mudou desde a pré-visualização)',
  ]);
  assert.equal(C.buildCardOfxSummary(RESULT, FMT),
    'Fatura importada: 4 lançamentos enriquecidos, 1 parcela futura consumida, 2 transações criadas, 2 parcelas futuras geradas, '
    + 'pagamento ajustado (R$ 900.00), 1 categoria criada, 1 proposta ignorada. 1 aviso.');
  const nothing = { ...RESULT, enriched: 0, consumedFutures: 0, created: 0, futureInstallments: 0, payment: null, skipped: 0, createdCategories: [], warnings: [] };
  assert.deepEqual(C.cardOfxResultLines(nothing, FMT, DATE), []);
  assert.equal(C.buildCardOfxSummary(nothing, FMT), 'Fatura importada: nada foi alterado.');
  const created = C.cardOfxResultLines({ ...nothing, payment: { ...RESULT.payment, action: 'created' }, reversalsImported: 2 }, FMT, DATE);
  assert.deepEqual(created, ['2 lançamentos de compra e estorno importados', 'Pagamento da fatura anterior registrado: R$ 900.00 em 09/09/2026']);
});

check('a failed confirm says why and asks for a refresh', () => {
  assert.equal(C.cardOfxFailureMessage('Falha de rede'),
    'Falha de rede. Atualize a pré-visualização antes de confirmar de novo: o que já tiver sido aplicado aparece como conciliado.');
  assert.match(C.cardOfxFailureMessage('  '), /^Não foi possível confirmar a importação\. Atualize/);
});

console.log('\n[K9] review round 1');

const lineR = (ref: string, amount: number, o: Record<string, Any> = {}): Any => ({
  ref, fitid: ref, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo: ref, merchant: ref, installment: null, status: 'proposed', group: null, ...o,
});
const bareProposal = (group: string, kind: string, refs: string[], o: Record<string, Any> = {}): Any => ({
  group, kind, refs, defaultSelected: true, ambiguous: false, target: null, result: null, futureInstallments: 0, ...o,
});
const bare = (o: Record<string, Any>): Any => mkPreview({ ofxTotal: 0, lines: [], proposals: [], sheetOnly: [], payment: null, categoryMap: [], ...o });

check('RV1 adjust whose recorded payment has no source account: Confirm waits for one and the request carries it', () => {
  const pay = lineR('p', 100, { kind: 'payment', type: 'INCOME', status: 'payment' });
  const payment = { ref: 'p', amount: 100, date: '2026-09-09', invoiceMonthKey: '2026-09', proposal: 'adjust',
    recorded: { transactionId: 't', amount: 99, date: '2026-09-09', sourceAccountId: null } };
  const p = bare({ lines: [pay], payment });
  assert.equal(C.paymentNeedsSource(payment), true);
  assert.equal(C.paymentNeedsSource({ ...payment, recorded: { ...payment.recorded, sourceAccountId: 'acc-main' } }), false);
  assert.equal(C.paymentNeedsSource({ ...payment, proposal: 'ok' }), false);
  const noAccount = C.buildCardOfxConfirm(p, {}, {}, C.defaultPaymentChoice(payment), CTX);
  assert.equal(C.cardOfxConfirmBlocker(noAccount, false)?.code, 'payment-source', 'Confirm waits for a source account');
  const withAccount = C.buildCardOfxConfirm(p, {}, {}, { apply: true, sourceAccountId: 'acc-main' }, CTX);
  assert.deepEqual(withAccount.payload.payment, { apply: true, sourceAccountId: 'acc-main' });
  assert.equal(C.cardOfxConfirmBlocker(withAccount, false), null);
  assert.deepEqual(C.buildCardOfxConfirm(p, {}, {}, { apply: false, sourceAccountId: '' }, CTX).payload.payment, { apply: false });
  assert.equal(C.cardOfxConfirmBlocker(C.buildCardOfxConfirm(p, {}, {}, { apply: false, sourceAccountId: '' }, CTX), false)?.code, 'none-selected', 'unticked: no account asked');
  // with a recorded account: only apply, whatever account the user had picked before
  const known = bare({ lines: [pay], payment: { ...payment, recorded: { ...payment.recorded, sourceAccountId: 'acc-main' } } });
  assert.deepEqual(C.buildCardOfxConfirm(known, {}, {}, { apply: true, sourceAccountId: 'acc-savings' }, CTX).payload.payment, { apply: true });
  assert.equal(C.buildCardOfxConfirm(known, {}, {}, C.defaultPaymentChoice(known.payment), CTX).paymentProblem, null);
});

check('RV2 a ticked consume-future counts the OFX amount the server writes; unticked keeps the stored amount, cent for cent', () => {
  const l = lineR('beta', 50.01, { installment: { number: 3, total: 6 } });
  const prop = bareProposal('g', 'consume-future', ['beta'], {
    result: { date: '2026-09-10', description: 'x', notesAppend: null },
    target: { transactionId: 'f', description: 'Beta 3/6', amount: 50, type: 'EXPENSE', date: '2026-09-20', sourceRef: 'maxfin:x:f1' },
  });
  const p = bare({ lines: [l], proposals: [prop], ofxTotal: 50.01 });
  const ticked = C.buildCardOfxConfirm(p, { g: true }, {}, C.defaultPaymentChoice(null), CTX);
  assert.equal(ticked.totals.rectaCents, 5001);
  assert.equal(ticked.totals.differenceCents, 0);
  const unticked = C.buildCardOfxConfirm(p, { g: false }, {}, C.defaultPaymentChoice(null), CTX);
  assert.equal(unticked.totals.rectaCents, 5000, 'left alone it keeps 50.00');
  // an enrich keeps the sheet amount (the server only changes date and description)
  const sheet = bareProposal('e', 'enrich-exact', ['beta'], { target: { transactionId: 's', description: 'Beta', amount: 50, type: 'EXPENSE', date: '2026-09-09', sourceRef: null } });
  assert.equal(C.buildCardOfxConfirm(bare({ lines: [l], proposals: [sheet], ofxTotal: 50.01 }), { e: true }, {}, C.defaultPaymentChoice(null), CTX).totals.rectaCents, 5000);
});

check('RV3 an unticked consume-future dated outside the invoice period does not count in this month; a ticked one does', () => {
  const l = lineR('beta', 50, { installment: { number: 3, total: 6 } });
  const future = (date: string) => bareProposal('g', 'consume-future', ['beta'], {
    target: { transactionId: 'f', description: 'Beta 3/6', amount: 50, type: 'EXPENSE', date, sourceRef: 'maxfin:x:f1' },
  });
  const cents = (date: string, tick: boolean) =>
    C.buildCardOfxConfirm(bare({ lines: [l], proposals: [future(date)], ofxTotal: 50 }), { g: tick }, {}, C.defaultPaymentChoice(null), CTX).totals.rectaCents;
  assert.equal(cents('2026-11-02', false), 0, 'after the period: another invoice');
  assert.equal(cents('2026-08-30', false), 0, 'before the period');
  assert.equal(cents('2026-10-02', false), 5000, 'the closing day is inside');
  assert.equal(cents('2026-09-02', false), 5000, 'the first day is inside');
  assert.equal(cents('2026-11-02', true), 5000, 'consumed it becomes a purchase of this invoice (dated by the bank)');
});

check('RV4 the request keeps the order of the preview lines (not sorted by ref) and of the proposals', () => {
  const l1 = lineR('z1', 10), l2 = lineR('a2', 20), pay = lineR('p', 5, { kind: 'payment', type: 'INCOME', status: 'payment' });
  const props = [bareProposal('g2', 'create', ['a2']), bareProposal('g1', 'create', ['z1'])];
  const p = bare({ lines: [l1, l2, pay], proposals: props, payment: { ref: 'p', amount: 5, date: '2026-09-09', invoiceMonthKey: '2026-09', proposal: 'create', recorded: null } });
  const b = C.buildCardOfxConfirm(p, { g1: true, g2: true }, {}, { apply: true, sourceAccountId: 'acc-main' }, CTX);
  assert.deepEqual(b.payload.lines.map((l: Any) => l.ref), ['z1', 'a2', 'p']);
  assert.deepEqual(b.payload.selectedGroups, ['g2', 'g1']);
});

check('inactive accounts are not offered as the payment source and are refused when chosen', () => {
  const accounts = [{ id: 'a', type: 'CHECKING' }, { id: 'b', type: 'SAVINGS', isActive: false }, { id: 'c', type: 'CASH', isActive: true }, { id: 'd', type: 'CREDIT' }];
  assert.deepEqual(C.paymentSourceAccounts(accounts).map((a: Any) => a.id), ['a', 'c']);
  assert.equal(C.paymentSourceProblem('b', accounts), C.PAYMENT_SOURCE_PROBLEM.inactive);
  assert.equal(C.paymentSourceProblem('c', accounts), null);
});

console.log('\n[K10] recurrence pairing (enrich-recurrence)');

{
  // An occurrence the recurrence job generated (forecast 50.00) paired with the real charge of the statement (47.90).
  const recLine = line('Pg Plano Beta Mensal', 47.9, { date: '2026-09-12' });
  const recLine2 = line('Clube Gama', 32.25, { date: '2026-09-13' });
  const recOcc = target('t-rec', 'Plano Beta', 50, { sourceRef: null, date: '2026-09-10' });
  const recOcc2 = target('t-rec2', 'Clube Gama', 30, { sourceRef: null, date: '2026-09-11' });
  const pRec = proposal('g-rec', 'enrich-recurrence', [recLine], {
    target: recOcc, result: { date: '2026-09-12', description: 'Plano Beta', notesAppend: 'Banco: Pg Plano Beta Mensal (valor anterior 50,00)' },
  });
  const pRecAmb = proposal('g-rec-amb', 'enrich-recurrence', [recLine2], {
    defaultSelected: false, ambiguous: true, reason: 'recurrence-ambiguous', target: recOcc2,
    result: { date: '2026-09-13', description: 'Clube Gama', notesAppend: 'Banco: Clube Gama (valor anterior 30,00)' },
  });
  const recPreview = mkPreview({
    lines: [recLine, recLine2], proposals: [pRec, pRecAmb], ofxTotal: 80.15, sheetOnly: [], payment: null, totals: { lines: 2, reconciled: 0, proposals: 2, create: 0, sheetOnly: 0 },
  });
  const rs = C.buildCardOfxSections(recPreview);
  const rDefaults = C.reconcileGroupSelection([], {}, rs.groups);
  const noPay = C.defaultPaymentChoice(null);
  const rBuild = (sel: Any) => C.buildCardOfxConfirm(recPreview, sel, {}, noPay, CTX);
  const fmt = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

  check('the new kind is known, labelled "recorrência", sent through the matched section and not an unknown kind', () => {
    assert.equal(C.isKnownProposalKind('enrich-recurrence'), true);
    assert.equal(C.proposalSection('enrich-recurrence'), 'matched');
    assert.equal(C.PROPOSAL_KIND_LABEL['enrich-recurrence'], 'recorrência');
    assert.deepEqual(ids(rs.matched), ['g-rec', 'g-rec-amb']);
    assert.deepEqual(rs.other, []);
    assert.deepEqual(rs.created, []);
    assert.ok(rs.groups.every((g: Any) => g.sendable));
    assert.match(C.proposalHeadline(pRec), /^Recorrência: /);
    assert.notEqual(C.proposalHeadline(pRec), C.proposalHeadline({ ...pRec, kind: 'enrich-near' }), 'own text, not the near-amount one');
  });

  check('default selection follows defaultSelected; an ambiguous one is unticked even when the server ticks it', () => {
    assert.deepEqual(rDefaults, { 'g-rec': true, 'g-rec-amb': false });
    const unticked = C.buildCardOfxSections(mkPreview({ lines: [recLine], proposals: [{ ...pRec, defaultSelected: false }] }));
    assert.equal(C.reconcileGroupSelection([], {}, unticked.groups)['g-rec'], false);
    const lying = C.buildCardOfxSections(mkPreview({ lines: [recLine2], proposals: [{ ...pRecAmb, defaultSelected: true }] }));
    assert.equal(C.reconcileGroupSelection([], {}, lying.groups)['g-rec-amb'], false);
  });

  check('confirm body: a ticked pairing goes in selectedGroups, an unticked one stays out, an ambiguous one only when the user ticks it', () => {
    assert.deepEqual(rBuild(rDefaults).payload.selectedGroups, ['g-rec']);
    assert.deepEqual(rBuild({ ...rDefaults, 'g-rec': false }).payload.selectedGroups, []);
    assert.deepEqual(rBuild({ ...rDefaults, 'g-rec-amb': true }).payload.selectedGroups, ['g-rec', 'g-rec-amb']);
    assert.deepEqual(rBuild(rDefaults).payload.categoryMap, [], 'a pairing creates nothing: no category is sent');
  });

  check('totals: a ticked pairing counts as enriched (never created), in integer cents; unticked it leaves the row as it is', () => {
    const t = rBuild(rDefaults).totals;
    assert.deepEqual(t.enriched, { groups: 1, lines: 1, cents: 4790 });
    assert.deepEqual(t.created, { groups: 0, lines: 0, cents: 0, futureInstallments: 0 });
    assert.deepEqual(t.consumed, { groups: 0, lines: 0, cents: 0 });
    // Ticked: the row holds the bank amount (47.90) and the unticked ambiguous one keeps its 30.00.
    assert.equal(t.rectaCents, 4790 + 3000);
    const off = rBuild({ ...rDefaults, 'g-rec': false }).totals;
    assert.deepEqual(off.enriched, { groups: 0, lines: 0, cents: 0 });
    assert.equal(off.rectaCents, 5000 + 3000, 'unticked: the occurrence stays at its forecast amount');
    const both = rBuild({ 'g-rec': true, 'g-rec-amb': true }).totals;
    assert.deepEqual(both.enriched, { groups: 2, lines: 2, cents: 4790 + 3225 });
    assert.equal(both.rectaCents, 4790 + 3225);
    assert.equal(both.differenceCents, both.ofxCents - both.rectaCents);
  });

  check('before and after: integer cents (no float drift), the difference signed, equal amounts say so', () => {
    const c = C.recurrenceChange(pRec, 4790);
    assert.deepEqual(c, { oldCents: 5000, newCents: 4790, diffCents: -210 });
    assert.equal(C.recurrenceChangeText(c, fmt), 'Valor: R$ 50,00 → R$ 47,90 (−R$ 2,10)');
    const drift = C.recurrenceChange({ kind: 'enrich-recurrence', target: target('t-d', 'Seguro Delta', 20.1, { sourceRef: null }) }, 2035);
    assert.deepEqual(drift, { oldCents: 2010, newCents: 2035, diffCents: 25 }, '20.1 is 2010 cents, not 2010.0000000000002');
    assert.equal(C.recurrenceChangeText(drift, fmt), 'Valor: R$ 20,10 → R$ 20,35 (+R$ 0,25)');
    const same = C.recurrenceChange(pRec, 5000);
    assert.equal(same.diffCents, 0);
    assert.equal(C.recurrenceChangeText(same, fmt), 'Valor: R$ 50,00 (igual ao previsto)');
    assert.equal(C.recurrenceChange({ kind: 'enrich-near', target: recOcc }, 4790), null, 'only for the recurrence kind');
    assert.equal(C.nearChange(pRec, 4790), null, 'the near-amount change does not apply to a recurrence');
    assert.equal(C.recurrenceChange({ kind: 'enrich-recurrence', target: null }, 4790), null);
  });

  check('ambiguous pairing: reason chip and a visible explanation; the plain one has neither', () => {
    const chip = C.proposalReasonChip(pRecAmb, (v: number) => String(v), (d: string) => d);
    assert.equal(chip.tone, 'orange');
    assert.equal(chip.text, 'recorrência, mais de uma opção');
    assert.match(chip.title, /confira/);
    assert.match(C.recurrenceAmbiguityNotice(pRecAmb), /confira se é o par certo/);
    assert.equal(C.recurrenceAmbiguityNotice(pRec), null);
    assert.equal(C.proposalReasonChip(pRec, (v: number) => String(v), (d: string) => d), null);
    assert.equal(C.recurrenceAmbiguityNotice({ ...pRec, kind: 'enrich-near', ambiguous: true }), null, 'only the recurrence kind');
  });
}
