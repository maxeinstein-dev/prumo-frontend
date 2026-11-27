import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Settings > Open Finance (P25 L4): src/utils/openFinanceLinks.ts, the pure part of the screen that links each Pluggy
// account to a Prumo account. Invented data only (ids and names are made up).
const path = process.env.OPEN_FINANCE_LINKS_MODULE || frontSrc('utils/openFinanceLinks.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = await import(pathToFileURL(path).href);

const ITEM_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const ITEM_B = 'aaaaaaaa-0000-4000-8000-00000000000b';
const P_CHECK = 'bbbbbbbb-0000-4000-8000-000000000001';
const P_CARD = 'bbbbbbbb-0000-4000-8000-000000000002';
const P_SPARE = 'bbbbbbbb-0000-4000-8000-000000000003';
const P_OLD = 'bbbbbbbb-0000-4000-8000-000000000009';
const ACC_BANK = 'cccccccc-0000-4000-8000-000000000001';
const ACC_CARD = 'cccccccc-0000-4000-8000-000000000002';
const ACC_INV = 'cccccccc-0000-4000-8000-000000000003';
const ACC_CASH = 'cccccccc-0000-4000-8000-000000000004';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pAcc = (id: string, itemId: string, type: 'BANK' | 'CREDIT', accountId: string | null = null, over: any = {}) => ({
  id,
  itemId,
  type,
  subtype: type === 'BANK' ? 'CHECKING_ACCOUNT' : 'CREDIT_CARD',
  name: type === 'BANK' ? 'Banco Inventado' : 'cartao inventado',
  marketingName: null,
  number: type === 'BANK' ? '00000-1' : '1234',
  balance: 0,
  currencyCode: 'BRL',
  accountId,
  ...over,
});

const ITEMS = [
  {
    itemId: ITEM_A,
    error: null,
    accounts: [pAcc(P_CHECK, ITEM_A, 'BANK', ACC_BANK), pAcc(P_CARD, ITEM_A, 'CREDIT')],
    orphanLinks: [{ pluggyAccountId: P_OLD, accountId: ACC_CASH }],
  },
  { itemId: ITEM_B, error: 'Pluggy answered with an error (HTTP 400)', accounts: [], orphanLinks: [{ pluggyAccountId: P_SPARE, accountId: ACC_INV }] },
];

const PRUMO = [
  { id: ACC_BANK, name: 'Conta Exemplo', type: 'CHECKING' },
  { id: ACC_CARD, name: 'Cartao Exemplo', type: 'CREDIT' },
  { id: ACC_INV, name: 'Corretora Exemplo', type: 'INVESTMENT' },
  { id: ACC_CASH, name: 'Carteira', type: 'CASH' },
  { id: 'cccccccc-0000-4000-8000-000000000005', name: 'Antiga', type: 'CHECKING', isActive: false },
];

console.log('\n[open finance links] utils/openFinanceLinks.ts');

check('draftFromItems: each listed Pluggy account with its Prumo account, "" when ignored', () => {
  assert.deepEqual(L.draftFromItems(ITEMS), { [P_CHECK]: ACC_BANK, [P_CARD]: '' });
});

check('accountOptionsFor: a card only offers credit cards; a bank account offers the other active accounts', () => {
  assert.deepEqual(L.accountOptionsFor(pAcc(P_CARD, ITEM_A, 'CREDIT'), PRUMO).map((o: { value: string }) => o.value), [ACC_CARD]);
  assert.deepEqual(
    L.accountOptionsFor(pAcc(P_CHECK, ITEM_A, 'BANK'), PRUMO).map((o: { value: string }) => o.value),
    [ACC_BANK, ACC_INV, ACC_CASH],
  );
});

check('isDraftChanged: false for the saved state, true after a change', () => {
  const draft = L.draftFromItems(ITEMS);
  assert.equal(L.isDraftChanged(draft, ITEMS), false);
  assert.equal(L.isDraftChanged({ ...draft, [P_CARD]: ACC_CARD }, ITEMS), true);
});

check('buildLinksBody: the chosen accounts, plus the links of items Pluggy could not read (never dropped by a save)', () => {
  const body = L.buildLinksBody({ [P_CHECK]: ACC_BANK, [P_CARD]: ACC_CARD }, ITEMS);
  assert.deepEqual(body, {
    links: [
      { pluggyItemId: ITEM_A, pluggyAccountId: P_CHECK, accountId: ACC_BANK },
      { pluggyItemId: ITEM_A, pluggyAccountId: P_CARD, accountId: ACC_CARD },
      { pluggyItemId: ITEM_B, pluggyAccountId: P_SPARE, accountId: ACC_INV },
    ],
  });
});

check('buildLinksBody: "" leaves the account out (ignored); orphans of a readable item are dropped', () => {
  const body = L.buildLinksBody({ [P_CHECK]: '', [P_CARD]: '' }, ITEMS);
  assert.deepEqual(body.links.map((l: { pluggyAccountId: string }) => l.pluggyAccountId), [P_SPARE]);
});

check('duplicateChoice: the same Prumo account picked for two Pluggy accounts blocks the save', () => {
  assert.equal(L.duplicateChoice({ [P_CHECK]: ACC_BANK, [P_CARD]: '' }, ITEMS), null);
  assert.equal(L.duplicateChoice({ [P_CHECK]: ACC_INV, [P_CARD]: '' }, ITEMS), ACC_INV); // ACC_INV is kept for ITEM_B
  assert.equal(L.duplicateChoice({ [P_CHECK]: ACC_CARD, [P_CARD]: ACC_CARD }, ITEMS), ACC_CARD);
});

check('normalizeItemId: trims and lowercases a uuid; anything else is null', () => {
  assert.equal(L.normalizeItemId(`  ${ITEM_A.toUpperCase()} `), ITEM_A);
  assert.equal(L.normalizeItemId('not-an-id'), null);
  assert.equal(L.normalizeItemId(''), null);
});

check('itemTitle: the bank name from its accounts (marketing name of the bank account first), else a short id', () => {
  const item = { ...ITEMS[0], accounts: [pAcc(P_CARD, ITEM_A, 'CREDIT'), pAcc(P_CHECK, ITEM_A, 'BANK', null, { name: 'Banco X S.A.', marketingName: 'Banco X (Conta)' })] };
  assert.equal(L.itemTitle(item), 'Banco X (Conta)');
  assert.equal(L.itemTitle(ITEMS[1]), 'Conexão aaaaaaaa');
});

check('pluggyAccountLabel: kind and the end of the number', () => {
  assert.equal(L.pluggyAccountLabel(pAcc(P_CARD, ITEM_A, 'CREDIT')), 'Cartão de crédito final 1234');
  assert.equal(L.pluggyAccountLabel(pAcc(P_CHECK, ITEM_A, 'BANK')), 'Conta final 00000-1');
});
