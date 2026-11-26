import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// "Pode gastar até DD/MM" (P07 L1): src/utils/spendable.ts shapes summary.nextIncome / spendableUntilNextIncome of
// GET /dashboard/cash-flow into the card of the Fluxo (desktop and mobile) and of the Início. Any income ends the window
// (decision of 13/11/2026: a side job, a sale or a gift also brings money); the number is the server's. This only picks
// the state and the words. SPENDABLE_MODULE points at a mutated copy. Invented data only.
const modPath = process.env.SPENDABLE_MODULE || frontSrc('utils/spendable.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(modPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const T: any = await import(pathToFileURL(frontSrc('utils/cashFlowTexts.ts')).href);

const TODAY = '2026-11-10';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const resp = (summary: Record<string, any>, days = 30): any => ({
  currency: 'BRL',
  period: { from: TODAY, to: '2026-12-10', days },
  startingBalance: 1000,
  days: [],
  summary: { lowestBalance: { date: TODAY, amount: 1000 }, ...summary },
  unassignedInvoices: [],
});
const withIncome = (amount: number, lowestDate = '2026-11-15', description = 'Salário') =>
  resp({ nextIncome: { date: '2026-11-20', amount: 5000, description }, spendableUntilNextIncome: { amount, lowestDate, balance: 'free' } });
const noIncome = (days = 30) => resp({ nextIncome: null, spendableUntilNextIncome: null }, days);
const text = (key: string, vars?: Record<string, string | number>) => T.cashFlowText(null, key, vars);
const money = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
const lines = (view: unknown) => S.spendableLines(view, text, money);

console.log('\n[t53] pode gastar até a próxima entrada');

check('older backend (keys absent) or no answer: no card at all', () => {
  assert.equal(S.spendableView(resp({})), null);
  assert.equal(S.spendableView(undefined), null);
  assert.equal(S.spendableView(null), null);
});

check('with a next income: the amount, the day of the income and the lowest day', () => {
  const view = S.spendableView(withIncome(412.35));
  assert.deepEqual(view, {
    kind: 'amount', untilDate: '2026-11-20', cents: 41235, zero: false, lowestDate: '2026-11-15', lowestIsToday: false,
    incomeCents: 500000, incomeDescription: 'Salário',
  });
  const l = lines(view);
  assert.equal(l.title, 'Pode gastar até 20/11');
  assert.equal(l.value, 'R$ 412,35');
  assert.match(l.detail, /15\/11/);
  assert.match(l.detail, /Salário, R\$ 5000,00/);
});

check('zero: the value shows zero and the detail says the free balance gets there before the income', () => {
  const view = S.spendableView(withIncome(0, '2026-11-12'));
  assert.equal(view.zero, true);
  const l = lines(view);
  assert.equal(l.value, 'R$ 0,00');
  assert.match(l.detail, /zero/);
  assert.match(l.detail, /entrada de 20\/11/);
  assert.match(l.detail, /12\/11/);
});

check('a negative amount from the wire is still shown as zero (never negative)', () => {
  const view = S.spendableView(withIncome(-50, TODAY));
  assert.equal(view.cents, 0);
  assert.equal(view.zero, true);
});

check('lowest day today is said as "hoje"', () => {
  const view = S.spendableView(withIncome(300, TODAY));
  assert.equal(view.lowestIsToday, true);
  assert.match(lines(view).detail, /hoje/);
  assert.doesNotMatch(lines(view).detail, /10\/11/);
});

check('no income in the period: no value, the card says so with the period length', () => {
  const view = S.spendableView(noIncome(60));
  assert.deepEqual(view, { kind: 'no-income', days: 60 });
  const l = lines(view);
  assert.equal(l.value, null);
  assert.equal(l.title, 'Pode gastar até a próxima entrada');
  assert.equal(l.detail, 'Nenhuma entrada prevista nos próximos 60 dias.');
});

check('an income without a description falls back to a word, never an empty pair of commas', () => {
  const view = S.spendableView(withIncome(300, '2026-11-11', ''));
  assert.doesNotMatch(lines(view).detail, /(\(|: ), /);
  assert.match(lines(view).detail, /Sem descrição/);
  const zero = S.spendableView(withIncome(0, '2026-11-11', '  '));
  assert.doesNotMatch(lines(zero).detail, /(\(|: ), /);
});

check('no text of the card says "sobra" (the Início already has the leftover and "Livre da renda")', () => {
  const all = [lines(S.spendableView(withIncome(3))), lines(S.spendableView(withIncome(0))), lines(S.spendableView(noIncome()))]
    .flatMap((l) => [l.title, l.value ?? '', l.detail, l.note]);
  for (const s of all) assert.doesNotMatch(s, /sobra/i, s);
  for (const [key, value] of Object.entries(T.CASH_FLOW_TEXTS_PT)) if (key.startsWith('cashFlowSpendable')) assert.doesNotMatch(String(value), /sobra/i, key);
});

check('the note says it is the free balance and that day-to-day spending is not estimated', () => {
  const l = lines(S.spendableView(noIncome()));
  assert.match(l.note, /metas/);
  assert.match(l.note, /dia a dia/);
});
