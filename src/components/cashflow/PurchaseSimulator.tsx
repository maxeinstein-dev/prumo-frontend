import { useEffect, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import CategoryCombobox from '../CategoryCombobox';
import { useAccounts } from '../../hooks/api/useAccounts';
import { usePurchaseSimulation } from '../../hooks/api/usePurchaseSimulation';
import { useBackLayer } from '../../hooks/useBackLayer';
import { useDefaultHousehold } from '../../hooks/useDefaultHousehold';
import { AccountType } from '../../constants/accountTypes';
import { TransactionType } from '../../lib/enums';
import { formatCurrency } from '../../utils/format';
import {
  INSTALLMENT_SHORTCUTS,
  MAX_INSTALLMENTS,
  SIMULATOR_ERRORS,
  simulationRequest,
  simulationRows,
  simulationSummary,
  type PurchaseSimulation,
} from '../../utils/purchaseSimulation';

interface PurchaseSimulatorProps {
  open: boolean;
  onClose: () => void;
  currency: string;
}

const FIELD = 'min-h-[44px] w-full rounded-xl border border-rc-line bg-rc-card2 px-3 text-base text-rc-ink placeholder:text-rc-ink2';
const LABEL = 'mb-1 block text-sm font-medium text-rc-ink';

/**
 * "Simular compra" (P20): how the coming months look if a purchase were made in N installments. Nothing is saved; every
 * number comes from POST /dashboard/purchase-simulation. Full screen on the phone, a side panel from 768 px up.
 */
export default function PurchaseSimulator({ open, onClose, currency }: PurchaseSimulatorProps) {
  const { householdId } = useDefaultHousehold();
  const accountsQuery = useAccounts({ householdId: householdId ?? '' });
  const simulation = usePurchaseSimulation();
  const titleId = useId();
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('12');
  const [accountId, setAccountId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [firstMonth, setFirstMonth] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useBackLayer(open, onClose);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const accounts = useMemo(
    () => (accountsQuery.data?.accounts ?? []).filter((a) => a.id && a.type !== AccountType.INVESTMENT && (a as { isActive?: boolean }).isActive !== false),
    [accountsQuery.data],
  );
  const money = (value: number): string => formatCurrency(value, currency);
  const result: PurchaseSimulation | undefined = simulation.data;
  const rows = useMemo(() => (result ? simulationRows(result) : []), [result]);
  const summary = useMemo(() => (result ? simulationSummary(result, money) : null), [result, currency]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdId) return;
    const request = simulationRequest({ amount, installments, accountId, categoryName, firstMonth }, householdId);
    if (!request.ok) {
      setFormError(SIMULATOR_ERRORS[request.error]);
      return;
    }
    setFormError(null);
    simulation.mutate(request.body);
  };

  return (
    <div className="fixed inset-0 z-50 flex md:justify-end" data-testid="purchase-simulator">
      <button type="button" aria-label="Fechar o simulador" tabIndex={-1} onClick={onClose} className="hidden flex-1 cursor-default bg-black/40 md:block" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full flex-col overflow-y-auto bg-rc-bg text-rc-ink md:max-w-md md:border-l md:border-rc-line md:shadow-xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-rc-line px-4 py-3">
          <h2 id={titleId} className="text-lg font-semibold">Simular compra</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="flex h-11 w-11 items-center justify-center rounded-full text-rc-ink2 hover:bg-rc-card2">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-4 py-4" noValidate>
          <p className="text-sm text-rc-ink2">Veja como os próximos meses ficam antes de comprar. Nada é salvo.</p>

          <div>
            <label htmlFor="sim-amount" className={LABEL}>Valor da compra</label>
            <input id="sim-amount" inputMode="decimal" autoComplete="off" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${FIELD} tabular-nums`} />
          </div>

          <div>
            <label htmlFor="sim-installments" className={LABEL}>Parcelas</label>
            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Atalhos de parcelas">
              {INSTALLMENT_SHORTCUTS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={installments === String(n)}
                  onClick={() => setInstallments(String(n))}
                  className={`min-h-[44px] min-w-[44px] rounded-xl border px-3 text-sm font-semibold ${installments === String(n) ? 'border-rc-ink bg-rc-ink text-rc-bg' : 'border-rc-line bg-rc-card text-rc-ink'}`}
                >
                  {n}x
                </button>
              ))}
            </div>
            <input id="sim-installments" type="number" inputMode="numeric" min={1} max={MAX_INSTALLMENTS} value={installments} onChange={(e) => setInstallments(e.target.value)} className={FIELD} />
          </div>

          <div>
            <label htmlFor="sim-account" className={LABEL}>Cartão ou conta</label>
            <select id="sim-account" value={accountId} onChange={(e) => setAccountId(e.target.value)} className={FIELD}>
              <option value="">Não informar</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-rc-ink2">Num cartão, a primeira parcela cai na fatura que o fechamento define.</p>
          </div>

          <div>
            <span className={LABEL}>Categoria (opcional)</span>
            <CategoryCombobox value={categoryName} onValueChange={setCategoryName} type={TransactionType.EXPENSE} showAllOption allOptionLabel="Sem categoria" householdId={householdId} />
          </div>

          <div>
            <label htmlFor="sim-first-month" className={LABEL}>Mês da primeira parcela (opcional)</label>
            <input id="sim-first-month" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} className={FIELD} />
          </div>

          {formError && <p role="alert" className="text-sm text-rc-red" data-testid="sim-form-error">{formError}</p>}
          {simulation.isError && <p role="alert" className="text-sm text-rc-red" data-testid="sim-server-error">Não consegui simular agora. Tente de novo.</p>}

          <button type="submit" disabled={simulation.isPending || !householdId} className="min-h-[48px] w-full rounded-xl bg-rc-ink px-4 text-base font-semibold text-rc-bg disabled:opacity-60">
            {simulation.isPending ? 'Simulando…' : 'Simular'}
          </button>
        </form>

        {result && summary && (
          <section className="space-y-3 border-t border-rc-line px-4 py-4" aria-label="Resultado da simulação" data-testid="sim-result">
            {summary.tightest && <p className="text-base font-semibold" data-testid="sim-tightest">{summary.tightest}</p>}
            {summary.average && <p className="text-sm text-rc-ink2">{summary.average}</p>}
            {summary.overruns.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-rc-red-soft p-3 text-sm text-rc-red" data-testid="sim-overruns">
                {summary.overruns.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}

            <div className="overflow-x-auto rounded-xl border border-rc-line bg-rc-card">
              <table className="w-full min-w-[22rem] text-sm tabular-nums">
                <thead>
                  <tr className="text-left text-xs text-rc-ink2">
                    <th scope="col" className="px-3 py-2 font-medium">Mês</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Já comprometido</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Parcela nova</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Total</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Sobra</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month} data-testid={`sim-row-${row.month}`} data-over-budget={row.overBudget} className={`border-t border-rc-line ${row.overBudget ? 'bg-rc-red-soft text-rc-red' : ''}`}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">{row.label}</th>
                      <td className="px-2 py-2 text-right">{money(row.committed)}</td>
                      <td className="px-2 py-2 text-right">{row.hasInstallment ? money(row.newInstallment) : '—'}</td>
                      <td className="px-2 py-2 text-right font-semibold">{money(row.total)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${row.leftoverNegative ? 'text-rc-red' : ''}`}>{money(row.leftover)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-rc-ink2">{summary.incomeNote}</p>
          </section>
        )}
      </div>
    </div>
  );
}
