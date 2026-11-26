import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P08: lines of the card OFX that belong to another person. The payload carries `otherPeople` only for ticked, sendable `create` and
// `advance-payment` groups; the footer counts them; the result text mentions the shares and settlements. CARD_OFX_MODULE points at a
// mutated copy for the bite-checks. All names and amounts are invented.
const load = async (env: string | undefined, rel: string) => import(pathToFileURL(env || frontSrc(rel)).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
const C: Any = await load(process.env.CARD_OFX_MODULE, 'utils/cardOfx.ts');

let n = 0;
const line = (memo: string, amount: number, o: Record<string, Any> = {}): Any => {
  n += 1;
  return {
    ref: `ofx:P${n}:0000000${n % 10}`, fitid: `P${n}`, date: '2026-09-10', amount, type: 'EXPENSE', kind: 'purchase', memo,
    merchant: memo, installment: null, status: 'proposed', group: null, ...o,
  };
};
const prop = (group: string, kind: string, ls: Any[], o: Record<string, Any> = {}): Any => {
  for (const l of ls) l.group = group;
  return {
    group, kind, refs: ls.map((l) => l.ref), defaultSelected: true, ambiguous: false, target: null, absorbed: [], reason: null,
    counterpart: null, result: null, futureInstallments: 0, ...o,
  };
};

const loja = line('Loja Gama', 90, { date: '2026-09-15' });
const mercado = line('Mercado Beta', 60, { date: '2026-09-10' });
const adv = line('Pagamento recebido', 152.4, { type: 'INCOME', kind: 'payment', date: '2026-09-11' });
const anterior = line('Pagamento recebido', 900, { type: 'INCOME', kind: 'payment', status: 'payment', date: '2026-09-09' });
const alvo = line('Padaria Delta', 30, { date: '2026-09-12' });
const pLoja = prop('g-loja', 'create', [loja]);
const pMercado = prop('g-mercado', 'create', [mercado]);
const pAdv = prop('g-adv', 'advance-payment', [adv]);
const pEnrich = prop('g-enrich', 'enrich-exact', [alvo], {
  target: { transactionId: 't-padaria', description: 'Padaria', amount: 30, type: 'EXPENSE', date: '2026-09-12', sourceRef: 'maxfin:2026-10:credit:1' },
  result: { date: '2026-09-12', description: 'Padaria Delta', notesAppend: null },
});
const proposals = [pLoja, pMercado, pAdv, pEnrich];
const lines = [loja, mercado, adv, anterior, alvo];
const PERIOD = { start: '2026-09-02', end: '2026-10-02' };
const closing = {
  periodStart: PERIOD.start, periodEnd: PERIOD.end, endInclusive: false, ofxTotal: 180, recordedTotal: 0, delta: 180,
  components: { uncreated: 0, heldMatches: 0, sheetOnlyInPeriod: 0, foreignInPeriod: 0, advancePayments: 0, residual: 0 },
  sheetOnlyOutsidePeriod: 0, explained: true,
};
const preview: Any = {
  accountId: 'acc-card', householdId: 'h1', month: { year: 2026, month: 10 }, monthKey: '2026-10', monthSource: 'statement', period: PERIOD,
  ofxTotal: 180, lines, proposals, sheetOnly: [], payment: { ref: anterior.ref, amount: 900, date: '2026-09-09', invoiceMonthKey: '2026-09', recorded: null, proposal: 'ok' },
  closing, categoryMap: [], totals: { lines: lines.length, reconciled: 0, proposals: proposals.length, create: 2, sheetOnly: 0 }, warnings: [],
};
const sections = C.buildCardOfxSections(preview);
const all = C.reconcileGroupSelection([], {}, sections.groups);
const ctx = { accounts: [], customIdsByType: { INCOME: new Set<string>(), EXPENSE: new Set<string>() } };
const build = (selection: Any, otherPeople?: Record<string, string>) =>
  C.buildCardOfxConfirm(preview, selection, {}, C.defaultPaymentChoice(null), { ...ctx, ...(otherPeople ? { otherPeople } : {}) });
const money = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

console.log('\n[T45] lines of another person');

check('OP1: no assignment sends no otherPeople key (the request stays what it was)', () => {
  const built = build(all);
  assert.equal('otherPeople' in built.payload, false);
  assert.deepEqual(built.totals.otherPeople, { groups: 0, lines: 0 });
});

check('OP2: a ticked purchase and a ticked advance payment go with their person; the others are left out', () => {
  const built = build(all, { 'g-loja': 'p-bia', 'g-adv': 'p-bia' });
  assert.deepEqual(built.payload.otherPeople, [{ group: 'g-loja', personId: 'p-bia' }, { group: 'g-adv', personId: 'p-bia' }]);
  assert.deepEqual(built.totals.otherPeople, { groups: 2, lines: 2 });
});

check('OP3: an unticked group is not sent with its person', () => {
  const built = build({ ...all, 'g-loja': false }, { 'g-loja': 'p-bia' });
  assert.equal('otherPeople' in built.payload, false);
  assert.equal(built.totals.otherPeople.lines, 0);
});

check('OP4: only create and advance-payment groups can belong to a person (a pairing with a sheet row cannot)', () => {
  const built = build(all, { 'g-enrich': 'p-bia', 'g-mercado': 'p-caio' });
  assert.deepEqual(built.payload.otherPeople, [{ group: 'g-mercado', personId: 'p-caio' }]);
  const byId = Object.fromEntries(sections.groups.map((g: Any) => [g.proposal.group, g]));
  assert.equal(C.isOtherPersonAssignable(byId['g-loja']), true);
  assert.equal(C.isOtherPersonAssignable(byId['g-adv']), true);
  assert.equal(C.isOtherPersonAssignable(byId['g-enrich']), false);
});

check('OP5: an empty person id means "mine" and is not sent', () => {
  const built = build(all, { 'g-loja': '' });
  assert.equal('otherPeople' in built.payload, false);
});

check('OP6: the statement totals do not move when a line is assigned (the transaction is still the whole line)', () => {
  const plain = build(all);
  const shared = build(all, { 'g-loja': 'p-bia' });
  assert.equal(shared.totals.rectaCents, plain.totals.rectaCents);
  assert.equal(shared.totals.differenceCents, plain.totals.differenceCents);
});

check('OP7: setOtherPerson sets, replaces and clears without touching the others', () => {
  let a: Record<string, string> = {};
  a = C.setOtherPerson(a, 'g-loja', 'p-bia');
  a = C.setOtherPerson(a, 'g-adv', 'p-bia');
  a = C.setOtherPerson(a, 'g-loja', 'p-caio');
  assert.deepEqual(a, { 'g-loja': 'p-caio', 'g-adv': 'p-bia' });
  a = C.setOtherPerson(a, 'g-loja', '');
  assert.deepEqual(a, { 'g-adv': 'p-bia' });
});

check('OP8: the result text tells about the shares and the settlements', () => {
  const base = { enriched: 0, consumedFutures: 0, created: 3, futureInstallments: 0, reversalsImported: 0, payment: null, skipped: 0, createdCategories: [], warnings: [] };
  const texts = C.cardOfxResultLines({ ...base, advancePayments: 1, sharedWithPeople: 2, settlementsRecorded: 1 }, money, (d: string) => d);
  assert.ok(texts.some((t: string) => /2 lançamentos? .*100%.*outra/.test(t)), texts.join(' | '));
  assert.ok(texts.some((t: string) => /1 acerto/.test(t)), texts.join(' | '));
  const none = C.cardOfxResultLines({ ...base, sharedWithPeople: 0, settlementsRecorded: 0 }, money, (d: string) => d);
  assert.ok(!none.some((t: string) => /100%|acerto/.test(t)));
  const old = C.cardOfxResultLines(base, money, (d: string) => d);
  assert.ok(!old.some((t: string) => /100%|acerto/.test(t)), 'a server that predates the feature answers without the fields');
});

check('OP9: the footer line counts lines of other people', () => {
  assert.equal(C.otherPeopleSummary({ groups: 0, lines: 0 }), null);
  assert.equal(C.otherPeopleSummary({ groups: 1, lines: 1 }), '1 linha de outra pessoa');
  assert.equal(C.otherPeopleSummary({ groups: 2, lines: 3 }), '3 linhas de outras pessoas');
});
