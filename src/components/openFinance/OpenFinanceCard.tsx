import { useState } from 'react';
import { Landmark } from 'lucide-react';
import { useToastContext } from '../../context/ToastContext';
import { useAccounts } from '../../hooks/api/useAccounts';
import {
  useAddOpenFinanceItem,
  useOpenFinanceLinks,
  useRemoveOpenFinanceItem,
  useReplaceOpenFinanceItem,
  useSaveOpenFinanceLinks,
} from '../../hooks/api/useOpenFinance';
import {
  accountOptionsFor,
  draftFromItems,
  duplicateChoice,
  isDraftChanged,
  itemTitle,
  normalizeItemId,
  pluggyAccountLabel,
  type LinksDraft,
  type LinksItem,
} from '../../utils/openFinanceLinks';
import SelectCombobox from '../SelectCombobox';
import { syncText } from '../../utils/openFinanceSavings';
import OpenFinanceSavingsSection from './OpenFinanceSavingsSection';
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SECONDARY_SM, ERROR_CLS, INPUT_CLS, MUTED_CLS } from '../people/ui';

const TOUCH = 'min-h-[44px]';

const TX = {
  title: 'Open Finance (Meu Pluggy)',
  intro:
    'Escolha qual conta do Prumo recebe os movimentos de cada conta do seu banco. Conta sem vínculo é ignorada. Os bancos são lidos pelo Meu Pluggy, uma vez por dia.',
  readOnly: 'Só quem edita a casa pode mudar os vínculos.',
  loadError: 'Não foi possível ler as conexões agora.',
  notConfigured: 'O Open Finance não está configurado no servidor (faltam as chaves da Pluggy).',
  authFailed: 'A Pluggy recusou as chaves do servidor. Confira se o segredo venceu.',
  empty: 'Nenhuma conexão cadastrada. Cole abaixo o id de uma conexão do Meu Pluggy.',
  itemError: 'A Pluggy não conseguiu ler esta conexão agora. Os vínculos salvos dela continuam valendo.',
  orphan: (n: number) =>
    n === 1
      ? '1 vínculo aponta para uma conta que este banco não lista mais; ele sai quando você salvar.'
      : `${n} vínculos apontam para contas que este banco não lista mais; eles saem quando você salvar.`,
  ignore: 'Não vincular (ignorar)',
  duplicate: 'A mesma conta do Prumo foi escolhida para duas contas do banco. Escolha só uma.',
  save: 'Salvar vínculos',
  saving: 'Salvando…',
  undo: 'Desfazer',
  saved: 'Vínculos salvos.',
  saveFailed: 'Não foi possível salvar os vínculos.',
  addLabel: 'Id da conexão no Meu Pluggy',
  addHint: 'No painel da Pluggy: Itens Conectados → copie o id da conexão.',
  addButton: 'Adicionar conexão',
  adding: 'Adicionando…',
  added: 'Conexão adicionada.',
  addFailed: 'Não foi possível adicionar a conexão (ela já pode estar cadastrada).',
  invalidId: 'Isso não parece um id de conexão (formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).',
  replace: 'Trocar id',
  replaceLabel: 'Novo id da conexão',
  replaceHint: 'Ao renovar a autorização, o Meu Pluggy pode dar um id novo à conexão. Os vínculos são mantidos.',
  replaceButton: 'Salvar novo id',
  replaced: 'Id da conexão trocado.',
  replaceFailed: 'Não foi possível trocar o id da conexão.',
  remove: 'Remover',
  removeConfirm: 'Remover conexão e vínculos',
  removed: 'Conexão removida.',
  removeFailed: 'Não foi possível remover a conexão.',
  cancel: 'Cancelar',
};

function loadErrorText(error: unknown): string {
  const code = (error as { response?: { data?: { error?: { code?: string } } } })?.response?.data?.error?.code;
  if (code === 'OPEN_FINANCE_NOT_CONFIGURED') return TX.notConfigured;
  if (code === 'OPEN_FINANCE_AUTH_FAILED') return TX.authFailed;
  return TX.loadError;
}

interface OpenFinanceCardProps {
  householdId?: string;
  /** EDITOR or more; a viewer sees the links and cannot change them. */
  canEdit: boolean;
}

/**
 * Settings > Open Finance (P25 L4): the Meu Pluggy connections of the household and, for each account the bank shows,
 * the Prumo account it feeds. The screen edits a draft; saving sends every link at once (see buildLinksBody).
 */
const OpenFinanceCard = ({ householdId, canEdit }: OpenFinanceCardProps) => {
  const { success, error: showError } = useToastContext();
  const links = useOpenFinanceLinks(householdId);
  const accounts = useAccounts({ householdId: householdId ?? '' });
  const save = useSaveOpenFinanceLinks(householdId);
  const add = useAddOpenFinanceItem(householdId);
  const replace = useReplaceOpenFinanceItem(householdId);
  const remove = useRemoveOpenFinanceItem(householdId);

  const items: LinksItem[] = links.data ?? [];
  const [draft, setDraft] = useState<LinksDraft | null>(null);
  const current = draft ?? draftFromItems(items);
  const dirty = draft !== null && isDraftChanged(draft, items);
  const duplicate = dirty ? duplicateChoice(current, items) : null;
  const prumo = accounts.data?.accounts ?? [];

  const [newItem, setNewItem] = useState('');
  const [newItemError, setNewItemError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState<string | null>(null);
  const [replaceText, setReplaceText] = useState('');
  const [replaceError, setReplaceError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const busy = save.isPending || add.isPending || replace.isPending || remove.isPending;

  const handleSave = async () => {
    if (!draft || !dirty || duplicate || busy) return;
    try {
      await save.mutateAsync({ draft, items });
      setDraft(null);
      success(TX.saved);
    } catch {
      showError(TX.saveFailed);
    }
  };

  const handleAdd = async () => {
    const id = normalizeItemId(newItem);
    if (!id) {
      setNewItemError(TX.invalidId);
      return;
    }
    setNewItemError(null);
    try {
      await add.mutateAsync(id);
      setNewItem('');
      success(TX.added);
    } catch {
      showError(TX.addFailed);
    }
  };

  const handleReplace = async (itemId: string) => {
    const id = normalizeItemId(replaceText);
    if (!id) {
      setReplaceError(TX.invalidId);
      return;
    }
    setReplaceError(null);
    try {
      await replace.mutateAsync({ itemId, newItemId: id });
      setReplacing(null);
      setReplaceText('');
      success(TX.replaced);
    } catch {
      showError(TX.replaceFailed);
    }
  };

  const handleRemove = async (itemId: string) => {
    try {
      await remove.mutateAsync(itemId);
      setRemoving(null);
      setDraft(null);
      success(TX.removed);
    } catch {
      showError(TX.removeFailed);
    }
  };

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
      <h2 className="text-lg sm:text-xl font-light tracking-tight text-gray-900 dark:text-white mb-2 flex items-center">
        <Landmark className="h-5 w-5 mr-2" aria-hidden="true" />
        {TX.title}
      </h2>
      <p className={`text-sm font-light mb-4 ${MUTED_CLS}`}>{TX.intro}</p>

      {links.isError && <p role="alert" className={`${ERROR_CLS} mb-3`}>{loadErrorText(links.error)}</p>}
      {!canEdit && <p className={`text-xs font-light mb-3 ${MUTED_CLS}`}>{TX.readOnly}</p>}
      {links.isSuccess && items.length === 0 && <p className={`text-sm font-light mb-4 ${MUTED_CLS}`}>{TX.empty}</p>}

      <div className="space-y-6">
        {items.map((item) => {
          const orphans = item.error === null ? item.orphanLinks.length : 0;
          return (
            <section key={item.itemId} aria-label={itemTitle(item)} className="min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white break-words min-w-0">{itemTitle(item)}</h3>
                {canEdit && removing !== item.itemId && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className={`${BTN_SECONDARY_SM} ${TOUCH}`}
                      disabled={busy}
                      onClick={() => {
                        setReplacing(replacing === item.itemId ? null : item.itemId);
                        setReplaceText('');
                        setReplaceError(null);
                      }}
                    >
                      {TX.replace}
                    </button>
                    <button type="button" className={`${BTN_SECONDARY_SM} ${TOUCH}`} disabled={busy} onClick={() => setRemoving(item.itemId)}>
                      {TX.remove}
                    </button>
                  </div>
                )}
                {canEdit && removing === item.itemId && (
                  <div className="flex gap-2">
                    <button type="button" className={`${BTN_SECONDARY_SM} ${TOUCH}`} disabled={busy} onClick={() => setRemoving(null)}>
                      {TX.cancel}
                    </button>
                    <button
                      type="button"
                      className={`${BTN_SECONDARY_SM} ${TOUCH} text-red-600 dark:text-red-400`}
                      disabled={busy}
                      onClick={() => void handleRemove(item.itemId)}
                    >
                      {TX.removeConfirm}
                    </button>
                  </div>
                )}
              </div>

              {replacing === item.itemId && (
                <div className="mb-4">
                  <p className={`text-xs font-light mb-2 ${MUTED_CLS}`}>{TX.replaceHint}</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      aria-label={TX.replaceLabel}
                      className={`${INPUT_CLS} ${TOUCH}`}
                      value={replaceText}
                      onChange={(e) => setReplaceText(e.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button type="button" className={`${BTN_PRIMARY} ${TOUCH} w-full sm:w-auto shrink-0`} disabled={busy} onClick={() => void handleReplace(item.itemId)}>
                      {TX.replaceButton}
                    </button>
                  </div>
                  {replaceError && <p role="alert" className={`${ERROR_CLS} mt-1`}>{replaceError}</p>}
                </div>
              )}

              <p className={`text-xs font-light mb-2 ${MUTED_CLS}`}>{syncText({ lastSyncAt: item.lastSyncAt ?? null, lastError: item.lastError ?? null })}</p>
              {item.lastError && <p role="alert" className={`${ERROR_CLS} mb-3`}>{item.lastError}</p>}
              {item.error !== null && <p className={`${ERROR_CLS} mb-3`}>{TX.itemError}</p>}
              {orphans > 0 && <p className={`text-xs font-light mb-3 ${MUTED_CLS}`}>{TX.orphan(orphans)}</p>}

              <div className="grid gap-4 sm:grid-cols-2">
                {item.accounts.map((account) => (
                  <div key={account.id} className="min-w-0">
                    <span className="block text-sm font-light text-gray-700 dark:text-gray-300 mb-1 break-words">
                      {pluggyAccountLabel(account)}
                    </span>
                    <SelectCombobox
                      value={current[account.id] ?? ''}
                      onValueChange={(value) => setDraft({ ...current, [account.id]: value })}
                      options={[{ value: '', label: TX.ignore }, ...accountOptionsFor(account, prumo)]}
                      placeholder={TX.ignore}
                      disabled={!canEdit || busy || links.isFetching}
                    />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {duplicate && <p role="alert" className={`${ERROR_CLS} mt-4`}>{TX.duplicate}</p>}

      {canEdit && items.length > 0 && (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {dirty && (
            <button type="button" onClick={() => setDraft(null)} disabled={busy} className={`${BTN_SECONDARY} ${TOUCH} w-full sm:w-auto`}>
              {TX.undo}
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!dirty || !!duplicate || busy}
            className={`${BTN_PRIMARY} ${TOUCH} w-full sm:w-auto`}
          >
            {save.isPending ? TX.saving : TX.save}
          </button>
        </div>
      )}

      {canEdit && (
        <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
          <label htmlFor="open-finance-new-item" className="block text-sm font-light text-gray-700 dark:text-gray-300 mb-1">
            {TX.addLabel}
          </label>
          <p className={`text-xs font-light mb-2 ${MUTED_CLS}`}>{TX.addHint}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="open-finance-new-item"
              className={`${INPUT_CLS} ${TOUCH}`}
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="button" className={`${BTN_SECONDARY} ${TOUCH} w-full sm:w-auto shrink-0`} disabled={busy} onClick={() => void handleAdd()}>
              {add.isPending ? TX.adding : TX.addButton}
            </button>
          </div>
          {newItemError && <p role="alert" className={`${ERROR_CLS} mt-1`}>{newItemError}</p>}
        </div>
      )}

      <OpenFinanceSavingsSection householdId={householdId} canEdit={canEdit} />
    </div>
  );
};

export default OpenFinanceCard;
