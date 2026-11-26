import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Gaps A/B/C of the card OFX import (frontend): merges (enrich-merge), the reasons of unticked proposals, the statement
// closing (server value + live recomputation) and the review queue. CARD_OFX_MODULE / CARD_CLOSING_MODULE /
// CARD_REVIEW_MODULE / CARD_QUEUE_MODULE point at mutated copies for the bite-checks.
const load = async (env: string | undefined, rel: string) => import(pathToFileURL(env || frontSrc(rel)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const C: Any = await load(process.env.CARD_OFX_MODULE, 'utils/cardOfx.ts');
const CL: Any = await load(process.env.CARD_CLOSING_MODULE, 'utils/cardOfxClosing.ts');
const RV: Any = await load(process.env.CARD_REVIEW_MODULE, 'utils/cardOfxReview.ts');
const Q: Any = await load(process.env.CARD_QUEUE_MODULE, 'utils/cardOfxQueue.ts');

// ---- fixtures (invented merchants and amounts) ------------------------------------------------------------

let n = 0;
const line = (memo: string, amount: number, o: Record<string, Any> = {}): Any => {
  n += 1;
  return {
    ref: `ofx:Z${n}:0000000${n % 10}`, fitid: `Z${n}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo,
    merchant: memo, installment: null, status: 'proposed', group: null, ...o,
  };
};
const row = (id: string, description: string, amount: number, date: string, o: Record<string, Any> = {}): Any => ({
  transactionId: id, description, amount, type: 'EXPENSE', date, sourceRef: `maxfin:2026-10:credit:${id}`, ...o,
});
const prop = (group: string, kind: string, lines: Any[], o: Record<string, Any> = {}): Any => {
  for (const l of lines) l.group = group;
  return {
    group, kind, refs: lines.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, absorbed: [], reason: null,
    counterpart: null, result: null, futureInstallments: 0, ...o,
  };
};

// Period 2026-09-02 .. 2026-10-02 (the last day is the next statement's first day: endInclusive false).
const PERIOD = { start: '2026-09-02', end: '2026-10-02' };
const padaria = line('Padaria Sol', 25.9, { date: '2026-09-03' });
const posto1 = line('Posto Via Norte', 120);
const posto2 = line('Posto Via Norte', 80);
const shopee = line('Shopee Loja Alfa', 91.3, { date: '2026-09-12' });
const beta = line('Loja Beta - Parcela 3/6', 50, { installment: { number: 3, total: 6 } });
const livraria = line('Livraria Gama', 45.5, { date: '2026-09-15' });
const eletro = line('Eletro Delta', 300, { date: '2026-09-20' });
const siteBuy = line('Site Omega', 199.99);
const siteRefund = line('Site Omega', 199.99, { type: 'INCOME', kind: 'refund' });
const mercado = line('Mercado Zeta', 60, { status: 'reconciled', date: '2026-09-05' });
const antecipado = line('Pagamento recebido', 70, { type: 'INCOME', kind: 'payment', date: '2026-09-25' });
const pagamento = line('Pagamento recebido', 900, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-09' });

const eletroOld = row('t-eletro-old', 'Eletro Delta 1/3', 299, '2026-09-21');
const pE1 = prop('g-e1', 'enrich-exact', [padaria], {
  target: row('t-padaria', 'Padaria', 25.9, '2026-09-01'), result: { date: '2026-09-03', description: 'Padaria Sol', notesAppend: null },
});
const pE2 = prop('g-e2', 'enrich-sum', [posto1, posto2], {
  target: row('t-gasolina', 'Gasolina 200', 200, '2026-09-09'), result: { date: '2026-09-10', description: 'Gasolina 200', notesAppend: null },
});
const pM1 = prop('g-m1', 'enrich-merge', [shopee], {
  target: row('t-shoppe1', 'Shoppe - Cabide', 36.86, '2026-09-11'), absorbed: [row('t-shoppe2', 'Shoppe - Frascos', 54.44, '2026-09-11')],
  result: { date: '2026-09-12', description: 'Shopee Loja Alfa', notesAppend: 'Planilha (soma de 2 linhas): Shoppe - Frascos 54,44' },
});
const pF1 = prop('g-f1', 'consume-future', [beta], {
  target: row('t-beta3', 'Loja Beta 3/6', 50, '2026-10-01'), result: { date: '2026-09-10', description: 'Loja Beta - Parcela 3/6', notesAppend: null },
});
const pC1 = prop('g-c1', 'create', [livraria]);
const pC2 = prop('g-c2', 'create', [eletro], {
  defaultSelected: false, reason: 'sheet-residue', counterpart: eletroOld,
});
const pR1 = prop('g-r1', 'reversal', [siteBuy, siteRefund], { defaultSelected: false });
const pA1 = prop('g-a1', 'enrich-exact', [antecipado], {
  target: row('t-antecipado', 'Pagamento antecipado', 70, '2026-09-25', { type: 'INCOME' }),
  result: { date: '2026-09-25', description: 'Pagamento recebido', notesAppend: null },
});
const pAmb = prop('g-amb', 'enrich-sum', [line('Farmacia Kappa', 30), line('Farmacia Kappa', 20)], {
  defaultSelected: false, ambiguous: true, reason: 'ambiguous', target: row('t-farmacia', 'Farmácia 50', 50, '2026-09-10'),
  result: { date: '2026-09-10', description: 'Farmácia 50', notesAppend: null },
});

const stream = row('t-stream', 'Assinatura Streaming', 39.9, '2026-09-15');
const manual = row('t-manual', 'Lançamento manual', 10, '2026-09-20');
const mercadoRow = row('t-mercado', 'Mercado', 60, '2026-09-05');

const proposals = [pE1, pE2, pM1, pF1, pC1, pC2, pR1, pA1];
const lines = [padaria, posto1, posto2, shopee, beta, livraria, eletro, siteBuy, siteRefund, mercado, antecipado, pagamento];

/**
 * Independent oracle: the closing computed from scratch for a selection, from the rows the card holds (as the
 * backend's card-ofx-closing.ts does it: project the card, count what is in the period, explain the delta). Cents.
 */
const MAIN: Fx = {
  proposals, lines, sheetOnly: [stream, eletroOld], members: [mercadoRow.transactionId],
  stored: [stream, eletroOld, manual, mercadoRow, pE2.target, pM1.target, ...pM1.absorbed, pF1.target, pA1.target],
};

interface Fx { proposals: Any[]; lines: Any[]; stored: Any[]; sheetOnly: Any[]; members: string[] }
interface OracleIn { selected: Set<string>; endInclusive?: boolean; fx?: Fx }
function oracle({ selected, endInclusive = false, fx = MAIN }: OracleIn): Any {
  const { proposals, lines } = fx;
  const inP = (d: string) => d >= PERIOD.start && (endInclusive ? d <= PERIOD.end : d < PERIOD.end);
  const cents = (r: Any) => (r.type === 'INCOME' ? -1 : 1) * Math.round(r.amount * 100);
  const lineByRef = new Map(lines.map((l) => [l.ref, l]));
  const net = (refs: string[]) => refs.reduce((s, ref) => s + cents(lineByRef.get(ref)!), 0);
  const stored = fx.stored.filter((r: Any) => inP(r.date));
  const sheetOnlyIds = new Set(fx.sheetOnly.map((r: Any) => r.transactionId));
  const members = new Set<string>(fx.members);
  for (const p of proposals) {
    if (p.target) members.add(p.target.transactionId);
    for (const a of p.absorbed) members.add(a.transactionId);
  }
  const projected = new Map<string, { c: number; d: string; sheetOnly: boolean }>();
  for (const r of stored) projected.set(r.transactionId, { c: cents(r), d: r.date, sheetOnly: sheetOnlyIds.has(r.transactionId) });
  let uncreated = 0;
  let held = 0;
  const advance = new Set<string>();
  for (const p of proposals) {
    const sel = selected.has(p.group);
    const lineNet = net(p.refs);
    if (!sel) {
      if (p.kind === 'create' || p.kind === 'reversal') uncreated += lineNet;
      else {
        const standing = [p.target, ...p.absorbed].filter((r: Any) => inP(r.date)).reduce((s: number, r: Any) => s + cents(r), 0);
        held += lineNet - standing;
      }
      continue;
    }
    if (p.kind === 'create') projected.set(`new:${p.group}`, { c: lineNet, d: lineByRef.get(p.refs[0])!.date, sheetOnly: false });
    else if (p.kind === 'reversal') continue;
    else {
      if (p.refs.every((ref: string) => lineByRef.get(ref)!.kind === 'payment')) advance.add(p.target.transactionId);
      const c = p.kind === 'enrich-merge' || p.kind === 'consume-future' || p.kind === 'enrich-near' ? lineNet : cents(p.target);
      projected.set(p.target.transactionId, { c, d: p.result.date, sheetOnly: false });
      for (const a of p.absorbed) projected.delete(a.transactionId);
    }
  }
  let recorded = 0;
  let adv = 0;
  let sheetOnlyIn = 0;
  let foreign = 0;
  for (const [id, e] of projected) {
    if (!inP(e.d)) continue;
    recorded += e.c;
    if (advance.has(id)) adv += e.c;
    if (e.sheetOnly) sheetOnlyIn += e.c;
    else if (!id.startsWith('new:') && !members.has(id)) foreign += e.c;
  }
  const ofx = lines.filter((l) => l.kind !== 'payment').reduce((s, l) => s + cents(l), 0);
  const delta = ofx - recorded;
  const residual = delta - (uncreated + held - sheetOnlyIn - foreign - adv);
  return { ofx, recorded, delta, uncreated, held, sheetOnlyIn, foreign, advance: adv, residual };
}

const DEFAULTS = new Set(proposals.filter((p) => p.defaultSelected).map((p) => p.group));
const toClosing = (o: Any): Any => ({
  periodStart: PERIOD.start, periodEnd: PERIOD.end, endInclusive: false, ofxTotal: o.ofx / 100, recordedTotal: o.recorded / 100, delta: o.delta / 100,
  components: {
    uncreated: o.uncreated / 100, heldMatches: o.held / 100, sheetOnlyInPeriod: o.sheetOnlyIn / 100, foreignInPeriod: o.foreign / 100,
    advancePayments: o.advance / 100, residual: o.residual / 100,
  },
  sheetOnlyOutsidePeriod: 0, explained: Math.abs(o.residual) <= 5,
});
const mkPreview = (o: Record<string, Any> = {}): Any => ({
  accountId: 'acc-card', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement', period: PERIOD,
  ofxTotal: 772.7, lines, proposals, sheetOnly: [stream, eletroOld], payment: null, closing: toClosing(oracle({ selected: DEFAULTS })), categoryMap: [],
  totals: { lines: lines.length, reconciled: 1, proposals: proposals.length, create: 2, sheetOnly: 2 }, warnings: [], ...o,
});
const preview = mkPreview();
const sections = C.buildCardOfxSections(preview);
const defaultsSel = C.reconcileGroupSelection([], {}, sections.groups);
const sel = (ids: string[]) => Object.fromEntries(proposals.map((p) => [p.group, ids.includes(p.group)]));
const view = (selection: Any, closing: Any = preview.closing) => CL.buildClosingView(closing, sections.groups, selection);
const ids = (groups: Any[]) => groups.map((g) => g.proposal.group);

// ---- G-A: merges and reasons ---------------------------------------------------------------------------------

console.log('\n[GA] enrich-merge and the reasons of unticked proposals');

check('GA1: a merge is a "matched" proposal, sendable, with its label; the server default tick is kept', () => {
  assert.ok(ids(sections.matched).includes('g-m1'), 'enrich-merge belongs to the matched section');
  const group = sections.groups.find((g: Any) => g.proposal.group === 'g-m1');
  assert.equal(group.sendable, true);
  assert.equal(C.isKnownProposalKind('enrich-merge'), true);
  assert.equal(C.PROPOSAL_KIND_LABEL['enrich-merge'], 'mesclagem');
  assert.equal(C.defaultGroupSelected(group), true);
  assert.equal(defaultsSel['g-m1'], true);
});

check('GA2: "Soma de N lançamentos da planilha" counts the row that stays plus the absorbed ones', () => {
  assert.equal(C.mergeRowCount(pM1), 2);
  assert.equal(C.mergeSummary(pM1), 'Soma de 2 lançamentos da planilha');
  const three = { ...pM1, absorbed: [...pM1.absorbed, row('t-x', 'Outro', 1, '2026-09-11')] };
  assert.equal(C.mergeSummary(three), 'Soma de 3 lançamentos da planilha');
  assert.equal(C.mergeSummary(pE1), null, 'not a merge');
  assert.equal(C.mergeRowCount({ ...pM1, target: null }), null);
  assert.match(C.mergeAbsorbedNotice(pM1), /^1 lançamento absorvido será apagado/);
  assert.match(C.mergeAbsorbedNotice(three), /^2 lançamentos absorvidos serão apagados/);
  assert.equal(C.mergeAbsorbedNotice(pE1), null);
});

check('GA3: the merge goes in selectedGroups only when ticked; the confirm echoes every line', () => {
  const on = C.buildCardOfxConfirm(preview, { ...defaultsSel, 'g-m1': true }, {}, C.defaultPaymentChoice(null), { accounts: [], customIdsByType: { INCOME: new Set(), EXPENSE: new Set() } });
  const off = C.buildCardOfxConfirm(preview, { ...defaultsSel, 'g-m1': false }, {}, C.defaultPaymentChoice(null), { accounts: [], customIdsByType: { INCOME: new Set(), EXPENSE: new Set() } });
  assert.ok(on.payload.selectedGroups.includes('g-m1'));
  assert.ok(!off.payload.selectedGroups.includes('g-m1'));
  assert.equal(on.totals.enriched.groups - off.totals.enriched.groups, 1);
});

check('GA4: the client estimate counts a ticked merge once at the bank amount, an unticked one as its rows', () => {
  const ctx = { accounts: [], customIdsByType: { INCOME: new Set<string>(), EXPENSE: new Set<string>() } };
  const only = { ...preview, proposals: [pM1], lines: [shopee], sheetOnly: [] };
  const tick = C.buildCardOfxConfirm(only, { 'g-m1': true }, {}, C.defaultPaymentChoice(null), ctx).totals.rectaCents;
  const untick = C.buildCardOfxConfirm(only, { 'g-m1': false }, {}, C.defaultPaymentChoice(null), ctx).totals.rectaCents;
  assert.equal(tick, 9130);
  assert.equal(untick, 3686 + 5444, 'the row and the absorbed one both stay');
});

check('GA5: reason chips: ambiguous, no-shared-words, mixed-categories, sheet-residue (with the counterpart amount)', () => {
  const fmt = (v: number, t: string) => `${t === 'INCOME' ? '+' : ''}R$ ${v.toFixed(2).replace('.', ',')}`;
  const fmtDate = (d: string) => d.split('-').reverse().join('/');
  const chip = (reason: string | null, counterpart: Any = null) => C.proposalReasonChip({ reason, counterpart }, fmt, fmtDate);
  assert.equal(chip(null), null, 'a ticked proposal has no chip');
  assert.equal(chip(''), null);
  assert.equal(chip('ambiguous').text, 'ambígua');
  assert.equal(chip('no-shared-words').text, 'sem palavras em comum');
  assert.equal(chip('mixed-categories').text, 'categorias diferentes');
  const residue = chip('sheet-residue', pC2.counterpart);
  assert.equal(residue.text, 'parecida com a planilha: R$ 299,00');
  assert.match(residue.title, /Eletro Delta 1\/3 · 21\/09\/2026 · R\$ 299,00/);
  assert.equal(residue.tone, 'orange');
  assert.equal(chip('sheet-residue').text, 'sobra na planilha', 'no counterpart: still says why');
  const unknown = chip('future-reason');
  assert.equal(unknown.text, 'desmarcada pelo servidor');
  assert.equal(unknown.tone, 'gray');
  assert.doesNotMatch(unknown.text + unknown.title, /future-reason/, 'a slug is never shown');
  assert.equal(C.proposalReasonChip(pAmb, fmt, fmtDate).reason, 'ambiguous');
});

check('GA6: absorbedRows in the result lines, the toast and the queue totals; absent counts as zero', () => {
  const base = { enriched: 3, consumedFutures: 0, created: 0, futureInstallments: 0, reversalsImported: 0, payment: null, skipped: 0, createdCategories: [], warnings: [] };
  const fmtMoney = (v: number) => String(v);
  const withAbs = { ...base, absorbedRows: 2 };
  assert.ok(C.cardOfxResultLines(withAbs, fmtMoney, (d: string) => d).includes('2 lançamentos da planilha absorvidos e apagados em mesclagens'));
  assert.ok(C.cardOfxResultLines({ ...withAbs, absorbedRows: 1 }, fmtMoney, (d: string) => d).includes('1 lançamento da planilha absorvido e apagado em uma mesclagem'));
  assert.ok(!C.cardOfxResultLines(base, fmtMoney, (d: string) => d).some((l: string) => /absorvid/.test(l)));
  assert.match(C.buildCardOfxSummary(withAbs, fmtMoney), /2 lançamentos absorvidos/);
  assert.doesNotMatch(C.buildCardOfxSummary(base, fmtMoney), /absorvid/);
  const totals = Q.sumCardOfxResults([withAbs, { ...base, absorbedRows: 1 }, base]);
  assert.equal(totals.absorbedRows, 3);
  assert.match(Q.cardQueueTotalsLine(totals), /3 lançamentos absorvidos/);
  assert.equal(Q.sumCardOfxResults([base]).absorbedRows, 0);
});

// ---- G-C: the statement closing -----------------------------------------------------------------------------------

console.log('\n[GC] closing of the invoice');

check('GC1: by hand, the fixture holds 751.60 against the OFX 772.70: delta 21.10 and no residual', () => {
  const o = oracle({ selected: DEFAULTS });
  assert.equal(o.ofx, 77270);
  assert.equal(o.recorded, 75160, '39.90 + 299 + 10 + 60 + 25.90 + 200 + 91.30 + 50 + 45.50 - 70');
  assert.equal(o.delta, 2110);
  assert.equal(o.uncreated, 30000);
  assert.equal(o.sheetOnlyIn, 33890);
  assert.equal(o.foreign, 1000);
  assert.equal(o.advance, -7000);
  assert.equal(o.residual, 0);
});

check('GC2: with the default selection the view IS the server closing (cents, basis "default")', () => {
  const v = view(defaultsSel);
  assert.equal(v.basis, 'default');
  assert.equal(v.changedGroups, 0);
  assert.equal(v.ofxCents, 77270);
  assert.equal(v.recordedCents, 75160);
  assert.equal(v.deltaCents, 2110);
  assert.deepEqual(v.components, { uncreated: 30000, heldMatches: 0, sheetOnlyInPeriod: 33890, foreignInPeriod: 1000, advancePayments: -7000, residual: 0 });
  assert.equal(v.explained, true);
});

check('GC3: unticking a new purchase puts it in "uncreated" and raises the delta by exactly its amount', () => {
  const v = view({ ...defaultsSel, 'g-c1': false });
  assert.equal(v.basis, 'live');
  assert.equal(v.changedGroups, 1);
  assert.equal(v.deltaCents, 2110 + 4550);
  assert.equal(v.components.uncreated, 30000 + 4550);
  assert.equal(v.recordedCents, 75160 - 4550);
  assert.equal(v.components.residual, 0);
});

check('GC4: ticking the unticked new purchase (dated in the period) lowers the delta and the uncreated', () => {
  const v = view({ ...defaultsSel, 'g-c2': true });
  assert.equal(v.deltaCents, 2110 - 30000);
  assert.equal(v.components.uncreated, 0);
  assert.equal(v.explained, true);
});

check('GC5: unticking a match whose stored date is outside the period: held matches, no residual', () => {
  const v = view({ ...defaultsSel, 'g-e1': false });
  assert.equal(v.components.heldMatches, 2590, 'the line is missing from the card: its sheet row is outside the period');
  assert.equal(v.deltaCents, 2110 + 2590);
  assert.equal(v.components.residual, 0);
});

check('GC6: a ticked reversal pair changes nothing in the card but is no longer uncreated (its net is zero)', () => {
  const v = view({ ...defaultsSel, 'g-r1': true });
  assert.equal(v.deltaCents, 2110);
  assert.equal(v.components.uncreated, 30000);
  assert.equal(v.components.residual, 0);
});

check('GC7: unticking the advance-payment match leaves the sheet credit in the card and out of "advance" (residual absorbs it, as the server does)', () => {
  const v = view({ ...defaultsSel, 'g-a1': false });
  assert.equal(v.components.advancePayments, 0);
  assert.equal(v.deltaCents, 2110);
  assert.equal(v.components.residual, 7000);
  assert.equal(v.explained, false);
});

check('GC8: property: every combination of the 8 proposals equals the closing computed from scratch', () => {
  const groups = proposals.map((p) => p.group);
  let compared = 0;
  for (let mask = 0; mask < 1 << groups.length; mask += 1) {
    const chosen = groups.filter((_, i) => mask & (1 << i));
    const v = view(sel(chosen));
    const o = oracle({ selected: new Set(chosen) });
    const got = {
      recorded: v.recordedCents, delta: v.deltaCents, uncreated: v.components.uncreated, held: v.components.heldMatches,
      sheetOnlyIn: v.components.sheetOnlyInPeriod, foreign: v.components.foreignInPeriod, advance: v.components.advancePayments, residual: v.components.residual,
    };
    const want = { recorded: o.recorded, delta: o.delta, uncreated: o.uncreated, held: o.held, sheetOnlyIn: o.sheetOnlyIn, foreign: o.foreign, advance: o.advance, residual: o.residual };
    assert.deepEqual(got, want, `selection ${chosen.join(',') || '(none)'}`);
    assert.equal(v.explained, Math.abs(o.residual) <= 5);
    compared += 1;
  }
  assert.equal(compared, 256);
});

check('GC9: the end day counts only when the closing says so (endInclusive comes from the server)', () => {
  const lateLine = line('Compra no último dia', 20, { date: '2026-10-02' });
  const lateProp = prop('g-late', 'create', [lateLine]);
  const p2 = { ...preview, lines: [...lines, lateLine], proposals: [...proposals, lateProp] };
  const s2 = C.buildCardOfxSections(p2);
  const unticked = { ...defaultsSel, 'g-late': false };
  const off = CL.buildClosingView({ ...preview.closing, endInclusive: false }, s2.groups, unticked);
  const on = CL.buildClosingView({ ...preview.closing, endInclusive: true }, s2.groups, unticked);
  assert.equal(off.recordedCents, 75160, 'the last day belongs to the next statement: the purchase never counted in the card');
  assert.equal(on.recordedCents, 75160 - 2000, 'the last day is inside: not creating the purchase removes it from the card total');
  assert.equal(on.endInclusive, true);
  assert.equal(off.endInclusive, false);
});

check('GC10: a change the calculation does not cover keeps the server value and says so (basis "server-default")', () => {
  const unknown = prop('g-weird', 'teleport', [line('Algo novo', 5)], { defaultSelected: true });
  const p2 = { ...preview, proposals: [...proposals, unknown], lines: [...lines, ...[] ] };
  p2.lines = [...lines, line('Algo novo', 5)];
  const unknown2 = prop('g-weird', 'teleport', [p2.lines[p2.lines.length - 1]], { defaultSelected: true });
  p2.proposals = [...proposals, unknown2];
  const s2 = C.buildCardOfxSections(p2);
  const v = CL.buildClosingView(preview.closing, s2.groups, { ...defaultsSel, 'g-weird': false });
  assert.equal(v.basis, 'server-default');
  assert.equal(v.deltaCents, 2110, 'the server number, untouched');
  assert.equal(v.changedGroups, 1);
  assert.match(CL.closingBasisLabel(v), /seleção padrão do servidor/);
  assert.match(CL.closingBasisLabel(v), /não recalculado/);
  // a proposal with a ref missing from the lines also cannot be recomputed
  const broken = { ...pC1, refs: [...pC1.refs, 'ofx:ghost:00000000'] };
  const p3 = { ...preview, proposals: proposals.map((p) => (p === pC1 ? broken : p)) };
  const s3 = C.buildCardOfxSections(p3);
  assert.equal(CL.buildClosingView(preview.closing, s3.groups, { ...defaultsSel, 'g-c1': false }).basis, 'server-default');
});

check('GC11: no closing from the server: null (the dialog falls back to its own estimate)', () => {
  assert.equal(CL.buildClosingView(undefined, sections.groups, defaultsSel), null);
  assert.equal(CL.buildClosingView(null, sections.groups, defaultsSel), null);
});

check('GC12: texts: basis, headline, rows (signed contributions, zero rows hidden, residual always), verdict', () => {
  const v = view(defaultsSel);
  const fmt = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
  assert.equal(CL.closingHeadline(v, fmt), 'O cartão fica R$ 21.10 a menos que o total do OFX.');
  assert.equal(CL.closingHeadline({ deltaCents: -500 }, fmt), 'O cartão fica R$ 5.00 a mais que o total do OFX.');
  assert.match(CL.closingHeadline({ deltaCents: 0 }, fmt), /^Fecha com o OFX/);
  assert.equal(CL.closingBasisLabel(v), 'com a seleção padrão do servidor');
  assert.match(CL.closingBasisLabel(view({ ...defaultsSel, 'g-c1': false })), /^recalculado com a sua seleção \(1 proposta diferente/);
  const rows = CL.closingRows(v);
  assert.deepEqual(rows.map((r: Any) => [r.key, r.cents]), [['uncreated', 30000], ['sheetOnlyInPeriod', -33890], ['foreignInPeriod', -1000], ['advancePayments', 7000], ['residual', 0]]);
  assert.equal(rows.reduce((s: number, r: Any) => s + r.cents, 0), v.deltaCents, 'the signed rows add up to the delta');
  const f = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
  const zero = CL.closingResidualStatus({ explained: true, components: { residual: 0 } }, f);
  assert.deepEqual([zero.tone, zero.chip], ['green', 'explicada']);
  const cents3 = CL.closingResidualStatus({ explained: true, components: { residual: -3 } }, f);
  assert.equal(cents3.tone, 'yellow');
  assert.equal(cents3.chip, 'dentro da tolerância: restam R$ 0.03', '"explicada" is not said while cents remain');
  assert.match(cents3.verdict, /exceto R\$ 0\.03.*tolerância de 5 centavos/);
  const off = CL.closingResidualStatus({ explained: false, components: { residual: 7000 } }, f);
  assert.deepEqual([off.tone, off.chip], ['orange', 'não explicada: restam R$ 70.00']);
  assert.match(off.verdict, /não é explicada/);
  assert.equal(CL.closingResidualStatus({ explained: false, components: { residual: 0 } }, f).tone, 'orange', 'the server flag wins over the cents');
});

check('GC14: "explained" is |residual| <= 5 cents, for the server value and for the recomputed one', () => {
  // The card holds `cents` less than the rows explain: a residual of exactly that many cents (consistent totals).
  const withResidual = (cents: number): Any => ({
    ...preview.closing, recordedTotal: preview.closing.recordedTotal - cents / 100, delta: preview.closing.delta + cents / 100,
    components: { ...preview.closing.components, residual: cents / 100 },
  });
  const near = withResidual(5);
  const far = withResidual(6);
  assert.equal(CL.buildClosingView(near, sections.groups, defaultsSel).explained, true, '5 cents is still explained');
  assert.equal(CL.buildClosingView(far, sections.groups, defaultsSel).explained, false, '6 cents is not');
  assert.equal(CL.buildClosingView(near, sections.groups, { ...defaultsSel, 'g-c1': false }).explained, true);
  assert.equal(CL.buildClosingView(far, sections.groups, { ...defaultsSel, 'g-c1': false }).explained, false);
  assert.equal(CL.CLOSING_TOLERANCE_CENTS, 5);
});

check('GC13: the explanation adds up to the delta for every selection (also with a residual)', () => {
  for (const chosen of [[], ['g-a1'], ['g-c2', 'g-e1'], proposals.map((p) => p.group)]) {
    const v = view(sel(chosen));
    const sum = CL.closingRows(v).reduce((s: number, r: Any) => s + r.cents, 0);
    assert.equal(sum, v.deltaCents, chosen.join(','));
  }
});

// ---- G-C: the review queue ---------------------------------------------------------------------------------------

console.log('\n[GR] review queue');

const item = (id: string, description: string, amount: number, monthKey: string, o: Record<string, Any> = {}): Any => ({
  transactionId: id, description, amount, type: 'EXPENSE', date: `${monthKey}-10`, sourceRef: `maxfin:${monthKey}:credit:${id}`, monthKey, categoryName: null, blocked: false, ...o,
});
const a = item('r-a', 'Camiseta', 80, '2026-08');
const b = item('r-b', 'Uber', 22.5, '2026-08');
const c = item('r-c', 'Seguro', 140, '2026-09', { blocked: true });
const d = item('r-d', 'Estorno Loja', 30, '2026-09', { type: 'INCOME' });
const ITEMS = [a, b, c, d];
const ACCOUNTS = [
  { id: 'acc-main', type: 'CHECKING', isActive: true }, { id: 'acc-card', type: 'CREDIT', isActive: true },
  { id: 'acc-old', type: 'CHECKING', isActive: false }, { id: 'acc-sav', type: 'SAVINGS' },
];

check('GR1: a blocked row accepts only "keep"; move and delete leave the draft as it was', () => {
  assert.deepEqual(RV.allowedActions(c), ['none', 'keep']);
  assert.deepEqual(RV.allowedActions(a), ['none', 'keep', 'move', 'delete']);
  const d0 = RV.EMPTY_REVIEW_DRAFT;
  assert.equal(RV.setRowChoice(d0, c, 'delete'), d0);
  assert.equal(RV.setRowChoice(d0, c, 'move', 'acc-main'), d0);
  assert.equal(RV.setRowChoice(d0, c, 'keep')['r-c'].action, 'keep');
  assert.equal(RV.setRowChoice(RV.setRowChoice(d0, a, 'delete'), a, 'none')['r-a'], undefined, '"Sem ação" removes the decision');
});

check('GR2: bulk: every non-blocked row takes the choice; blocked rows are counted, not changed; keep reaches all', () => {
  const del = RV.setBulkChoice(RV.EMPTY_REVIEW_DRAFT, ITEMS, 'delete');
  assert.equal(del.applied, 3);
  assert.equal(del.blockedSkipped, 1);
  assert.equal(del.draft['r-c'], undefined);
  const keep = RV.setBulkChoice(RV.EMPTY_REVIEW_DRAFT, ITEMS, 'keep');
  assert.equal(keep.applied, 4);
  assert.equal(keep.blockedSkipped, 0);
  const move = RV.setBulkChoice(RV.EMPTY_REVIEW_DRAFT, ITEMS, 'move', 'acc-main');
  assert.equal(move.draft['r-a'].targetAccountId, 'acc-main');
  assert.equal(move.blockedSkipped, 1);
});

check('GR3: move targets: active accounts that are not credit cards; the destination is validated', () => {
  assert.deepEqual(RV.moveTargetAccounts(ACCOUNTS).map((x: Any) => x.id), ['acc-main', 'acc-sav']);
  assert.equal(RV.moveTargetProblem('', ACCOUNTS), RV.MOVE_TARGET_PROBLEM.missing);
  assert.equal(RV.moveTargetProblem('nope', ACCOUNTS), RV.MOVE_TARGET_PROBLEM.notFound);
  assert.equal(RV.moveTargetProblem('acc-card', ACCOUNTS), RV.MOVE_TARGET_PROBLEM.isCard);
  assert.equal(RV.moveTargetProblem('acc-old', ACCOUNTS), RV.MOVE_TARGET_PROBLEM.inactive);
  assert.equal(RV.moveTargetProblem('acc-main', ACCOUNTS), null);
});

check('GR4: the request has one action per decided row, in list order; the target goes only with move; cents of the deleted', () => {
  let draft = RV.EMPTY_REVIEW_DRAFT;
  draft = RV.setRowChoice(draft, d, 'delete');
  draft = RV.setRowChoice(draft, a, 'move', 'acc-main');
  draft = RV.setRowChoice(draft, c, 'keep');
  const built = RV.buildReviewActions('acc-card', ITEMS, draft, ACCOUNTS);
  assert.deepEqual(built.payload, {
    accountId: 'acc-card',
    actions: [
      { transactionId: 'r-a', action: 'move', targetAccountId: 'acc-main' },
      { transactionId: 'r-c', action: 'keep' },
      { transactionId: 'r-d', action: 'delete' },
    ],
  });
  assert.deepEqual(built.counts, { keep: 1, move: 1, delete: 1, total: 3, deleteCents: -3000, moveByTarget: { 'acc-main': 1 } });
  assert.deepEqual(built.problems, []);
  assert.equal(RV.buildReviewActions('acc-card', ITEMS, RV.EMPTY_REVIEW_DRAFT, ACCOUNTS).payload.actions.length, 0);
});

check('GR5: a move with no valid destination is a problem and is not sent', () => {
  const draft = RV.setRowChoice(RV.EMPTY_REVIEW_DRAFT, a, 'move');
  const built = RV.buildReviewActions('acc-card', ITEMS, draft, ACCOUNTS);
  assert.equal(built.payload.actions.length, 0);
  assert.deepEqual(built.problems, [{ transactionId: 'r-a', message: RV.MOVE_TARGET_PROBLEM.missing }]);
  const toCard = RV.setRowTarget(draft, 'r-a', 'acc-card');
  assert.equal(RV.buildReviewActions('acc-card', ITEMS, toCard, ACCOUNTS).problems[0].message, RV.MOVE_TARGET_PROBLEM.isCard);
  assert.equal(RV.setRowTarget(RV.EMPTY_REVIEW_DRAFT, 'r-a', 'acc-main'), RV.EMPTY_REVIEW_DRAFT, 'only a row marked to move has a destination');
});

check('GR6: the blocker: refresh first, then nothing to do, a problem, too many; null when it can go', () => {
  const ok = RV.buildReviewActions('acc-card', ITEMS, RV.setRowChoice(RV.EMPTY_REVIEW_DRAFT, a, 'keep'), ACCOUNTS);
  const none = RV.buildReviewActions('acc-card', ITEMS, RV.EMPTY_REVIEW_DRAFT, ACCOUNTS);
  const bad = RV.buildReviewActions('acc-card', ITEMS, RV.setRowChoice(RV.EMPTY_REVIEW_DRAFT, a, 'move'), ACCOUNTS);
  assert.equal(RV.reviewBlocker(ok, { needsRefresh: false, busy: false }), null);
  assert.equal(RV.reviewBlocker(ok, { needsRefresh: true, busy: false }).code, 'needs-refresh', 'a stale list is never applied');
  assert.equal(RV.reviewBlocker(none, { needsRefresh: true, busy: false }).code, 'needs-refresh', 'refresh outranks "nothing to do"');
  assert.equal(RV.reviewBlocker(ok, { needsRefresh: false, busy: true }).code, 'busy');
  assert.equal(RV.reviewBlocker(none, { needsRefresh: false, busy: false }).code, 'nothing');
  assert.equal(RV.reviewBlocker(null, { needsRefresh: false, busy: false }).code, 'nothing');
  assert.equal(RV.reviewBlocker(bad, { needsRefresh: false, busy: false }).code, 'problem');
  const many = { ...ok, payload: { accountId: 'acc-card', actions: Array.from({ length: RV.REVIEW_MAX_ACTIONS + 1 }, (_, i) => ({ transactionId: `x${i}`, action: 'keep' })) } };
  assert.equal(RV.reviewBlocker(many, { needsRefresh: false, busy: false }).code, 'too-many');
  assert.equal(RV.REVIEW_MAX_ACTIONS, 200);
});

check('GR7: the answer is read row by row: counts come from the results, missing and unexpected rows are not "done"', () => {
  const sent = [
    { transactionId: 'r-a', action: 'move', targetAccountId: 'acc-main' }, { transactionId: 'r-b', action: 'delete' },
    { transactionId: 'r-c', action: 'keep' }, { transactionId: 'r-d', action: 'delete' },
  ];
  const response = {
    results: [
      { transactionId: 'r-a', action: 'move', status: 'done' }, { transactionId: 'r-b', action: 'delete', status: 'failed', reason: 'P2034' },
      { transactionId: 'r-d', action: 'delete', status: 'blocked' }, { transactionId: 'zzz', action: 'keep', status: 'done' },
      { transactionId: 'r-c', action: 'keep', status: 'weird' }, { transactionId: 'r-a', action: 'move', status: 'done' },
    ],
    done: 3, skipped: 0, blocked: 1, failed: 1, warnings: ['Sem âncora: a planilha traz a linha de volta.'],
  };
  const s = RV.summarizeReviewResponse(sent, response);
  assert.deepEqual([s.done, s.skipped, s.blocked, s.failed], [1, 0, 1, 1]);
  assert.deepEqual(s.missing, ['r-c'], 'r-c came back with a status nobody knows: not assumed done');
  assert.equal(s.unexpected, 3, 'a result for a row that was not sent, a status nobody knows, and a result repeated');
  assert.equal(s.inconsistent, true, 'the server totals (3 done) disagree with its own results');
  assert.deepEqual(s.warnings, ['Sem âncora: a planilha traz a linha de volta.']);
  assert.equal(RV.reviewSummaryLine(s), '1 feito, 1 bloqueado, 1 com falha, 1 sem resposta do servidor');
  assert.equal(RV.reviewSummaryLine({ done: 0, skipped: 0, blocked: 0, failed: 0, missing: [] }), 'nada foi alterado');
  const clean = RV.summarizeReviewResponse(sent.slice(0, 1), { results: [{ transactionId: 'r-a', action: 'move', status: 'skipped' }], done: 0, skipped: 1, blocked: 0, failed: 0, warnings: [] });
  assert.equal(clean.inconsistent, false);
  assert.equal(RV.reviewSummaryLine(clean), '1 já tratado (nada a fazer)');
});

check('GR8: after an answer only the failed decisions stay; failed and blocked outcomes linger next to their row', () => {
  let draft = RV.EMPTY_REVIEW_DRAFT;
  for (const x of [a, b, d]) draft = RV.setRowChoice(draft, x, 'delete');
  const s = RV.summarizeReviewResponse(
    [{ transactionId: 'r-a', action: 'delete' }, { transactionId: 'r-b', action: 'delete' }, { transactionId: 'r-d', action: 'delete' }],
    { results: [{ transactionId: 'r-a', action: 'delete', status: 'done' }, { transactionId: 'r-b', action: 'delete', status: 'failed', reason: 'boom' }, { transactionId: 'r-d', action: 'delete', status: 'blocked' }], done: 1, skipped: 0, blocked: 1, failed: 1, warnings: [] },
  );
  assert.deepEqual(Object.keys(RV.draftAfterResults(draft, s)), ['r-b']);
  assert.deepEqual(Object.keys(RV.lingeringOutcomes(s)).sort(), ['r-b', 'r-d']);
  const after = RV.reconcileReviewDraft(draft, [{ ...b }, { ...c }, { ...d, blocked: true }]);
  assert.deepEqual(Object.keys(after), ['r-b'], 'rows no longer listed lose their decision; a row that became blocked loses delete');
});

check('GR9: the confirmation lists each kind with its rows, the destination names and the amount to delete', () => {
  let draft = RV.setRowChoice(RV.EMPTY_REVIEW_DRAFT, a, 'move', 'acc-main');
  draft = RV.setRowChoice(draft, b, 'move', 'acc-sav');
  draft = RV.setRowChoice(draft, d, 'delete');
  draft = RV.setRowChoice(draft, c, 'keep');
  const built = RV.buildReviewActions('acc-card', ITEMS, draft, ACCOUNTS);
  const names: Record<string, string> = { 'acc-main': 'Conta Principal', 'acc-sav': 'Poupança' };
  const lines2 = RV.confirmLines(built.counts, (id: string) => names[id], (cents: number) => `R$ ${(cents / 100).toFixed(2)}`);
  assert.deepEqual(lines2, [
    'Manter sem comprovante: 1 lançamento.',
    'Mover para outra conta: 2 lançamentos (Conta Principal: 1; Poupança: 1).',
    'Excluir: 1 lançamento (R$ -30.00 no total).',
  ]);
  assert.match(RV.DELETE_WARNING, /volta/);
});

check('GR10: months: sections oldest first with the server totals; the rows alone when the server sent no month totals', () => {
  const queue = {
    items: ITEMS, months: [{ monthKey: '2026-09', count: 2, net: 110 }, { monthKey: '2026-08', count: 2, net: 102.5 }],
    totals: { count: 4, net: 212.5 }, view: 'queue', truncated: false,
  };
  const s = RV.reviewSections(queue);
  assert.deepEqual(s.map((x: Any) => [x.monthKey, x.count, x.netCents, x.items.length]), [['2026-08', 2, 10250, 2], ['2026-09', 2, 11000, 2]]);
  assert.match(s[0].label, /agosto/i);
  const noMonths = RV.reviewSections({ items: ITEMS, months: [] });
  assert.deepEqual(noMonths.map((x: Any) => [x.count, x.netCents]), [[2, 10250], [2, 11000 - 0]], 'credit 30 off the 140 purchase: 110');
  const trunc = RV.reviewHeadline({ ...queue, truncated: true }, (cents: number) => `R$ ${(cents / 100).toFixed(2)}`);
  assert.equal(trunc.text, '4 lançamentos sem comprovante (R$ 212.50 no total).');
  assert.match(trunc.truncatedNote, /primeiros 4/);
  assert.equal(RV.reviewHeadline({ ...queue, truncated: false }, String).truncatedNote, null);
  assert.equal(RV.reviewHeadline({ items: [], totals: { count: 0, net: 0 }, view: 'queue', truncated: false }, String).text, 'Nenhum lançamento sem comprovante.');
  assert.equal(RV.reviewHeadline({ items: [], totals: { count: 0, net: 0 }, view: 'kept', truncated: false }, String).text, 'Nenhum lançamento mantido sem comprovante.');
});

check('GR11: "Ver mantidos" and "Desfazer": the view labels, and unkeep is a single action', () => {
  assert.equal(RV.reviewViewLabel('kept'), 'Ver mantidos');
  assert.equal(RV.reviewViewLabel('queue'), 'Ver pendentes');
  assert.deepEqual(RV.unkeepRequest('acc-card', 'r-a'), { accountId: 'acc-card', actions: [{ transactionId: 'r-a', action: 'unkeep' }] });
  assert.equal(RV.REVIEW_LIMIT, 200);
});

check('GR12: reason codes in words, and the failure text always asks for a refresh', () => {
  assert.equal(RV.reviewReasonText('changed-meanwhile'), 'Mudou enquanto era aplicado');
  assert.equal(RV.reviewReasonText('has-shares-split-settlement-recurrence-or-attachment'), 'Tem divisão com pessoas, acerto, recorrência ou anexo');
  assert.equal(RV.reviewReasonText('has-shares-or-settlement'), 'Tem divisão com pessoas ou acerto');
  assert.equal(RV.reviewReasonText('P2034'), 'Erro inesperado ao aplicar', 'an unknown code is never shown raw');
  assert.equal(RV.reviewReasonText(undefined), '');
  assert.match(RV.reviewFailureMessage('Erro de rede'), /^Erro de rede\. Algumas podem ter sido aplicadas\. Atualize a lista/);
  assert.match(RV.reviewFailureMessage('Falha', 500), /Algumas podem ter sido aplicadas/);
  assert.match(RV.reviewFailureMessage(''), /^Não foi possível aplicar as decisões\./);
  assert.equal(RV.reviewFailureMessage('Conta inválida', 400), 'Conta inválida. Nenhuma decisão foi aplicada.', 'a 4xx wrote nothing');
  assert.equal(RV.isRefusedBeforeWriting(422), true);
  assert.equal(RV.isRefusedBeforeWriting(500), false);
  assert.equal(RV.isRefusedBeforeWriting(undefined), false, 'no status (network): may have been applied');
  assert.equal(RV.reviewOutcomeReason({ status: 'blocked' }), 'Tem divisão com pessoas, acerto, recorrência ou anexo');
  assert.equal(RV.reviewOutcomeReason({ status: 'failed', reason: 'P2034' }), 'Erro inesperado ao aplicar');
  assert.equal(RV.reviewOutcomeReason({ status: 'failed' }), '');
});

// ---- round 4: near / neighbour / group, residual wording, category chips, 409 --------------------------------------

console.log('\n[R4] near, neighbour, group, categories, conflict');

const mk2 = () => {
  const near = line('Loja Nove', 10.03, { date: '2026-09-14' });
  const neigh = line('Padaria Sol Velha', 33, { date: '2026-09-04' });
  const g1 = line('Cafe Central', 30, { date: '2026-09-16' });
  const g2 = line('Cafe Central', 20, { date: '2026-09-17' });
  const weak = line('Loja Dez', 15, { date: '2026-09-18' });
  const creat = line('Livraria Gama', 45.5, { date: '2026-09-15' });
  const nearP = prop('g-near', 'enrich-near', [near], {
    target: row('t-near', 'Loja 9', 10, '2026-09-14'), result: { date: '2026-09-14', description: 'Loja Nove', notesAppend: null },
  });
  const neighP = prop('g-neigh', 'enrich-neighbour', [neigh], {
    target: row('t-neigh', 'Padaria Sol', 33, '2026-08-30', { sourceRef: 'maxfin:2026-09:credit:7' }), result: { date: '2026-09-04', description: 'Padaria Sol Velha', notesAppend: null },
  });
  const groupP = prop('g-group', 'enrich-group', [g1, g2], {
    target: row('t-cafe', 'Cafés', 50, '2026-09-16'), result: { date: '2026-09-16', description: 'Cafe Central', notesAppend: null },
  });
  const weakP = prop('g-weak', 'enrich-near', [weak], {
    defaultSelected: false, reason: 'near-amount', target: row('t-weak', 'Loja 10', 15.02, '2026-09-18'), result: { date: '2026-09-18', description: 'Loja Dez', notesAppend: null },
  });
  const cP = prop('g-c', 'create', [creat]);
  const props2 = [nearP, neighP, groupP, weakP, cP];
  const lines2 = [near, neigh, g1, g2, weak, creat];
  const fx: Any = {
    proposals: props2, lines: lines2, sheetOnly: [stream], members: [],
    stored: [stream, nearP.target, neighP.target, groupP.target, weakP.target],
  };
  return { props2, lines2, fx, nearP };
};

check('R4-1: near, neighbour and group are known, sendable "matched" kinds with labels', () => {
  const { props2, lines2 } = mk2();
  const pv = mkPreview({ proposals: props2, lines: lines2, sheetOnly: [stream] });
  const sec = C.buildCardOfxSections(pv);
  assert.deepEqual(ids(sec.matched), ['g-near', 'g-neigh', 'g-group', 'g-weak']);
  assert.ok(sec.groups.every((g: Any) => g.sendable));
  const sel2 = C.reconcileGroupSelection([], {}, sec.groups);
  assert.deepEqual(Object.entries(sel2).filter(([, v]) => v).map(([k]) => k), ['g-near', 'g-neigh', 'g-group', 'g-c']);
  assert.equal(C.PROPOSAL_KIND_LABEL['enrich-near'], 'valor próximo');
  assert.equal(C.PROPOSAL_KIND_LABEL['enrich-neighbour'], 'mês vizinho');
  assert.equal(C.PROPOSAL_KIND_LABEL['enrich-group'], 'por comerciante');
  assert.equal(C.proposalHeadline(props2[0]), 'Valor próximo: a planilha passa a ter o valor do banco');
  assert.equal(C.proposalHeadline(props2[1]), 'Compra do mês vizinho');
  assert.equal(C.proposalHeadline(props2[2]), 'Soma por comerciante');
  assert.equal(C.proposalHeadline(pE1), null, 'a plain match needs no headline');
  assert.equal(C.neighbourMonthLabel(props2[1]), 'setembro/2026');
  assert.equal(C.neighbourMonthLabel(props2[0]), null);
});

check('R4-2: near amount: old and new amount and the difference in cents', () => {
  const { nearP, props2 } = mk2();
  const ch = C.nearChange(nearP, 1003);
  assert.deepEqual(ch, { oldCents: 1000, newCents: 1003, diffCents: 3 });
  const f = (c: number) => `R$ ${(c / 100).toFixed(2)}`;
  assert.equal(C.nearChangeText(ch, f), 'R$ 10.00 → R$ 10.03 (+3 centavos)');
  assert.equal(C.nearChangeText({ oldCents: 1000, newCents: 999, diffCents: -1 }, f), 'R$ 10.00 → R$ 9.99 (−1 centavo)');
  assert.equal(C.nearChange(props2[1], 3300), null);
});

check('R4-3: reason chips of the new kinds: plain Portuguese, no slug in text or title', () => {
  const fmt = (v: number) => `R$ ${v}`;
  const want: Record<string, string> = {
    'neighbour-weak': 'mês vizinho, pouca semelhança', 'neighbour-ambiguous': 'mês vizinho, mais de uma opção',
    'neighbour-month-not-imported': 'fatura do mês vizinho ainda não importada', 'near-amount': 'valor próximo, sem sinal forte',
    'near-ambiguous': 'valor próximo, mais de uma opção', 'pool-too-large': 'muitas compras do comerciante',
  };
  for (const [reason, text] of Object.entries(want)) {
    const chip = C.proposalReasonChip({ reason, counterpart: null }, fmt, (d: string) => d);
    assert.equal(chip.text, text, reason);
    assert.ok(!(chip.text + chip.title).includes(reason), `${reason} must not leak`);
  }
});

check('R4-4: the closing of the new kinds equals the closing from scratch for every combination (near writes the bank amount)', () => {
  const { props2, lines2, fx } = mk2();
  const sec = C.buildCardOfxSections(mkPreview({ proposals: props2, lines: lines2, sheetOnly: [stream] }));
  const dflt = new Set(props2.filter((p) => p.defaultSelected).map((p) => p.group));
  const closing = toClosing(oracle({ selected: dflt, fx }));
  let n2 = 0;
  for (let mask = 0; mask < 1 << props2.length; mask += 1) {
    const chosen = props2.map((p) => p.group).filter((_, i) => mask & (1 << i));
    const v = CL.buildClosingView(closing, sec.groups, Object.fromEntries(props2.map((p) => [p.group, chosen.includes(p.group)])));
    const o = oracle({ selected: new Set(chosen), fx });
    assert.deepEqual([v.recordedCents, v.deltaCents, v.components.heldMatches, v.components.uncreated, v.components.residual],
      [o.recorded, o.delta, o.held, o.uncreated, o.residual], chosen.join(',') || '(none)');
    n2 += 1;
  }
  assert.equal(n2, 32);
  // by hand: not adopting the near amount leaves the row at 10.00 instead of 10.03
  const off = CL.buildClosingView(closing, sec.groups, Object.fromEntries(props2.map((p) => [p.group, dflt.has(p.group) && p.group !== 'g-near'])));
  assert.equal(Math.round(closing.recordedTotal * 100) - off.recordedCents, 3);
});

check('R4-5: category chips: system names in Portuguese, CUSTOM:<id> by the household name, "Categoria" when unknown', () => {
  const names = { 'cat-1': 'Pets' };
  assert.equal(RV.categoryChipLabel('FOOD', names), 'Alimentação');
  assert.equal(RV.categoryChipLabel('CUSTOM:cat-1', names), 'Pets');
  assert.equal(RV.categoryChipLabel('CUSTOM:cat-9', names), 'Categoria');
  assert.equal(RV.categoryChipLabel('SOME_NEW_SYSTEM_KEY', names), 'Categoria', 'a slug is never shown');
  assert.equal(RV.categoryChipLabel('Vestuário', names), 'Vestuário');
  assert.equal(RV.categoryChipLabel(null, names), null);
  assert.equal(RV.categoryChipLabel('  ', names), null);
});

const T: Any = await load(process.env.CARD_CONFLICT_MODULE, 'utils/transactionConflict.ts');
check('R4-6: a 409 from a PATCH reads in Portuguese; other errors keep their own message', () => {
  const conflict = Object.assign(new Error('Conflict'), { status: 409 });
  assert.equal(T.isConflict(conflict), true);
  assert.equal(T.isConflict(new Error('x')), false);
  assert.equal(T.updateFailureMessage(conflict), T.CONFLICT_MESSAGE);
  assert.match(T.CONFLICT_MESSAGE, /acabou de ser alterada/);
  assert.equal(T.updateFailureMessage(new Error('Sem permissão')), 'Sem permissão');
  assert.equal(T.updateFailureMessage('weird'), 'Não foi possível atualizar a transação.');
});

check('R4-7: the client estimate writes the bank amount into a ticked near-amount row and keeps the sheet one when unticked', () => {
  const { nearP, lines2 } = mk2();
  const ctx = { accounts: [], customIdsByType: { INCOME: new Set<string>(), EXPENSE: new Set<string>() } };
  const only = { ...preview, proposals: [nearP], lines: [lines2[0]], sheetOnly: [] };
  assert.equal(C.buildCardOfxConfirm(only, { 'g-near': true }, {}, C.defaultPaymentChoice(null), ctx).totals.rectaCents, 1003);
  assert.equal(C.buildCardOfxConfirm(only, { 'g-near': false }, {}, C.defaultPaymentChoice(null), ctx).totals.rectaCents, 1000);
});
