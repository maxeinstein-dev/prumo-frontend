import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P25 L3: the Início strip when the bank balance (last Open Finance import) differs from Prumo's balance beyond the
// tolerance (src/utils/homeMobile.ts, warningStrips). Invented names and values only.
const path = process.env.HOME_MOBILE_MODULE || frontSrc('utils/homeMobile.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const H: any = await import(pathToFileURL(path).href);

const gap = (over: Record<string, unknown> = {}) => ({
  prumoAccountId: 'acc-1',
  accountName: 'Carteira Exemplo',
  bankCents: 41140,
  prumoCents: 40140,
  diffCents: 1000,
  estimated: false,
  toleranceCents: 0,
  alert: true,
  at: '2026-11-28T13:05:00.000Z',
  ...over,
});

console.log('\n[balance notice] utils/homeMobile.ts warningStrips');

check('warningStrips: one strip per account whose balance differs from the bank, with the difference, to Contas', () => {
  const strips = H.warningStrips({ captures: 0, negativeDate: null, balances: [gap(), gap({ prumoAccountId: 'acc-2', accountName: 'Banco Exemplo', diffCents: -250 })] });
  assert.deepEqual(
    strips.map((s: { id: string; title: string; subtitle: string; to: string }) => [s.id, s.title, s.subtitle, s.to]),
    [
      ['balance:acc-1', 'Carteira Exemplo: saldo diferente do banco', 'O banco tem R$ 10,00 a mais que o Prumo', '/app/accounts'],
      ['balance:acc-2', 'Banco Exemplo: saldo diferente do banco', 'O banco tem R$ 2,50 a menos que o Prumo', '/app/accounts'],
    ],
  );
});

check('warningStrips: no strip when the difference is within the tolerance (alert false), nor without balances', () => {
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null, balances: [gap({ alert: false })] }), []);
  assert.deepEqual(H.warningStrips({ captures: 0, negativeDate: null }), []);
});

check('warningStrips: an estimated bank balance says so; the strips come after the captures and before the negative day', () => {
  const strips = H.warningStrips({ captures: 2, negativeDate: '2026-12-10', balances: [gap({ estimated: true, diffCents: 123456 })] });
  assert.deepEqual(strips.map((s: { id: string }) => s.id), ['captures', 'balance:acc-1', 'negative']);
  assert.equal(strips[1].subtitle, 'O banco tem R$ 1.234,56 a mais que o Prumo (com estimativa do cofrinho)');
});
