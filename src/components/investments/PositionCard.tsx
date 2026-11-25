import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useCurrency } from '../../context/CurrencyContext';
import { formatCurrency } from '../../utils/format';
import { fmtDate } from '../people/ui';
import { invText } from '../../utils/investmentsTexts';
import { formatQuantity, indexerText, investmentsPath, resultTone, type Position } from '../../utils/investments';
import PositionMarks from './PositionMarks';

export const TONE_CLS = { up: 'text-rc-green', down: 'text-rc-red', flat: 'text-rc-ink3' } as const;

/** "+R$ 12,40" / "-R$ 3,00" / "R$ 0,00" for a result. */
export function signedMoney(value: number, currency: string): string {
  return `${value > 0 ? '+' : ''}${formatCurrency(value, currency)}`;
}

/** One position of the list: opens its detail. */
export default function PositionCard({ position }: { position: Position }) {
  const { t } = useI18n();
  const { baseCurrency } = useCurrency();
  const money = (v: number) => formatCurrency(v, baseCurrency);
  const stock = position.kind === 'STOCK_EXCHANGE';
  const tone = resultTone(position.result);
  const label = stock ? position.ticker : position.name;

  return (
    <li>
      <Link
        to={investmentsPath(position.accountId, position.id)}
        aria-label={invText(t, 'invOpenPosition', { name: label ?? position.name })}
        className="flex min-h-[44px] items-start gap-3 rounded-2xl border border-rc-line bg-rc-card p-4"
      >
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="break-words text-sm font-semibold text-rc-ink">{label}</p>
          {stock ? (
            <>
              <p className="break-words text-xs text-rc-ink2">{position.name}</p>
              <p className="text-xs text-rc-ink2 tabular-nums">
                {invText(t, 'invQuantity')} {formatQuantity(position.quantity)}
                {position.avgPrice !== null && <> · {invText(t, 'invAvgPrice')} {money(position.avgPrice)}</>}
              </p>
              {position.lastQuote && (
                <p className="text-xs text-rc-ink2 tabular-nums">
                  {invText(t, 'invQuote')} {invText(t, 'invQuoteOn', { price: money(position.lastQuote.price), date: fmtDate(position.lastQuote.date) })}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs text-rc-ink2">{indexerText(position.indexer, position.rate)}</p>
              <p className="text-xs text-rc-ink2 tabular-nums">
                {invText(t, 'invCost')} {money(position.costAmount)}
                {position.maturityDate && <> · {invText(t, 'invMaturityOn', { date: fmtDate(position.maturityDate) })}</>}
              </p>
            </>
          )}
          {position.incomeLast12Months > 0 && (
            <p className="text-xs text-rc-ink2 tabular-nums">{invText(t, 'invIncome12')} {money(position.incomeLast12Months)}</p>
          )}
          <PositionMarks position={position} />
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums text-rc-ink">{money(position.currentValue)}</p>
          <p className="text-[11px] text-rc-ink3">{stock ? invText(t, 'invValue') : invText(t, 'invEstimatedValue')}</p>
          <p className={`text-xs tabular-nums ${TONE_CLS[tone]}`}>{signedMoney(position.result, baseCurrency)}</p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-rc-ink3" aria-hidden="true" />
      </Link>
    </li>
  );
}
