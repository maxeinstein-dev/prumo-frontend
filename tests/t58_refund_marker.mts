import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Estorno: receita marcada isRefund que cancela uma despesa. Contas do lado do cliente, barra do orçamento e o campo
// "É estorno" do lançamento. Só dados inventados. REFUND_MODULE / CALCULATIONS_MODULE apontam para cópias mutadas.
const refundPath = process.env.REFUND_MODULE || frontSrc('utils/refund.ts');
const calcPath = process.env.CALCULATIONS_MODULE || frontSrc('utils/calculations.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = await import(pathToFileURL(refundPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(calcPath).href);
const read = (rel: string): string => readFileSync(frontSrc(rel), 'utf8');

console.log('\n[refund marker] utils/refund.ts, utils/calculations.ts');

const tx = (over: Record<string, unknown>) => ({ id: 'x', amount: 10, type: 'EXPENSE', category: 'Mercado', date: new Date(2026, 9, 5), ...over });
const month = [
  tx({ amount: 100 }),
  tx({ type: 'INCOME', amount: 30, isRefund: true }),
  tx({ type: 'INCOME', amount: 1000, category: 'Salário' }),
];

check('isRefundTx: só receita marcada é estorno', () => {
  assert.equal(R.isRefundTx({ type: 'INCOME', isRefund: true }), true);
  assert.equal(R.isRefundTx({ type: 'INCOME', isRefund: false }), false);
  assert.equal(R.isRefundTx({ type: 'INCOME' }), false);
  assert.equal(R.isRefundTx({ type: 'EXPENSE', isRefund: true }), false);
});

check('compra de 100 e estorno de 30: despesa 70, receita só o salário', () => {
  assert.equal(C.getTotalExpense(month), 70);
  assert.equal(C.getTotalIncome(month), 1000);
  assert.equal(C.getBalance(month), 930);
});

check('estorno sozinho no mês: despesa negativa, receita zero', () => {
  const only = [tx({ type: 'INCOME', amount: 30, isRefund: true })];
  assert.equal(C.getTotalExpense(only), -30);
  assert.equal(C.getTotalIncome(only), 0);
});

check('por categoria: o estorno abate a despesa da categoria dele e não vira receita', () => {
  const rows = C.getTransactionsByCategory([...month, tx({ amount: 50, category: 'Lazer' }), tx({ type: 'INCOME', amount: 20, isRefund: true, category: 'Lazer' })]);
  const by = (n: string) => rows.find((r: { name: string }) => r.name === n);
  assert.deepEqual([by('Mercado').receita, by('Mercado').despesa], [0, 70]);
  assert.deepEqual([by('Lazer').receita, by('Lazer').despesa], [0, 30]);
  assert.deepEqual([by('Salário').receita, by('Salário').despesa], [1000, 0]);
});

check('receita comum numa categoria de despesa continua receita (sem marcador)', () => {
  assert.equal(C.getTotalIncome([tx({ type: 'INCOME', amount: 40 })]), 40);
});

check('budgetBarWidth: a barra para no zero e no cem, gasto negativo não passa do começo', () => {
  assert.equal(R.budgetBarWidth(-30), 0);
  assert.equal(R.budgetBarWidth(0), 0);
  assert.equal(R.budgetBarWidth(42.5), 42.5);
  assert.equal(R.budgetBarWidth(180), 100);
  assert.equal(R.budgetBarWidth(Number.NaN), 0);
});

check('refundToSend: só receita manda o marcador (desmarcar limpa); despesa não manda', () => {
  assert.equal(R.refundToSend('INCOME', true), true);
  assert.equal(R.refundToSend('INCOME', false), false);
  assert.equal(R.refundToSend('EXPENSE', true), undefined);
  assert.equal(R.refundToSend('TRANSFER', true), undefined);
});

check('telas: as barras do orçamento usam budgetBarWidth', () => {
  for (const f of ['components/budgets/BudgetItem.tsx', 'components/widgets/BudgetVsRealizedWidget.tsx']) {
    const src = read(f);
    assert.ok(src.includes('budgetBarWidth('), f);
    assert.ok(!/width: `\$\{Math\.min\(budget\.percentage, 100\)\}%`/.test(src), `${f} ainda usa Math.min cru`);
  }
});

check('lançamento: o modal tem "É estorno" só para receita, e o envia', () => {
  const modal = read('components/TransactionModal.tsx');
  assert.ok(modal.includes('RefundField'), 'campo no modal');
  assert.ok(/\(transactionType === TransactionType\.INCOME \|\| isCreditCardContext\) && !isRecurring && \([\s\S]{0,60}<RefundField/.test(modal), 'só em receita (ou no cartão, onde o tipo é forçado)');
  assert.ok(modal.includes('refundToSend('), 'envia o marcador');
  assert.ok(read('components/transactions/RefundField.tsx').includes('data-testid="refund-field"'));
});

check('contexto: o marcador viaja na criação, na edição e na leitura', () => {
  const ctx = read('context/TransactionsContext.tsx');
  assert.ok((ctx.match(/isRefund/g) ?? []).length >= 4, 'leitura (2 mapas), criação e edição');
  assert.ok(read('types/index.ts').includes('isRefund?: boolean'));
});

check('folha de lançar do celular: "É estorno" só na receita, zera ao trocar de tipo e é enviado', () => {
  const sheet = read('components/mobile/AddTransactionSheet.tsx');
  assert.ok(/state\.type === 'INCOME' && \([\s\S]{0,120}<RefundField/.test(sheet), 'campo só na receita');
  assert.ok(/setIsRefund\(false\)/.test(sheet), 'zera ao trocar de tipo');
  assert.ok(/isRefund: true/.test(sheet), 'envia o marcador');
});

// ---- the refund keeps the category of the purchase (an expense category) ----

check('categoryListType: com "É estorno" a lista é de despesa, sem ele segue o tipo; no cartão sempre despesa', () => {
  assert.equal(R.categoryListType({ isRefund: true, type: 'INCOME', isCreditCardContext: false }), 'EXPENSE');
  assert.equal(R.categoryListType({ isRefund: false, type: 'INCOME', isCreditCardContext: false }), 'INCOME');
  assert.equal(R.categoryListType({ isRefund: false, type: 'EXPENSE', isCreditCardContext: false }), 'EXPENSE');
  assert.equal(R.categoryListType({ isRefund: false, type: 'INCOME', isCreditCardContext: true }), 'EXPENSE');
  assert.equal(R.categoryListType({ isRefund: true, type: 'INCOME', isCreditCardContext: true }), 'EXPENSE');
  assert.equal(R.categoryListType({ isRefund: false, type: 'TRANSFER', isCreditCardContext: false }), undefined);
});

check('categoryMustBeCleared: o estorno guarda a categoria de despesa e só perde a de receita', () => {
  const base = { type: 'INCOME', isRefund: true, isCreditCardContext: false, categoryIsIncome: false, categoryIsExpense: true };
  assert.equal(R.categoryMustBeCleared(base), false);
  assert.equal(R.categoryMustBeCleared({ ...base, categoryIsIncome: true, categoryIsExpense: false }), true);
  assert.equal(R.categoryMustBeCleared({ ...base, isCreditCardContext: true }), false);
});

check('categoryMustBeCleared: sem estorno nada muda (receita com categoria de despesa limpa; no cartão limpa a de receita)', () => {
  const base = { type: 'INCOME', isRefund: false, isCreditCardContext: false, categoryIsIncome: false, categoryIsExpense: true };
  assert.equal(R.categoryMustBeCleared(base), true);
  assert.equal(R.categoryMustBeCleared({ ...base, type: 'EXPENSE' }), false);
  assert.equal(R.categoryMustBeCleared({ ...base, type: 'EXPENSE', categoryIsExpense: false, categoryIsIncome: true }), true);
  assert.equal(R.categoryMustBeCleared({ ...base, isCreditCardContext: true, categoryIsIncome: true, categoryIsExpense: false }), true);
});

check('shouldAutoAdjustType: com "É estorno" o tipo não acompanha a categoria', () => {
  assert.equal(R.shouldAutoAdjustType(true), false);
  assert.equal(R.shouldAutoAdjustType(false), true);
});

check('modal: usa os mesmos helpers no auto-ajuste, na limpeza e na lista de categorias', () => {
  const modal = read('components/TransactionModal.tsx');
  assert.ok(modal.includes('shouldAutoAdjustType(isRefund)'), 'auto-ajuste do tipo suspenso');
  assert.ok(modal.includes('categoryMustBeCleared('), 'limpeza da categoria');
  assert.ok(/isRefund=\{isRefund\}/.test(modal), 'a lista de categorias recebe o estorno');
  assert.ok(read('components/transactions/TransactionBasicFields.tsx').includes('categoryListType('), 'lista pelo helper');
});

check('modal no cartão: o "É estorno" aparece no contexto de cartão e troca o tipo para receita ao marcar', () => {
  const modal = read('components/TransactionModal.tsx');
  assert.ok(/transactionType === TransactionType\.INCOME \|\| isCreditCardContext/.test(modal), 'campo também no cartão');
  assert.ok(/isCreditCardContext && !isRefund/.test(modal), 'o tipo forçado a despesa respeita o estorno');
});

check('folha do celular: a lista de categorias e os recentes usam despesa quando é estorno', () => {
  const sheet = read('components/mobile/AddTransactionSheet.tsx');
  assert.ok(sheet.includes('categoryListType('), 'lista pelo helper');
  assert.ok(/setIsRefund\(checked\)/.test(sheet), 'marcar zera a categoria');
});

check('mapa de calor: um dia negativo (estorno de compra de outro dia) é desenhado como dia sem gasto', () => {
  assert.ok(/getIntensity = \(amount: number\): number => \{\s*if \(amount <= 0\) return 0;/.test(read('components/widgets/SpendingHeatmapWidget.tsx')));
});

check('modal no cartão: ao abrir um estorno para editar, a categoria dele não é apagada', () => {
  assert.ok(/isCreditCardContext && !transaction\.isRefund && \(transaction\.type === TransactionType\.INCOME/.test(read('components/TransactionModal.tsx')));
});

check('initialFormType: abrir um estorno pela tela de Cartões mantém receita; os demais lançamentos do cartão seguem despesa', () => {
  assert.equal(R.initialFormType({ isCreditCardContext: true, type: 'INCOME', isRefund: true }), 'INCOME');
  assert.equal(R.initialFormType({ isCreditCardContext: true, type: 'INCOME', isRefund: false }), 'EXPENSE');
  assert.equal(R.initialFormType({ isCreditCardContext: true, type: 'EXPENSE', isRefund: false }), 'EXPENSE');
  assert.equal(R.initialFormType({ isCreditCardContext: false, type: 'INCOME', isRefund: false }), 'INCOME');
  assert.equal(R.initialFormType({ isCreditCardContext: false, type: undefined, isRefund: false }), 'EXPENSE');
});

check('edição no cartão: o modal calcula o tipo inicial pelo helper e o envio leva receita + marcador', () => {
  const modal = read('components/TransactionModal.tsx');
  assert.ok(/initialFormType\(\{ isCreditCardContext, type: transaction\.type, isRefund: transaction\.isRefund === true \}\)/.test(modal), 'reset usa o helper');
  // com o tipo INCOME e isRefund no estado, o envio manda os dois (refundToSend só devolve valor para INCOME)
  assert.equal(R.refundToSend(R.initialFormType({ isCreditCardContext: true, type: 'INCOME', isRefund: true }), true), true);
});
