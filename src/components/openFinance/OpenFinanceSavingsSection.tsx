import { useState } from 'react';
import { PiggyBank, Plus, Trash2 } from 'lucide-react';
import { useToastContext } from '../../context/ToastContext';
import { useOpenFinanceSavings, useSaveOpenFinanceSavings } from '../../hooks/api/useOpenFinance';
import { draftFromSavings, isSavingsChanged, savingsError, type SavingsRow } from '../../utils/openFinanceSavings';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SECONDARY_SM, ERROR_CLS, INPUT_CLS, MUTED_CLS } from '../people/ui';

const TOUCH = 'min-h-[44px]';

const TX = {
  title: 'Cofrinhos',
  intro:
    'O banco não diz de qual cofrinho vem cada rendimento. Cadastre cada cofrinho com um saldo aproximado e a data dele: o saldo anda sozinho com o que você guarda e retira, e o rendimento do mês é dividido pelos saldos. Cofrinho que não é do Prumo é ignorado (pagamentos feitos com ele não viram rascunho).',
  name: 'Nome',
  aliases: 'Outros nomes que ele já teve (separados por vírgula)',
  inPrumo: 'É dinheiro do Prumo',
  balance: 'Saldo aproximado (R$)',
  asOf: 'Data do saldo',
  add: 'Adicionar cofrinho',
  remove: 'Remover',
  save: 'Salvar cofrinhos',
  saving: 'Salvando…',
  undo: 'Desfazer',
  saved: 'Cofrinhos salvos.',
  saveFailed: 'Não foi possível salvar os cofrinhos.',
  loadError: 'Não foi possível ler os cofrinhos.',
  empty: 'Nenhum cofrinho cadastrado.',
};

const EMPTY: SavingsRow = { name: '', aliases: '', inPrumo: true, balance: '', asOf: '' };

/** Settings > Open Finance, savings part (P25 L2c): edits a draft of the register; saving sends it whole. */
const OpenFinanceSavingsSection = ({ householdId, canEdit }: { householdId?: string; canEdit: boolean }) => {
  const { success, error: showError } = useToastContext();
  const savings = useOpenFinanceSavings(householdId);
  const save = useSaveOpenFinanceSavings(householdId);
  const server = savings.data ?? [];
  const [draft, setDraft] = useState<SavingsRow[] | null>(null);
  const rows = draft ?? draftFromSavings(server);
  const dirty = draft !== null && isSavingsChanged(draft, server);
  const problem = dirty ? savingsError(rows) : null;

  const edit = (index: number, change: Partial<SavingsRow>) => setDraft(rows.map((r, i) => (i === index ? { ...r, ...change } : r)));

  const handleSave = async () => {
    if (!draft || !dirty || problem || save.isPending) return;
    try {
      await save.mutateAsync(draft);
      setDraft(null);
      success(TX.saved);
    } catch {
      showError(TX.saveFailed);
    }
  };

  return (
    <section aria-label={TX.title} className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
      <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1 flex items-center">
        <PiggyBank className="h-4 w-4 mr-2" aria-hidden="true" />
        {TX.title}
      </h3>
      <p className={`text-xs font-light mb-4 ${MUTED_CLS}`}>{TX.intro}</p>
      {savings.isError && <p role="alert" className={`${ERROR_CLS} mb-3`}>{TX.loadError}</p>}
      {savings.isSuccess && rows.length === 0 && <p className={`text-sm font-light mb-3 ${MUTED_CLS}`}>{TX.empty}</p>}

      <div className="space-y-4">
        {rows.map((row, index) => (
          <div key={index} className="rounded-lg border border-gray-100 dark:border-gray-800 p-3 grid gap-3 sm:grid-cols-2">
            <label className="block min-w-0">
              <span className="block text-xs font-light text-gray-700 dark:text-gray-300 mb-1">{TX.name}</span>
              <input className={`${INPUT_CLS} ${TOUCH}`} value={row.name} disabled={!canEdit} onChange={(e) => edit(index, { name: e.target.value })} />
            </label>
            <label className="block min-w-0">
              <span className="block text-xs font-light text-gray-700 dark:text-gray-300 mb-1">{TX.aliases}</span>
              <input className={`${INPUT_CLS} ${TOUCH}`} value={row.aliases} disabled={!canEdit} onChange={(e) => edit(index, { aliases: e.target.value })} />
            </label>
            <label className="block min-w-0">
              <span className="block text-xs font-light text-gray-700 dark:text-gray-300 mb-1">{TX.balance}</span>
              <input
                className={`${INPUT_CLS} ${TOUCH}`}
                inputMode="decimal"
                placeholder="0,00"
                value={row.balance}
                disabled={!canEdit}
                onChange={(e) => edit(index, { balance: e.target.value })}
              />
            </label>
            <label className="block min-w-0">
              <span className="block text-xs font-light text-gray-700 dark:text-gray-300 mb-1">{TX.asOf}</span>
              <input
                type="date"
                className={`${INPUT_CLS} ${TOUCH}`}
                value={row.asOf}
                disabled={!canEdit}
                onChange={(e) => edit(index, { asOf: e.target.value })}
              />
            </label>
            <div className="flex items-center justify-between gap-2 sm:col-span-2">
              <label className={`flex items-center gap-2 text-sm font-light text-gray-700 dark:text-gray-300 ${TOUCH}`}>
                <input type="checkbox" className="h-5 w-5" checked={row.inPrumo} disabled={!canEdit} onChange={(e) => edit(index, { inPrumo: e.target.checked })} />
                {TX.inPrumo}
              </label>
              {canEdit && (
                <button
                  type="button"
                  className={`${BTN_SECONDARY_SM} ${TOUCH}`}
                  onClick={() => setDraft(rows.filter((_, i) => i !== index))}
                  disabled={save.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" aria-hidden="true" />
                  {TX.remove}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {problem && <p role="alert" className={`${ERROR_CLS} mt-3`}>{problem}</p>}

      {canEdit && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <button type="button" className={`${BTN_SECONDARY} ${TOUCH} w-full sm:w-auto`} onClick={() => setDraft([...rows, EMPTY])} disabled={save.isPending}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />
            {TX.add}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row">
            {dirty && (
              <button type="button" className={`${BTN_SECONDARY} ${TOUCH} w-full sm:w-auto`} onClick={() => setDraft(null)} disabled={save.isPending}>
                {TX.undo}
              </button>
            )}
            <button
              type="button"
              className={`${BTN_PRIMARY} ${TOUCH} w-full sm:w-auto`}
              onClick={() => void handleSave()}
              disabled={!dirty || !!problem || save.isPending}
            >
              {save.isPending ? TX.saving : TX.save}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default OpenFinanceSavingsSection;
