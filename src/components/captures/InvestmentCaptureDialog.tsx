import { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { DialogShell, BTN_PRIMARY, BTN_SECONDARY, ERROR_CLS, INPUT_CLS, LABEL_CLS, MUTED_CLS, NOTICE_BOX_CLS } from '../people/ui';
import { useAvailableAccounts } from '../../hooks/api/useAccounts';
import { useConfirmInvestmentCapture } from '../../hooks/api/useCaptures';
import { useToastContext } from '../../context/ToastContext';
import { formatCurrency } from '../../utils/format';
import { localDayKey, type CaptureItem } from '../../utils/captureInbox';
import {
  buildConfirmInvestmentBody,
  confirmInvestmentError,
  defaultInvestmentDraft,
  investmentOf,
  investmentTitle,
  targetOptions,
  validateInvestmentDraft,
  type InvestmentDraft,
} from '../../utils/captureInvestment';

interface Props {
  item: CaptureItem | null;
  householdId: string | undefined;
  onClose: () => void;
}

const TOUCH = 'min-h-[44px]';

/**
 * P21 L7: confirm an XP draft as an investment movement (a dividend or a reinvestment purchase) on an open position of
 * its ticker, or on a new one in an investment account. Never creates a transaction.
 */
const InvestmentCaptureDialog = ({ item, householdId, onClose }: Props) => {
  const investment = item ? investmentOf(item) : null;
  const { data: available } = useAvailableAccounts(householdId ?? '', false);
  const accounts = useMemo(
    () =>
      (available?.accounts ?? [])
        .filter((account) => (account as { type?: string }).type === 'INVESTMENT' && account.id)
        .map((account) => ({ id: account.id as string, name: account.name })),
    [available],
  );
  const confirm = useConfirmInvestmentCapture();
  const { success } = useToastContext();
  const [draft, setDraft] = useState<InvestmentDraft | null>(null);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (investment) setDraft(defaultInvestmentDraft(investment, accounts));
    setTouched(false);
    setServerError(null);
    // A new capture (or the accounts arriving) resets the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.id, accounts.length]);

  if (!item || !investment || !draft) return null;

  const today = localDayKey(new Date().toISOString()) ?? '';
  const { errors } = validateInvestmentDraft(draft, investment, today);
  const shown = touched ? errors : {};
  const isBuy = investment.movementType === 'BUY';
  const options = targetOptions(investment, accounts);
  const busy = confirm.isPending;
  const set = (patch: Partial<InvestmentDraft>) => setDraft({ ...draft, ...patch });

  const submit = async () => {
    setTouched(true);
    setServerError(null);
    const body = buildConfirmInvestmentBody(draft, investment, today);
    if (!body) return;
    try {
      await confirm.mutateAsync({ id: item.id, householdId, body });
      success(isBuy ? 'Compra registrada no investimento.' : 'Provento registrado no investimento.');
      onClose();
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      setServerError(confirmInvestmentError(status, draft.target.startsWith('new:') ? 'position' : 'other'));
    }
  };

  return (
    <DialogShell
      open
      onClose={onClose}
      canClose={!busy}
      titleId="investment-capture-title"
      title={investmentTitle(investment)}
      icon={<TrendingUp className="h-5 w-5" aria-hidden="true" />}
      widthClass="max-w-lg"
    >
      <div className="space-y-4">
        <p className={`text-sm font-light ${MUTED_CLS}`}>
          {isBuy
            ? 'Vira uma compra na posição escolhida. Não cria lançamento nem muda o saldo do mês.'
            : 'Vira um provento na posição escolhida. Não cria lançamento nem entra na renda do mês.'}
        </p>

        {investment.pairedNotice && (
          <p className={NOTICE_BOX_CLS}>
            Aviso de reinvestimento de {formatCurrency(investment.pairedNotice.amount)} para este dia (é o total de proventos
            do mês, não o valor desta compra).
          </p>
        )}

        <div>
          <label htmlFor="investment-target" className={LABEL_CLS}>Posição</label>
          <select
            id="investment-target"
            value={draft.target}
            onChange={(event) => set({ target: event.target.value })}
            disabled={busy}
            className={`${INPUT_CLS} ${TOUCH}`}
            aria-invalid={shown.target ? true : undefined}
            aria-describedby={shown.target ? 'investment-target-error' : undefined}
          >
            <option value="">Escolha</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          {options.length === 0 && (
            <p className={`mt-1 text-xs font-light ${MUTED_CLS}`}>Nenhuma conta de investimento: crie uma em Contas para receber a posição.</p>
          )}
          {shown.target && <p id="investment-target-error" className={ERROR_CLS}>{shown.target}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="investment-amount" className={LABEL_CLS}>Valor (R$)</label>
            <input
              id="investment-amount"
              inputMode="decimal"
              value={draft.amountText}
              onChange={(event) => set({ amountText: event.target.value })}
              disabled={busy}
              className={`${INPUT_CLS} ${TOUCH}`}
              aria-invalid={shown.amount ? true : undefined}
              aria-describedby={shown.amount ? 'investment-amount-error' : undefined}
            />
            {shown.amount && <p id="investment-amount-error" className={ERROR_CLS}>{shown.amount}</p>}
          </div>
          <div>
            <label htmlFor="investment-date" className={LABEL_CLS}>Data</label>
            <input
              id="investment-date"
              type="date"
              max={today}
              value={draft.date}
              onChange={(event) => set({ date: event.target.value })}
              disabled={busy}
              className={`${INPUT_CLS} ${TOUCH}`}
              aria-invalid={shown.date ? true : undefined}
              aria-describedby={shown.date ? 'investment-date-error' : undefined}
            />
            {shown.date && <p id="investment-date-error" className={ERROR_CLS}>{shown.date}</p>}
          </div>
        </div>

        {isBuy && (
          <div>
            <label htmlFor="investment-quantity" className={LABEL_CLS}>Quantidade comprada</label>
            <input
              id="investment-quantity"
              inputMode="decimal"
              value={draft.quantityText}
              onChange={(event) => set({ quantityText: event.target.value })}
              disabled={busy}
              className={`${INPUT_CLS} ${TOUCH}`}
              aria-invalid={shown.quantity ? true : undefined}
              aria-describedby="investment-quantity-hint"
            />
            <p id="investment-quantity-hint" className={`mt-1 text-xs font-light ${MUTED_CLS}`}>
              {investment.quote
                ? `Sugestão: valor ÷ cotação de ${formatCurrency(investment.quote.price)}. Confira no app da XP.`
                : 'Sem cotação guardada: informe a quantidade que a XP mostra.'}
            </p>
            {shown.quantity && <p className={ERROR_CLS}>{shown.quantity}</p>}
          </div>
        )}

        {serverError && <p role="alert" className={ERROR_CLS}>{serverError}</p>}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={`${BTN_SECONDARY} ${TOUCH}`}>Cancelar</button>
          <button type="button" onClick={() => void submit()} disabled={busy} className={`${BTN_PRIMARY} ${TOUCH}`}>
            {busy ? 'Registrando...' : isBuy ? 'Registrar compra' : 'Registrar provento'}
          </button>
        </div>
      </div>
    </DialogShell>
  );
};

export default InvestmentCaptureDialog;
