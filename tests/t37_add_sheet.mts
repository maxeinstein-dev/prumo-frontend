import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Folha de adicionar (lote R2): pure logic of the mobile add sheet below 768 px. Invented data only.
// ADD_SHEET_MODULE points the suite at a mutated copy of utils/addSheet.ts.
const shPath = process.env.ADD_SHEET_MODULE || frontSrc('utils/addSheet.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(shPath).href);

console.log('\n[add sheet] utils/addSheet.ts');

// ---- valor ---------------------------------------------------------------------------------------------

check('amountDigitsToCents: keeps only the digits, empty or zero is 0, at most 11 digits count', () => {
  assert.equal(S.amountDigitsToCents('4590'), 4590);
  assert.equal(S.amountDigitsToCents('R$ 45,90'), 4590);
  assert.equal(S.amountDigitsToCents(''), 0);
  assert.equal(S.amountDigitsToCents('0,00'), 0);
  assert.equal(S.amountDigitsToCents('123456789012345'), 12345678901);
});

check('formatAmountInput: two decimals in pt-BR, thousands with a dot, no currency symbol', () => {
  assert.equal(S.formatAmountInput(0, 2, 'pt-BR'), '0,00');
  assert.equal(S.formatAmountInput(4590, 2, 'pt-BR'), '45,90');
  assert.equal(S.formatAmountInput(123456789, 2, 'pt-BR'), '1.234.567,89');
});

check('formatAmountInput: currencies without cents (decimalPlaces 0) keep the units', () => {
  assert.equal(S.formatAmountInput(4590, 0, 'ja-JP'), '4,590');
});

check('typing right to left: each digit enters as the last cent, 4 then 5 then 9 then 0 gives 45,90', () => {
  let text = S.formatAmountInput(0, 2, 'pt-BR');
  for (const digit of ['4', '5', '9', '0']) {
    text = S.formatAmountInput(S.amountDigitsToCents(text + digit), 2, 'pt-BR');
  }
  assert.equal(text, '45,90');
});

check('the value is always read from its digits: a digit typed while the caret is in the middle still enters as the last cent', () => {
  // The DOM keeps the caret at the end; the pure rule only reads the digits, so the order of the digits is the only input.
  assert.equal(S.formatAmountInput(S.amountDigitsToCents('4' + '5' + '90'), 2, 'pt-BR'), '45,90');
  assert.equal(S.formatAmountInput(S.amountDigitsToCents('41' + '590'), 2, 'pt-BR'), '415,90');
});

// ---- mais usadas ---------------------------------------------------------------------------------------

check('orderByRecent: recent values first in their recency order, then the rest in the default order', () => {
  assert.deepEqual(S.orderByRecent(['A', 'B', 'C', 'D'], ['C', 'A', 'Z']), ['C', 'A', 'B', 'D']);
});

check('orderByRecent: without history the default order stays', () => {
  assert.deepEqual(S.orderByRecent(['A', 'B', 'C'], []), ['A', 'B', 'C']);
});

check('rememberRecent: the used value goes to the front without duplicates and the list is capped', () => {
  assert.deepEqual(S.rememberRecent(['A', 'B'], 'B', 3), ['B', 'A']);
  assert.deepEqual(S.rememberRecent(['A', 'B', 'C'], 'D', 3), ['D', 'A', 'B']);
});

check('recentStorageKey: separate per household, per type and per kind (category or account)', () => {
  const keys = new Set([
    S.recentStorageKey('h1', 'EXPENSE', 'category'),
    S.recentStorageKey('h1', 'INCOME', 'category'),
    S.recentStorageKey('h2', 'EXPENSE', 'category'),
    S.recentStorageKey('h1', 'EXPENSE', 'account'),
  ]);
  assert.equal(keys.size, 4);
});

check('readRecent / writeRecent: round trip on a storage; invalid JSON or non-strings give an empty list', () => {
  const map = new Map<string, string>();
  const storage = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
  const key = S.recentStorageKey('h1', 'EXPENSE', 'category');
  S.writeRecent(storage, key, ['Mercado', 'Lazer']);
  assert.deepEqual(S.readRecent(storage, key), ['Mercado', 'Lazer']);
  map.set(key, '{not json');
  assert.deepEqual(S.readRecent(storage, key), []);
  map.set(key, JSON.stringify(['ok', 3, null]));
  assert.deepEqual(S.readRecent(storage, key), ['ok']);
});

check('readRecent / writeRecent: a storage that throws (private window, blocked site data) never breaks the sheet', () => {
  const broken = {
    getItem: () => { throw new Error('blocked'); },
    setItem: () => { throw new Error('blocked'); },
  };
  assert.deepEqual(S.readRecent(broken, 'k'), []);
  assert.doesNotThrow(() => S.writeRecent(broken, 'k', ['x']));
  assert.deepEqual(S.readRecent(null, 'k'), []);
});

// ---- data -----------------------------------------------------------------------------------------------

check('dateChipDate: "Hoje" is now; "Ontem" is the day before, keeping the time of day', () => {
  const now = new Date(2026, 10, 12, 15, 30);
  const today = S.dateChipDate('today', now);
  assert.equal(today.getDate(), 12);
  const yesterday = S.dateChipDate('yesterday', now);
  assert.equal(yesterday.getMonth(), 10);
  assert.equal(yesterday.getDate(), 11);
  assert.equal(yesterday.getHours(), 15);
});

check('dateChipDate: "Ontem" across the start of a month goes back to the last day of the previous one', () => {
  const yesterday = S.dateChipDate('yesterday', new Date(2026, 10, 1, 9, 0));
  assert.equal(yesterday.getMonth(), 9);
  assert.equal(yesterday.getDate(), 31);
});

check('paidForDate: a date from today or before is paid by default, a future date is pending (the form\'s rule)', () => {
  const now = new Date(2026, 10, 12, 18, 0);
  assert.equal(S.paidForDate(new Date(2026, 10, 12, 18, 0), now), true);
  assert.equal(S.paidForDate(new Date(2026, 10, 11, 9, 0), now), true);
  assert.equal(S.paidForDate(new Date(2026, 10, 13, 9, 0), now), false);
});

// ---- validação e montagem -------------------------------------------------------------------------------

check('sheetCreateError: no amount gives the message the sheet shows, and the sheet stays open', () => {
  assert.equal(S.sheetCreateError({ amountCents: 0 }), 'Informe um valor maior que zero.');
  assert.equal(S.sheetCreateError({ amountCents: 4590 }), null);
});

const sheet = {
  type: 'EXPENSE',
  amountCents: 4590,
  description: '',
  category: 'Mercado',
  accountId: 'acc-1',
  date: new Date(2026, 10, 12, 10, 0),
};

check('toTransactionInput: builds the same plain transaction the form sends, in reais, paid by the date rule, one installment', () => {
  const data = S.toTransactionInput(sheet, new Date(2026, 10, 12, 12, 0));
  assert.equal(data.amount, 45.9);
  assert.equal(data.type, 'EXPENSE');
  assert.equal(data.category, 'Mercado');
  assert.equal(data.accountId, 'acc-1');
  assert.equal(data.description, '');
  assert.equal(data.paid, true);
  assert.equal(data.installments, 1);
  assert.equal(data.fromAccountId, '');
  assert.equal(data.toAccountId, '');
});

check('toTransactionInput: a description typed in the sheet is trimmed and kept', () => {
  const data = S.toTransactionInput({ ...sheet, description: '  Feira do bairro  ' }, new Date(2026, 10, 12, 12, 0));
  assert.equal(data.description, 'Feira do bairro');
});

check('toFullFormPrefill: carries type, amount, description, category, account, date and paid to the full form', () => {
  const p = S.toFullFormPrefill({ ...sheet, description: 'Feira' }, new Date(2026, 10, 12, 12, 0));
  assert.equal(p.type, 'EXPENSE');
  assert.equal(p.amount, 45.9);
  assert.equal(p.description, 'Feira');
  assert.equal(p.category, 'Mercado');
  assert.equal(p.accountId, 'acc-1');
  assert.equal(p.date.getDate(), 12);
  assert.equal(p.paid, true);
});

check('toTransferPrefill: a transfer takes the typed amount, description and date, with no category or account', () => {
  const p = S.toTransferPrefill({ ...sheet, description: 'Reserva' }, new Date(2026, 10, 12, 12, 0));
  assert.equal(p.type, 'TRANSFER');
  assert.equal(p.amount, 45.9);
  assert.equal(p.description, 'Reserva');
  assert.equal(p.category, '');
  assert.equal(p.accountId, '');
  assert.equal(p.fromAccountId, '');
  assert.equal(p.toAccountId, '');
});

// ---- contas ----------------------------------------------------------------------------------------------

check('sheetAccounts: investments are left out, every other account the form offers stays', () => {
  const accounts = [
    { id: 'a', type: 'CHECKING' },
    { id: 'b', type: 'CREDIT' },
    { id: 'c', type: 'INVESTMENT' },
    { id: 'd', type: 'CASH' },
  ];
  assert.deepEqual(S.sheetAccounts(accounts).map((a: { id: string }) => a.id), ['a', 'b', 'd']);
});

// ---- regras compartilhadas com o formulário completo ---------------------------------------------------

const RULES_PATH = process.env.SIMPLE_TRANSACTION_MODULE || frontSrc('utils/simpleTransactionRules.ts');
const LABEL_PATH = process.env.ACCOUNT_LABEL_MODULE || frontSrc('utils/accountOptionLabel.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = await import(pathToFileURL(RULES_PATH).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const L: any = await import(pathToFileURL(LABEL_PATH).href);

const labels = { creditCard: 'Cartão', cash: 'Dinheiro', myPersonalAccount: '(minha)', otherMemberPersonalAccount: '(de outro membro)' };
const accountsForRules = [
  { id: 'chk', type: 'CHECKING', availableBalance: 100, totalBalance: 100, allocatedBalance: 0 },
  { id: 'crd', type: 'CREDIT', availableBalance: 0, totalBalance: 0, allocatedBalance: 0 },
];

check('accountOptionLabel: a plain account shows its name; cards and cash get their type first', () => {
  assert.equal(L.accountOptionLabel({ name: 'Conta A', type: 'CHECKING' }, labels, 'me'), 'Conta A');
  assert.equal(L.accountOptionLabel({ name: 'Azul', type: 'CREDIT' }, labels, 'me'), 'Cartão - Azul');
  assert.equal(L.accountOptionLabel({ name: 'Carteira', type: 'CASH' }, labels, 'me'), 'Dinheiro - Carteira');
});

check('accountOptionLabel: a personal account says whose it is, mine or another member\'s', () => {
  assert.equal(L.accountOptionLabel({ name: 'Conta B', type: 'CHECKING', isPersonal: true, accountOwnerId: 'me' }, labels, 'me'), 'Conta B (minha)');
  assert.equal(L.accountOptionLabel({ name: 'Conta C', type: 'CHECKING', isPersonal: true, accountOwnerId: 'outra' }, labels, 'me'), 'Conta C (de outro membro)');
});

check('simpleTransactionError: an income or expense without an account says so; a transfer is not this rule', () => {
  assert.equal(R.simpleTransactionError({ type: 'EXPENSE', amount: 10, paid: true, accountId: '' }, accountsForRules), 'accountRequired');
  assert.equal(R.simpleTransactionError({ type: 'INCOME', amount: 10, paid: true, accountId: '' }, accountsForRules), 'accountRequired');
});

check('simpleTransactionError: a paid expense above the available balance is refused', () => {
  assert.equal(R.simpleTransactionError({ type: 'EXPENSE', amount: 150, paid: true, accountId: 'chk' }, accountsForRules), 'insufficientBalance');
  assert.equal(R.simpleTransactionError({ type: 'EXPENSE', amount: 100, paid: true, accountId: 'chk' }, accountsForRules), null);
});

check('simpleTransactionError: a pending expense, a card purchase and an income are not checked against the balance', () => {
  assert.equal(R.simpleTransactionError({ type: 'EXPENSE', amount: 150, paid: false, accountId: 'chk' }, accountsForRules), null);
  assert.equal(R.simpleTransactionError({ type: 'EXPENSE', amount: 150, paid: true, accountId: 'crd' }, accountsForRules), null);
  assert.equal(R.simpleTransactionError({ type: 'INCOME', amount: 150, paid: true, accountId: 'chk' }, accountsForRules), null);
});

// ---- situação (pago ou pendente) escolhida na folha ----------------------------------------------------

check('situationPaid: without a choice the date decides (today or before paid, later pending)', () => {
  const now = new Date(2026, 10, 12, 18, 0);
  assert.equal(S.situationPaid(new Date(2026, 10, 12, 9, 0), now, null), true);
  assert.equal(S.situationPaid(new Date(2026, 10, 13, 9, 0), now, null), false);
  assert.equal(S.situationPaid(new Date(2026, 10, 13, 9, 0), now, undefined), false);
});

check('situationPaid: an explicit choice wins over the date, in both directions', () => {
  const now = new Date(2026, 10, 12, 18, 0);
  assert.equal(S.situationPaid(new Date(2026, 10, 12, 9, 0), now, false), false);
  assert.equal(S.situationPaid(new Date(2026, 10, 13, 9, 0), now, true), true);
});

check('situationLabels: despesa says Pago / Pendente; receita says Recebido / A receber', () => {
  assert.deepEqual(S.situationLabels('EXPENSE'), { paid: 'Pago', pending: 'Pendente' });
  assert.deepEqual(S.situationLabels('INCOME'), { paid: 'Recebido', pending: 'A receber' });
});

check('toTransactionInput: a pending choice is sent as pending even for today, and a paid choice for a future date', () => {
  const now = new Date(2026, 10, 12, 12, 0);
  assert.equal(S.toTransactionInput({ ...sheet, paidChoice: false }, now).paid, false);
  assert.equal(S.toTransactionInput({ ...sheet, date: new Date(2026, 10, 20, 9, 0), paidChoice: true }, now).paid, true);
  assert.equal(S.toTransactionInput({ ...sheet, paidChoice: null }, now).paid, true);
});

check('toFullFormPrefill and toTransferPrefill carry the chosen situation to the full form', () => {
  const now = new Date(2026, 10, 12, 12, 0);
  assert.equal(S.toFullFormPrefill({ ...sheet, paidChoice: false }, now).paid, false);
  assert.equal(S.toTransferPrefill({ ...sheet, paidChoice: false }, now).paid, false);
  assert.equal(S.toTransferPrefill({ ...sheet, date: new Date(2026, 10, 20, 9, 0) }, now).paid, false);
});

check('a pending expense above the balance is not refused: the balance rule only checks paid expenses', () => {
  const now = new Date(2026, 10, 12, 12, 0);
  const data = S.toTransactionInput({ ...sheet, amountCents: 15000, accountId: 'chk', paidChoice: false }, now);
  assert.equal(R.simpleTransactionError({ type: data.type, amount: data.amount, paid: data.paid, accountId: data.accountId }, accountsForRules), null);
  const paid = S.toTransactionInput({ ...sheet, amountCents: 15000, accountId: 'chk', paidChoice: true }, now);
  assert.equal(R.simpleTransactionError({ type: paid.type, amount: paid.amount, paid: paid.paid, accountId: paid.accountId }, accountsForRules), 'insufficientBalance');
});

// ---- linha de contas enquanto carregam ------------------------------------------------------------------

check('accountsRowState: accounts in hand show them; none yet and still loading shows loading; none and done shows empty', () => {
  assert.equal(S.accountsRowState(true, 2), 'ready');
  assert.equal(S.accountsRowState(false, 2), 'ready');
  assert.equal(S.accountsRowState(true, 0), 'loading');
  assert.equal(S.accountsRowState(false, 0), 'empty');
});

check('accountsRowMessage: loading and empty say what is happening; ready says nothing', () => {
  assert.equal(S.accountsRowMessage('loading'), 'Carregando contas…');
  assert.equal(S.accountsRowMessage('empty'), 'Nenhuma conta disponível.');
  assert.equal(S.accountsRowMessage('ready'), null);
});

check('accountsNotReadyError: Lançar without an account while the accounts load asks to wait, and keeps the sheet open', () => {
  assert.equal(S.accountsNotReadyError('loading', ''), 'Aguarde as contas carregarem.');
  assert.equal(S.accountsNotReadyError('loading', 'acc-1'), null);
  assert.equal(S.accountsNotReadyError('ready', ''), null);
  assert.equal(S.accountsNotReadyError('empty', ''), null);
});
