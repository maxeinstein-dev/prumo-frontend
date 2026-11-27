import { useCurrency } from '../../context/CurrencyContext';
import { useDefaultHousehold } from '../../hooks/useDefaultHousehold';
import { useOpenFinanceCards } from '../../hooks/api/useOpenFinance';
import { formatCurrency } from '../../utils/format';
import { cardBillRows, cardLimitInfo, cardMismatches } from '../../utils/openFinanceCards';

const CARD = 'rounded-2xl border border-rc-line bg-rc-card p-4';

/**
 * Cartões > card: the bills the bank lists through Open Finance beside the Prumo invoice with the same due day (P25,
 * card lot). Only a check: purchases keep coming from the invoice OFX. The bank limit is information only (it varies).
 * Hidden when the card has no Open Finance link.
 */
export default function CardBankCheck({ accountId, className = '' }: { accountId: string; className?: string }) {
  const { householdId } = useDefaultHousehold();
  const { baseCurrency } = useCurrency();
  const query = useOpenFinanceCards(householdId ?? undefined);
  const check = (query.data ?? []).find((c) => c.prumoAccountId === accountId);
  if (!check) return null;
  const money = (cents: number | null) => (cents === null ? '—' : formatCurrency(cents / 100, baseCurrency));
  const mismatches = cardMismatches(check);
  const limit = cardLimitInfo(check);

  return (
    <section className={`${CARD} space-y-3 ${className}`} aria-labelledby={`card-bank-check-${accountId}`}>
      <div>
        <h2 id={`card-bank-check-${accountId}`} className="text-sm font-semibold text-rc-ink">Conferência com o banco</h2>
        <p className="text-xs text-rc-ink3">
          As faturas fechadas que o banco mostra pelo Open Finance ao lado da fatura do Prumo com o mesmo vencimento. Diferença acima de R$ 1 indica compra, estorno ou pagamento fora da fatura certa.
        </p>
      </div>
      {check.blocked ? (
        <p role="alert" className="text-sm text-rc-red">{check.blocked}</p>
      ) : (
        <>
          {mismatches.length > 0 && (
            <p role="alert" className="text-sm text-rc-red">
              {mismatches.length === 1 ? '1 fatura diferente do banco.' : `${mismatches.length} faturas diferentes do banco.`}
            </p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-rc-ink3">
                <th className="py-1 font-normal">Fatura</th>
                <th className="py-1 pl-3 text-right font-normal">Banco</th>
                <th className="py-1 pl-3 text-right font-normal">Prumo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rc-line">
              {cardBillRows(check).map((row) => (
                <tr key={row.label}>
                  <td className="py-2 pr-2 align-top text-rc-ink">
                    <span className="block break-words">{row.label}</span>
                    <span className={`block text-xs ${row.alert ? 'text-rc-red' : 'text-rc-ink3'}`}>{row.note}</span>
                  </td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right align-top tabular-nums text-rc-ink">{money(row.bankCents)}</td>
                  <td className="whitespace-nowrap py-2 pl-3 text-right align-top tabular-nums text-rc-ink">{money(row.prumoCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {limit && (
            <p className="text-xs text-rc-ink3">
              No banco: limite {money(limit.limitCents)}
              {limit.availableCents !== null && <>, disponível {money(limit.availableCents)}</>}. O banco muda o limite com o tempo; fica só como informação.
            </p>
          )}
        </>
      )}
    </section>
  );
}
