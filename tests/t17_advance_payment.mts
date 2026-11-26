import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Advance payments of the card OFX import (backend a8de11c): the `advance-payment` proposal kind (a "Pagamento recebido" line that is
// not the previous invoice's payment becomes an INCOME credit on the card), its reasons ('sheet-credit-near', 'changed-in-statement'),
// the closing recomputation, the result texts and the queue totals. CARD_OFX_MODULE / CARD_CLOSING_MODULE / CARD_QUEUE_MODULE point at
// mutated copies for the bite-checks. All names and amounts are invented.
const load = async (env: string | undefined, rel: string) => import(pathToFileURL(env || frontSrc(rel)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const C: Any = await load(process.env.CARD_OFX_MODULE, 'utils/cardOfx.ts');
const CL: Any = await load(process.env.CARD_CLOSING_MODULE, 'utils/cardOfxClosing.ts');
const Q: Any = await load(process.env.CARD_QUEUE_MODULE, 'utils/cardOfxQueue.ts');

// ---- fixtures ---------------------------------------------------------------------------------------------

let n = 0;
const line = (memo: string, amount: number, o: Record<string, Any> = {}): Any => {
  n += 1;
  return {
    ref: `ofx:A${n}:0000000${n % 10}`, fitid: `A${n}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo,
    merchant: memo, installment: null, status: 'proposed', group: null, ...o,
  };
};
const row = (id: string, description: string, amount: number, date: string, o: Record<string, Any> = {}): Any => ({
  transactionId: id, description, amount, type: 'EXPENSE', date, sourceRef: `maxfin:2026-10:credit:${id}`, ...o,
});
const prop = (group: string, kind: string, ls: Any[], o: Record<string, Any> = {}): Any => {
  for (const l of ls) l.group = group;
  return {
    group, kind, refs: ls.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, absorbed: [], reason: null,
    counterpart: null, result: null, futureInstallments: 0, ...o,
  };
};

// Period 2026-09-02 .. 2026-10-02 (the last day belongs to the next statement unless the OFX lists lines dated on it).
const PERIOD = { start: '2026-09-02', end: '2026-10-02' };
const padaria = line('Padaria Aurora', 25.9, { date: '2026-09-03' });
const livraria = line('Livraria Prisma', 45.5, { date: '2026-09-15' });
const oficina = line('Oficina Horizonte', 310.4, { date: '2026-09-18' });
const adv1 = line('Pagamento recebido', 100, { type: 'INCOME', kind: 'payment', date: '2026-09-14' });
const adv2 = line('Pagamento recebido', 40.5, { type: 'INCOME', kind: 'payment', date: '2026-09-28' });
const adv3 = line('Pagamento recebido', 25, { type: 'INCOME', kind: 'payment', date: '2026-10-02' });
const advPaired = line('Pagamento recebido', 70, { type: 'INCOME', kind: 'payment', date: '2026-09-25' });
const faturaAnterior = line('Pagamento recebido', 900, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-09' });
const mercado = line('Mercado Colina', 60, { status: 'reconciled', date: '2026-09-05' });

const sheetCredit = row('t-credito', 'Pagamento recebido', 40.52, '2026-09-28', { type: 'INCOME' });
const oficinaOld = row('t-oficina-old', 'Oficina Horizonte', 305.4, '2026-09-19');
const stream = row('t-stream', 'Assinatura Biblioteca', 19.9, '2026-09-15');
const mercadoRow = row('t-mercado', 'Mercado', 60, '2026-09-05');
const creditoPareado = row('t-pareado', 'Pagamento antecipado', 70, '2026-09-25', { type: 'INCOME' });

const pE = prop('g-e', 'enrich-exact', [padaria], {
  target: row('t-padaria', 'Padaria', 25.9, '2026-09-03'), result: { date: '2026-09-03', description: 'Padaria Aurora', notesAppend: null },
});
const pC = prop('g-c', 'create', [livraria]);
const pCh = prop('g-ch', 'create', [oficina], { defaultSelected: false, reason: 'changed-in-statement', counterpart: oficinaOld });
const pA1 = prop('g-a1', 'advance-payment', [adv1]);
const pA2 = prop('g-a2', 'advance-payment', [adv2], { defaultSelected: false, reason: 'sheet-credit-near', counterpart: sheetCredit });
const pA3 = prop('g-a3', 'advance-payment', [adv3]);
const pPair = prop('g-pair', 'enrich-exact', [advPaired], {
  target: creditoPareado, result: { date: '2026-09-25', description: 'Pagamento recebido', notesAppend: null },
});
const proposals = [pE, pC, pCh, pA1, pA2, pA3, pPair];
const lines = [padaria, livraria, oficina, adv1, adv2, adv3, advPaired, faturaAnterior, mercado];
const stored = [stream, oficinaOld, sheetCredit, mercadoRow, pE.target, creditoPareado];
const sheetOnly = [stream, oficinaOld, sheetCredit];
const members = [mercadoRow.transactionId];

interface OracleIn { selected: Set<string>; endInclusive: boolean }
/** Independent oracle: the card projected after the selected proposals, counted in the period, the delta explained (cents). */
function oracle({ selected, endInclusive }: OracleIn): Any {
  const inP = (d: string) => d >= PERIOD.start && (endInclusive ? d <= PERIOD.end : d < PERIOD.end);
  const cents = (r: Any) => (r.type === 'INCOME' ? -1 : 1) * Math.round(r.amount * 100);
  const byRef = new Map(lines.map((l) => [l.ref, l]));
  const net = (refs: string[]) => refs.reduce((s, ref) => s + cents(byRef.get(ref)!), 0);
  const sheetOnlyIds = new Set(sheetOnly.map((r) => r.transactionId));
  const memberIds = new Set<string>(members);
  for (const p of proposals) if (p.target) memberIds.add(p.target.transactionId);
  const card = new Map<string, { c: number; d: string; so: boolean }>();
  for (const r of stored) card.set(r.transactionId, { c: cents(r), d: r.date, so: sheetOnlyIds.has(r.transactionId) });
  let uncreated = 0;
  let held = 0;
  const adv = new Set<string>();
  for (const p of proposals) {
    const on = selected.has(p.group);
    if (!on) {
      if (p.kind === 'create') uncreated += net(p.refs);
      else if (p.kind === 'advance-payment') continue; // payments are not in the OFX total
      else held += net(p.refs) - [p.target].filter((r) => inP(r.date)).reduce((s, r) => s + cents(r), 0);
      continue;
    }
    if (p.kind === 'create') card.set(`new:${p.group}`, { c: net(p.refs), d: byRef.get(p.refs[0])!.date, so: false });
    else if (p.kind === 'advance-payment') {
      card.set(`new:${p.group}`, { c: net(p.refs), d: byRef.get(p.refs[0])!.date, so: false });
      adv.add(`new:${p.group}`);
    } else {
      if (p.refs.every((ref: string) => byRef.get(ref)!.kind === 'payment')) adv.add(p.target.transactionId);
      card.set(p.target.transactionId, { c: cents(p.target), d: p.result.date, so: false });
    }
  }
  let recorded = 0;
  let advance = 0;
  let sheetOnlyIn = 0;
  let foreign = 0;
  for (const [id, e] of card) {
    if (!inP(e.d)) continue;
    recorded += e.c;
    if (adv.has(id)) advance += e.c;
    if (e.so) sheetOnlyIn += e.c;
    else if (!id.startsWith('new:') && !memberIds.has(id)) foreign += e.c;
  }
  const ofx = lines.filter((l) => l.kind !== 'payment').reduce((s, l) => s + cents(l), 0);
  const delta = ofx - recorded;
  return { ofx, recorded, delta, uncreated, held, sheetOnlyIn, foreign, advance, residual: delta - (uncreated + held - sheetOnlyIn - foreign - advance) };
}

const DEFAULTS = new Set(proposals.filter((p) => p.defaultSelected).map((p) => p.group));
const toClosing = (o: Any, endInclusive: boolean): Any => ({
  periodStart: PERIOD.start, periodEnd: PERIOD.end, endInclusive, ofxTotal: o.ofx / 100, recordedTotal: o.recorded / 100, delta: o.delta / 100,
  components: {
    uncreated: o.uncreated / 100, heldMatches: o.held / 100, sheetOnlyInPeriod: o.sheetOnlyIn / 100, foreignInPeriod: o.foreign / 100,
    advancePayments: o.advance / 100, residual: o.residual / 100,
  },
  sheetOnlyOutsidePeriod: 0, explained: Math.abs(o.residual) <= 5,
});
const mkPreview = (endInclusive = false, o: Record<string, Any> = {}): Any => ({
  accountId: 'acc-card', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement', period: PERIOD,
  ofxTotal: 381.8, lines, proposals, sheetOnly, payment: { ref: faturaAnterior.ref, amount: 900, date: '2026-09-09', invoiceMonthKey: '2026-09', recorded: null, proposal: 'ok' }, closing: toClosing(oracle({ selected: DEFAULTS, endInclusive }), endInclusive),
  categoryMap: [], totals: { lines: lines.length, reconciled: 1, proposals: proposals.length, create: 2, sheetOnly: 3 }, warnings: [], ...o,
});
const preview = mkPreview();
const sections = C.buildCardOfxSections(preview);
const defaultsSel = C.reconcileGroupSelection([], {}, sections.groups);
const ctx = { accounts: [], customIdsByType: { INCOME: new Set<string>(), EXPENSE: new Set<string>() } };
const build = (selection: Any, pv: Any = preview) => C.buildCardOfxConfirm(pv, selection, {}, C.defaultPaymentChoice(null), ctx);
const fmtA = (v: number, t: string) => `${t === 'INCOME' ? '+' : ''}R$ ${v.toFixed(2).replace('.', ',')}`;
const fmtD = (d: string) => d.split('-').reverse().join('/');
const fmtMoney = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

// ---- kind, section, selection -------------------------------------------------------------------------------

console.log('\n[T17] advance payments');

check('AP1: advance-payment is a known kind with its own section, label and default tick (sendable, selected as the server says)', () => {
  assert.equal(C.isKnownProposalKind('advance-payment'), true);
  assert.equal(C.proposalSection('advance-payment'), 'advance');
  assert.equal(C.PROPOSAL_KIND_LABEL['advance-payment'], 'pagamento antecipado');
  assert.deepEqual(sections.advance.map((g: Any) => g.proposal.group), ['g-a1', 'g-a2', 'g-a3']);
  assert.ok(sections.advance.every((g: Any) => g.sendable));
  assert.equal(defaultsSel['g-a1'], true);
  assert.equal(defaultsSel['g-a2'], false, 'held back by the server (sheet-credit-near)');
  assert.equal(defaultsSel['g-a3'], true);
  assert.ok(!sections.matched.some((g: Any) => g.section === 'advance'));
});

check('AP2: the lines of an advance-payment group are not listed as "paired with a sheet credit" nor as loose payments', () => {
  assert.deepEqual(sections.pairedAdvancePayments.map((l: Any) => l.ref), [advPaired.ref], 'only the enrich-paired one');
  assert.deepEqual(sections.advancePayments, []);
  const old = mkPreview(false, { proposals: [pE], lines: [padaria, adv1] });
  const s = C.buildCardOfxSections(old);
  assert.deepEqual(s.advancePayments.map((l: Any) => l.ref), [adv1.ref], 'with no proposal (older server) it stays information only');
  assert.deepEqual(s.pairedAdvancePayments, []);
});

check('AP3: an unknown kind next to it is shown but never sent (kinds stay safe)', () => {
  const odd = prop('g-odd', 'advance-payment-v2', [line('Pagamento recebido', 5, { type: 'INCOME', kind: 'payment' })]);
  const pv = mkPreview(false, { proposals: [...proposals, odd], lines: [...lines, ...odd.refs.map((r: string) => ({ ...line('x', 5), ref: r }))] });
  const s = C.buildCardOfxSections(pv);
  assert.equal(C.proposalSection('advance-payment-v2'), 'other');
  assert.deepEqual(s.other.map((g: Any) => g.proposal.group), ['g-odd']);
  const b = build({ ...defaultsSel, 'g-odd': true }, pv);
  assert.ok(!b.payload.selectedGroups.includes('g-odd'));
});

check('AP4: selectedGroups carries the ticked advance payments; categoryMap and the OFX estimate ignore them', () => {
  const b = build(defaultsSel);
  assert.deepEqual(b.payload.selectedGroups, ['g-e', 'g-c', 'g-a1', 'g-a3', 'g-pair']);
  assert.deepEqual(b.totals.advance, { groups: 2, lines: 2, cents: -12500 });
  const off = build({ ...defaultsSel, 'g-a1': false, 'g-a3': false });
  assert.ok(!off.payload.selectedGroups.includes('g-a1') && !off.payload.selectedGroups.includes('g-a3'));
  assert.equal(off.totals.advance.groups, 0);
  assert.equal(b.totals.rectaCents, off.totals.rectaCents, 'payments are outside the invoice total: ticking one does not move it');
  const on2 = build({ ...defaultsSel, 'g-a2': true });
  assert.ok(on2.payload.selectedGroups.includes('g-a2'));
  assert.equal(on2.totals.advance.groups, 3);
  assert.equal(C.cardOfxConfirmBlocker(on2, false), null);
});

check('AP5: only advance payments ticked is something to confirm (no blocker); none at all is "nothing to do"', () => {
  const only = mkPreview(false, { proposals: [pA1], lines: [adv1], sheetOnly: [] });
  const b = build({ 'g-a1': true }, only);
  assert.equal(C.cardOfxConfirmBlocker(b, false), null);
  assert.equal(C.cardOfxConfirmBlocker(build({ 'g-a1': false }, only), false).code, 'none-selected');
});

// ---- texts --------------------------------------------------------------------------------------------------

check('AP6: the headline and the effect say what happens, in plain Portuguese, with amount and bank date', () => {
  assert.equal(C.proposalHeadline(pA1), 'Pagamento antecipado de fatura: vira um crédito no cartão');
  assert.equal(C.ADVANCE_PAYMENT_HEADLINE, 'Pagamento antecipado de fatura: vira um crédito no cartão');
  assert.equal(C.advancePaymentEffect([adv1], fmtMoney, fmtD), 'Crédito de R$ 100,00 no cartão, na data do banco (14/09/2026)');
  assert.equal(C.advancePaymentEffect([], fmtMoney, fmtD), null);
});

check('AP7: reason chips: sheet-credit-near and changed-in-statement, each with its counterpart, no raw slug', () => {
  const near = C.proposalReasonChip(pA2, fmtA, fmtD);
  assert.equal(near.text, 'parece o crédito que já está na planilha');
  assert.equal(near.tone, 'orange');
  assert.match(near.title, /Pagamento recebido · 28\/09\/2026 · \+R\$ 40,52/);
  const changed = C.proposalReasonChip(pCh, fmtA, fmtD);
  assert.equal(changed.text, 'a compra mudou neste arquivo: confira antes de importar');
  assert.match(changed.title, /Oficina Horizonte · 19\/09\/2026 · R\$ 305,40/);
  for (const chip of [near, changed, C.proposalReasonChip({ ...pA2, counterpart: null }, fmtA, fmtD), C.proposalReasonChip({ ...pCh, counterpart: null }, fmtA, fmtD)]) {
    assert.doesNotMatch(chip.text + chip.title, /sheet-credit-near|changed-in-statement/);
  }
  assert.equal(C.proposalReasonChip({ ...pA2, counterpart: null }, fmtA, fmtD).text, 'parece o crédito que já está na planilha', 'no counterpart: still says why');
  assert.equal(C.proposalReasonChip({ ...pCh, counterpart: null }, fmtA, fmtD).text, 'a compra mudou neste arquivo: confira antes de importar');
});

check('AP8: the counterpart is shown as its own line for the two new reasons only', () => {
  assert.equal(C.counterpartNote(pA2, fmtA, fmtD), 'Crédito na planilha: Pagamento recebido · 28/09/2026 · +R$ 40,52');
  assert.equal(C.counterpartNote(pCh, fmtA, fmtD), 'Já registrada: Oficina Horizonte · 19/09/2026 · R$ 305,40');
  assert.equal(C.counterpartNote(pA1, fmtA, fmtD), null);
  assert.equal(C.counterpartNote({ reason: 'sheet-credit-near', counterpart: null }, fmtA, fmtD), null);
  assert.equal(C.counterpartNote({ reason: 'sheet-residue', counterpart: oficinaOld }, fmtA, fmtD), null, 'sheet-residue keeps its chip text');
});

check('AP9: the result lines, the toast and the queue totals count advancePayments; absent is zero', () => {
  const base = { enriched: 0, consumedFutures: 0, created: 0, futureInstallments: 0, reversalsImported: 0, payment: null, skipped: 0, createdCategories: [], warnings: [] };
  const three = { ...base, advancePayments: 3 };
  assert.ok(C.cardOfxResultLines(three, fmtMoney, fmtD).includes('3 pagamentos antecipados registrados'));
  assert.ok(C.cardOfxResultLines({ ...three, advancePayments: 1 }, fmtMoney, fmtD).includes('1 pagamento antecipado registrado'));
  assert.ok(!C.cardOfxResultLines(base, fmtMoney, fmtD).some((l: string) => /antecipado/.test(l)));
  assert.match(C.buildCardOfxSummary(three, fmtMoney), /3 pagamentos antecipados registrados/);
  assert.doesNotMatch(C.buildCardOfxSummary(base, fmtMoney), /antecipado/);
  assert.equal(C.buildCardOfxSummary(base, fmtMoney), 'Fatura importada: nada foi alterado.');
  const totals = Q.sumCardOfxResults([three, { ...base, advancePayments: 2 }, base]);
  assert.equal(totals.advancePayments, 5);
  assert.match(Q.cardQueueTotalsLine(totals), /5 pagamentos antecipados registrados/);
  assert.equal(Q.sumCardOfxResults([base]).advancePayments, 0);
  assert.equal(Q.cardQueueTotalsLine(Q.sumCardOfxResults([base])), 'nada foi alterado');
  assert.equal(totals.payments, 0, 'the previous invoice payment is a different count');
});

check('AP10: the default plan of a queued invoice sends the advance payments the server ticked and holds the others', () => {
  const plan = Q.planCardDefaultApply(preview, ctx, { sourceAccountId: '' });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.built.payload.selectedGroups, ['g-e', 'g-c', 'g-a1', 'g-a3', 'g-pair']);
  assert.equal(plan.built.totals.advance.groups, 2);
  const only = mkPreview(false, { proposals: [pA1], lines: [adv1], sheetOnly: [] });
  assert.equal(Q.planCardDefaultApply(only, ctx, { sourceAccountId: '' }).ok, true, 'a file with only an advance payment is not "nothing to do"');
});

// ---- closing ------------------------------------------------------------------------------------------------

console.log('\n[T17] closing with advance payments');

check('AP11: by hand: ticking the unticked advance payment (28/09, inside the period) adds a credit of 40.50 to the card', () => {
  const v = CL.buildClosingView(preview.closing, sections.groups, { ...defaultsSel, 'g-a2': true });
  assert.equal(v.basis, 'live');
  const base = CL.buildClosingView(preview.closing, sections.groups, defaultsSel);
  assert.equal(base.basis, 'default');
  assert.equal(v.recordedCents, base.recordedCents - 4050);
  assert.equal(v.deltaCents, base.deltaCents + 4050);
  assert.equal(v.components.advancePayments, base.components.advancePayments - 4050);
  assert.equal(v.components.residual, base.components.residual, 'the credit is explained by the advance payments component');
});

check('AP12: an advance payment dated on the closing day is outside the period (not counted) unless the OFX lists lines on it', () => {
  const base = CL.buildClosingView(preview.closing, sections.groups, { ...defaultsSel, 'g-a3': true });
  const off = CL.buildClosingView(preview.closing, sections.groups, { ...defaultsSel, 'g-a3': false });
  assert.equal(base.basis, 'default');
  assert.equal(off.recordedCents, base.recordedCents, 'dated 02/10 and endInclusive false: not in the period either way');
  assert.equal(off.components.advancePayments, base.components.advancePayments);
  const inc = mkPreview(true);
  const sInc = C.buildCardOfxSections(inc);
  const incBase = CL.buildClosingView(inc.closing, sInc.groups, defaultsSel);
  const incOff = CL.buildClosingView(inc.closing, sInc.groups, { ...defaultsSel, 'g-a3': false });
  assert.equal(incOff.recordedCents, incBase.recordedCents + 2500, 'with endInclusive the 25.00 credit counts');
  assert.equal(incOff.components.advancePayments, incBase.components.advancePayments + 2500);
});

check('AP13: unticking an advance payment never touches "uncreated" or "heldMatches" (it is not in the OFX total)', () => {
  const v = CL.buildClosingView(preview.closing, sections.groups, { ...defaultsSel, 'g-a1': false });
  assert.equal(v.components.uncreated, Math.round(preview.closing.components.uncreated * 100));
  assert.equal(v.components.heldMatches, 0);
  assert.equal(v.deltaCents, Math.round(preview.closing.delta * 100) - 10000);
  assert.equal(v.components.advancePayments, Math.round(preview.closing.components.advancePayments * 100) + 10000);
  assert.equal(v.explained, true);
});

check('AP14: property: every combination of the 7 proposals equals the closing computed from scratch (both endInclusive)', () => {
  const ids = proposals.map((p) => p.group);
  let compared = 0;
  for (const endInclusive of [false, true]) {
    const pv = mkPreview(endInclusive);
    const s = C.buildCardOfxSections(pv);
    for (let mask = 0; mask < 1 << ids.length; mask += 1) {
      const chosen = ids.filter((_, i) => mask & (1 << i));
      const selection = Object.fromEntries(ids.map((id) => [id, chosen.includes(id)]));
      const v = CL.buildClosingView(pv.closing, s.groups, selection);
      const o = oracle({ selected: new Set(chosen), endInclusive });
      const got = {
        recorded: v.recordedCents, delta: v.deltaCents, uncreated: v.components.uncreated, held: v.components.heldMatches,
        sheetOnlyIn: v.components.sheetOnlyInPeriod, foreign: v.components.foreignInPeriod, advance: v.components.advancePayments, residual: v.components.residual,
      };
      const want = { recorded: o.recorded, delta: o.delta, uncreated: o.uncreated, held: o.held, sheetOnlyIn: o.sheetOnlyIn, foreign: o.foreign, advance: o.advance, residual: o.residual };
      assert.deepEqual(got, want, `selection ${chosen.join(',') || '(none)'} endInclusive=${endInclusive}`);
      assert.notEqual(v.basis, 'server-default', 'every kind in the fixture is recomputable');
      compared += 1;
    }
  }
  assert.equal(compared, 256);
});

check('AP15: the closing row is named for all advance credits (sheet or OFX), signed to explain the delta', () => {
  const v = CL.buildClosingView(preview.closing, sections.groups, defaultsSel);
  const r = CL.closingRows(v).find((x: Any) => x.key === 'advancePayments');
  assert.equal(r.label, 'Créditos de pagamentos antecipados');
  assert.equal(r.cents, 7000 + 10000 + 0, 'default: the paired 70.00 and the recorded 100.00 (the 25.00 one is outside the period)');
  assert.doesNotMatch(r.hint, /advance-payment/);
});

// ---- round 2 (backend e1e9b56): ledgerBalance echo, payment-ambiguous, a changed advance payment ----------------

console.log('\n[T17] ledgerBalance and the new reasons');

check('AP16: the preview ledgerBalance is echoed in the confirm payload (also 0 and negative); absent, null or not a number is omitted', () => {
  const echoed = (v: Any) => build(defaultsSel, { ...preview, ledgerBalance: v }).payload;
  assert.equal(echoed(1234.56).ledgerBalance, 1234.56);
  assert.equal(echoed(0).ledgerBalance, 0, 'zero is a balance, not an absence');
  assert.equal(echoed(-12.5).ledgerBalance, -12.5);
  for (const absent of [null, undefined, Number.NaN, '99', Number.POSITIVE_INFINITY]) {
    assert.equal(Object.prototype.hasOwnProperty.call(echoed(absent), 'ledgerBalance'), false, `omitted for ${String(absent)}`);
  }
  const noKey = { ...preview };
  delete noKey.ledgerBalance;
  assert.equal(Object.prototype.hasOwnProperty.call(build(defaultsSel, noKey).payload, 'ledgerBalance'), false);
});

check('AP17: the queue default plan (apply to the rest) echoes the ledgerBalance too, and omits it when the preview has none', () => {
  const withBalance = Q.planCardDefaultApply({ ...preview, ledgerBalance: 842.1 }, ctx, { sourceAccountId: '' });
  assert.equal(withBalance.ok, true);
  assert.equal(withBalance.built.payload.ledgerBalance, 842.1);
  const without = Q.planCardDefaultApply({ ...preview, ledgerBalance: null }, ctx, { sourceAccountId: '' });
  assert.equal(without.ok, true);
  assert.equal('ledgerBalance' in without.built.payload, false);
});

check('AP18: payment-ambiguous reads in plain Portuguese, with no slug and no counterpart needed', () => {
  const chip = C.proposalReasonChip({ kind: 'advance-payment', reason: 'payment-ambiguous', counterpart: null }, fmtA, fmtD);
  assert.equal(chip.text, 'não deu para saber qual é o pagamento principal da fatura: confira antes de importar');
  assert.equal(chip.tone, 'orange');
  assert.doesNotMatch(chip.text + chip.title, /payment-ambiguous/);
  assert.equal(C.counterpartNote({ reason: 'payment-ambiguous', counterpart: null }, fmtA, fmtD), null);
});

check('AP19: a changed advance payment says "o pagamento antecipado mudou", a changed purchase keeps its own text; the counterpart is the existing credit', () => {
  const credit = row('t-cred-old', 'Pagamento recebido', 90, '2026-09-14', { type: 'INCOME' });
  const advance = { kind: 'advance-payment', reason: 'changed-in-statement', counterpart: credit };
  const chip = C.proposalReasonChip(advance, fmtA, fmtD);
  assert.equal(chip.text, 'o pagamento antecipado mudou neste arquivo: confira antes de importar');
  assert.match(chip.title, /Pagamento recebido · 14\/09\/2026 · \+R\$ 90,00/);
  assert.equal(C.proposalReasonChip({ ...advance, counterpart: null }, fmtA, fmtD).text, 'o pagamento antecipado mudou neste arquivo: confira antes de importar');
  assert.equal(C.proposalReasonChip({ kind: 'create', reason: 'changed-in-statement', counterpart: oficinaOld }, fmtA, fmtD).text, 'a compra mudou neste arquivo: confira antes de importar');
  assert.equal(C.proposalReasonChip({ reason: 'changed-in-statement', counterpart: oficinaOld }, fmtA, fmtD).text, 'a compra mudou neste arquivo: confira antes de importar', 'no kind: the purchase text');
  assert.equal(C.counterpartNote(advance, fmtA, fmtD), 'Já registrada: Pagamento recebido · 14/09/2026 · +R$ 90,00');
  assert.doesNotMatch(chip.text + chip.title, /changed-in-statement/);
});

check('AP20: a held advance payment (changed or ambiguous) is not ticked by default and is sent only when the user ticks it', () => {
  const credit = row('t-cred-old', 'Pagamento recebido', 90, '2026-09-14', { type: 'INCOME' });
  const held1 = line('Pagamento recebido', 95, { type: 'INCOME', kind: 'payment', date: '2026-09-14' });
  const held2 = line('Pagamento recebido', 60, { type: 'INCOME', kind: 'payment', date: '2026-09-20' });
  const h1 = prop('g-h1', 'advance-payment', [held1], { defaultSelected: false, reason: 'changed-in-statement', counterpart: credit });
  const h2 = prop('g-h2', 'advance-payment', [held2], { defaultSelected: false, reason: 'payment-ambiguous' });
  const pv = mkPreview(false, { proposals: [h1, h2], lines: [held1, held2], sheetOnly: [], ledgerBalance: 500 });
  const s = C.buildCardOfxSections(pv);
  const sel0 = C.reconcileGroupSelection([], {}, s.groups);
  assert.deepEqual(sel0, { 'g-h1': false, 'g-h2': false });
  assert.deepEqual(build(sel0, pv).payload.selectedGroups, []);
  assert.deepEqual(build({ ...sel0, 'g-h2': true }, pv).payload.selectedGroups, ['g-h2']);
  assert.equal(build({ ...sel0, 'g-h2': true }, pv).payload.ledgerBalance, 500);
});

// ---- round 3 (backend 1fd50f8): paymentLineRef echo and "Reabra a prévia" ---------------------------------------

check('AP21: payment.ref goes back as paymentLineRef; no payment, no ref or an empty ref omit it; a ref does not need a ledgerBalance', () => {
  const sent = (pv: Any) => build(defaultsSel, pv).payload;
  assert.equal(sent({ ...preview, ledgerBalance: null }).paymentLineRef, faturaAnterior.ref);
  assert.equal(sent(preview).paymentLineRef, faturaAnterior.ref);
  const has = (o: Any) => Object.prototype.hasOwnProperty.call(o, 'paymentLineRef');
  assert.equal(has(sent({ ...preview, payment: null })), false);
  const noKey = { ...preview };
  delete noKey.payment;
  assert.equal(has(sent(noKey)), false, 'the payment object may be missing');
  assert.equal(has(sent({ ...preview, payment: { ...preview.payment, ref: '' } })), false);
  assert.equal(has(sent({ ...preview, payment: { ...preview.payment, ref: undefined } })), false);
  assert.equal(sent({ ...preview, ledgerBalance: 10 }).ledgerBalance, 10, 'both fields travel together');
});

check('AP22: the queue default plan echoes paymentLineRef too, and omits it without a payment', () => {
  const plan = Q.planCardDefaultApply({ ...preview, ledgerBalance: 5 }, ctx, { sourceAccountId: '' });
  assert.equal(plan.ok, true);
  assert.equal(plan.built.payload.paymentLineRef, faturaAnterior.ref);
  const none = Q.planCardDefaultApply({ ...preview, payment: null }, ctx, { sourceAccountId: '' });
  assert.equal(none.ok, true);
  assert.equal('paymentLineRef' in none.built.payload, false);
});

check('AP23: when the server answers "Reabra a prévia" the result and the toast say the payments were not applied', () => {
  const base = { enriched: 1, consumedFutures: 0, created: 0, futureInstallments: 0, reversalsImported: 0, advancePayments: 0, payment: null, skipped: 0, createdCategories: [], warnings: [] };
  const warned = { ...base, warnings: ['Esta fatura tem mais de um "Pagamento recebido" e o pedido não trouxe o saldo. O pagamento e os antecipados não foram aplicados. Reabra a prévia.'] };
  assert.equal(C.paymentsNotApplied(warned), true);
  assert.equal(C.paymentsNotApplied({ ...base, warnings: ['outro aviso'] }), false);
  assert.equal(C.paymentsNotApplied({ warnings: undefined }), false);
  assert.ok(C.cardOfxResultLines(warned, fmtMoney, fmtD).includes('O pagamento da fatura anterior e os pagamentos antecipados não foram aplicados: reabra a prévia.'));
  assert.ok(!C.cardOfxResultLines(base, fmtMoney, fmtD).some((l: string) => /reabra/.test(l)));
  assert.match(C.buildCardOfxSummary(warned, fmtMoney), /pagamentos não aplicados: reabra a prévia/);
  assert.doesNotMatch(C.buildCardOfxSummary(base, fmtMoney), /reabra/);
});
