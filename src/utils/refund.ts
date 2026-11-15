/**
 * Estorno (refund): an INCOME row marked `isRefund` that cancels an expense. It is not income: the totals, the
 * categories and the budgets take it off the spending (the server computes the same rule, budget-spending.ts).
 */
export const isRefundTx = (t: { type: string; isRefund?: boolean | null }): boolean => t.type === 'INCOME' && t.isRefund === true;

/** What the "É estorno" box sends: only an income carries it; unticking sends false so a marked row is cleared. */
export const refundToSend = (type: string, checked: boolean): boolean | undefined => (type === 'INCOME' ? checked : undefined);

/** Width (%) of a budget progress bar: it stops at zero (a negative spending after a refund) and at one hundred. */
export const budgetBarWidth = (percentage: number): number => (Number.isFinite(percentage) ? Math.max(0, Math.min(percentage, 100)) : 0);
