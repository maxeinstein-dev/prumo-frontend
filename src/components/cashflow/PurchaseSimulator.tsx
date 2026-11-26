import { useEffect, useId, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import CategoryCombobox from '../CategoryCombobox';
import { useAccounts } from '../../hooks/api/useAccounts';
import { usePurchaseSimulation } from '../../hooks/api/usePurchaseSimulation';
import { useBackLayer } from '../../hooks/useBackLayer';
import { useDefaultHousehold } from '../../hooks/useDefaultHousehold';
import { AccountType } from '../../constants/accountTypes';
import { getCategoryDisplayName, TransactionType, type CustomCategoryInfo } from '../../lib/enums';
import { useCategories } from '../../hooks/api/useCategories';
import { useI18n } from '../../context/I18nContext';
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
  const [ownShare, setOwnShare] = useState('');
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
  // In the table the column headings carry the unit, so the cells drop the currency symbol to fit a phone
  const plain = (value: number): string => money(value).replace(/[^\d.,\-−]/g, '');
  const result: PurchaseSimulation | undefined = simulation.data;
  const rows = useMemo(() => (result ? simulationRows(result) : []), [result]);
  const { t } = useI18n();
  const categoriesQuery = useCategories({ householdId: householdId ?? '' });
  const customCategories = useMemo(() => (categoriesQuery.data ?? []).filter((c) => !c.isSystem), [categoriesQuery.data]);
  // The overrun lines name the category as the screens do (a custom one by its name, never the internal id)
  const categoryLabel = (name: string): string => getCategoryDisplayName(name, t as unknown as Record<string, string>, customCategories as CustomCategoryInfo[] | undefined);
  const summary = useMemo(() => (result ? simulationSummary(result, money, categoryLabel) : null), [result, currency, customCategories]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!householdId) return;
    const request = simulationRequest({ amount, installments, accountId, categoryName, firstMonth, ownShare }, householdId);
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
                <option key={a.id} value={a.id}>{a.type === AccountType.CREDIT ? `${a.name} (cartão)` : a.name}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-rc-ink2">Num cartão, a primeira parcela cai na fatura que o fechamento define.</p>
          </div>

          <div>
            <span className={LABEL}>Categoria (opcional)</span>
            <CategoryCombobox value={categoryName} onValueChange={setCategoryName} type={TransactionType.EXPENSE} showAllOption allOptionLabel="Sem categoria" householdId={householdId} />
          </div>

          <div>
            <label htmlFor="sim-own-share" className={LABEL}>Vai dividir? Sua parte em % (opcional)</label>
            <div className="mb-2 flex flex-wrap gap-2" role="group" aria-label="Atalhos da sua parte">
              {['50', '100'].map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={(ownShare || '100') === p}
                  onClick={() => setOwnShare(p === '100' ? '' : p)}
                  className={`min-h-[44px] min-w-[44px] rounded-xl border px-3 text-sm font-semibold ${(ownShare || '100') === p ? 'border-rc-ink bg-rc-ink text-rc-bg' : 'border-rc-line bg-rc-card text-rc-ink'}`}
                >
                  {p === '100' ? 'Só eu' : 'Meio a meio'}
                </button>
              ))}
            </div>
            <input id="sim-own-share" inputMode="decimal" autoComplete="off" placeholder="100" value={ownShare} onChange={(e) => setOwnShare(e.target.value)} aria-describedby="sim-own-share-hint" className={`${FIELD} tabular-nums`} />
            <p id="sim-own-share-hint" className="mt-1 text-xs text-rc-ink2">Se a compra for dividida, só a sua parte conta na parcela, na sobra e nos orçamentos que medem a sua parte.</p>
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
            {summary.share && <p className="text-sm text-rc-ink2" data-testid="sim-share">{summary.share}</p>}
            {summary.average && <p className="text-sm text-rc-ink2">{summary.average}</p>}
            {summary.overruns.length > 0 && (
              <ul className="space-y-1 rounded-xl bg-rc-red-soft p-3 text-sm text-rc-red" data-testid="sim-overruns">
                {summary.overruns.map((line) => <li key={line}>{line}</li>)}
              </ul>
            )}

            <div className="overflow-hidden rounded-xl border border-rc-line bg-rc-card">
              <table className="w-full table-fixed text-xs tabular-nums sm:text-sm">
                <thead>
                  <tr className="text-left text-xs text-rc-ink2">
                    <th scope="col" className="w-[17%] px-2 py-2 font-medium">Mês</th>
                    <th scope="col" className="px-1 py-2 text-right font-medium">Já lançado</th>
                    <th scope="col" className="px-1 py-2 text-right font-medium">Parcela</th>
                    <th scope="col" className="px-1 py-2 text-right font-medium">Total</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Sobra</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month} data-testid={`sim-row-${row.month}`} data-over-budget={row.overBudget} className={`border-t border-rc-line ${row.overBudget ? 'bg-rc-red-soft text-rc-red' : ''}`}>
                      <th scope="row" className="px-2 py-2 text-left font-medium">{row.label}</th>
                      <td className="px-1 py-2 text-right">{plain(row.committed)}</td>
                      <td className="px-1 py-2 text-right">{row.hasInstallment ? plain(row.newInstallment) : '—'}</td>
                      <td className="px-1 py-2 text-right font-semibold">{plain(row.total)}</td>
                      <td className={`px-2 py-2 text-right font-semibold ${row.leftoverNegative ? 'text-rc-red' : ''}`}>{plain(row.leftover)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-rc-ink2">Valores em reais. {summary.incomeNote}</p>
          </section>
        )}
      </div>
    </div>
  );
}
