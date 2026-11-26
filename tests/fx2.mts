import { CONFIRM_CTX, M, defaultSelection, mkEntry, mkPreview, mkRow } from './harness.mts';

export const k = (r: unknown): string => M.rowKey(r);
export const salary = mkRow({ section: 'income', accountId: 'acc-main', type: 'INCOME', description: 'Salario', categoryKey: 'SALÁRIO ', amount: 5000 });
export const freela = mkRow({ section: 'income', accountId: 'acc-main', type: 'INCOME', description: 'Freela', categoryKey: 'Freela', amount: 1200.3 });
export const farmacia = mkRow({ section: 'debit', accountId: 'acc-main', description: 'Farmacia', categoryKey: 'saude', amount: 89.9 });
export const lazerChanged = mkRow({ section: 'debit', accountId: 'acc-main', description: 'Cinema', categoryKey: 'Lazer', amount: 40, status: 'changed' });
export const internet = mkRow({ section: 'bills', accountId: 'acc-main', description: 'Internet', categoryKey: 'Moradia', amount: 120, status: 'changed' });
export const curso = mkRow({ description: 'Curso 2/12', categoryKey: 'Educacao', amount: 200, status: 'replaces-future' });
export const posto = mkRow({ description: 'Posto', categoryKey: 'Carro', amount: 80, status: 'legacy-duplicate' });
export const netflix = mkRow({ description: 'Netflix', categoryKey: 'Lazer', amount: 55.9, status: 'duplicate' });
export const mystery = mkRow({ description: 'Mystery', categoryKey: 'Lazer', amount: 9.99, status: 'brand-new-status' });
export const all = [salary, freela, farmacia, lazerChanged, internet, curso, posto, netflix, mystery];

export const categoryMap = [
  mkEntry('Saúde', { suggestion: { kind: 'system', categoryName: 'HEALTHCARE', label: 'Saúde' } }),
  mkEntry('Lazer', { suggestion: { kind: 'create', name: 'Lazer', label: 'Criar' } }),
  mkEntry('Salário', { type: 'INCOME', suggestion: { kind: 'system', categoryName: 'SALARY', label: 'Salário' } }),
  mkEntry('Salário', { type: 'EXPENSE', suggestion: { kind: 'create', name: 'Salário', label: 'Criar' } }),
  mkEntry('Freela', { type: 'INCOME' }),
];
export const preview = mkPreview(all, { categoryMap });
// Defaults (new + replaces-future), plus Internet (changed) and Posto (legacy) ticked, plus a forced duplicate and unknown.
export const selected = { ...defaultSelection(all), [k(internet)]: true, [k(posto)]: true, [k(netflix)]: true, [k(mystery)]: true };
export const built = M.buildConfirmPayload(preview, selected, {}, CONFIRM_CTX);
export const sentNames: string[] = built.rowsSent.map((r: { description: string }) => r.description);
