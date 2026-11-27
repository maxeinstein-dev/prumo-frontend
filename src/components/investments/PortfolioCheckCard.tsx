import { useCurrency } from '../../context/CurrencyContext';
import { useDefaultHousehold } from '../../hooks/useDefaultHousehold';
import { useOpenFinancePortfolio } from '../../hooks/api/useOpenFinance';
import { formatCurrency } from '../../utils/format';
import { portfolioMismatches, portfolioRows } from '../../utils/openFinancePortfolio';

const CARD = 'rounded-2xl border border-rc-line bg-rc-card p-4';

/**
 * Investimentos > account: the broker portfolio as the bank shows it (Open Finance) beside what Prumo computes (P25
 * L5). Only a comparison: values may differ by the day of the bank's quote; a quantity difference is the one to check.
 * Hidden when the account has no Open Finance link.
 */
export default function PortfolioCheckCard({ accountId }: { accountId: string }) {
  const { householdId } = useDefaultHousehold();
  const { baseCurrency } = useCurrency();
  const query = useOpenFinancePortfolio(householdId ?? undefined);
  const check = (query.data ?? []).find((c) => c.prumoAccountId === accountId);
  if (!check) return null;
  const money = (cents: number | null) => (cents === null ? '—' : formatCurrency(cents / 100, baseCurrency));
  const mismatches = portfolioMismatches(check);

  return (
    <section className={`${CARD} space-y-3`} aria-labelledby="inv-bank-check">
      <div>
        <h2 id="inv-bank-check" className="text-sm font-semibold text-rc-ink">Conferência com o banco</h2>
        <p className="text-xs text-rc-ink3">
          O que a corretora mostra pelo Open Finance ao lado do que o Prumo calcula. Valores podem diferir pelo dia da cotação do banco; quantidade diferente indica compra ou venda faltando.
        </p>
      </div>
      {check.blocked ? (
        <p role="alert" className="text-sm text-rc-red">{check.blocked}</p>
      ) : (
        <>
          {mismatches.length > 0 && (
            <p role="alert" className="text-sm text-rc-red">
              {mismatches.length === 1 ? '1 ativo com quantidade diferente do banco.' : `${mismatches.length} ativos com quantidade diferente do banco.`}
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-rc-ink3">
                <th className="py-1 font-normal">Ativo</th>
                <th className="py-1 text-right font-normal">Banco</th>
                <th className="py-1 text-right font-normal">Prumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rc-line">
              {portfolioRows(check).map((row) => (
                <tr key={row.label} className={row.label === 'Total' ? 'font-semibold' : ''}>
                  <td className="py-2 pr-2 align-top text-rc-ink">
                    <span className="block break-words">{row.label}</span>
                    {row.note && (
                      <span className={`block text-xs ${row.note.startsWith('Quantidade') || row.note.startsWith('Só') ? 'text-rc-red' : 'text-rc-ink3'}`}>
                        {row.note}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right align-top tabular-nums text-rc-ink">{money(row.bankCents)}</td>
                  <td className="py-2 text-right align-top tabular-nums text-rc-ink">{money(row.prumoCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
