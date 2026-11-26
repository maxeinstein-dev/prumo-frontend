import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { check, frontSrc } from './harness.mts';

// Category manager (Settings), merge dialog and the inline "Criar" option of the combobox: src/utils/categoryManager.ts.
// CATEGORY_MANAGER_MODULE points at a mutated copy (bite-checks).
const modPath = process.env.CATEGORY_MANAGER_MODULE || frontSrc('utils/categoryManager.ts');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const C: any = await import(pathToFileURL(modPath).href);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

console.log('\n[categories] manager, merge and inline create');

const LABELS: Record<string, string> = { SALARY: 'Salário', INVESTMENTS: 'Investimentos', OTHER_INCOME: 'Outras Receitas', FOOD: 'Alimentação', TRANSFER: 'Transferência', ALLOCATION: 'Alocação' };
const label = (c: { id: string }): string => LABELS[c.id] ?? c.id;
const sys = (id: string, type: 'INCOME' | 'EXPENSE', usage?: Any): Any => ({ id, name: id, type, isSystem: true, usage });
const cus = (id: string, name: string, type: 'INCOME' | 'EXPENSE', usage?: Any, color?: string): Any => ({ id, name, type, isSystem: false, usage, color });
const ALL = [
  sys('SALARY', 'INCOME'), sys('INVESTMENTS', 'INCOME', { transactions: 4, recurringTransactions: 0, budgets: 0 }), sys('OTHER_INCOME', 'INCOME'),
  sys('FOOD', 'EXPENSE'), sys('TRANSFER', 'EXPENSE'), sys('ALLOCATION', 'EXPENSE'),
  cus('c-inv', 'Teste Investimento', 'INCOME', { transactions: 3, recurringTransactions: 1, budgets: 0 }),
  cus('c-vale', 'Vale Teste', 'INCOME'),
  cus('c-zeta', 'zeta teste', 'EXPENSE', { transactions: 0, recurringTransactions: 0, budgets: 2 }),
  cus('c-alfa', 'Alfa teste', 'EXPENSE'),
];

check('normalizeCategoryName ignores case, accents and spaces but not singular/plural', () => {
  assert.equal(C.normalizeCategoryName('  Vale   Alimentação '), 'vale alimentacao');
  assert.equal(C.normalizeCategoryName('INVESTIMENTOS'), C.normalizeCategoryName('investimentos'));
  assert.notEqual(C.normalizeCategoryName('Investimento'), C.normalizeCategoryName('Investimentos'));
});

check('groupCategories: Receitas then Despesas, system and custom apart, sorted, movement markers hidden', () => {
  const groups = C.groupCategories(ALL, label);
  assert.deepEqual(groups.map((g: Any) => g.title), ['Receitas', 'Despesas']);
  assert.deepEqual(groups[0].system.map((c: Any) => c.id), ['INVESTMENTS', 'OTHER_INCOME', 'SALARY']); // by label: Investimentos, Outras, Salário
  assert.deepEqual(groups[0].custom.map((c: Any) => c.id), ['c-inv', 'c-vale']);
  assert.deepEqual(groups[1].custom.map((c: Any) => c.id), ['c-alfa', 'c-zeta']); // case-insensitive order
  assert.deepEqual(groups[1].system.map((c: Any) => c.id), ['FOOD']);
});

check('usageLabel: zero parts left out, singular/plural, "Sem uso"', () => {
  assert.equal(C.usageLabel({ transactions: 12, recurringTransactions: 2, budgets: 1 }), '12 transações, 2 recorrências e 1 orçamento');
  assert.equal(C.usageLabel({ transactions: 1, recurringTransactions: 0, budgets: 0 }), '1 transação');
  assert.equal(C.usageLabel({ transactions: 0, recurringTransactions: 1, budgets: 3 }), '1 recorrência e 3 orçamentos');
  assert.equal(C.usageLabel({ transactions: 0, recurringTransactions: 0, budgets: 0 }), 'Sem uso');
  assert.equal(C.usageLabel(undefined), 'Sem uso');
});

check('usageTotal decides if delete is offered: any of the three tables counts', () => {
  assert.equal(C.usageTotal({ transactions: 0, recurringTransactions: 0, budgets: 2 }), 2);
  assert.equal(C.usageTotal({ transactions: 0, recurringTransactions: 0, budgets: 0 }), 0);
  assert.equal(C.usageTotal(null), 0);
});

check('mergeTargets: same type only, never itself, custom first then system, markers excluded; a system source has none', () => {
  const inv = ALL.find((c: Any) => c.id === 'c-inv');
  const targets = C.mergeTargets(inv, ALL, label);
  assert.deepEqual(targets.map((t: Any) => `${t.kind}:${t.id}`), ['custom:c-vale', 'system:INVESTMENTS', 'system:OTHER_INCOME', 'system:SALARY']);
  const expense = C.mergeTargets(ALL.find((c: Any) => c.id === 'c-alfa'), ALL, label);
  assert.deepEqual(expense.map((t: Any) => `${t.kind}:${t.id}`), ['custom:c-zeta', 'system:FOOD']); // no TRANSFER / ALLOCATION
  assert.deepEqual(C.mergeTargets(ALL.find((c: Any) => c.id === 'INVESTMENTS'), ALL, label), []);
});

check('buildMergeRequest: custom target by id, system target by enum value, ?preview=true only for the preview', () => {
  const custom = { kind: 'custom', id: 'c-vale', label: 'Vale Teste' };
  const system = { kind: 'system', id: 'INVESTMENTS', label: 'Investimentos' };
  assert.deepEqual(C.buildMergeRequest('c-inv', custom, true), { url: '/categories/c-inv/merge?preview=true', body: { targetCategoryId: 'c-vale' } });
  assert.deepEqual(C.buildMergeRequest('c-inv', system, false), { url: '/categories/c-inv/merge', body: { targetSystemName: 'INVESTMENTS' } });
});

check('mergePreviewSentence: counts per table, singular/plural, budgets moved + combined, nothing to move', () => {
  assert.equal(C.mergePreviewSentence({ transactions: 12, recurringTransactions: 2, budgets: 0, budgetsCombined: 0 }, 'Investimentos'), 'Vão para Investimentos: 12 transações e 2 recorrências.');
  assert.equal(C.mergePreviewSentence({ transactions: 1, recurringTransactions: 1, budgets: 1, budgetsCombined: 1 }, 'Alfa'), 'Vão para Alfa: 1 transação, 1 recorrência e 2 orçamentos.');
  assert.match(C.mergePreviewSentence({ transactions: 0, recurringTransactions: 0, budgets: 0, budgetsCombined: 0 }, 'Alfa'), /Nada usa esta categoria/);
});

check('mergeBudgetNote only when two monthly budgets meet', () => {
  assert.equal(C.mergeBudgetNote({ transactions: 1, recurringTransactions: 0, budgets: 1, budgetsCombined: 0 }), null);
  assert.match(C.mergeBudgetNote({ transactions: 0, recurringTransactions: 0, budgets: 0, budgetsCombined: 1 }), /limites dos dois serão somados/);
  assert.match(C.mergeBudgetNote({ transactions: 0, recurringTransactions: 0, budgets: 0, budgetsCombined: 3 }), /3 orçamentos mensais/);
});

check('validateCategoryName: empty, too long, same as a system or custom category of the type (not of the other type)', () => {
  assert.equal(C.validateCategoryName('   ', 'INCOME', ALL, label).ok, false);
  assert.equal(C.validateCategoryName('x'.repeat(101), 'INCOME', ALL, label).ok, false);
  const sysClash = C.validateCategoryName('investimentos', 'INCOME', ALL, label);
  assert.equal(sysClash.ok, false);
  assert.match(sysClash.message, /categoria padrão "Investimentos"/);
  const customClash = C.validateCategoryName(' TESTE   investimento ', 'INCOME', ALL, label);
  assert.equal(customClash.ok, false);
  assert.match(customClash.message, /Teste Investimento/);
  assert.equal(C.validateCategoryName('Investimento', 'INCOME', ALL, label).ok, true); // singular is a different name
  assert.equal(C.validateCategoryName('Alimentação', 'INCOME', ALL, label).ok, true); // FOOD is an EXPENSE
  assert.equal(C.validateCategoryName('  Vale   Novo ', 'INCOME', ALL, label).name, 'Vale Novo');
});

check('validateCategoryName on rename ignores the category itself (only the letter case changes)', () => {
  assert.equal(C.validateCategoryName('teste investimento', 'INCOME', ALL, label, 'c-inv').ok, true);
  assert.equal(C.validateCategoryName('vale teste', 'INCOME', ALL, label, 'c-inv').ok, false);
});

check('createOptionFor: offered for text that matches nothing, trimmed; not for a match, empty or too long', () => {
  const options = [{ value: 'INVESTMENTS', display: 'Investimentos' }, { value: 'CUSTOM:c-vale', display: 'Vale Teste' }];
  assert.deepEqual(C.createOptionFor('  Vale   Alimentação ', options), { name: 'Vale Alimentação', label: 'Criar “Vale Alimentação”' });
  assert.equal(C.createOptionFor('investimentos', options), null);
  assert.equal(C.createOptionFor('VALE teste', options), null);
  assert.equal(C.createOptionFor('   ', options), null);
  assert.equal(C.createOptionFor('x'.repeat(101), options), null);
  // the "all" option (value '') is not a category: its label never blocks a creation
  assert.deepEqual(C.createOptionFor('Todas', [{ value: '', display: 'Todas' }]), { name: 'Todas', label: 'Criar “Todas”' });
});

check('customValue: the value stored in rows', () => assert.equal(C.customValue('abc'), 'CUSTOM:abc'));

check('categoryFailureMessage: one sentence per server code, never the raw code', () => {
  for (const code of ['CATEGORY_NAME_TAKEN', 'CATEGORY_IN_USE', 'CATEGORY_MERGE_SELF', 'CATEGORY_MERGE_TYPE_MISMATCH', 'CATEGORY_MERGE_TARGET_INVALID']) {
    const text = C.categoryFailureMessage(Object.assign(new Error(code), { code }));
    assert.ok(!text.includes(code) && /[a-z]{4}/.test(text), `${code} -> ${text}`);
  }
  assert.match(C.categoryFailureMessage(Object.assign(new Error('Category not found'), { status: 404, code: 'NOT_FOUND' })), /não existe mais/);
  assert.match(C.categoryFailureMessage(Object.assign(new Error('x'), { status: 403 })), /permissão/);
  assert.equal(C.categoryFailureMessage(new Error('Falha de rede')), 'Falha de rede');
  assert.equal(C.categoryFailureMessage(new Error('SOME_SLUG'), 'Padrão'), 'Padrão');
  assert.equal(C.categoryFailureMessage(null, 'Padrão'), 'Padrão');
});

check('normalizeColor and buildUpdatePatch: only changed fields travel', () => {
  assert.equal(C.normalizeColor('#aabbcc'), '#AABBCC');
  assert.equal(C.normalizeColor('red'), null);
  assert.equal(C.normalizeColor(null), null);
  assert.equal(C.buildUpdatePatch({ name: 'A', color: '#112233' }, { name: 'A', color: '#112233' }), null);
  assert.deepEqual(C.buildUpdatePatch({ name: 'A', color: '#112233' }, { name: 'B', color: '#112233' }), { name: 'B' });
  assert.deepEqual(C.buildUpdatePatch({ name: 'A', color: null }, { name: 'A', color: '#112233' }), { color: '#112233' });
  assert.deepEqual(C.buildUpdatePatch({ name: 'A', color: '#112233' }, { name: 'A', color: null }), { color: null });
  assert.equal(C.buildUpdatePatch({ name: 'A', color: undefined }, { name: 'A', color: null }), null);
});
