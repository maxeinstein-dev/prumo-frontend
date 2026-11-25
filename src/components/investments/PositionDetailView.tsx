import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useI18n } from '../../context/I18nContext';
import { useCurrency } from '../../context/CurrencyContext';
import { useToastContext } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/format';
import { fmtDate, BTN_PRIMARY, BTN_SECONDARY, ERROR_CLS, INPUT_CLS, LABEL_CLS } from '../people/ui';
import { invText } from '../../utils/investmentsTexts';
import { linkHidesStoredValue } from '../../utils/goalPositions';
import {
  clearAnchorBody,
  apiErrorParts,
  closeBody,
  formatQuantity,
  goalLinkBody,
  indexerText,
  investmentErrorText,
  investmentsPath,
  movementEffect,
  movementTypeLabel,
  reopenBody,
  resultTone,
  type GoalRef,
  type Movement,
} from '../../utils/investments';
import { useDeleteMovement, usePositionDetail, useUpdatePosition } from '../../hooks/api/useInvestments';
import LoadFailureNotice from '../LoadFailureNotice';
import { isLoadFailure } from '../../utils/loadFailure';
import { AnchorDialog, ConfirmDialog, MovementDialog } from './InvestmentDialogs';
import PositionMarks from './PositionMarks';
import { TONE_CLS, signedMoney } from './PositionCard';

const CARD = 'rounded-2xl border border-rc-line bg-rc-card p-4';
const BTN_P = `${BTN_PRIMARY} min-h-[44px]`;
const BTN_S = `${BTN_SECONDARY} min-h-[44px]`;

function Figure({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-rc-ink3">{label}</dt>
      <dd className={`break-words text-sm font-medium tabular-nums ${tone ?? 'text-rc-ink'}`}>{value}</dd>
    </div>
  );
}

type Pending = { kind: 'delete'; movement: Movement } | { kind: 'close' } | { kind: 'link'; goalId: string; goal: GoalRef } | null;

/** The detail of one position: figures, marks, goal link, the movements and the actions (move, inform value, close). */
export default function PositionDetailView({ accountId, positionId, goals }: { accountId: string; positionId: string; goals: GoalRef[] }) {
  const { t } = useI18n();
  const { baseCurrency } = useCurrency();
  const { success, error: showError } = useToastContext();
  const query = usePositionDetail(positionId);
  const update = useUpdatePosition(positionId);
  const del = useDeleteMovement(positionId);
  const sending = useRef(false);
  const [dialog, setDialog] = useState<'movement' | 'anchor' | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const money = (v: number) => formatCurrency(v, baseCurrency);

  const back = (
    <Link to={investmentsPath(accountId)} className="inline-flex min-h-[44px] items-center gap-2 text-sm text-rc-accentInk">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {invText(t, 'invBack')}
    </Link>
  );

  if (query.isLoading) return <div>{back}<p role="status" className="py-8 text-center text-sm text-rc-ink2">{invText(t, 'invLoading')}</p></div>;
  const failure = isLoadFailure({ isError: query.isError, data: query.data });
  if (failure || !query.data) {
    const notFound = (query.error as { status?: number } | null)?.status === 404;
    return (
      <div>
        {back}
        {notFound ? <p role="alert" className="py-8 text-center text-sm text-rc-red">{invText(t, 'invDetailNotFound')}</p> : <LoadFailureNotice message={invText(t, 'invLoadError')} onRetry={() => void query.refetch()} />}
      </div>
    );
  }

  const p = query.data;
  const stock = p.kind === 'STOCK_EXCHANGE';
  const isClosed = !!p.closedAt;
  const tone = resultTone(p.result);
  const label = stock ? (p.ticker ?? p.name) : p.name;
  const currentGoal = goals.find((g) => g.id === p.savingsGoalId) ?? null;

  /** Runs one write with the double-tap guard; the error goes to the toast (or [onError]) in Portuguese. */
  const run = async (action: () => Promise<unknown>, context: Parameters<typeof investmentErrorText>[0], done: string, onError?: (text: string) => void) => {
    if (sending.current) return false;
    sending.current = true;
    try {
      await action();
      success(done);
      return true;
    } catch (e) {
      const text = investmentErrorText(context, apiErrorParts(e));
      if (onError) onError(text); else showError(text);
      return false;
    } finally {
      sending.current = false;
    }
  };

  const changeGoal = (goalId: string) => {
    if (goalId === (p.savingsGoalId ?? '')) return;
    const goal = goals.find((g) => g.id === goalId);
    if (goal && linkHidesStoredValue(goal)) {
      setPending({ kind: 'link', goalId, goal });
      return;
    }
    void run(() => update.mutateAsync(goalLinkBody(goalId)), 'link', goalId ? invText(t, 'invGoalLinked') : invText(t, 'invGoalUnlinked'));
  };

  const confirmPending = async () => {
    if (!pending) return;
    if (pending.kind === 'delete') {
      await run(() => del.mutateAsync(pending.movement.id), 'deleteMovement', invText(t, 'invMovementDeleted'));
    } else if (pending.kind === 'close') {
      await run(() => update.mutateAsync(closeBody()), 'close', invText(t, 'invClosed'), (text) => setCloseError(text));
    } else {
      await run(() => update.mutateAsync(goalLinkBody(pending.goalId)), 'link', invText(t, 'invGoalLinked'));
    }
    setPending(null);
  };

  const busy = update.isPending || del.isPending;

  return (
    <div className="space-y-4">
      {back}

      <section className={`${CARD} space-y-3`} aria-labelledby="inv-detail-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="inv-detail-title" className="break-words text-lg font-semibold text-rc-ink">{label}</h2>
            {stock && <p className="break-words text-sm text-rc-ink2">{p.name}</p>}
            {!stock && <p className="text-sm text-rc-ink2">{indexerText(p.indexer, p.rate)}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xl font-semibold tabular-nums text-rc-ink">{money(p.currentValue)}</p>
            <p className={`text-sm tabular-nums ${TONE_CLS[tone]}`}>{signedMoney(p.result, baseCurrency)}</p>
          </div>
        </div>
        <PositionMarks position={p} />
        {isClosed && <p className="rounded-md bg-rc-card2 px-3 py-2 text-sm text-rc-ink2">{invText(t, 'invClosedBanner', { date: fmtDate(p.closedAt as string) })}</p>}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rc-line pt-3">
          {stock ? (
            <>
              <Figure label={invText(t, 'invQuantity')} value={formatQuantity(p.quantity)} />
              <Figure label={invText(t, 'invAvgPrice')} value={p.avgPrice !== null ? money(p.avgPrice) : '—'} />
              <Figure label={invText(t, 'invCostPaid')} value={money(p.costAmount)} />
              <Figure label={invText(t, 'invQuote')} value={p.lastQuote ? invText(t, 'invQuoteOn', { price: money(p.lastQuote.price), date: fmtDate(p.lastQuote.date) }) : invText(t, 'invMarkNoQuote')} />
              <Figure label={invText(t, 'invIncome12')} value={money(p.incomeLast12Months)} />
            </>
          ) : (
            <>
              <Figure label={invText(t, 'invCost')} value={money(p.costAmount)} />
              <Figure label={invText(t, 'invEstimatedValue')} value={money(p.currentValue)} />
              <Figure label={invText(t, 'invMaturity')} value={p.maturityDate ? fmtDate(p.maturityDate) : '—'} />
              <Figure label={invText(t, 'invIncome12')} value={money(p.incomeLast12Months)} />
            </>
          )}
        </dl>
        {!stock && <p className="text-xs text-rc-ink3">{invText(t, 'invGrossNotice')}</p>}
        {!stock && p.anchor && <p className="text-xs text-rc-ink2">{invText(t, 'invAnchorCurrent', { amount: money(p.anchor.amount), date: fmtDate(p.anchor.date) })}</p>}
      </section>

      {!isClosed && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BTN_P} onClick={() => setDialog('movement')}>{invText(t, 'invNewMovement')}</button>
          {!stock && <button type="button" className={BTN_S} onClick={() => setDialog('anchor')}>{invText(t, 'invAnchorButton')}</button>}
          {!stock && p.anchor && (
            <button
              type="button"
              className={BTN_S}
              disabled={busy}
              onClick={() => void run(() => update.mutateAsync(clearAnchorBody()), 'anchor', invText(t, 'invAnchorCleared'))}
            >
              {invText(t, 'invAnchorClear')}
            </button>
          )}
        </div>
      )}

      <section className={`${CARD} space-y-2`} aria-labelledby="inv-goal-title">
        <h3 id="inv-goal-title" className="text-sm font-medium text-rc-ink">{invText(t, 'invGoalSection')}</h3>
        <label htmlFor="inv-detail-goal" className={LABEL_CLS}>{invText(t, 'invGoalLinkedLabel')}</label>
        <select id="inv-detail-goal" className={`${INPUT_CLS} min-h-[44px]`} value={p.savingsGoalId ?? ''} disabled={busy || isClosed} onChange={(e) => changeGoal(e.target.value)}>
          <option value="">{invText(t, 'invGoalNone')}</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
          {p.savingsGoalId && !currentGoal && <option value={p.savingsGoalId}>{invText(t, 'invGoalMissing')}</option>}
        </select>
        <p className="text-xs text-rc-ink3">{invText(t, 'invGoalLinkHint')}</p>
        {p.savingsGoalId && <Link to="/app/goals" className="inline-flex min-h-[44px] items-center text-sm text-rc-accentInk">{invText(t, 'invSeeGoals')}</Link>}
      </section>

      <section className={`${CARD} space-y-2`} aria-labelledby="inv-moves-title">
        <h3 id="inv-moves-title" className="text-sm font-medium text-rc-ink">{invText(t, 'invDetailMovements')}</h3>
        {p.movements.length === 0 ? (
          <p className="text-sm text-rc-ink2">{invText(t, 'invDetailNoMovements')}</p>
        ) : (
          <ul className="divide-y divide-rc-line">
            {p.movements.map((m) => {
              const effect = movementEffect(m.type);
              const typeLabel = movementTypeLabel(p.kind, m.type);
              return (
                <li key={m.id} className="flex items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-rc-ink">{typeLabel} <span className="text-xs text-rc-ink3">· {fmtDate(m.date)}</span></p>
                    {m.quantity !== null && m.unitPrice !== null && (
                      <p className="text-xs text-rc-ink2 tabular-nums">{invText(t, 'invMovementAtPrice', { quantity: formatQuantity(m.quantity), price: money(m.unitPrice) })}</p>
                    )}
                    <p className="text-xs text-rc-ink3">{effect === 'in' ? invText(t, 'invMoveIn') : effect === 'out' ? invText(t, 'invMoveOut') : invText(t, 'invMoveNone')}</p>
                    {m.notes && <p className="break-words text-xs text-rc-ink2">{m.notes}</p>}
                  </div>
                  <span className={`shrink-0 text-sm font-medium tabular-nums ${effect === 'in' ? 'text-rc-green' : 'text-rc-ink'}`}>{money(m.amount)}</span>
                  <button
                    type="button"
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-rc-ink3 hover:text-rc-red"
                    aria-label={invText(t, 'invMovementDelete', { date: fmtDate(m.date) })}
                    disabled={busy}
                    onClick={() => setPending({ kind: 'delete', movement: m })}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-2">
        {isClosed ? (
          <button type="button" className={BTN_S} disabled={busy} onClick={() => void run(() => update.mutateAsync(reopenBody()), 'generic', invText(t, 'invReopened'))}>{invText(t, 'invReopen')}</button>
        ) : (
          <button type="button" className={`${BTN_S} text-rc-red`} disabled={busy} onClick={() => { setCloseError(null); setPending({ kind: 'close' }); }}>{invText(t, 'invCloseButton')}</button>
        )}
        {closeError && <p role="alert" className={ERROR_CLS}>{closeError}</p>}
      </div>

      {dialog === 'movement' && <MovementDialog position={p} onClose={() => setDialog(null)} />}
      {dialog === 'anchor' && <AnchorDialog position={p} onClose={() => setDialog(null)} />}
      {pending?.kind === 'delete' && (
        <ConfirmDialog
          title={invText(t, 'invMovementDeleteTitle')}
          message={invText(t, 'invMovementDeleteMessage', { type: movementTypeLabel(p.kind, pending.movement.type).toLowerCase(), date: fmtDate(pending.movement.date), amount: money(pending.movement.amount) })}
          confirmText={t.delete ?? 'Apagar'}
          busy={del.isPending}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'close' && (
        <ConfirmDialog
          title={invText(t, 'invCloseTitle')}
          message={invText(t, 'invCloseMessage', { name: label })}
          confirmText={invText(t, 'invCloseConfirm')}
          busy={update.isPending}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
      {pending?.kind === 'link' && (
        <ConfirmDialog
          title={invText(t, 'invGoalLinkWarnTitle')}
          message={invText(t, 'invGoalLinkWarn', { goal: pending.goal.name, amount: money(pending.goal.currentAmount) })}
          confirmText={invText(t, 'invGoalLinkConfirm')}
          tone="primary"
          busy={update.isPending}
          onConfirm={() => void confirmPending()}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
