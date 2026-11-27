import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import LoadFailureNotice from '../components/LoadFailureNotice';
import PositionCard, { TONE_CLS, signedMoney } from '../components/investments/PositionCard';
import PositionDetailView from '../components/investments/PositionDetailView';
import PortfolioCheckCard from '../components/investments/PortfolioCheckCard';
import { NewPositionDialog } from '../components/investments/InvestmentDialogs';
import { fmtDate, BTN_PRIMARY, INPUT_CLS, LABEL_CLS } from '../components/people/ui';
import { useI18n } from '../context/I18nContext';
import { useCurrency } from '../context/CurrencyContext';
import { useDefaultHousehold } from '../hooks/useDefaultHousehold';
import { useAccounts } from '../hooks/api/useAccounts';
import { useAccountPositions } from '../hooks/api/useInvestments';
import { useSavingsGoals } from '../hooks/api/useSavingsGoals';
import { formatCurrency } from '../utils/format';
import { isLoadFailure } from '../utils/loadFailure';
import { invText } from '../utils/investmentsTexts';
import {
  groupByGoal,
  investmentsPath,
  pickInvestmentAccount,
  resultTone,
  splitPositions,
  type GoalRef,
  type Position,
} from '../utils/investments';

const CARD = 'rounded-2xl border border-rc-line bg-rc-card p-4';
const BTN_P = `${BTN_PRIMARY} min-h-[44px]`;

/** The Investimentos page: positions of an investment account, by goal; the detail of a position at /:accountId/:positionId. */
const Investments = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { accountId, positionId } = useParams();
  const { householdId } = useDefaultHousehold();
  const accounts = useAccounts({ householdId: householdId ?? '' });
  const goalsQuery = useSavingsGoals({ householdId: householdId ?? '' });

  const { account, options } = useMemo(
    () => pickInvestmentAccount(accounts.data?.accounts ?? [], accountId),
    [accounts.data, accountId],
  );
  const goals: GoalRef[] = useMemo(
    () =>
      (goalsQuery.data ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        targetAmount: Number(g.targetAmount),
        currentAmount: Number(g.currentAmount),
        remaining: g.remaining === undefined ? undefined : Number(g.remaining),
        fromPositions: g.fromPositions === true,
      })),
    [goalsQuery.data],
  );

  let body;
  if (accounts.isLoading || (!accounts.data && !accounts.isError)) {
    body = <p role="status" className="py-8 text-center text-sm text-rc-ink2">{invText(t, 'invAccountsLoading')}</p>;
  } else if (isLoadFailure({ isError: accounts.isError, data: accounts.data })) {
    body = <LoadFailureNotice message={invText(t, 'invLoadError')} onRetry={() => void accounts.refetch()} />;
  } else if (options.length === 0) {
    body = (
      <div className={`${CARD} space-y-3 text-center`}>
        <h2 className="text-base font-medium text-rc-ink">{invText(t, 'invNoAccountTitle')}</h2>
        <p className="text-sm text-rc-ink2">{invText(t, 'invNoAccount')}</p>
        <Link to="/app/accounts" className={`${BTN_P} mx-auto max-w-xs`}>{invText(t, 'invGoToAccounts')}</Link>
      </div>
    );
  } else if (!account) {
    body = (
      <div className={`${CARD} space-y-3 text-center`}>
        <p role="alert" className="text-sm text-rc-red">{invText(t, 'invAccountNotFound')}</p>
        <Link to={investmentsPath()} className="inline-flex min-h-[44px] items-center text-sm text-rc-accentInk">{invText(t, 'invBack')}</Link>
      </div>
    );
  } else {
    body = (
      <>
        {options.length > 1 && !positionId && (
          <div className="max-w-sm">
            <label htmlFor="inv-account" className={LABEL_CLS}>{invText(t, 'invAccount')}</label>
            <select id="inv-account" className={`${INPUT_CLS} min-h-[44px]`} value={account.id} onChange={(e) => navigate(investmentsPath(e.target.value))}>
              {options.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
        {positionId ? (
          <PositionDetailView key={positionId} accountId={account.id} positionId={positionId} goals={goals} />
        ) : (
          <AccountOverview key={account.id} accountId={account.id} goals={goals} />
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title={invText(t, 'invTitle')} description={invText(t, 'invDescription')} />
      {body}
    </div>
  );
};

/** Total, cash balance and the positions of one account, by goal. */
function AccountOverview({ accountId, goals }: { accountId: string; goals: GoalRef[] }) {
  const { t } = useI18n();
  const { baseCurrency } = useCurrency();
  const query = useAccountPositions(accountId);
  const [creating, setCreating] = useState(false);
  const money = (v: number) => formatCurrency(v, baseCurrency);

  const positions: Position[] = query.data?.positions ?? [];
  const { open, closed } = useMemo(() => splitPositions(positions), [positions]);
  const groups = useMemo(() => groupByGoal(open, goals), [open, goals]);

  if (query.isLoading) return <p role="status" className="py-8 text-center text-sm text-rc-ink2">{invText(t, 'invLoading')}</p>;
  if (isLoadFailure({ isError: query.isError, data: query.data }) || !query.data) {
    return <LoadFailureNotice message={invText(t, 'invLoadError')} onRetry={() => void query.refetch()} />;
  }
  const s = query.data.summary;
  const tone = resultTone(s.positionsResult);
  const hasFixed = open.some((p) => p.kind === 'FIXED_INCOME');

  return (
    <div className="space-y-4">
      <section className={`${CARD} space-y-3`} aria-labelledby="inv-total-label">
        <p id="inv-total-label" className="text-sm text-rc-ink2">{s.accountName} · {invText(t, 'invTotalLabel')}</p>
        <p className="text-3xl font-semibold tracking-tight tabular-nums text-rc-ink" data-testid="inv-total">{money(s.totalValue)}</p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rc-line pt-3">
          <div className="min-w-0">
            <dt className="text-xs text-rc-ink3">{invText(t, 'invPositionsValue')}</dt>
            <dd className="text-sm font-medium tabular-nums text-rc-ink">{money(s.positionsValue)}</dd>
            <dd className={`text-xs tabular-nums ${TONE_CLS[tone]}`}>{invText(t, 'invResult')} {signedMoney(s.positionsResult, baseCurrency)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs text-rc-ink3">{invText(t, 'invCashBalance')}</dt>
            <dd className="text-sm font-medium tabular-nums text-rc-ink" data-testid="inv-cash">{money(s.cashBalance)}</dd>
          </div>
        </dl>
        <p className="text-xs text-rc-ink3">{invText(t, 'invCashHint')}</p>
        <div className="space-y-1">
          {s.hasEstimates && <p className="text-xs text-rc-amber">{invText(t, 'invEstimatedNotice')}</p>}
          {s.hasNoQuote && <p className="text-xs text-rc-amber">{invText(t, 'invNoQuoteNotice')}</p>}
          <p className="text-xs text-rc-ink3">{invText(t, 'invValuedAt', { date: fmtDate(s.valuedAt) })}</p>
        </div>
      </section>

      <div className="flex">
        <button type="button" className={`${BTN_P} w-full sm:w-auto`} onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {invText(t, 'invNewPosition')}
        </button>
      </div>

      {positions.length === 0 && (
        <div className={`${CARD} space-y-1 text-center`}>
          <h2 className="text-base font-medium text-rc-ink">{invText(t, 'invEmptyTitle')}</h2>
          <p className="text-sm text-rc-ink2">{invText(t, 'invEmpty')}</p>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`inv-group-${g.key}`} className="space-y-2">
          <div className="space-y-0.5 px-1">
            <h2 id={`inv-group-${g.key}`} className="break-words text-sm font-semibold text-rc-ink">
              {g.goalId === null ? invText(t, 'invNoGoal') : g.goalName ?? invText(t, 'invGoalMissing')}
            </h2>
            {g.goalId === null || g.goalMissing ? (
              <p className="text-xs tabular-nums text-rc-ink2">{invText(t, 'invGroupValue', { amount: money(g.valueTotal) })}</p>
            ) : (
              <p className="text-xs tabular-nums text-rc-ink2">
                {invText(t, 'invGoalTarget', { amount: money(g.target ?? 0) })} · {invText(t, 'invGoalValue', { amount: money(g.current ?? 0) })} · {invText(t, 'invGoalRemaining', { amount: money(g.remaining ?? 0) })}
              </p>
            )}
          </div>
          <ul className="space-y-2">
            {g.positions.map((p) => (
              <PositionCard key={p.id} position={p} />
            ))}
          </ul>
        </section>
      ))}

      {hasFixed && <p className="px-1 text-xs text-rc-ink3">{invText(t, 'invGrossNotice')}</p>}

      <PortfolioCheckCard accountId={accountId} />

      {closed.length > 0 && (
        <details className={CARD}>
          <summary className="min-h-[44px] cursor-pointer py-3 text-sm font-medium text-rc-ink">{invText(t, 'invClosedTitle', { count: closed.length })}</summary>
          <ul className="divide-y divide-rc-line">
            {closed.map((p) => (
              <li key={p.id}>
                <Link to={investmentsPath(accountId, p.id)} className="flex min-h-[44px] items-center justify-between gap-3 py-2 text-sm text-rc-ink">
                  <span className="min-w-0 break-words">{p.ticker ?? p.name}</span>
                  <span className="shrink-0 text-xs text-rc-ink3">{invText(t, 'invClosedOn', { date: fmtDate(p.closedAt as string) })}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      {creating && <NewPositionDialog accountId={accountId} goals={goals} onClose={() => setCreating(false)} />}
    </div>
  );
}

export default Investments;
