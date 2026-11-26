/**
 * The aporte (P24): a transfer from an account that is not an investment account into one that is. The server counts it
 * as spending of its category and of the General budget, and as "Investido" in where the income goes; a redemption, a
 * transfer between two investment accounts and one between banks are ordinary transfers. Pure: no React.
 */

type AccountLike = { type?: string | null } | null | undefined;

export function isInvestmentContribution(from: AccountLike, to: AccountLike): boolean {
  return !!from?.type && to?.type === 'INVESTMENT' && from.type !== 'INVESTMENT';
}

const normalized = (name: string): string =>
  name.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** The household's expense category named "Investimentos" (or "Investimento"), as a categoryName; null when there is none. */
export function investmentsCategoryValue(
  categories: ReadonlyArray<{ id: string; name: string; type: string; isSystem?: boolean }> | null | undefined,
): string | null {
  const found = (categories ?? []).find(
    (c) => !c.isSystem && c.type === 'EXPENSE' && ['investimentos', 'investimento'].includes(normalized(c.name)),
  );
  return found ? `CUSTOM:${found.id}` : null;
}

/** The category a transfer is sent with: only an aporte carries one; without it the server counts it in the General budget only. */
export function transferCategoryToSend(from: AccountLike, to: AccountLike, category: string | null | undefined): string | undefined {
  return isInvestmentContribution(from, to) && category ? category : undefined;
}
