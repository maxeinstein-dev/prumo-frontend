import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P25 L5: the broker portfolio from Open Finance against P21 (GET /open-finance/investments). The Início warns only when
// a quantity differs or an asset is on one side only (decision of 27/11/2026); values only compare on the Investimentos
// page. Invented tickers and values only.
const H_PATH = process.env.HOME_MOBILE_MODULE || frontSrc('utils/homeMobile.ts');
const P_PATH = process.env.OPEN_FINANCE_PORTFOLIO_MODULE || frontSrc('utils/openFinancePortfolio.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const H: any = await import(pathToFileURL(H_PATH).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const P: any = await import(pathToFileURL(P_PATH).href);

const stock = (ticker: string, status: string, bankQuantity: number | null, prumoQuantity: number | null, bankCents: number | null = 1000, prumoCents: number | null = 1000) => ({
  ticker, status, bankQuantity, prumoQuantity, bankCents, prumoCents,
});
const account = (stocks: unknown[], over: Record<string, unknown> = {}) => ({
  prumoAccountId: 'acc-inv',
  accountName: 'Corretora Exemplo',
  blocked: null,
  itemId: 'item-x',
  stocks,
  others: { bankCents: 1534210, prumoCents: 1535335 },
  cash: { bankCents: 1210, prumoCents: 1210 },
  total: { bankCents: 1622500, prumoCents: 1625939, diffCents: -3439 },
  ...over,
});

console.log('\n[portfolio check] utils/openFinancePortfolio.ts, homeMobile warningStrips');

check('warningStrips: no strip when every quantity matches, however the values differ', () => {
  const same = account([stock('AAAA11', 'same', 53, 53, 41210, 42808)]);
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null, portfolios: [same] }), []);
});

check('warningStrips: a strip per account with a quantity difference or an asset on one side, naming the first and counting the rest', () => {
  const [strip] = H.warningStrips({
    captures: 0,
    negativeDate: null,
    portfolios: [account([stock('AAAA11', 'same', 2, 2), stock('BBBB11', 'quantity', 47, 45), stock('CCCC3', 'bank_only', 5, null), stock('DDDD11', 'prumo_only', null, 3)])],
  });
  assert.equal(strip.id, 'portfolio:acc-inv');
  assert.equal(strip.title, 'Corretora Exemplo: carteira diferente do banco');
  assert.equal(strip.subtitle, 'BBBB11: 47 no banco, 45 no Prumo · e mais 2');
  assert.equal(strip.to, '/app/investments/acc-inv');
});

check('warningStrips: one asset only at the bank / only in Prumo; a blocked connection gives no strip', () => {
  assert.equal(H.warningStrips({ captures: 0, negativeDate: null, portfolios: [account([stock('CCCC3', 'bank_only', 5, null)])] })[0].subtitle, 'CCCC3: só no banco (5)');
  assert.equal(H.warningStrips({ captures: 0, negativeDate: null, portfolios: [account([stock('DDDD11', 'prumo_only', null, 3)])] })[0].subtitle, 'DDDD11: só no Prumo (3)');
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null, portfolios: [{ prumoAccountId: 'acc-inv', accountName: 'X', blocked: 'vencida' }] }), []);
});

check('portfolioRows: one row per asset, then fixed income and funds, cash and the total, with the difference bank - Prumo', () => {
  const rows = P.portfolioRows(account([stock('AAAA11', 'same', 53, 53, 41210, 42808), stock('BBBB11', 'quantity', 47, 45, 100, 90)]));
  assert.deepEqual(
    rows.map((r: { label: string; bankCents: number | null; prumoCents: number | null; diffCents: number | null; note: string }) => [r.label, r.bankCents, r.prumoCents, r.diffCents, r.note]),
    [
      ['AAAA11', 41210, 42808, -1598, '53 cotas'],
      ['BBBB11', 100, 90, 10, 'Quantidade diferente: 47 no banco, 45 no Prumo'],
      ['Renda fixa e fundos', 1534210, 1535335, -1125, ''],
      ['Caixa', 1210, 1210, 0, ''],
      ['Total', 1622500, 1625939, -3439, ''],
    ],
  );
});
