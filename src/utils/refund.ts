/**
 * Estorno (refund): an INCOME row marked `isRefund` that cancels an expense. It is not income: the totals, the
 * categories and the budgets take it off the spending (the server computes the same rule, budget-spending.ts).
 */
export const isRefundTx = (t: { type: string; isRefund?: boolean | null }): boolean => t.type === 'INCOME' && t.isRefund === true;

/** What the "É estorno" box sends: only an income carries it; unticking sends false so a marked row is cleared. */
export const refundToSend = (type: string, checked: boolean): boolean | undefined => (type === 'INCOME' ? checked : undefined);

/** Width (%) of a budget progress bar: it stops at zero (a negative spending after a refund) and at one hundred. */
export const budgetBarWidth = (percentage: number): number => (Number.isFinite(percentage) ? Math.max(0, Math.min(percentage, 100)) : 0);

/**
 * Which categories the picker offers: a refund keeps the category of the purchase it cancels, so it lists the EXPENSE
 * categories even though the row is an INCOME; on a card only expense categories exist; otherwise the type decides.
 */
export const categoryListType = (o: { isRefund: boolean; type: string; isCreditCardContext: boolean }): 'INCOME' | 'EXPENSE' | undefined => {
  if (o.isRefund || o.isCreditCardContext) return 'EXPENSE';
  if (o.type === 'INCOME') return 'INCOME';
  if (o.type === 'EXPENSE') return 'EXPENSE';
  return undefined;
};

/** True when the chosen category does not fit the form any more and must be cleared (a refund only loses an income category). */
export const categoryMustBeCleared = (o: {
  type: string;
  isRefund: boolean;
  isCreditCardContext: boolean;
  categoryIsIncome: boolean;
  categoryIsExpense: boolean;
}): boolean => {
  if (o.isRefund || o.isCreditCardContext) return o.categoryIsIncome;
  return (o.type === 'INCOME' && !o.categoryIsIncome) || (o.type === 'EXPENSE' && !o.categoryIsExpense);
};

/** The type follows the category (an expense category makes an expense) except for a refund, which is an income in an expense category. */
export const shouldAutoAdjustType = (isRefund: boolean): boolean => !isRefund;
