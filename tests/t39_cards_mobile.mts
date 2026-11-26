import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Cartões no celular (lote R3): presentation logic only, below 768 px. Invented data only.
// CARDS_MOBILE_MODULE points the suite at a mutated copy of utils/cardsMobile.ts.
const cmPath = process.env.CARDS_MOBILE_MODULE || frontSrc('utils/cardsMobile.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(cmPath).href);

console.log('\n[cards mobile] utils/cardsMobile.ts');

// ---- situação da fatura no cartão -------------------------------------------------------------------

check('cardSituation: a closed statement not paid says it is closed and when it is due', () => {
  assert.deepEqual(C.cardSituation({ state: 'closed', dueLabel: '12/11', closingLabel: '05/11' }), {
    kind: 'closed',
    label: 'Fechada · vence 12/11',
  });
});

check('cardSituation: a closed statement without a due date says only that it is closed', () => {
  assert.equal(C.cardSituation({ state: 'closed', dueLabel: null, closingLabel: null }).label, 'Fechada');
});

check('cardSituation: an open statement says it is open and when it closes', () => {
  assert.deepEqual(C.cardSituation({ state: 'open', dueLabel: '12/12', closingLabel: '05/12' }), {
    kind: 'open',
    label: 'Aberta · fecha 05/12',
  });
  assert.equal(C.cardSituation({ state: 'open', dueLabel: null, closingLabel: null }).label, 'Aberta');
});

check('cardSituation: a paid statement says Paga, whatever the dates', () => {
  assert.deepEqual(C.cardSituation({ state: 'paid', dueLabel: '12/11', closingLabel: '05/11' }), {
    kind: 'paid',
    label: 'Paga',
  });
});

check('cardSituation: without a state the screen says the situation is unknown, never a blank', () => {
  assert.deepEqual(C.cardSituation({ state: null, dueLabel: null, closingLabel: null }), {
    kind: 'unknown',
    label: 'Situação indisponível',
  });
});

// ---- barra de uso do limite -------------------------------------------------------------------------

check('usageBarWidth: the percentage clamped to 0..100 with one decimal', () => {
  assert.equal(C.usageBarWidth(42.345), 42.3);
  assert.equal(C.usageBarWidth(-5), 0);
  assert.equal(C.usageBarWidth(140), 100);
  assert.equal(C.usageBarWidth(Number.NaN), 0);
});

check('usageTone: amber above 70%, red above 90%, the same thresholds as the desktop page', () => {
  assert.equal(C.usageTone(70), 'normal');
  assert.equal(C.usageTone(70.1), 'warn');
  assert.equal(C.usageTone(90), 'warn');
  assert.equal(C.usageTone(90.1), 'danger');
});

// ---- barra do lançado e do previsto ------------------------------------------------------------------

check('invoiceBars: the solid part is the posted share of the expected total, the rest is the hatched part', () => {
  assert.deepEqual(C.invoiceBars(1684.3, 2910.4), { solid: 57.9, rest: 42.1 });
});

check('invoiceBars: posted above the expected total (no forecast left) fills the bar', () => {
  assert.deepEqual(C.invoiceBars(500, 300), { solid: 100, rest: 0 });
});

check('invoiceBars: nothing posted and nothing expected gives an empty bar, not a division by zero', () => {
  assert.deepEqual(C.invoiceBars(0, 0), { solid: 0, rest: 0 });
});

// ---- colunas das próximas faturas --------------------------------------------------------------------

check('columnHeights: the heaviest month is 100, the others proportional with a 10% floor', () => {
  assert.deepEqual(C.columnHeights([2000, 1000, 100]), [100, 50, 10]);
});

check('columnHeights: a month with nothing to pay has no column, not a 10% one', () => {
  assert.deepEqual(C.columnHeights([0, 800]), [0, 100]);
});

check('columnHeights: all zero gives all zero', () => {
  assert.deepEqual(C.columnHeights([0, 0]), [0, 0]);
});

// ---- estado da tela ----------------------------------------------------------------------------------

check('cardsScreenState: loading wins, then error, then no card, then ready', () => {
  assert.equal(C.cardsScreenState({ loading: true, error: true, cardCount: 0 }), 'loading');
  assert.equal(C.cardsScreenState({ loading: false, error: true, cardCount: 2 }), 'error');
  assert.equal(C.cardsScreenState({ loading: false, error: false, cardCount: 0 }), 'empty');
  assert.equal(C.cardsScreenState({ loading: false, error: false, cardCount: 2 }), 'ready');
});

// ---- carrossel ---------------------------------------------------------------------------------------

check('carouselIndex: the card nearest the scroll position, clamped to the list', () => {
  assert.equal(C.carouselIndex(0, 300, 3), 0);
  assert.equal(C.carouselIndex(160, 300, 3), 1);
  assert.equal(C.carouselIndex(9000, 300, 3), 2);
  assert.equal(C.carouselIndex(-40, 300, 3), 0);
});

check('carouselIndex: no width or no card gives the first card', () => {
  assert.equal(C.carouselIndex(100, 0, 3), 0);
  assert.equal(C.carouselIndex(100, 300, 0), 0);
});

// ---- valor estimado ----------------------------------------------------------------------------------

check('approxPrefix: an estimated amount carries "≈" in the text, never only the colour', () => {
  assert.equal(C.approxPrefix(true), '≈ ');
  assert.equal(C.approxPrefix(false), '');
});

// ---- mês do cabeçalho ---------------------------------------------------------------------------------

check('monthStartOf: the first day of the header month in local time, December and January included', () => {
  const nov = C.monthStartOf('2026-11');
  assert.equal([nov.getFullYear(), nov.getMonth(), nov.getDate()].join('-'), '2026-10-1');
  const jan = C.monthStartOf('2027-01');
  assert.equal([jan.getFullYear(), jan.getMonth(), jan.getDate()].join('-'), '2027-0-1');
});

// ---- melhor dia para comprar ------------------------------------------------------------------------

check('bestDayToBuyText: the closing day as the day to buy, or null when the card has no closing day', () => {
  assert.equal(C.bestDayToBuyText(5), 'dia 5');
  assert.equal(C.bestDayToBuyText(null), null);
  assert.equal(C.bestDayToBuyText(0), null);
});

// ---- colunas das próximas faturas: rótulo e valor curtos ---------------------------------------------

check('shortMonthLabel: abbreviated month of the year; the year shows only in another year', () => {
  assert.equal(C.shortMonthLabel('2026-12', 2026), 'dez');
  assert.equal(C.shortMonthLabel('2027-01', 2026), 'jan 27');
  assert.equal(C.shortMonthLabel('2026-03', 2026), 'mar');
  assert.equal(C.shortMonthLabel('bad', 2026), '');
});

check('shortAmount: whole reais with dot thousands, no currency and no cents', () => {
  assert.equal(C.shortAmount(1140), '1.140');
  assert.equal(C.shortAmount(1140.6), '1.141');
  assert.equal(C.shortAmount(980), '980');
  assert.equal(C.shortAmount(-1234.4), '-1.234');
  assert.equal(C.shortAmount(0), '0');
});

// ---- percentual em pt-BR ------------------------------------------------------------------------------

check('percentPt: one decimal with a comma, as the pt-BR screen shows it', () => {
  assert.equal(C.percentPt(49), '49,0%');
  assert.equal(C.percentPt(45.83), '45,8%');
  assert.equal(C.percentPt(0), '0,0%');
  assert.equal(C.percentPt(Number.NaN), '0,0%');
});

// ---- cor do cartão: escolhida pelo usuário, da marca ou padrão ----------------------------------------

check('brandColorFor: recognises the common Brazilian issuers without accents or case, and nothing else', () => {
  assert.equal(C.brandColorFor('Nubank Ultravioleta')?.color, '#820ad1');
  assert.equal(C.brandColorFor('ITAÚ Platinum')?.color, '#ec7000');
  assert.equal(C.brandColorFor('itau black')?.color, '#ec7000');
  assert.equal(C.brandColorFor('Bradesco Visa')?.color, '#cc092f');
  assert.equal(C.brandColorFor('Santander Free')?.color, '#ec0000');
  assert.equal(C.brandColorFor('Banco do Brasil Ouro')?.color, '#fcd000');
  assert.equal(C.brandColorFor('Caixa Econômica')?.color, '#005ca9');
  assert.equal(C.brandColorFor('Inter Gold')?.color, '#ff7a00');
  assert.equal(C.brandColorFor('C6 Carbon')?.color, '#242424');
  assert.equal(C.brandColorFor('XP Visa Infinite')?.color, '#000000');
  assert.equal(C.brandColorFor('Mercado Pago')?.color, '#009ee3');
  assert.equal(C.brandColorFor('PicPay Card')?.color, '#21c25e');
  assert.equal(C.brandColorFor('BTG Pactual')?.color, '#0c2340');
  assert.equal(C.brandColorFor('Neon')?.color, '#1ccff7');
  assert.equal(C.brandColorFor('Will Bank')?.color, '#fdd000');
  assert.equal(C.brandColorFor('Next')?.color, '#00e56f');
  assert.equal(C.brandColorFor('PagBank')?.color, '#21a94f');
  assert.equal(C.brandColorFor('Sicredi')?.color, '#33a02c');
  assert.equal(C.brandColorFor('Sicoob Platinum')?.color, '#003641');
  assert.equal(C.brandColorFor('Cartão teste B'), null);
  assert.equal(C.brandColorFor('Expresso Visa'), null, 'a word that only contains "xp" is not XP');
  assert.equal(C.brandColorFor(''), null);
});

check('brandColorFor: the text on top has at least 4.5:1 contrast for every brand (light or dark text, whichever reads better)', () => {
  for (const name of ['Nubank', 'Itaú', 'Bradesco', 'Santander', 'Banco do Brasil', 'Caixa', 'Inter', 'C6', 'XP', 'Mercado Pago', 'PicPay', 'BTG', 'Neon', 'Will', 'Next', 'PagBank', 'Sicredi', 'Sicoob']) {
    const brand = C.brandColorFor(name);
    assert.ok(brand, name);
    const ink = brand.text === 'light' ? '#ffffff' : '#111111';
    assert.ok(C.contrastRatio(brand.color, ink) >= 4.5, `${name}: ${C.contrastRatio(brand.color, ink).toFixed(2)}`);
  }
});

check('brandColorFor: Banco do Brasil, Inter, Will and Next carry dark text; Nubank and C6 carry light text', () => {
  assert.equal(C.brandColorFor('Banco do Brasil')?.text, 'dark');
  assert.equal(C.brandColorFor('Will')?.text, 'dark');
  assert.equal(C.brandColorFor('Nubank')?.text, 'light');
  assert.equal(C.brandColorFor('C6')?.text, 'light');
});

check('cardVisual: the colour the user chose wins over the brand', () => {
  const v = C.cardVisual({ name: 'Nubank', color: '#123456' });
  assert.equal(v.source, 'user');
  assert.equal(v.color, '#123456');
});

check('cardVisual: the system default colour (#3b82f6, what the form prefills) does not count as a choice, so the brand applies', () => {
  const v = C.cardVisual({ name: 'Nubank', color: '#3b82f6' });
  assert.equal(v.source, 'brand');
  assert.equal(v.color, '#820ad1');
  assert.equal(C.cardVisual({ name: 'Nubank', color: null }).source, 'brand');
});

check('cardVisual: without a chosen colour and an unknown issuer, the default colour; its text still reads (4.5:1)', () => {
  const v = C.cardVisual({ name: 'Cartão teste B', color: '#3b82f6' });
  assert.equal(v.source, 'default');
  assert.equal(v.color, '#3b82f6');
  assert.ok(C.contrastRatio(v.color, v.text === 'light' ? '#ffffff' : '#111111') >= 4.5);
});

check('contrastRatio: black on white is 21:1', () => {
  assert.equal(Math.round(C.contrastRatio('#000000', '#ffffff')), 21);
});

check('shadeHex: mixes a colour toward black by the share given; 0 keeps it, 0.5 halves each channel', () => {
  assert.equal(C.shadeHex('#808080', 0), '#808080');
  assert.equal(C.shadeHex('#ffffff', 0.5), '#808080');
  assert.equal(C.shadeHex('#820ad1', 0.25), '#62089d');
});

// ---- fatura que abre ao entrar em Cartões (pedido do usuário, melhorias item 31) -----------------------
// Convenção do código: a fatura leva o nome do mês em que FECHA (o cartão fecha dia 2 -> "fatura de dezembro"
// fecha 2/12). Ela fica fechada a partir do dia de fechamento; a aberta é a que ainda recebe compras.
// Só se pede o estado de até dois meses antes da aberta.

console.log('\n[cards mobile] regra da fatura que abre');

const memoOf = (table: Record<string, string>) => (key: string) => table[key] ?? 'unknown';

check('openInvoiceMonthKey: on 12/11 with closing day 2, the open invoice is December (it closes 02/12)', () => {
  assert.equal(C.openInvoiceMonthKey('2026-11-12', 2), '2026-12');
});

check('openInvoiceMonthKey: on the closing day itself the invoice is already closed (buying that day goes to the next one)', () => {
  assert.equal(C.openInvoiceMonthKey('2026-11-02', 2), '2026-12');
  assert.equal(C.openInvoiceMonthKey('2026-11-01', 2), '2026-11');
});

check('openInvoiceMonthKey: without a closing day the open invoice is the calendar month', () => {
  assert.equal(C.openInvoiceMonthKey('2026-11-12', null), '2026-11');
});

check('openInvoiceMonthKey: a closing day past the end of the month is clamped to its last day', () => {
  assert.equal(C.openInvoiceMonthKey('2026-02-27', 31), '2026-02');
  assert.equal(C.openInvoiceMonthKey('2026-02-28', 31), '2026-03');
});

check('openingInvoiceMonth: the user case, November paid and closed, opens the open December invoice', () => {
  const r = C.openingInvoiceMonth({ today: '2026-11-12', closingDay: 2, statusOf: memoOf({ '2026-11': 'settled' }) });
  assert.deepEqual(r, { monthKey: '2026-12', reason: 'open' });
});

check('openingInvoiceMonth: a closed invoice not paid opens it, even with the open one next', () => {
  const r = C.openingInvoiceMonth({ today: '2026-11-12', closingDay: 2, statusOf: memoOf({ '2026-11': 'unpaid' }) });
  assert.deepEqual(r, { monthKey: '2026-11', reason: 'closed-unpaid' });
});

check('openingInvoiceMonth: between the closing day and the due day, unpaid, it still opens the closed one', () => {
  const r = C.openingInvoiceMonth({ today: '2026-11-05', closingDay: 2, statusOf: memoOf({ '2026-11': 'unpaid' }) });
  assert.deepEqual(r, { monthKey: '2026-11', reason: 'closed-unpaid' });
});

check('openingInvoiceMonth: before the closing day, the month before is the closed one and is checked', () => {
  const r = C.openingInvoiceMonth({ today: '2026-11-01', closingDay: 2, statusOf: memoOf({ '2026-10': 'unpaid' }) });
  assert.deepEqual(r, { monthKey: '2026-10', reason: 'closed-unpaid' });
});

check('openingInvoiceMonth: two closed invoices not paid open the oldest one', () => {
  const r = C.openingInvoiceMonth({
    today: '2026-12-12',
    closingDay: 2,
    statusOf: memoOf({ '2026-12': 'unpaid', '2026-11': 'unpaid' }),
  });
  assert.deepEqual(r, { monthKey: '2026-11', reason: 'closed-unpaid' });
});

check('openingInvoiceMonth: the older of two is paid, the newer unpaid, so the newer one opens', () => {
  const r = C.openingInvoiceMonth({
    today: '2026-12-12',
    closingDay: 2,
    statusOf: memoOf({ '2026-12': 'unpaid', '2026-11': 'settled' }),
  });
  assert.deepEqual(r, { monthKey: '2026-12', reason: 'closed-unpaid' });
});

check('openingInvoiceMonth: a card without a closing day counts the earlier month as closed and checks it', () => {
  const r = C.openingInvoiceMonth({ today: '2026-11-12', closingDay: null, statusOf: memoOf({ '2026-10': 'unpaid' }) });
  assert.deepEqual(r, { monthKey: '2026-10', reason: 'closed-unpaid' });
  const s = C.openingInvoiceMonth({ today: '2026-11-12', closingDay: null, statusOf: memoOf({ '2026-10': 'settled' }) });
  assert.deepEqual(s, { monthKey: '2026-11', reason: 'open' });
});

check('openingInvoiceMonth: an unknown state (failed request) is not treated as unpaid', () => {
  const r = C.openingInvoiceMonth({ today: '2026-11-12', closingDay: 2, statusOf: () => 'unknown' });
  assert.deepEqual(r, { monthKey: '2026-12', reason: 'open' });
});

check('openingInvoiceMonth: a month in the URL (?month=) has priority over the rule', () => {
  const r = C.openingInvoiceMonth({
    today: '2026-11-12',
    closingDay: 2,
    statusOf: memoOf({ '2026-11': 'unpaid' }),
    urlMonth: '2026-10',
  });
  assert.deepEqual(r, { monthKey: '2026-10', reason: 'url' });
  const bad = C.openingInvoiceMonth({ today: '2026-11-12', closingDay: 2, statusOf: () => 'settled', urlMonth: '2026-13' });
  assert.deepEqual(bad, { monthKey: '2026-12', reason: 'open' });
});

check('invoiceMemo: paid (state or legacy flag) is settled; closed with an amount owed is unpaid; zero owed is settled', () => {
  assert.equal(C.invoiceMemo({ state: 'paid', debtTotal: 0 }), 'settled');
  assert.equal(C.invoiceMemo({ isPaid: true, total: 0 }), 'settled');
  assert.equal(C.invoiceMemo({ state: 'closed', debtTotal: 812.4 }), 'unpaid');
  assert.equal(C.invoiceMemo({ state: 'closed', debtTotal: 0, statementTotal: 0 }), 'settled');
  assert.equal(C.invoiceMemo({ isPaid: false, total: 300 }), 'unpaid');
  assert.equal(C.invoiceMemo(null), 'unknown');
  assert.equal(C.invoiceMemo({ state: 'open', debtTotal: 10 }), 'unknown');
});

check('invoiceMemo: a partly paid closed invoice still owes, so it is unpaid', () => {
  assert.equal(C.invoiceMemo({ state: 'closed', statementTotal: 1000, debtTotal: 400 }), 'unpaid');
  assert.equal(C.invoiceMemo({ state: 'closed', statementTotal: 1000, debtTotal: 0.004 }), 'settled');
});

check('openingInvoiceMonth: a partly paid closed invoice opens it', () => {
  const r = C.openingInvoiceMonth({
    today: '2026-11-12',
    closingDay: 2,
    statusOf: (k: string) => (k === '2026-11' ? C.invoiceMemo({ state: 'closed', statementTotal: 1000, debtTotal: 400 }) : 'settled'),
  });
  assert.deepEqual(r, { monthKey: '2026-11', reason: 'closed-unpaid' });
});

check('openingInvoiceMonth: a new card with no invoices (empty answers) opens the open invoice', () => {
  const r = C.openingInvoiceMonth({ today: '2026-11-12', closingDay: 2, statusOf: (k: string) => C.invoiceMemo(k ? null : null) });
  assert.deepEqual(r, { monthKey: '2026-12', reason: 'open' });
  const z = C.openingInvoiceMonth({
    today: '2026-11-12',
    closingDay: 2,
    statusOf: () => C.invoiceMemo({ state: 'closed', statementTotal: 0, debtTotal: 0 }),
  });
  assert.equal(z.monthKey, '2026-12');
});
