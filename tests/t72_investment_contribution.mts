import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// P24 L2: o aporte (transferência de uma conta que não é de investimento para uma que é) já sai com a categoria
// "Investimentos" e aparece como "Investido" na divisão da renda. Lógica pura em utils/investmentContribution.ts e
// utils/incomeSplit.ts; o resto são guardas de código. Dados inventados.
const contributionPath = process.env.INVESTMENT_CONTRIBUTION_MODULE || frontSrc('utils/investmentContribution.ts');
const splitPath = process.env.INCOME_SPLIT_MODULE || frontSrc('utils/incomeSplit.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(contributionPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S: any = await import(pathToFileURL(splitPath).href);

console.log('\n[aporte como investido] utils/investmentContribution.ts');

const bank = { type: 'CHECKING' };
const savings = { type: 'SAVINGS' };
const broker = { type: 'INVESTMENT' };

check('isInvestmentContribution: banco para investimento é aporte; resgate, corretora para corretora e banco para banco não', () => {
  assert.equal(C.isInvestmentContribution(bank, broker), true);
  assert.equal(C.isInvestmentContribution(savings, broker), true);
  assert.equal(C.isInvestmentContribution(broker, bank), false);
  assert.equal(C.isInvestmentContribution(broker, broker), false);
  assert.equal(C.isInvestmentContribution(bank, savings), false);
  assert.equal(C.isInvestmentContribution(undefined, broker), false);
  assert.equal(C.isInvestmentContribution(bank, undefined), false);
});

const categories = [
  { id: 'c-1', name: 'Mercado da Esquina', type: 'EXPENSE', isSystem: false },
  { id: 'c-2', name: 'Investimentos', type: 'INCOME', isSystem: false },
  { id: 'c-3', name: '  investimentos ', type: 'EXPENSE', isSystem: false },
];

check('investmentsCategoryValue: a categoria de despesa "Investimentos" da casa (sem diferenciar maiúsculas e espaços)', () => {
  assert.equal(C.investmentsCategoryValue(categories), 'CUSTOM:c-3');
  assert.equal(C.investmentsCategoryValue([{ id: 'c-9', name: 'Investimento', type: 'EXPENSE', isSystem: false }]), 'CUSTOM:c-9');
  assert.equal(C.investmentsCategoryValue([{ id: 'c-8', name: 'Invéstimentos', type: 'EXPENSE', isSystem: false }]), 'CUSTOM:c-8');
});

check('investmentsCategoryValue: sem a categoria de despesa, nada é sugerido', () => {
  assert.equal(C.investmentsCategoryValue([categories[0], categories[1]]), null);
  assert.equal(C.investmentsCategoryValue([]), null);
  assert.equal(C.investmentsCategoryValue(undefined), null);
});

check('transferCategoryToSend: só o aporte leva categoria; vazio vai sem (o servidor conta só no Geral)', () => {
  assert.equal(C.transferCategoryToSend(bank, broker, 'CUSTOM:c-3'), 'CUSTOM:c-3');
  assert.equal(C.transferCategoryToSend(bank, broker, ''), undefined);
  assert.equal(C.transferCategoryToSend(broker, bank, 'CUSTOM:c-3'), undefined);
  assert.equal(C.transferCategoryToSend(bank, savings, 'CUSTOM:c-3'), undefined);
});

console.log('\n[aporte como investido] utils/incomeSplit.ts');

const brl = (cents: number): string => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const split = (o: any = {}): any => ({
  month: '2026-12',
  income: { amount: 5000, basis: 'expected' },
  groups: [],
  totalSpent: 400,
  leftover: { amount: 4600, percentOfIncome: 0.92 },
  housing: { amount: 0, percentOfIncome: 0, reference: 0.3, housingGroups: 0 },
  ...o,
});

check('investedLine: o investido do mês com a parte da renda', () => {
  assert.deepEqual(S.investedLine(split({ invested: { amount: 250, percentOfIncome: 0.05 } }), brl), { amount: 'R$ 250,00', share: '5%' });
});

check('investedLine: nada investido (ou servidor antigo sem o campo) não mostra a linha', () => {
  assert.equal(S.investedLine(split({ invested: { amount: 0, percentOfIncome: 0 } }), brl), null);
  assert.equal(S.investedLine(split(), brl), null);
});

console.log('\n[aporte como investido] guardas de código');

const read = (rel: string): string => readFileSync(frontSrc(rel), 'utf8');

check('o formulário de transferência sugere "Investimentos" no aporte e o envio manda a categoria', () => {
  const fields = read('components/transactions/TransferFormFields.tsx');
  assert.match(fields, /investmentsCategoryValue\(/);
  assert.match(fields, /isInvestmentContribution\(/);
  assert.match(fields, /CategoryCombobox/);
  const modal = read('components/TransactionModal.tsx');
  assert.match(modal, /categoryName:\s*transferCategoryToSend\(/);
  const context = read('context/TransactionsContext.tsx');
  assert.match(context, /categoryName:\s*data\.categoryName/);
});

check('a barra da renda mostra o investido', () => {
  const views = read('components/spending-groups/IncomeSplitViews.tsx');
  assert.match(views, /investedLine\(/);
  assert.match(views, /data-testid="income-split-invested"/);
});
