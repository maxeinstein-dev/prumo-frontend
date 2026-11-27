/**
 * Pure part of the broker portfolio check (P25 L5): GET /open-finance/investments compares the portfolio Pluggy shows
 * with what P21 computes. Decision of 27/11/2026: the Início warns only when a quantity differs or an asset is on one
 * side only (a buy or sale missing in Prumo); values compare only on the Investimentos page, without alarm (the bank's
 * value may be a day or more behind the latest close). No React: tests/t75_portfolio_check.mts runs it under tsx.
 */

export interface PortfolioStock {
  ticker: string;
  bankQuantity: number | null;
  prumoQuantity: number | null;
  bankCents: number | null;
  prumoCents: number | null;
  status: 'same' | 'quantity' | 'bank_only' | 'prumo_only';
}

export interface PortfolioCheck {
  prumoAccountId: string;
  accountName: string;
  /** Why the connection could not be read (e.g. expired authorization); the rest is then absent. */
  blocked: string | null;
  stocks?: PortfolioStock[];
  others?: { bankCents: number; prumoCents: number };
  cash?: { bankCents: number; prumoCents: number };
  total?: { bankCents: number; prumoCents: number; diffCents: number };
}

export interface PortfolioRow {
  label: string;
  bankCents: number | null;
  prumoCents: number | null;
  diffCents: number | null;
  note: string;
}

const qty = (n: number | null): string => (n === null ? '0' : String(Number(n.toFixed(6))));

/** The assets whose quantity differs or that are on one side only. */
export function portfolioMismatches(check: PortfolioCheck): PortfolioStock[] {
  if (check.blocked) return [];
  return (check.stocks ?? []).filter((s) => s.status !== 'same');
}

/** "BBBB11: 47 no banco, 45 no Prumo" / "CCCC3: só no banco (5)" / "DDDD11: só no Prumo (3)". */
export function mismatchText(stock: PortfolioStock): string {
  if (stock.status === 'bank_only') return `${stock.ticker}: só no banco (${qty(stock.bankQuantity)})`;
  if (stock.status === 'prumo_only') return `${stock.ticker}: só no Prumo (${qty(stock.prumoQuantity)})`;
  return `${stock.ticker}: ${qty(stock.bankQuantity)} no banco, ${qty(stock.prumoQuantity)} no Prumo`;
}

const diff = (bank: number | null, prumo: number | null): number | null => (bank === null || prumo === null ? null : bank - prumo);

/** Rows of the comparison on the Investimentos page: each asset, then fixed income and funds, cash and the total. */
export function portfolioRows(check: PortfolioCheck): PortfolioRow[] {
  if (check.blocked || !check.total) return [];
  const rows: PortfolioRow[] = (check.stocks ?? []).map((s) => ({
    label: s.ticker,
    bankCents: s.bankCents,
    prumoCents: s.prumoCents,
    diffCents: diff(s.bankCents, s.prumoCents),
    note:
      s.status === 'same'
        ? `${qty(s.bankQuantity)} cotas`
        : s.status === 'quantity'
          ? `Quantidade diferente: ${qty(s.bankQuantity)} no banco, ${qty(s.prumoQuantity)} no Prumo`
          : s.status === 'bank_only'
            ? `Só no banco (${qty(s.bankQuantity)} cotas)`
            : `Só no Prumo (${qty(s.prumoQuantity)} cotas)`,
  }));
  if (check.others) rows.push({ label: 'Renda fixa e fundos', ...check.others, diffCents: check.others.bankCents - check.others.prumoCents, note: '' });
  if (check.cash) rows.push({ label: 'Caixa', ...check.cash, diffCents: check.cash.bankCents - check.cash.prumoCents, note: '' });
  rows.push({ label: 'Total', bankCents: check.total.bankCents, prumoCents: check.total.prumoCents, diffCents: check.total.diffCents, note: '' });
  return rows;
}
