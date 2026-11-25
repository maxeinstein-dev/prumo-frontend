import { useI18n } from '../../context/I18nContext';
import { fmtDate } from '../people/ui';
import { invText, type InvestmentsTextKey } from '../../utils/investmentsTexts';
import { positionMarks, shortDate, valueDateInfo, type Position, type PositionMark } from '../../utils/investments';

const MARK_TEXT: Record<PositionMark, InvestmentsTextKey> = {
  estimated: 'invMarkEstimated',
  noQuote: 'invMarkNoQuote',
  ratesCarried: 'invMarkRatesCarried',
  ratesMissing: 'invMarkRatesMissing',
};

export const CHIP_CLS = 'inline-flex items-center rounded-full bg-rc-amberSoft px-2 py-0.5 text-xs font-medium text-rc-amber';

/** The marks of a position ("Estimado", "Sem cotação", rate warnings) and the date its value refers to. */
export default function PositionMarks({ position, withDate = true }: { position: Position; withDate?: boolean }) {
  const { t } = useI18n();
  const marks = positionMarks(position);
  const info = withDate ? valueDateInfo(position) : null;
  if (marks.length === 0 && !info) return null;
  const dateKey = info?.kind === 'quote' ? 'invDateQuote' : info?.kind === 'anchor' ? 'invDateAnchor' : 'invDateEstimate';
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {marks.map((m) => (
        <span key={m} className={CHIP_CLS}>{invText(t, MARK_TEXT[m])}</span>
      ))}
      {info && (
        <span className="text-xs text-rc-ink3" title={fmtDate(info.date)}>
          {invText(t, dateKey, { date: shortDate(info.date) })}
        </span>
      )}
    </div>
  );
}
