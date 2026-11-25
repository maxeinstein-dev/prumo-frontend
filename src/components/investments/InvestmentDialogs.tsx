import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useToastContext } from '../../context/ToastContext';
import { useCurrency } from '../../context/CurrencyContext';
import { formatCurrency } from '../../utils/format';
import { linkHidesStoredValue } from '../../utils/goalPositions';
import { maskMoneyInput, todayIsoDate } from '../../utils/adjustBalance';
import { invText, type InvestmentsTextKey } from '../../utils/investmentsTexts';
import {
  anchorBody,
  apiErrorParts,
  INDEXERS,
  investmentErrorText,
  movementBody,
  movementTypeOptions,
  newPositionBody,
  type FormError,
  type FormErrors,
  type GoalRef,
  type Indexer,
  type MovementField,
  type MovementForm,
  type MovementType,
  type NewPositionField,
  type NewPositionForm,
  type Position,
  type PositionKind,
} from '../../utils/investments';
import { useCreateMovement, useCreatePosition, useUpdatePosition } from '../../hooks/api/useInvestments';
import { BTN_DANGER, BTN_PRIMARY, BTN_SECONDARY, DialogShell, ERROR_CLS, INPUT_CLS, LABEL_CLS, MUTED_CLS } from '../people/ui';

const FIELD = `${INPUT_CLS} min-h-[44px]`;
const BTN_P = `${BTN_PRIMARY} min-h-[44px]`;
const BTN_S = `${BTN_SECONDARY} min-h-[44px]`;

const ERROR_TEXT: Record<FormError, InvestmentsTextKey> = {
  ticker: 'invErrTicker',
  name: 'invErrName',
  indexer: 'invErrIndexer',
  rate: 'invErrRate',
  date: 'invErrDate',
  future: 'invErrFuture',
  quantity: 'invErrQuantity',
  price: 'invErrPrice',
  priceOrAmount: 'invErrPriceOrAmount',
  amount: 'invErrAmount',
  notes: 'invErrNotes',
};

function Field({ id, label, error, hint, children }: { id: string; label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={LABEL_CLS}>{label}</label>
      {children}
      {hint && !error && <p className={`mt-1 text-xs ${MUTED_CLS}`}>{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className={`mt-1 ${ERROR_CLS}`}>{error}</p>}
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: Array<{ value: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-[44px] rounded-md border px-3 text-sm ${
            value === o.value
              ? 'border-primary-600 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-900/30 dark:text-primary-300'
              : 'border-gray-200 text-gray-700 dark:border-gray-800 dark:text-gray-300'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A confirmation with 44 px buttons; the confirm button is off while the request runs (no double tap). */
export function ConfirmDialog({
  title, message, confirmText, tone = 'danger', busy, onConfirm, onCancel,
}: { title: string; message: string; confirmText: string; tone?: 'danger' | 'primary'; busy: boolean; onConfirm: () => void; onCancel: () => void }) {
  const { t } = useI18n();
  return (
    <DialogShell open onClose={onCancel} canClose={!busy} titleId="inv-confirm-title" title={title} widthClass="max-w-md" zClass="z-[70]">
      <p className="text-sm font-light leading-relaxed text-gray-600 dark:text-gray-400">{message}</p>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" className={BTN_S} onClick={onCancel} disabled={busy}>{invText(t, 'invCancel')}</button>
        <button type="button" className={`${tone === 'danger' ? BTN_DANGER : BTN_PRIMARY} min-h-[44px]`} onClick={onConfirm} disabled={busy}>{confirmText}</button>
      </div>
    </DialogShell>
  );
}

function GoalSelect({ id, value, goals, onChange }: { id: string; value: string; goals: GoalRef[]; onChange: (v: string) => void }) {
  const { t } = useI18n();
  return (
    <select id={id} className={FIELD} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{invText(t, 'invGoalNone')}</option>
      {goals.map((g) => (
        <option key={g.id} value={g.id}>{g.name}</option>
      ))}
    </select>
  );
}

const emptyForm = (kind: PositionKind): NewPositionForm => ({
  kind, ticker: '', name: '', savingsGoalId: '', indexer: 'CDI', rateText: '', maturityDate: '', openingDate: todayIsoDate(),
  openingQuantityText: '', openingPriceText: '', openingCents: null,
});

/* ---------- new position ---------- */

export function NewPositionDialog({ accountId, goals, onClose, onCreated }: { accountId: string; goals: GoalRef[]; onClose: () => void; onCreated?: (p: { id: string }) => void }) {
  const { t } = useI18n();
  const { baseCurrency } = useCurrency();
  const { success } = useToastContext();
  const create = useCreatePosition(accountId);
  const sending = useRef(false);
  const [form, setForm] = useState<NewPositionForm>(() => emptyForm('STOCK_EXCHANGE'));
  const [amountText, setAmountText] = useState('');
  const [errors, setErrors] = useState<FormErrors<NewPositionField>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const set = <K extends keyof NewPositionForm>(key: K, value: NewPositionForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const err = (field: NewPositionField): string | undefined => {
    const code = errors[field];
    return code ? invText(t, ERROR_TEXT[code]) : undefined;
  };
  const stock = form.kind === 'STOCK_EXCHANGE';
  const masked = maskMoneyInput(amountText);
  const chosenGoal = goals.find((g) => g.id === form.savingsGoalId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    const result = newPositionBody({ ...form, openingCents: masked.cents }, todayIsoDate());
    if (!result.ok) {
      setErrors(result.errors);
      setApiError(null);
      return;
    }
    setErrors({});
    setApiError(null);
    sending.current = true;
    try {
      const created = await create.mutateAsync(result.body);
      success(invText(t, 'invCreated'));
      onCreated?.(created);
      onClose();
    } catch (e) {
      setApiError(investmentErrorText('createPosition', apiErrorParts(e)));
    } finally {
      sending.current = false;
    }
  };

  return (
    <DialogShell open onClose={onClose} canClose={!create.isPending} titleId="inv-create-title" title={invText(t, 'invCreateTitle')} widthClass="max-w-lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <span className={LABEL_CLS}>{invText(t, 'invCreateKind')}</span>
          <Segmented<PositionKind>
            label={invText(t, 'invCreateKind')}
            value={form.kind}
            options={[{ value: 'STOCK_EXCHANGE', label: invText(t, 'invKindStock') }, { value: 'FIXED_INCOME', label: invText(t, 'invKindFixed') }]}
            onChange={(kind) => { set('kind', kind); setErrors({}); }}
          />
        </div>

        {stock ? (
          <>
            <Field id="inv-ticker" label={invText(t, 'invTicker')} error={err('ticker')} hint={invText(t, 'invTickerHint')}>
              <input id="inv-ticker" className={`${FIELD} uppercase`} autoComplete="off" autoCapitalize="characters" value={form.ticker} onChange={(e) => set('ticker', e.target.value)} aria-invalid={!!errors.ticker} />
            </Field>
            <Field id="inv-name" label={invText(t, 'invNameOptional')}>
              <input id="inv-name" className={FIELD} autoComplete="off" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
          </>
        ) : (
          <>
            <Field id="inv-name" label={invText(t, 'invName')} error={err('name')} hint={invText(t, 'invNameFixedHint')}>
              <input id="inv-name" className={FIELD} autoComplete="off" value={form.name} onChange={(e) => set('name', e.target.value)} aria-invalid={!!errors.name} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="inv-indexer" label={invText(t, 'invIndexerLabel')} error={err('indexer')}>
                <select id="inv-indexer" className={FIELD} value={form.indexer} onChange={(e) => set('indexer', e.target.value)}>
                  {INDEXERS.map((i: Indexer) => (
                    <option key={i} value={i}>{invText(t, `invIndexer${i}` as InvestmentsTextKey)}</option>
                  ))}
                </select>
              </Field>
              <Field id="inv-rate" label={form.indexer === 'CDI' || form.indexer === 'SELIC' ? invText(t, 'invRateCdi') : invText(t, 'invRateAnnual')} error={err('rate')}>
                <input id="inv-rate" className={FIELD} inputMode="decimal" autoComplete="off" value={form.rateText} onChange={(e) => set('rateText', e.target.value)} aria-invalid={!!errors.rate} />
              </Field>
            </div>
            <Field id="inv-maturity" label={invText(t, 'invMaturityLabel')} error={err('maturityDate')}>
              <input id="inv-maturity" type="date" className={FIELD} value={form.maturityDate} onChange={(e) => set('maturityDate', e.target.value)} />
            </Field>
          </>
        )}

        <fieldset className="space-y-3 rounded-md border border-gray-200 p-3 dark:border-gray-800">
          <legend className="px-1 text-sm font-medium text-gray-900 dark:text-white">{invText(t, 'invOpeningTitle')}</legend>
          <p className={`text-xs ${MUTED_CLS}`}>{stock ? invText(t, 'invOpeningHint') : `${invText(t, 'invOpeningFixedHint')} ${invText(t, 'invOpeningHint')}`}</p>
          <Field id="inv-open-date" label={invText(t, 'invOpeningDate')} error={err('openingDate')}>
            <input id="inv-open-date" type="date" className={FIELD} value={form.openingDate} max={todayIsoDate()} onChange={(e) => set('openingDate', e.target.value)} />
          </Field>
          {stock ? (
            <div className="grid grid-cols-2 gap-3">
              <Field id="inv-open-qty" label={invText(t, 'invMovementQuantity')} error={err('openingQuantity')}>
                <input id="inv-open-qty" className={FIELD} inputMode="decimal" autoComplete="off" value={form.openingQuantityText} onChange={(e) => set('openingQuantityText', e.target.value)} />
              </Field>
              <Field id="inv-open-price" label={invText(t, 'invAvgPrice')} error={err('openingPrice')}>
                <input id="inv-open-price" className={FIELD} inputMode="decimal" autoComplete="off" placeholder="0,00" value={form.openingPriceText} onChange={(e) => set('openingPriceText', e.target.value)} />
              </Field>
            </div>
          ) : (
            <Field id="inv-open-amount" label={invText(t, 'invOpeningAmount')} error={err('openingAmount')}>
              <input id="inv-open-amount" className={FIELD} inputMode="numeric" autoComplete="off" placeholder="R$ 0,00" value={masked.display} onChange={(e) => setAmountText(e.target.value)} />
            </Field>
          )}
        </fieldset>

        <Field id="inv-goal" label={invText(t, 'invGoalLabel')} hint={invText(t, 'invGoalLinkHint')}>
          <GoalSelect id="inv-goal" value={form.savingsGoalId} goals={goals} onChange={(v) => set('savingsGoalId', v)} />
        </Field>
        {chosenGoal && linkHidesStoredValue(chosenGoal) && (
          <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            {invText(t, 'invGoalLinkWarn', { goal: chosenGoal.name, amount: formatCurrency(chosenGoal.currentAmount, baseCurrency) })}
          </p>
        )}

        {apiError && <p role="alert" className={ERROR_CLS}>{apiError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={BTN_S} onClick={onClose} disabled={create.isPending}>{invText(t, 'invCancel')}</button>
          <button type="submit" className={BTN_P} disabled={create.isPending}>{create.isPending ? invText(t, 'invCreateSaving') : invText(t, 'invCreateSave')}</button>
        </div>
      </form>
    </DialogShell>
  );
}

/* ---------- new movement ---------- */

export function MovementDialog({ position, onClose }: { position: Position; onClose: () => void }) {
  const { t } = useI18n();
  const { success } = useToastContext();
  const create = useCreateMovement(position.id);
  const sending = useRef(false);
  const stock = position.kind === 'STOCK_EXCHANGE';
  const [form, setForm] = useState<MovementForm>({ type: 'BUY', date: todayIsoDate(), quantityText: '', priceText: '', amountCents: null, notes: '' });
  const [amountText, setAmountText] = useState('');
  const [errors, setErrors] = useState<FormErrors<MovementField>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const set = <K extends keyof MovementForm>(key: K, value: MovementForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const err = (field: MovementField): string | undefined => {
    const code = errors[field];
    return code ? invText(t, ERROR_TEXT[code]) : undefined;
  };
  const masked = maskMoneyInput(amountText);
  const needsQuantity = stock && form.type !== 'INCOME';
  const note: InvestmentsTextKey | null = form.type === 'INCOME' ? 'invMovementNoteIncome' : !stock ? 'invMovementNoteFixed' : form.type === 'BUY' ? 'invMovementNoteBuy' : null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    const result = movementBody(position.kind, { ...form, amountCents: masked.cents }, todayIsoDate());
    if (!result.ok) {
      setErrors(result.errors);
      setApiError(null);
      return;
    }
    setErrors({});
    setApiError(null);
    sending.current = true;
    try {
      await create.mutateAsync(result.body);
      success(invText(t, 'invMovementSaved'));
      onClose();
    } catch (e) {
      setApiError(investmentErrorText('movement', apiErrorParts(e)));
    } finally {
      sending.current = false;
    }
  };

  return (
    <DialogShell open onClose={onClose} canClose={!create.isPending} titleId="inv-move-title" title={invText(t, 'invMovementTitle', { name: position.ticker ?? position.name })} widthClass="max-w-lg">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div>
          <span className={LABEL_CLS}>{invText(t, 'invMovementType')}</span>
          <Segmented<MovementType>
            label={invText(t, 'invMovementType')}
            value={form.type}
            options={movementTypeOptions(position.kind)}
            onChange={(type) => { set('type', type); setErrors({}); }}
          />
        </div>
        <Field id="inv-move-date" label={invText(t, 'invMovementDate')} error={err('date')}>
          <input id="inv-move-date" type="date" className={FIELD} value={form.date} max={todayIsoDate()} onChange={(e) => set('date', e.target.value)} />
        </Field>
        {needsQuantity && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field id="inv-move-qty" label={invText(t, 'invMovementQuantity')} error={err('quantity')}>
                <input id="inv-move-qty" className={FIELD} inputMode="decimal" autoComplete="off" value={form.quantityText} onChange={(e) => set('quantityText', e.target.value)} aria-invalid={!!errors.quantity} />
              </Field>
              <Field id="inv-move-price" label={invText(t, 'invMovementPrice')} error={err('price')}>
                <input id="inv-move-price" className={FIELD} inputMode="decimal" autoComplete="off" placeholder="0,00" value={form.priceText} onChange={(e) => set('priceText', e.target.value)} aria-invalid={!!errors.price} />
              </Field>
            </div>
            <Field id="inv-move-total" label={invText(t, 'invMovementTotal')} hint={invText(t, 'invMovementTotalHint')}>
              <input id="inv-move-total" className={FIELD} inputMode="numeric" autoComplete="off" placeholder="R$ 0,00" value={masked.display} onChange={(e) => setAmountText(e.target.value)} />
            </Field>
          </>
        )}
        {!needsQuantity && (
          <Field id="inv-move-total" label={invText(t, 'invMovementTotalRequired')} error={err('amount')}>
            <input id="inv-move-total" className={FIELD} inputMode="numeric" autoComplete="off" placeholder="R$ 0,00" value={masked.display} onChange={(e) => setAmountText(e.target.value)} aria-invalid={!!errors.amount} />
          </Field>
        )}
        <Field id="inv-move-notes" label={invText(t, 'invMovementNotes')} error={err('notes')}>
          <input id="inv-move-notes" className={FIELD} autoComplete="off" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {note && <p className={`text-xs ${MUTED_CLS}`}>{invText(t, note)}</p>}
        {apiError && <p role="alert" className={ERROR_CLS}>{apiError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={BTN_S} onClick={onClose} disabled={create.isPending}>{invText(t, 'invCancel')}</button>
          <button type="submit" className={BTN_P} disabled={create.isPending}>{create.isPending ? invText(t, 'invMovementSaving') : invText(t, 'invMovementSave')}</button>
        </div>
      </form>
    </DialogShell>
  );
}

/* ---------- informar valor (anchor) ---------- */

export function AnchorDialog({ position, onClose }: { position: Position; onClose: () => void }) {
  const { t } = useI18n();
  const { success } = useToastContext();
  const update = useUpdatePosition(position.id);
  const sending = useRef(false);
  const [date, setDate] = useState(todayIsoDate());
  const [amountText, setAmountText] = useState('');
  const [errors, setErrors] = useState<FormErrors<'date' | 'amount'>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const masked = maskMoneyInput(amountText);
  const err = (field: 'date' | 'amount'): string | undefined => {
    const code = errors[field];
    return code ? invText(t, ERROR_TEXT[code]) : undefined;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending.current) return;
    const result = anchorBody({ date, cents: masked.cents }, todayIsoDate());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setApiError(null);
    sending.current = true;
    try {
      await update.mutateAsync(result.body);
      success(invText(t, 'invAnchorSaved'));
      onClose();
    } catch (e) {
      setApiError(investmentErrorText('anchor', apiErrorParts(e)));
    } finally {
      sending.current = false;
    }
  };

  return (
    <DialogShell open onClose={onClose} canClose={!update.isPending} titleId="inv-anchor-title" title={invText(t, 'invAnchorTitle', { name: position.name })} widthClass="max-w-md">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className={`text-sm ${MUTED_CLS}`}>{invText(t, 'invAnchorIntro')}</p>
        <Field id="inv-anchor-date" label={invText(t, 'invAnchorDate')} error={err('date')}>
          <input id="inv-anchor-date" type="date" className={FIELD} value={date} max={todayIsoDate()} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field id="inv-anchor-amount" label={invText(t, 'invAnchorAmount')} error={err('amount')}>
          <input id="inv-anchor-amount" className={FIELD} inputMode="numeric" autoComplete="off" placeholder="R$ 0,00" value={masked.display} onChange={(e) => setAmountText(e.target.value)} aria-invalid={!!errors.amount} />
        </Field>
        {apiError && <p role="alert" className={ERROR_CLS}>{apiError}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={BTN_S} onClick={onClose} disabled={update.isPending}>{invText(t, 'invCancel')}</button>
          <button type="submit" className={BTN_P} disabled={update.isPending}>{update.isPending ? invText(t, 'invAnchorSaving') : invText(t, 'invAnchorSave')}</button>
        </div>
      </form>
    </DialogShell>
  );
}
