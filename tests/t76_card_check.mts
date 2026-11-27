import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P25, card lot: the card bills from Open Finance against the Prumo invoice with the same due day
// (GET /open-finance/cards). The Início warns when a closed bill differs by more than R$ 1; the Cartões page shows the
// bills side by side and the bank limit only as information (the limit varies). Invented values only.
const H_PATH = process.env.HOME_MOBILE_MODULE || frontSrc('utils/homeMobile.ts');
const C_PATH = process.env.OPEN_FINANCE_CARDS_MODULE || frontSrc('utils/openFinanceCards.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const H: any = await import(pathToFileURL(H_PATH).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(C_PATH).href);

const bill = (dueDate: string, month: string | null, bankCents: number, prumoCents: number | null, state: string | null = 'paid') => ({
  dueDate,
  month,
  bankCents,
  prumoCents,
  diffCents: prumoCents === null ? null : bankCents - prumoCents,
  state,
});
const card = (bills: unknown[], over: Record<string, unknown> = {}) => ({
  prumoAccountId: 'acc-card',
  accountName: 'Cartão Exemplo',
  blocked: null,
  card: { bankBalanceCents: 250000, prumoBalanceCents: 120000, bankLimitCents: 500000, bankAvailableCents: 250000, prumoLimitCents: 400000, closeDate: '2026-12-01', dueDate: '2026-12-08' },
  bills,
  ...over,
});

console.log('\n[card check] utils/openFinanceCards.ts, homeMobile warningStrips');

check('warningStrips: no strip when every bill matches within R$ 1, or the connection is blocked', () => {
  const near = card([bill('2026-11-08', '2026-11', 123456, 123400), bill('2026-10-08', '2026-10', 50000, 50000)]);
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null, cards: [near] }), []);
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null, cards: [{ prumoAccountId: 'acc-card', accountName: 'X', blocked: 'vencida' }] }), []);
});

check('warningStrips: a strip per card naming the newest bill that differs and counting the rest, opening that invoice', () => {
  const [strip] = H.warningStrips({
    captures: 0,
    negativeDate: null,
    cards: [card([bill('2026-11-08', '2026-11', 123456, 120000), bill('2026-10-08', '2026-10', 50000, 51000), bill('2026-09-08', '2026-09', 700, 700)])],
  });
  assert.equal(strip.id, 'card:acc-card');
  assert.equal(strip.title, 'Cartão Exemplo: fatura diferente do banco');
  assert.equal(strip.subtitle, 'Fatura de novembro: o banco tem R$ 34,56 a mais que o Prumo · e mais 1');
  assert.equal(strip.to, '/app/credit-cards?card=acc-card&month=2026-11');
});

check('warningStrips: less at the bank says "a menos"; a bill with no Prumo invoice does not warn', () => {
  const [strip] = H.warningStrips({ captures: 0, negativeDate: null, cards: [card([bill('2026-10-08', '2026-10', 50000, 51000)])] });
  assert.equal(strip.subtitle, 'Fatura de outubro: o banco tem R$ 10,00 a menos que o Prumo');
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null, cards: [card([bill('2026-08-08', null, 900, null, null)])] }), []);
});

check('cardBillRows: one row per bill, newest first, with the due day, both totals and the difference', () => {
  const rows = C.cardBillRows(card([bill('2026-10-08', '2026-10', 50000, 51000), bill('2026-11-08', '2026-11', 123456, 123400), bill('2026-08-08', null, 900, null, null)]));
  assert.deepEqual(
    rows.map((r: { label: string; note: string; bankCents: number; prumoCents: number | null; alert: boolean }) => [r.label, r.note, r.bankCents, r.prumoCents, r.alert]),
    [
      ['Fatura de novembro', 'Vence 08/11 · R$ 0,56 a mais no banco', 123456, 123400, false],
      ['Fatura de outubro', 'Vence 08/10 · R$ 10,00 a menos no banco', 50000, 51000, true],
      ['Fatura de vencimento 08/08', 'Sem fatura no Prumo com esse vencimento', 900, null, false],
    ],
  );
});

check('cardLimitInfo: the bank limit and what is available there, as information only', () => {
  assert.deepEqual(C.cardLimitInfo(card([])), { limitCents: 500000, availableCents: 250000 });
  assert.equal(C.cardLimitInfo(card([], { card: { bankLimitCents: null, bankAvailableCents: null } })), null);
  assert.equal(C.cardLimitInfo({ prumoAccountId: 'x', accountName: 'X', blocked: 'vencida' }), null);
});
